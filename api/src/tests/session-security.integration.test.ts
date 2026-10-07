import {beforeAll,afterAll,test,expect} from 'vitest';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import pool from '../db';
import {registerAccount,getPublicSessionByToken,logoutSession,isGameSessionActive} from '../repositories/auth';
import {credentialHash} from '../lib/sessionTokens';
import {hashPassword,verifyPassword} from '../lib/passwords';
beforeAll(async()=>{if(!process.env.DATABASE_URL?.includes('aoweb_session_test_'))throw Error('Isolated database required');await pool.query(fs.readFileSync('schema.sql','utf8'));await pool.query('ALTER TABLE characters ADD COLUMN economy_lock UUID');});
afterAll(async()=>{await pool.end();});
test('database stores a hash that cannot itself authenticate; logout revokes the original credential',async()=>{
 const a=await registerAccount({name:'Securitytest',email:'security@example.invalid',password:'Securetest123!'});
 const row=(await pool.query('SELECT token FROM auth_sessions WHERE account_id=$1',[a.account._id])).rows[0];
 expect(row.token).toBe(credentialHash(a.sessionToken));expect(row.token).not.toBe(a.sessionToken);
 expect((await getPublicSessionByToken(a.sessionToken))?.account._id).toBe(a.account._id);
 expect(await getPublicSessionByToken(row.token)).toBeNull();
 await logoutSession(a.sessionToken);expect(await getPublicSessionByToken(a.sessionToken)).toBeNull();
});
test('an active session cannot extend beyond its absolute lifetime',async()=>{
 const a=await registerAccount({name:'Agedsession',email:'aged@example.invalid',password:'Securetest123!'});
 await pool.query("UPDATE auth_sessions SET created_at=NOW()-INTERVAL '31 days',expires_at=NOW()+INTERVAL '1 day' WHERE account_id=$1",[a.account._id]);
 expect(await getPublicSessionByToken(a.sessionToken)).toBeNull();
});
test('legacy migration preserves cookies and ticket foreign keys and is safe to rerun',async()=>{
 const a=await registerAccount({name:'Migrationtest',email:'migrate@example.invalid',password:'Securetest123!'});
 const raw='legacy-'+randomUUID(),ticket='ticket-'+randomUUID();
 await pool.query("INSERT INTO auth_sessions(token,account_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 day')",[raw,a.account._id]);
 await pool.query("INSERT INTO game_tickets(ticket,auth_token,account_id,expires_at,mode) VALUES($1,$2,$3,NOW()+INTERVAL '1 minute','arena')",[ticket,raw,a.account._id]);
 const migration=fs.readFileSync('session-credentials-migration.sql','utf8');await pool.query(migration);await pool.query(migration);
 expect((await getPublicSessionByToken(raw))?.account._id).toBe(a.account._id);
 const stored=(await pool.query('SELECT ticket,auth_token FROM game_tickets WHERE account_id=$1',[a.account._id])).rows[0];
 expect(stored).toEqual({ticket:credentialHash(ticket),auth_token:credentialHash(raw)});
 await logoutSession(raw);expect((await pool.query('SELECT count(*)::int n FROM game_tickets WHERE account_id=$1',[a.account._id])).rows[0].n).toBe(0);
});
test('new password hashes reject bcrypt truncation including multi-byte input; legacy verification remains compatible',async()=>{
 await expect(hashPassword('a'.repeat(73))).rejects.toThrow('72 UTF-8 bytes');
 await expect(hashPassword('é'.repeat(37))).rejects.toThrow('72 UTF-8 bytes');
 const password='é'.repeat(36);const hash=await hashPassword(password);expect(await verifyPassword(password,hash)).toBe(true);expect(await verifyPassword('wrong',hash)).toBe(false);
});

test('game session checks revoke active sockets after logout and reject another account character',async()=>{
 const a=await registerAccount({name:'Gamevalidation',email:'gamecheck@example.invalid',password:'Securetest123!'});const id=randomUUID();
 await pool.query("INSERT INTO characters(id,account_id,name) VALUES($1,$2,'Player')",[id,a.account._id]);
 expect(await isGameSessionActive(credentialHash(a.sessionToken),id)).toBe(true);
 expect(await isGameSessionActive(credentialHash(a.sessionToken),randomUUID())).toBe(false);
 await logoutSession(a.sessionToken);expect(await isGameSessionActive(credentialHash(a.sessionToken),id)).toBe(false);
});

test('active game access is revoked by character bans and shared IP bans, including expired-ban recovery',async()=>{
 const a=await registerAccount({name:'Banvalidation',email:'bancheck@example.invalid',password:'Securetest123!'}),id=randomUUID(),other=randomUUID(),hash=credentialHash(a.sessionToken);
 await pool.query("INSERT INTO characters(id,account_id,name,ip) VALUES($1,$2,'Bantest','192.0.2.10'),($3,$2,'Ipbantest','192.0.2.10')",[id,a.account._id,other]);
 expect(await isGameSessionActive(hash,id)).toBe(true);
 await pool.query("UPDATE characters SET banned=NOW()+INTERVAL '1 hour' WHERE id=$1",[id]);expect(await isGameSessionActive(hash,id)).toBe(false);
 await pool.query("UPDATE characters SET banned=NOW()-INTERVAL '1 hour',ip_banned_until=NOW()+INTERVAL '1 hour' WHERE id=$1",[id]);expect(await isGameSessionActive(hash,id)).toBe(false);
 await pool.query("UPDATE characters SET ip_banned_until=NULL WHERE id=$1",[id]);await pool.query("UPDATE characters SET ip_banned_until=NOW()+INTERVAL '1 hour' WHERE id=$1",[other]);expect(await isGameSessionActive(hash,id)).toBe(false);
 await pool.query("UPDATE characters SET ip_banned_until=NOW()-INTERVAL '1 hour' WHERE id=$1",[other]);expect(await isGameSessionActive(hash,id)).toBe(true);
});
