const assert=require('node:assert/strict');
const {apiRequest}=require('../dist/apiRequest.js');
const original=global.fetch;
const reset=()=>Object.assign(new TypeError('fetch failed'),{cause:{code:'ECONNRESET'}});
(async()=>{try{
 let calls=0;
 global.fetch=async(_url,options)=>{assert.equal(options.redirect,'error');if(++calls===1)throw reset();return Response.json({ok:true});};
 assert.deepEqual(await apiRequest('http://127.0.0.1/fixture'),{ok:true});assert.equal(calls,2);
 calls=0;global.fetch=async()=>{calls++;throw reset();};
 await assert.rejects(apiRequest('http://127.0.0.1/fixture'),/fetch failed/);assert.equal(calls,2);
 for(const method of ['POST','PUT','DELETE']){calls=0;await assert.rejects(apiRequest('http://127.0.0.1/fixture',{method}),/fetch failed/);assert.equal(calls,1);}
 calls=0;global.fetch=async()=>{calls++;return Response.json({error:'unavailable'},{status:503});};
 await assert.rejects(apiRequest('http://127.0.0.1/fixture'),/unavailable/);assert.equal(calls,1);
 global.fetch=async(_url,{signal})=>({ok:true,json:()=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))});
 await assert.rejects(apiRequest('http://127.0.0.1/fixture',{},30),/timed out/);
 console.log('API request tests passed: single read reset retry, no write/HTTP-status retries and response-body deadline.');
}finally{global.fetch=original;}})().catch(error=>{console.error(error);process.exitCode=1;});
