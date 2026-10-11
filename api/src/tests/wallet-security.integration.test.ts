import {selectedWallet,assertCharacterWallet} from '../linked-wallet';
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

test('additional wallet preserves active wallet, staked characters and sessions; proof is consumed',async()=>{
 const old=await link(),next=keys(),id=randomUUID();
 await pool.query("INSERT INTO characters(id,account_id,name,connected,chain_state) VALUES($1,$2,'Linkedplayer',FALSE,'legacy')",[id,account]);
 await fixtureChainState(id,'staked');
 const c=(await post('challenge',{address:next.address,mode:'add'})).body;
 const proof={signature:signature(next,c.message)};
 expect((await post('verify',proof)).status).toBe(200);
 expect((await pool.query('SELECT address FROM account_wallets WHERE account_id=$1',[account])).rows[0].address).toBe(old.address);
 expect((await pool.query('SELECT count(*)::int n FROM account_linked_wallets WHERE account_id=$1',[account])).rows[0].n).toBe(2);
 expect(await getPublicSessionByToken(token)).not.toBeNull();
 expect((await post('verify',proof)).body.error).toBe('wallet.expiredProof');
});
test('adding requires its own proof and fresh login, and cannot reuse a wallet owned by another account',async()=>{
 const old=await link(),next=keys(),c=(await post('challenge',{address:next.address,mode:'add'})).body;
 expect(c.requiresPreviousWalletProof).toBe(undefined);
 expect((await post('verify',{signature:signature(keys(),c.message)})).body.error).toBe('wallet.invalidProof');
 await pool.query("UPDATE auth_sessions SET created_at=NOW()-INTERVAL '11 minutes' WHERE account_id=$1",[account]);
 expect((await post('verify',{signature:signature(next,c.message),previousSignature:signature(old,c.message)})).body.error).toBe('wallet.reauthenticate');
 await pool.query('UPDATE auth_sessions SET created_at=NOW() WHERE account_id=$1',[account]);
 const other=await registerAccount({name:'Other'+randomUUID().replaceAll('-','').slice(0,8).replace(/[0-9]/g,'x'),email:randomUUID()+'@example.invalid',password:'Securetest123!'});
 await pool.query('INSERT INTO account_linked_wallets(account_id,address) VALUES($1,$2)',[other.account._id,next.address]);
 expect((await post('verify',{signature:signature(next,c.message),previousSignature:signature(old,c.message)})).body.error).toBe('wallet.alreadyLinked');
});
test('wallet membership limit is five and concurrent submissions only link once',async()=>{
 const old=await link(),next=keys(),c=(await post('challenge',{address:next.address,mode:'add'})).body;
 const proof={signature:signature(next,c.message)};
 const results=await Promise.all([post('verify',proof),post('verify',proof)]);
 expect(results.filter(x=>x.status===200)).toHaveLength(1);
 for(let i=0;i<3;i++)await pool.query('INSERT INTO account_linked_wallets(account_id,address) VALUES($1,$2)',[account,keys().address]);
 const extra=keys(),d=(await post('challenge',{address:extra.address,mode:'add'})).body;
 expect((await post('verify',{signature:signature(extra,d.message),previousSignature:signature(old,d.message)})).body.error).toBe('wallet.limitReached');
});

test('request selection accepts linked wallets only and does not change another session or default',async()=>{
 const old=await link(),next=keys(),c=(await post('challenge',{address:next.address,mode:'add'})).body;
 expect((await post('verify',{signature:signature(next,c.message)})).status).toBe(200);
 expect(await selectedWallet({headers:{'x-aochain-wallet':next.address}} as any,account,pool)).toBe(next.address);
 expect(await selectedWallet({headers:{}} as any,account,pool)).toBe(old.address);
 let rejected=false;try{await selectedWallet({headers:{'x-aochain-wallet':keys().address}} as any,account,pool);}catch{rejected=true;}expect(rejected).toBe(true);
 expect((await pool.query('SELECT address FROM account_wallets WHERE account_id=$1',[account])).rows[0].address).toBe(old.address);
});
test('finalized character ownership blocks another linked wallet and ignores prepared or failed attempts',async()=>{
 const old=await link(),next=keys(),id=randomUUID(),asset=keys().address;
 await pool.query("INSERT INTO characters(id,account_id,name,connected,chain_state,asset_address) VALUES($1,$2,'Walletowned',FALSE,'staked',$3)",[id,account,asset]);
 await pool.query("INSERT INTO game_assets(id,kind,character_id,asset_address,issuer_address,metadata_uri,state) VALUES($1,'character',$1,$2,$3,'https://example.invalid/asset','active')",[id,asset,old.address]);
 await pool.query("INSERT INTO game_asset_operations(id,account_id,character_id,asset_id,kind,state,wallet,transaction_bytes,message_bytes,last_valid_height,completed_at) VALUES($1,$2,$3,$3,'mint','complete',$4,'fixture','fixture',1,NOW())",[randomUUID(),account,id,old.address]);
 await pool.query("INSERT INTO game_asset_operations(id,account_id,character_id,asset_id,kind,state,wallet,transaction_bytes,message_bytes,last_valid_height,completed_at) VALUES($1,$2,$3,$3,'stake','failed',$4,'fixture','fixture',1,NOW()+INTERVAL '1 second')",[randomUUID(),account,id,next.address]);
 await assertCharacterWallet(pool,id,old.address);
 let rejected=false;try{await assertCharacterWallet(pool,id,next.address);}catch{rejected=true;}expect(rejected).toBe(true);
});

