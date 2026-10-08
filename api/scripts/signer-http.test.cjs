const assert=require('node:assert/strict'),http=require('node:http');
const {randomUUID}=require('node:crypto');
const {signerHttpHandler}=require('../dist/signer/http');
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
