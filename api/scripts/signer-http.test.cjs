const assert=require('node:assert/strict'),http=require('node:http');
const {randomUUID}=require('node:crypto');
const {signerHttpHandler}=require('../dist/signer/http');
const {createCustodyHandlers}=require('../dist/signer/handlers');
const {Keypair}=require('@solana/web3.js');
const path=require('node:path'),os=require('node:os');
const token='f'.repeat(64),id=randomUUID();
async function fixture(enabled,run){
 let calls=0;
 const handlers={identity:async()=>{calls++;return {address:'public-asset',issuer:'public-issuer',secret:'must-not-leave'};},economy:async()=>{calls++;return {id,message:'message',bytes:'bytes',signature:'signature',secret:'must-not-leave'};},asset:async()=>{throw Error('private diagnostics');}};
 const server=http.createServer(signerHttpHandler(token,enabled,handlers));
 server.requestTimeout=1000;server.headersTimeout=1000;
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port;
 const request=(route,body,authorization='Bearer '+token)=>fetch(url+route,{method:'POST',headers:{authorization,'content-type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)});
 try{await run(request,()=>calls,url);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
(async()=>{
 const issuer=Keypair.generate();let queries=0;
 const options={issuer,pool:{query:async()=>{queries++;return {rows:[]};}},journal:path.join(os.tmpdir(),'fixture-journal'),budget:{directory:path.join(os.tmpdir(),'fixture-budget'),maximumGold:10,maximumAssets:1,maximumCosmetics:1},metadataOrigin:'https://fixture.invalid',mint:Keypair.generate().publicKey.toBase58(),maximumGold:10,maximumLamports:100};
 const bound=createCustodyHandlers(options);
 const publicIdentity=await bound.identity(id);
 assert.deepEqual(Object.keys(publicIdentity).sort(),['address','issuer']);
 assert.equal(publicIdentity.issuer,issuer.publicKey.toBase58());
 await assert.rejects(()=>bound.identity('../escape'));
 await assert.rejects(()=>bound.economy(id,'fixture'));
 await assert.rejects(()=>bound.asset(id,'fixture'));
 assert.equal(queries,2); // Missing committed state is denied before RPC or signing.
 assert.throws(()=>createCustodyHandlers({...options,metadataOrigin:'http://fixture.invalid'}));
 assert.throws(()=>createCustodyHandlers({...options,maximumGold:Infinity}));
 await fixture(false,async(request,calls,url)=>{
  assert.equal((await request('/economy-submit',{id,transaction:'fixture'})).status,503);
  assert.equal((await request('/economy-submit',{id},token)).status,401);
  assert.equal(calls(),0);
  assert.deepEqual(await (await fetch(url+'/health',{headers:{authorization:'Bearer '+token}})).json(),{ok:true,enabled:false});
 });
 await fixture(true,async(request,calls)=>{
  assert.deepEqual(await (await request('/asset-identity',{id})).json(),{address:'public-asset',issuer:'public-issuer'});
  assert.equal((await request('/asset-identity',{id,extra:'forbidden'})).status,400);
  assert.equal((await request('/asset-identity',{id:'../escape'})).status,400);
  assert.equal((await request('/sign-anything',{id})).status,404);
  assert.equal((await request('/economy-submit','{')).status,400);
  assert.equal((await request('/economy-submit','x'.repeat(4097))).status,413);
  assert.deepEqual(await (await request('/economy-submit',{id,transaction:'fixture'})).json(),{id,message:'message',bytes:'bytes',signature:'signature'});
  assert.deepEqual(await (await request('/asset-submit',{id,transaction:'fixture'})).json(),{error:'signer.denied'});
  assert.equal(calls(),2);
 });
 console.log('Signer HTTP authentication, disabled mode, fixed routes, body limits and public-only responses passed; fixture hooks only.');
})().catch(()=>{console.error('Signer HTTP regression failed');process.exitCode=1;});