async function addLinked(){const k=keys(),c=(await post('challenge',{address:k.address,mode:'add'})).body;expect((await post('verify',{signature:signature(k,c.message)})).status).toBe(200);return k;}
async function ownedFixture(address:string,state='complete'){
 const id=randomUUID(),asset=keys().address;
 await pool.query("INSERT INTO characters(id,account_id,name,connected,chain_state,asset_address) VALUES($1,$2,$3,FALSE,'staked',$4)",[id,account,'U'+id.replaceAll('-','').slice(0,10),state==='complete'?asset:null]);
 await pool.query("INSERT INTO game_assets(id,kind,character_id,asset_address,issuer_address,metadata_uri,state) VALUES($1,'character',$1,$2,$3,'https://example.invalid/unlink','active')",[id,asset,address]);
 await pool.query("INSERT INTO game_asset_operations(id,account_id,character_id,asset_id,kind,state,wallet,transaction_bytes,message_bytes,last_valid_height,completed_at) VALUES($1,$2,$3,$3,'mint',$4,$5,'fixture','fixture',1,NOW())",[randomUUID(),account,id,state,address]);return id;
}
test('unlink empty wallet preserves other memberships and selects a valid fallback',async()=>{
 const old=await link(),next=await addLinked();
 expect((await post('unlink',{address:old.address})).body.unlinked).toBe(old.address);
 expect(await selectedWallet({headers:{}} as any,account,pool)).toBe(next.address);
 await expect(selectedWallet({headers:{'x-aochain-wallet':old.address}} as any,account,pool)).rejects.toThrow();
 expect((await post('unlink',{address:old.address})).body.error).toBe('wallet.notLinked');
 expect((await post('unlink',{address:next.address})).status).toBe(200);
 expect((await pool.query('SELECT address FROM account_wallets WHERE account_id=$1',[account])).rowCount).toBe(0);
});
test('unlink rejects owned character including withdrawn state; unrelated wallet can be removed',async()=>{
 const old=await link(),next=await addLinked(),id=await ownedFixture(old.address);
 expect((await post('unlink',{address:old.address})).body.error).toBe('wallet.ownsCharacter');
 await fixtureChainState(id,'unstaked');
 expect((await post('unlink',{address:old.address})).body.error).toBe('wallet.ownsCharacter');
 expect((await post('unlink',{address:next.address})).status).toBe(200);
});
test('unlink fails closed for minted characters without verified custody history',async()=>{
 const old=await link();await pool.query("INSERT INTO characters(id,account_id,name,asset_address,chain_state) VALUES($1,$2,'Unknowncustody',$3,'unstaked')",[randomUUID(),account,keys().address]);
 expect((await post('unlink',{address:old.address})).body.error).toBe('wallet.ownsCharacter');
});
test('unlink rejects pending wallet operations, foreign addresses and stale sessions',async()=>{
 const old=await link();await ownedFixture(old.address,'prepared');
 expect((await post('unlink',{address:old.address})).body.error).toBe('wallet.pendingOperations');
 expect((await post('unlink',{address:keys().address})).body.error).toBe('wallet.notLinked');
 await pool.query("UPDATE auth_sessions SET created_at=NOW()-INTERVAL '11 minutes' WHERE account_id=$1",[account]);
 expect((await post('unlink',{address:old.address})).body.error).toBe('wallet.reauthenticate');
 expect((await pool.query('SELECT 1 FROM account_linked_wallets WHERE account_id=$1 AND address=$2',[account,old.address])).rowCount).toBe(1);
});
test('unlink waits for in-flight wallet membership readers and cannot race preparation',async()=>{
 const old=await link(),client=await pool.connect();await client.query('BEGIN');
 try{await selectedWallet({headers:{'x-aochain-wallet':old.address}} as any,account,client);let settled=false;const request=post('unlink',{address:old.address}).then(result=>{settled=true;return result;});await new Promise(r=>setTimeout(r,100));expect(settled).toBe(false);await client.query('COMMIT');expect((await request).status).toBe(200);}finally{await client.query('ROLLBACK');client.release();}
});

test('unlink follows latest finalized custody and blocks active marketplace listings',async()=>{
 const old=await link(),next=await addLinked(),id=await ownedFixture(old.address);
 await pool.query("INSERT INTO game_asset_operations(id,account_id,character_id,asset_id,kind,state,wallet,transaction_bytes,message_bytes,last_valid_height,completed_at) VALUES($1,$2,$3,$3,'stake','complete',$4,'fixture','fixture',1,NOW()+INTERVAL '1 second')",[randomUUID(),account,id,next.address]);
 expect((await post('unlink',{address:old.address})).status).toBe(200);
 expect((await post('unlink',{address:next.address})).body.error).toBe('wallet.ownsCharacter');
});
test('unlink cannot abandon a character listing even when the character is unminted',async()=>{
 const old=await link(),id=randomUUID();await pool.query("INSERT INTO characters(id,account_id,name,connected,chain_state) VALUES($1,$2,'Unlinksale',FALSE,'legacy')",[id,account]);
 await pool.query("INSERT INTO character_sales(id,character_id,seller_id,seller_wallet,price,state) VALUES($1,$2,$3,$4,1000000,'listed')",[randomUUID(),id,account,old.address]);
 expect((await post('unlink',{address:old.address})).body.error).toBe('wallet.pendingOperations');
});
