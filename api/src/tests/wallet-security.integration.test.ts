import {beforeAll,beforeEach,afterAll,test,expect} from 'vitest';
import fs from 'node:fs';
import express from 'express';
import type {Server} from 'node:http';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import bs58 from 'bs58';
import pool from '../db';
import {registerAccount,loginAccount,getPublicSessionByToken} from '../repositories/auth';
import {credentialHash} from '../lib/sessionTokens';
import {installWalletRoutes} from '../wallet-routes';
let server:Server,url:string,token:string,account:string,email:string;
const keys=()=>{const key=generateKeyPairSync('ed25519');return {key,address:bs58.encode(key.publicKey.export({format:'der',type:'spki'}).subarray(-32))};};
const signature=(k:ReturnType<typeof keys>,message:string)=>sign(null,Buffer.from(message),k.key.privateKey).toString('base64');
async function post(path:string,body:unknown){const r=await fetch(url+'/auth/wallet/'+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
async function challenge(k:ReturnType<typeof keys>){const c=await post('challenge',{address:k.address});expect(c.status).toBe(200);return c.body;}
async function fixtureChainState(id:string,state:string){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('aoweb.economy_writer','yes',true)");await c.query('UPDATE characters SET connected=FALSE,chain_state=$2 WHERE id=$1',[id,state]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function link(){const old=keys(),c=await challenge(old);expect((await post('verify',{signature:signature(old,c.message)})).status).toBe(200);return old;}
beforeAll(async()=>{
 if(!process.env.DATABASE_URL?.includes('aoweb_wallet_test_'))throw Error('Isolated database required');
 for(const f of ['schema.sql','wallet-schema.sql','economy-schema.sql','game-assets-schema.sql'])await pool.query(fs.readFileSync(f,'utf8'));
 const app=express();app.use(express.json());installWalletRoutes(app);server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));url='http://127.0.0.1:'+(server.address() as any).port;
});
beforeEach(async()=>{const id=randomUUID().replaceAll('-','');email=id+'@example.invalid';const a=await registerAccount({name:'W'+id.slice(0,10).replace(/[0-9]/g,d=>String.fromCharCode(103+Number(d))),email,password:'Securetest123!'});token=a.sessionToken;account=a.account._id;});
afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));await pool.end();});
test('wallet proof is verified and consumed once',async()=>{const k=keys(),c=await challenge(k),proof=signature(k,c.message);expect((await post('verify',{signature:proof})).status).toBe(200);expect((await post('verify',{signature:proof})).body.error).toBe('wallet.expiredProof');});
test('a stolen older session cannot replace the linked wallet even with both wallet proofs',async()=>{
 const old=await link(),next=keys();await pool.query("UPDATE auth_sessions SET created_at=NOW()-INTERVAL '11 minutes' WHERE account_id=$1",[account]);
 const c=await challenge(next);expect((await post('verify',{signature:signature(next,c.message),previousSignature:signature(old,c.message)})).body.error).toBe('wallet.reauthenticate');
});
test('wallet replacement requires a valid previous-wallet signature bound to the current challenge',async()=>{
 const old=await link(),next=keys(),earlier=await challenge(next),c=await challenge(next);expect(c.requiresPreviousWalletProof).toBe(true);expect(c.previousWallet).toBe(old.address);
 const proof=signature(next,c.message);
 for(const previousSignature of [undefined,signature(keys(),c.message),signature(old,earlier.message)])expect((await post('verify',{signature:proof,previousSignature})).body.error).toBe('wallet.previousProofRequired');
 expect((await pool.query('SELECT address FROM account_wallets WHERE account_id=$1',[account])).rows[0].address).toBe(old.address);
});
test('replacement revokes other sessions and tickets but preserves the approving session; replay is rejected',async()=>{
 const old=await link(),other=await loginAccount({identifier:email,password:'Securetest123!'}),next=keys(),c=await challenge(next);await pool.query("INSERT INTO game_tickets(ticket,auth_token,account_id,expires_at,mode) VALUES($1,$2,$3,NOW()+INTERVAL '1 minute','arena')",[credentialHash(randomUUID()),credentialHash(other.sessionToken),account]);const payload={signature:signature(next,c.message),previousSignature:signature(old,c.message)};
 expect((await post('verify',payload)).status).toBe(200);expect(await getPublicSessionByToken(other.sessionToken)).toBeNull();expect(await getPublicSessionByToken(token)).not.toBeNull();expect((await post('verify',payload)).body.error).toBe('wallet.expiredProof');
 expect((await pool.query('SELECT address FROM account_wallets WHERE account_id=$1',[account])).rows[0].address).toBe(next.address);expect((await pool.query('SELECT count(*)::int n FROM game_tickets WHERE account_id=$1',[account])).rows[0].n).toBe(0);
});
test('wallet replacement is blocked by active play or staking and succeeds only after both clear',async()=>{
 const old=await link(),id=randomUUID();await pool.query("INSERT INTO characters(id,account_id,name,connected,chain_state) VALUES($1,$2,'Walletplayer',TRUE,'legacy')",[id,account]);
 const next=keys(),c=await challenge(next),payload={signature:signature(next,c.message),previousSignature:signature(old,c.message)};
 expect((await post('verify',payload)).body.error).toBe('wallet.finishOperations');await fixtureChainState(id,'staked');expect((await post('verify',payload)).body.error).toBe('wallet.finishOperations');
 await fixtureChainState(id,'unstaked');expect((await post('verify',payload)).status).toBe(200);
});
test('invalid proof cannot consume the challenge and same-wallet reverification needs no previous proof',async()=>{
 const old=await link(),c=await challenge(old);expect((await post('verify',{signature:signature(keys(),c.message)})).body.error).toBe('wallet.invalidProof');expect((await post('verify',{signature:signature(old,c.message)})).status).toBe(200);
});
test('wallet challenge attempts are bounded per account and route',async()=>{
 const k=keys();for(let i=0;i<10;i++)expect((await post('challenge',{address:k.address})).status).toBe(200);expect((await post('challenge',{address:k.address})).status).toBe(429);
});

test('concurrent replacement retries settle once and consume the challenge',async()=>{
 const old=await link(),next=keys(),c=await challenge(next),payload={signature:signature(next,c.message),previousSignature:signature(old,c.message)};
 const results=await Promise.all([post('verify',payload),post('verify',payload)]);expect(results.filter(r=>r.status===200)).toHaveLength(1);expect(results.filter(r=>r.body.error==='wallet.expiredProof')).toHaveLength(1);
 expect((await pool.query('SELECT address FROM account_wallets WHERE account_id=$1',[account])).rows[0].address).toBe(next.address);
});
