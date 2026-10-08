const assert=require('node:assert/strict'),{createHmac}=require('node:crypto');
const {canonical,createVerifier}=require('./backend-proxy-proof.cjs');
const key='ab'.repeat(32),now=1800000000000;
function request(overrides={}){
 const req={method:'POST',url:'/player-api/auth/login',headers:{'x-aochain-proxy-ip':'203.0.113.4','x-aochain-proxy-time':String(now),'x-aochain-proxy-nonce':'cd'.repeat(16),authorization:'Bearer fixture'}};
 req.headers['x-aochain-proxy-proof']=createHmac('sha256',key).update(canonical(req.method,req.url,req.headers['x-aochain-proxy-ip'],String(now),req.headers['x-aochain-proxy-nonce'],req.headers.authorization)).digest('hex');
 return {...req,...overrides,headers:{...req.headers,...overrides.headers}};
}
const verifier=createVerifier();assert.equal(verifier(request(),key,now),'203.0.113.4');assert.equal(verifier(request(),key,now),null);
for(const change of [{method:'GET'},{url:'/player-api/auth/register'},{headers:{authorization:'Bearer changed'}},{headers:{'x-aochain-proxy-ip':'203.0.113.5'}},{headers:{'x-aochain-proxy-proof':['fake']}},{headers:{'x-aochain-proxy-time':'0'}}])assert.equal(createVerifier()(request(change),key,now),null);
assert.equal(createVerifier()(request(),key,now+30001),null);assert.equal(createVerifier()(request(),'ef'.repeat(32),now),null);
console.log('Proxy identity rejects replay, stale proof, changed method/path/IP/authorization, malformed headers and wrong credentials.');
