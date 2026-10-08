// Real HTTP transport faults on disposable loopback listeners; no chain broadcast.
const assert=require('node:assert/strict'),http=require('node:http');
const {createDevnetFetch}=require('../dist/economy-rpc');
const {createBoundedRpcFetch,RpcCapacity}=require('../dist/rpcCapacity');
const genesis='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
async function fixture(run){
 const calls=[];let mode='ok',primary=0;
 const server=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  calls.push({path:req.url,body});
  if(req.url==='/primary')primary++;
  if(mode==='slow'){res.writeHead(200,{'content-type':'application/json'});res.write('{"result":');return;}
  if(mode==='large'){res.end('x'.repeat(128));return;}
  if(mode==='http-error'){res.writeHead(503);res.end('unavailable');return;}
  if(mode==='throttle'||mode==='wrong-network'||(mode==='recover'&&primary<3)){
   if(req.url==='/primary'){res.writeHead(429);res.end('busy');return;}
   if(JSON.parse(body).method==='getGenesisHash'){res.end(JSON.stringify({result:mode==='wrong-network'?'mainnet':genesis}));return;}
  }
  res.end('{"result":"fixture"}');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address='http://127.0.0.1:'+server.address().port;
 const adapter=(url,init)=>fetch(address+(String(url).includes('tatum')?'/fallback':'/primary'),init);
 const capacity=new RpcCapacity(1,1,100);
 const bounded=createBoundedRpcFetch(adapter,capacity,64);
 const waits=[],transport=createDevnetFetch(bounded,Date.now,async ms=>{waits.push(ms);});
 try{await run({calls,waits,transport,bounded,mode:value=>{mode=value;primary=0;}});}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
const body=JSON.stringify({jsonrpc:'2.0',id:1,method:'sendTransaction',params:['offline-fixture-bytes']});
const input='https://api.devnet.solana.com';
(async()=>{
 await fixture(async f=>{
  f.mode('recover');assert.equal((await f.transport(input,{method:'POST',body})).status,200);
  assert.equal(f.calls.length,3);assert.ok(f.calls.every(call=>call.body===body));assert.deepEqual(f.waits,[250,750]);
 });
 await fixture(async f=>{
  f.mode('http-error');assert.equal((await f.transport(input,{method:'POST',body})).status,503);assert.equal(f.calls.length,1);
 });
 await fixture(async f=>{
  f.mode('wrong-network');await assert.rejects(()=>f.transport(input,{method:'POST',body}));
  assert.equal(f.calls.length,4);assert.equal(f.calls.filter(call=>call.path==='/fallback'&&call.body===body).length,0);
 });
 await fixture(async f=>{
  f.mode('throttle');assert.equal((await f.transport(input,{method:'POST',body})).status,200);
  assert.equal(f.calls.length,5);assert.equal(f.calls[4].body,body);
 });
 await fixture(async f=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>f.transport(input,{method:'POST',body,signal:controller.signal}));assert.equal(f.calls.length,0);
  f.mode('slow');await assert.rejects(()=>f.transport(input,{method:'POST',body,signal:AbortSignal.timeout(150)}));
  assert.equal(f.calls.length,1); // Interrupted bodies must not retry or fail over.
  f.mode('ok');assert.equal((await f.transport(input,{method:'POST',body})).status,200); // Capacity lease released.
 });
 await fixture(async f=>{
  f.mode('large');await assert.rejects(()=>f.bounded(input,{method:'POST',body}),/economy.rpcBusy/);
  f.mode('ok');assert.equal((await f.bounded(input,{method:'POST',body})).status,200);
 });
 console.log('Loopback RPC outage rehearsal passed: HTTP 429 bounded retries, exact-byte fallback after devnet verification, wrong-network denial, no 503 retry, caller cancellation, stalled body and capacity recovery. No live provider or blockchain transaction was used.');
})().catch(error=>{console.error('Loopback RPC outage rehearsal failed:',error.name);process.exitCode=1;});
