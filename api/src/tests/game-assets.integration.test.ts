import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import express from 'express';
import type {Server} from 'node:http';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
vi.mock('../repositories/auth',()=>({getPublicSessionByToken:async(token:string)=>({account:{_id:token}})}));
const chain=vi.hoisted(()=>({proof:'pending',legacy:false,hook:null as null|(()=>Promise<void>),assets:new Map<string,any>(),plans:new Map<string,any>(),send:vi.fn(async()=> 'signature')}));
vi.mock('../economy-chain',()=>({hasPreparedSignatures:()=>chain.legacy,economyAuthority:()=>({}),receiptState:async()=>{const proof=chain.proof;const hook=chain.hook;chain.hook=null;if(hook)await hook();return proof;},validateSignedTransaction:()=>({bytes:'signed',signature:randomUUID()}),economyConnection:{sendRawTransaction:chain.send}}));
vi.mock('../game-asset-chain',()=>({signAssetSubmission:()=>({bytes:'signed',signature:randomUUID()}),assetReady:()=>true,assetIdentity:(id:string)=>({address:'asset-'+id,issuer:'test-issuer'}),
 verifiedAsset:async(record:any,wallet?:string)=>{const asset=chain.assets.get(record.asset_address);if(!asset||(wallet&&asset.owner!==wallet))throw Error('assets.notOwned');return asset;},
 verifyPlayableAsset:async(address:string,wallet:string)=>{const a=chain.assets.get(address);return !!a&&a.owner===wallet&&a.freezeDelegate?.frozen;},
 prepareAssetTransaction:async(kind:string,id:string,record:any,wallet:string,name:string,settlement:any)=>{chain.plans.set(id,{kind,record,wallet,settlement});return {transaction_bytes:'bytes',message_bytes:'message',last_valid_height:99};}
}));
import pool from '../db';
import {installGameAssetRoutes,reconcileAssetOperation} from '../game-asset-routes';
import {claimCharacterConnection} from '../repositories/characters';
import {assertPlayableCharacter,bundleHash} from '../game-asset-policy';
let server:Server,url:string;const seller=randomUUID(),buyer=randomUUID(),character=randomUUID(),recipient=randomUUID();
async function post(account:string,action:string,body:unknown){const r=await fetch(url+'/auth/game-assets/'+action,{method:'POST',headers:{Authorization:'Bearer '+account,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
async function prepare(kind:string,extra:unknown={}){return post(seller,'prepare',{kind,characterId:character,...extra as object});}
async function complete(id:string,account=seller){
 await post(account,'submit',{operationId:id,transaction:'signed'});
 const plan=chain.plans.get(id);const old=chain.assets.get(plan.record.asset_address);
 if(plan.kind==='item-import')chain.assets.delete(plan.record.asset_address);
 else chain.assets.set(plan.record.asset_address,{...old,owner:plan.wallet,freezeDelegate:{frozen:plan.kind==='mint'||plan.kind==='stake'},attributes:{attributeList:plan.settlement?[{key:'snapshot_version',value:String(plan.settlement.version)},{key:'snapshot_hash',value:plan.settlement.hash}]:old?.attributes?.attributeList??[]}});
 chain.proof='complete';return reconcileAssetOperation(id,account);
}
beforeAll(async()=>{
 if(!process.env.DATABASE_URL?.includes('aoweb_assets_test_'))throw Error('Isolated asset database required');
 process.env.AOWEB_DEVNET_METADATA_URL='https://test.invalid/api/cosmetics/metadata';
 await pool.query(`CREATE TABLE accounts(id UUID PRIMARY KEY);CREATE TABLE characters(id UUID PRIMARY KEY,account_id UUID REFERENCES accounts(id),name TEXT,level INT DEFAULT 2,npc_matados INT DEFAULT 4,gold INT DEFAULT 100,connected BOOLEAN DEFAULT FALSE,privileges INT DEFAULT 0,banned TIMESTAMPTZ,clan_id UUID,deleted_at TIMESTAMPTZ,updated_at TIMESTAMPTZ DEFAULT NOW(),id_clase INT DEFAULT 1,id_body INT DEFAULT 1,id_head INT DEFAULT 1,id_weapon INT DEFAULT 0,id_shield INT DEFAULT 0,id_helmet INT DEFAULT 0);
 CREATE TABLE account_wallets(account_id UUID PRIMARY KEY,address TEXT);CREATE TABLE auth_sessions(selected_character_id UUID);CREATE TABLE game_tickets(character_id UUID,consumed_at TIMESTAMPTZ,mode TEXT DEFAULT 'world');
 CREATE TABLE character_items(character_id UUID,id_pos INT,id_item INT,cant INT,equipped BOOLEAN,PRIMARY KEY(character_id,id_pos));CREATE TABLE character_bank_items(character_id UUID,id_pos INT,id_item INT,cant INT);CREATE TABLE character_spells(character_id UUID,id_pos INT,id_spell INT);
 CREATE TABLE game_objects(id INT PRIMARY KEY,name TEXT,obj_type INT,data JSONB);CREATE TABLE game_npcs(id INT,npc_type INT,data JSONB);CREATE TABLE market_listings(seller_character_id UUID,status TEXT);CREATE TABLE market_claims(owner_character_id UUID);`);
 await pool.query(fs.readFileSync(path.resolve(__dirname,'../../economy-schema.sql'),'utf8'));
 await pool.query(fs.readFileSync(path.resolve(__dirname,'../../game-assets-schema.sql'),'utf8'));
 await pool.query("INSERT INTO game_objects VALUES(42,'Rare sword',1,'{}'),(43,'Starter sword',1,'{\"newbie\":1}')");
 const app=express();app.use(express.json());installGameAssetRoutes(app);server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));url='http://127.0.0.1:'+(server.address() as any).port;
});
beforeEach(async()=>{
 chain.legacy=false;chain.hook=null;chain.proof='pending';chain.assets.clear();chain.plans.clear();chain.send.mockClear();
 await pool.query('TRUNCATE accounts,characters,account_wallets,auth_sessions,game_tickets,character_items,character_bank_items,character_spells,character_sales,item_sales,market_listings,market_claims CASCADE');
 await pool.query('INSERT INTO accounts VALUES($1),($2)',[seller,buyer]);await pool.query("INSERT INTO account_wallets VALUES($1,'seller-wallet'),($2,'buyer-wallet')",[seller,buyer]);
 await pool.query("INSERT INTO characters(id,account_id,name) VALUES($1,$2,'Bundlehero'),($3,$4,'Recipient')",[character,seller,recipient,buyer]);
 for(const sql of ['INSERT INTO character_items VALUES($1,1,42,5,FALSE)','INSERT INTO character_bank_items VALUES($1,1,42,3)','INSERT INTO character_spells VALUES($1,1,7)'])await pool.query(sql,[character]);
 await pool.query("INSERT INTO character_achievements VALUES($1,'explorer',NOW())",[character]);await pool.query("INSERT INTO character_titles VALUES($1,'explorer')",[character]);
});
afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));await pool.end();});
describe('character ownership and complete bundles',()=>{
 it('does not refund an export when submission arrives during its expiry check',async()=>{const m=await prepare('mint');await complete(m.body.id);chain.proof='pending';const p=await prepare('item-export',{slot:1,quantity:2});expect(p.status).toBe(200);chain.proof='failed';chain.hook=async()=>{chain.proof='pending';expect((await post(seller,'submit',{operationId:p.body.id,transaction:'signed'})).status).toBe(200);};expect((await reconcileAssetOperation(p.body.id,seller)).state).toBe('pending');expect((await pool.query('SELECT cant FROM character_items WHERE character_id=$1',[character])).rows[0].cant).toBe(3);});
 it('keeps legacy presigned export reservations quarantined',async()=>{const m=await prepare('mint');await complete(m.body.id);chain.proof='pending';const p=await prepare('item-export',{slot:1,quantity:2});expect(p.status).toBe(200);chain.proof='failed';chain.legacy=true;expect((await reconcileAssetOperation(p.body.id,seller)).state).toBe('pending');expect((await pool.query('SELECT cant FROM character_items WHERE character_id=$1',[character])).rows[0].cant).toBe(3);});

 it('requires new characters to mint, locks preparation, settles mint once and verifies play',async()=>{
  await expect(claimCharacterConnection(character,seller)).rejects.toThrow('Mint and stake');
  const op=await prepare('mint');expect(op.status).toBe(200);
  expect((await prepare('mint')).status).toBe(409);
  await expect(pool.query('UPDATE characters SET gold=0 WHERE id=$1',[character])).rejects.toThrow('locked');
  expect((await reconcileAssetOperation(op.body.id,seller)).state).toBe('pending');
  await complete(op.body.id);await reconcileAssetOperation(op.body.id,seller);
  const c=(await pool.query('SELECT * FROM characters WHERE id=$1',[character])).rows[0];expect(c.chain_state).toBe('staked');expect(c.gold).toBe(100);expect(c.economy_lock).toBeNull();
  expect((await claimCharacterConnection(character,seller)).ok).toBe(true);
  expect((await prepare('unstake')).status).toBe(409);
 });
 it('syncs and seals the whole bundle; a new NFT owner stakes the same character and inventory',async()=>{
  const mint=await prepare('mint');await complete(mint.body.id);chain.proof='pending';
  const out=await prepare('unstake');expect(out.status).toBe(200);await complete(out.body.id);
  const snapshot=(await pool.query('SELECT * FROM character_snapshots WHERE character_id=$1 AND settled ORDER BY version DESC',[character])).rows[0];
  expect(snapshot.bundle.character_items[0].cant).toBe(5);expect(snapshot.bundle.character_bank_items[0].cant).toBe(3);expect(snapshot.bundle.character_spells[0].id_spell).toBe(7);expect(snapshot.bundle.character_titles[0].kind).toBe('explorer');expect(bundleHash(snapshot.bundle)).toBe(snapshot.hash);expect(snapshot.bundle.character.account_id).toBeUndefined();
  await expect(pool.query('UPDATE characters SET gold=0 WHERE id=$1',[character])).rejects.toThrow('stake');await expect(pool.query('DELETE FROM character_items WHERE character_id=$1',[character])).rejects.toThrow('sealed');
  const asset=chain.plans.get(mint.body.id).record.asset_address;chain.assets.get(asset).owner='buyer-wallet';chain.proof='pending';
  expect((await post(seller,'prepare',{kind:'stake',asset})).body.error).toBe('assets.notOwned');
  const incoming=await post(buyer,'prepare',{kind:'stake',asset});expect(incoming.status).toBe(200);await complete(incoming.body.id,buyer);
  expect((await pool.query('SELECT account_id,chain_state FROM characters WHERE id=$1',[character])).rows[0]).toMatchObject({account_id:buyer,chain_state:'staked'});expect((await pool.query('SELECT cant FROM character_items WHERE character_id=$1',[character])).rows[0].cant).toBe(5);
  expect((await claimCharacterConnection(character,seller)).ok).toBe(false);expect((await claimCharacterConnection(character,buyer)).ok).toBe(true);
 });
 it('expires unsigned mint without creating a playable NFT; failed unstake keeps the character staked',async()=>{
  const failed=await prepare('mint');chain.proof='failed';await reconcileAssetOperation(failed.body.id);expect((await pool.query('SELECT asset_address FROM characters WHERE id=$1',[character])).rows[0].asset_address).toBeNull();
  chain.proof='pending';const mint=await prepare('mint');await complete(mint.body.id);chain.proof='pending';const out=await prepare('unstake');chain.proof='failed';await reconcileAssetOperation(out.body.id);expect((await pool.query('SELECT chain_state,economy_lock FROM characters WHERE id=$1',[character])).rows[0]).toMatchObject({chain_state:'staked',economy_lock:null});
 });
});
it('denies realm entry for legacy unminted characters even when chain_required is false',async()=>{const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('aoweb.economy_writer','yes',true)");await c.query("UPDATE characters SET chain_required=FALSE WHERE id=$1",[character]);await c.query('COMMIT');}finally{c.release();}await expect(assertPlayableCharacter(character,seller)).rejects.toThrow('Mint and stake');});
describe('off-chain items with mint/burn exports',()=>{
 it('allows an inventory withdrawal while other items are escrowed, without releasing escrow',async()=>{
  await legacy();
  await pool.query("INSERT INTO market_listings VALUES($1,'active')",[character]);
  await pool.query('INSERT INTO market_claims VALUES($1)',[character]);
  const out=await prepare('item-export',{slot:1,quantity:2});expect(out.status).toBe(200);
  await complete(out.body.id);
  expect((await pool.query('SELECT cant FROM character_items WHERE character_id=$1',[character])).rows[0].cant).toBe(3);
  expect((await pool.query('SELECT * FROM market_listings WHERE seller_character_id=$1',[character])).rowCount).toBe(1);
  expect((await pool.query('SELECT * FROM market_claims WHERE owner_character_id=$1',[character])).rowCount).toBe(1);
  expect((await prepare('mint')).body.error).toBe('economy.clearMarket');
 });
 async function legacy(){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('aoweb.economy_writer','yes',true)");await c.query("UPDATE characters SET chain_required=FALSE WHERE id=ANY($1::uuid[])",[[character,recipient]]);await c.query('COMMIT');}finally{c.release();}}
 it('removes exported quantity from the bundle and burns to deposit it exactly once to a new owner',async()=>{
  await legacy();const out=await prepare('item-export',{slot:1,quantity:2});expect(out.status).toBe(200);expect((await pool.query('SELECT cant FROM character_items WHERE character_id=$1',[character])).rows[0].cant).toBe(3);await complete(out.body.id);
  const asset=chain.plans.get(out.body.id).record.asset_address;chain.assets.get(asset).owner='buyer-wallet';chain.proof='pending';
  const incoming=await post(buyer,'prepare',{kind:'item-import',characterId:recipient,asset});expect(incoming.status).toBe(200);expect((await pool.query('SELECT * FROM character_items WHERE character_id=$1',[recipient])).rowCount).toBe(0);await complete(incoming.body.id,buyer);await reconcileAssetOperation(incoming.body.id,buyer);
  expect((await pool.query('SELECT cant,id_item FROM character_items WHERE character_id=$1',[recipient])).rows[0]).toMatchObject({cant:2,id_item:42});expect((await post(buyer,'prepare',{kind:'item-import',characterId:recipient,asset})).status).toBe(409);
  chain.proof='pending';const mint=await prepare('mint');await complete(mint.body.id);const snap=(await pool.query('SELECT bundle FROM character_snapshots WHERE character_id=$1 AND settled',[character])).rows[0].bundle;expect(snap.character_items[0].cant).toBe(3);
 });
 it('refunds failed exports once and prevents equipped, starter, online and oversized withdrawals',async()=>{
  await legacy();expect((await prepare('item-export',{slot:1,quantity:6})).status).toBe(409);
  const out=await prepare('item-export',{slot:1,quantity:2});chain.proof='failed';await reconcileAssetOperation(out.body.id);await reconcileAssetOperation(out.body.id);expect((await pool.query('SELECT cant FROM character_items WHERE character_id=$1',[character])).rows[0].cant).toBe(5);
  await pool.query('UPDATE character_items SET equipped=TRUE WHERE character_id=$1',[character]);expect((await prepare('item-export',{slot:1,quantity:1})).status).toBe(409);
  await pool.query('UPDATE character_items SET equipped=FALSE,id_item=43 WHERE character_id=$1',[character]);expect((await prepare('item-export',{slot:1,quantity:1})).body.error).toBe('economy.itemRestricted');
 });
 it('prevents a full recipient inventory from burning and retains locks when RPC outcome is unknown',async()=>{
  await legacy();const out=await prepare('item-export',{slot:1,quantity:2});await complete(out.body.id);chain.proof='pending';const asset=chain.plans.get(out.body.id).record.asset_address;chain.assets.get(asset).owner='buyer-wallet';
  await pool.query('INSERT INTO character_items SELECT $1,n,42,10000,FALSE FROM generate_series(1,21) n',[recipient]);expect((await post(buyer,'prepare',{kind:'item-import',characterId:recipient,asset})).body.error).toBe('economy.inventoryFull');expect(chain.assets.has(asset)).toBe(true);
 });
});

