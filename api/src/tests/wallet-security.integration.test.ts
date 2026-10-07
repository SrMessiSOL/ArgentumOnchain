import {beforeAll,afterAll,test,expect} from 'vitest';
import fs from 'node:fs';
import express from 'express';
import type {Server} from 'node:http';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import bs58 from 'bs58';
import pool from '../db';
import {registerAccount} from '../repositories/auth';
import {installWalletRoutes} from '../wallet-routes';
let server:Server,url:string,token:string,account:string;
const keys=()=>{const key=generateKeyPairSync('ed25519');return {key,address:bs58.encode(key.publicKey.export({format:'der',type:'spki'}).subarray(-32))};};
async function post(path:string,body:unknown){const r=await fetch(url+'/auth/wallet/'+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
async function proof(k:ReturnType<typeof keys>){const c=await post('challenge',{address:k.address});expect(c.status).toBe(200);return sign(null,Buffer.from(c.body.message),k.key.privateKey).toString('base64');}
beforeAll(async()=>{
 if(!process.env.DATABASE_URL?.includes('aoweb_wallet_test_'))throw Error('Isolated database required');
 for(const f of ['schema.sql','wallet-schema.sql','economy-schema.sql','game-assets-schema.sql'])await pool.query(fs.readFileSync(f,'utf8'));
 const a=await registerAccount({name:'Walletsecurity',email:'wallet@example.invalid',password:'Securetest123!'});token=a.sessionToken;account=a.account._id;
 const app=express();app.use(express.json());installWalletRoutes(app);server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));url='http://127.0.0.1:'+(server.address() as any).port;
});
afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));await pool.end();});
test('wallet proof is verified and consumed once',async()=>{
 const k=keys(),signature=await proof(k);expect((await post('verify',{signature})).status).toBe(200);expect((await post('verify',{signature})).body.error).toBe('wallet.expiredProof');
});
test('a stolen older session cannot replace the linked wallet',async()=>{
 await pool.query("UPDATE auth_sessions SET created_at=NOW()-INTERVAL '11 minutes' WHERE account_id=$1",[account]);
 const signature=await proof(keys());expect((await post('verify',{signature})).body.error).toBe('wallet.reauthenticate');
 await pool.query('UPDATE auth_sessions SET created_at=NOW() WHERE account_id=$1',[account]);
});
test('wallet changes are blocked by active play and then allowed after logout',async()=>{
 const character=randomUUID();await pool.query("INSERT INTO characters(id,account_id,name,connected) VALUES($1,$2,'Walletplayer',TRUE)",[character,account]);
 const k=keys(),signature=await proof(k);expect((await post('verify',{signature})).body.error).toBe('wallet.finishOperations');
 await pool.query('UPDATE characters SET connected=FALSE WHERE id=$1',[character]);
 expect((await post('verify',{signature})).status).toBe(200);
 expect((await pool.query('SELECT address FROM account_wallets WHERE account_id=$1',[account])).rows[0].address).toBe(k.address);
});
