import { beforeAll, afterAll, test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pool from '../db';
import { syncAccountVault, syncClanVault } from '../repositories/vaults';

const owner = randomUUID(), other = randomUUID(), character = randomUUID();
beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('aoweb_vault_test_')) throw Error('Isolated vault test database required');
    await pool.query(`
      CREATE TABLE accounts(id UUID PRIMARY KEY,name TEXT,email TEXT);
      CREATE TABLE clans(id UUID PRIMARY KEY);
      CREATE TABLE characters(id UUID PRIMARY KEY,account_id UUID REFERENCES accounts(id),name TEXT,gold INTEGER,clan_id UUID,deleted_at TIMESTAMPTZ,updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE character_items(character_id UUID REFERENCES characters(id),id_pos INTEGER,id_item INTEGER,cant INTEGER,equipped BOOLEAN,PRIMARY KEY(character_id,id_pos));
      CREATE TABLE account_vaults(account_id UUID PRIMARY KEY REFERENCES accounts(id),gold INTEGER DEFAULT 0,updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE account_vault_items(account_id UUID REFERENCES accounts(id),id_pos INTEGER,id_item INTEGER,cant INTEGER,PRIMARY KEY(account_id,id_pos));
      CREATE TABLE clan_vaults(clan_id UUID PRIMARY KEY REFERENCES clans(id),gold INTEGER DEFAULT 0,updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE clan_vault_items(clan_id UUID REFERENCES clans(id),id_pos INTEGER,id_item INTEGER,cant INTEGER,PRIMARY KEY(clan_id,id_pos));
    `);
    await pool.query(fs.readFileSync(path.resolve('vault-receipts-schema.sql'), 'utf8'));
    await pool.query(`INSERT INTO accounts(id,name,email) VALUES($1,'vault fixture','fixture@example.invalid'),($2,'other fixture','other@example.invalid')`, [owner, other]);
    await pool.query(`INSERT INTO characters(id,account_id,name,gold) VALUES($1,$2,'vault fixture',100)`, [character, owner]);
});
afterAll(async () => { await pool.end(); });

test('lost-response replay returns the receipt without overwriting later gold state', async () => {
    const payload = { operationId: randomUUID(), characterId: character, characterGold: 75, gold: 25 };
    const receipt = await syncAccountVault(owner, payload);
    await syncAccountVault(owner, { operationId: randomUUID(), characterId: character, characterGold: 60, gold: 40 });
    expect(await syncAccountVault(owner, payload)).toEqual(receipt);
    expect((await pool.query('SELECT gold FROM characters WHERE id=$1', [character])).rows[0].gold).toBe(60);
    expect((await pool.query('SELECT gold FROM account_vaults WHERE account_id=$1', [owner])).rows[0].gold).toBe(40);
});

test('concurrent identical submissions share exactly one committed receipt', async () => {
    const payload = { operationId: randomUUID(), characterId: character, characterGold: 50, gold: 50 };
    const results = await Promise.all(Array.from({ length: 5 }, () => syncAccountVault(owner, payload)));
    expect(results.every(result => JSON.stringify(result) === JSON.stringify(results[0]))).toBe(true);
    expect((await pool.query('SELECT count(*)::int AS n FROM vault_operation_receipts WHERE operation_id=$1', [payload.operationId])).rows[0].n).toBe(1);
});

test('operation IDs are bound to exact payload, owner and scope', async () => {
    const payload = { operationId: randomUUID(), characterId: character, characterGold: 45, gold: 55 };
    await syncAccountVault(owner, payload);
    await expect(syncAccountVault(owner, { ...payload, gold: 999 })).rejects.toThrow('does not match');
    await expect(syncAccountVault(other, payload)).rejects.toThrow('does not match');
    await expect(syncClanVault(owner, payload)).rejects.toThrow('does not match');
    expect((await pool.query('SELECT gold FROM account_vaults WHERE account_id=$1', [owner])).rows[0].gold).toBe(55);
});

test('rejected transactions leave no success receipt and no partial balance changes', async () => {
    const operationId = randomUUID();
    await expect(syncAccountVault(other, { operationId, characterId: character, characterGold: 0, gold: 1000 })).rejects.toThrow();
    expect((await pool.query('SELECT count(*)::int AS n FROM vault_operation_receipts WHERE operation_id=$1', [operationId])).rows[0].n).toBe(0);
    expect((await pool.query('SELECT gold FROM characters WHERE id=$1', [character])).rows[0].gold).toBe(45);
    await expect(syncAccountVault(owner, { operationId, characterId: character, characterGold: 40, gold: 60 })).resolves.toMatchObject({ ok: true });
});

test('item replay cannot restore a previously moved item over a later inventory', async () => {
    const first = { operationId: randomUUID(), characterId: character, characterItems: [{ idPos: 1, idItem: 1, cant: 2, equipped: false }], items: [{ idPos: 1, idItem: 1, cant: 3 }] };
    await syncAccountVault(owner, first);
    await syncAccountVault(owner, { operationId: randomUUID(), characterId: character, characterItems: [], items: [{ idPos: 1, idItem: 1, cant: 5 }] });
    await syncAccountVault(owner, first);
    expect((await pool.query('SELECT count(*)::int AS n FROM character_items WHERE character_id=$1', [character])).rows[0].n).toBe(0);
    expect((await pool.query('SELECT cant FROM account_vault_items WHERE account_id=$1', [owner])).rows[0].cant).toBe(5);
});

test('clan vault receipts also protect later balances from old retries', async () => {
    const clan = randomUUID();
    await pool.query('INSERT INTO clans(id) VALUES($1)', [clan]);
    await pool.query('UPDATE characters SET clan_id=$2 WHERE id=$1', [character, clan]);
    const payload = { operationId: randomUUID(), characterId: character, characterGold: 35, gold: 65 };
    const receipt = await syncClanVault(clan, payload);
    await syncClanVault(clan, { operationId: randomUUID(), characterId: character, characterGold: 20, gold: 80 });
    expect(await syncClanVault(clan, payload)).toEqual(receipt);
    expect((await pool.query('SELECT gold FROM characters WHERE id=$1', [character])).rows[0].gold).toBe(20);
    expect((await pool.query('SELECT gold FROM clan_vaults WHERE clan_id=$1', [clan])).rows[0].gold).toBe(80);
});

test('failure after character mutation rolls back both balance and receipt', async () => {
    await pool.query('ALTER TABLE account_vaults ADD CONSTRAINT fixture_reject_gold CHECK(gold <> 13)');
    const operationId = randomUUID();
    await expect(syncAccountVault(owner, { operationId, characterId: character, characterGold: 0, gold: 13 })).rejects.toThrow();
    expect((await pool.query('SELECT gold FROM characters WHERE id=$1', [character])).rows[0].gold).toBe(20);
    expect((await pool.query('SELECT count(*)::int AS n FROM vault_operation_receipts WHERE operation_id=$1', [operationId])).rows[0].n).toBe(0);
});
