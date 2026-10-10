const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const net=require('node:net');
const {playerRoute,validateConfig,createGateway}=require('./backend-gateway.cjs');
test('closed gateway optional metadata is exact, bounded and credential-free',async t=>{
 const received=[];const api=http.createServer((req,res)=>{received.push(req.headers);res.setHeader('content-type','application/json');res.end(JSON.stringify({name:'fixture',attributes:[]}));});
 await new Promise(r=>api.listen(0,'127.0.0.1',r));
 const cfg={enabled:false,metadataEnabled:true,backendOrigin:'https://backend.example',siteOrigin:'https://site.example'};
 const gateway=createGateway(()=>cfg,{api:api.address().port,game:1});await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
 t.after(()=>{gateway.closeAllConnections();gateway.close();api.closeAllConnections();api.close();});
 const request=(url,method='GET')=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:gateway.address().port,path:url,method,headers:{host:'backend.example',authorization:'Bearer secret-fixture',cookie:'fixture=secret','x-game-data-admin-token':'secret'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end();});
 const url='/player-api/game-assets/metadata?id=01234567-89ab-cdef-0123-456789abcdef';
 assert.equal(await request(url),200);assert.equal(received[0].authorization,undefined);assert.equal(received[0].cookie,undefined);assert.equal(received[0]['x-game-data-admin-token'],undefined);
 for(const blocked of [url+'&extra=1',url.replace('id=','id=%'),'/player-api/auth/session','/player-api/internal/save'])assert.equal(await request(blocked),503);
 assert.equal(await request(url,'POST'),503);
 cfg.metadataEnabled=false;assert.equal(await request(url),503);cfg.metadataEnabled=true;
 for(let i=1;i<60;i++)assert.equal(await request(url),200);
 assert.equal(await request(url),429);assert.equal(received.length,60);
});
test('signed closed diagnostic returns only booleans and cannot open player routes',async t=>{
 const {createHmac,randomBytes}=require('node:crypto'),{canonical}=require('./backend-proxy-proof.cjs');
 const key='ab'.repeat(32),gateway=createGateway(()=>({enabled:false,backendOrigin:'https://backend.example',siteOrigin:'https://site.example',proxyHmacKey:key}),{api:1,game:1});
 await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
 t.after(()=>{gateway.closeAllConnections();gateway.close();});
 const request=(path,headers={})=>new Promise((resolve,reject)=>{http.get({host:'127.0.0.1',port:gateway.address().port,path,headers:{host:'backend.example',...headers}},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>resolve({status:res.statusCode,body}));}).on('error',reject);});
 const path='/player-api/proxy-health',ip='203.0.113.4',time=String(Date.now()),nonce=randomBytes(16).toString('hex');
 const signed={'x-aochain-proxy-ip':ip,'x-aochain-proxy-time':time,'x-aochain-proxy-nonce':nonce,'x-aochain-proxy-proof':createHmac('sha256',key).update(canonical('GET',path,ip,time,nonce,'')).digest('hex')};
 assert.equal((await request(path)).status,403);
 const valid=await request(path,signed);assert.equal(valid.status,200);assert.deepEqual(JSON.parse(valid.body),{proxyVerified:true,gatewayClosed:true});
 assert.equal((await request(path,signed)).status,403);
 for(const blocked of ['/player-api/auth/session','/player-api/internal/save','/player-api/proxy-health?extra=1'])assert.equal((await request(blocked,signed)).status,503);
});
test('configured gateway requires signed identity for auth and removes proof headers',async t=>{
  const {createHmac}=require('node:crypto'),{canonical}=require('./backend-proxy-proof.cjs');
  const received=[],key='ab'.repeat(32);
  const api=http.createServer((req,res)=>{received.push(req.headers);res.end('ok');});
  await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));
  const gateway=createGateway(()=>({enabled:true,backendOrigin:'https://backend.example',siteOrigin:'https://site.example',proxyHmacKey:key}),{api:api.address().port,game:1});
  await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
  t.after(()=>{gateway.closeAllConnections();gateway.close();api.closeAllConnections();api.close();});
  const path='/player-api/auth/session',ip='203.0.113.4',time=String(Date.now()),nonce='cd'.repeat(16),authorization='Bearer fixture';
  const proof=createHmac('sha256',key).update(canonical('GET',path,ip,time,nonce,authorization)).digest('hex');
  const request=headers=>new Promise((resolve,reject)=>{http.get({hostname:'127.0.0.1',port:gateway.address().port,path,headers:{host:'backend.example',authorization,...headers}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));}).on('error',reject);});
  assert.equal(await request({'x-aochain-client-ip':ip}),403);
  const signed={'x-aochain-proxy-ip':ip,'x-aochain-proxy-time':time,'x-aochain-proxy-nonce':nonce,'x-aochain-proxy-proof':proof};
  assert.equal(await request(signed),200);assert.equal(await request(signed),403);
  assert.equal(received.length,1);assert.equal(received[0]['x-aochain-client-ip'],ip);assert.equal(received[0]['x-aochain-proxy-proof'],undefined);
});
test('routes deny internal, administrative, encoded and unknown paths',()=>{
  for(const path of ['/internal/runtime-config','/admin/game-data/objects','/runtime-config/admin','/auth/new-route','/auth/game-ticket/consume','/auth/../internal','/auth/%2e%2e/internal','/auth\\login']) {
    for(const method of ['GET','POST','PUT','DELETE'])assert.equal(playerRoute(method,'/player-api'+path),null);
  }
  assert.equal(playerRoute('POST','/player-api/auth/login'),'/auth/login');
  assert.equal(playerRoute('GET','/player-api/auth/login'),null);
  assert.equal(playerRoute('GET','/player-api/wiki'),'/wiki');
  assert.throws(()=>validateConfig({backendOrigin:'http://example.com',siteOrigin:'https://site.example'}));
});
test('gateway routes player requests, strips identity spoofing and fails closed',async t=>{
  const received=[];
  const api=http.createServer((req,res)=>{received.push({url:req.url,headers:req.headers});res.end('ok');});
  await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));
  let cfg={enabled:true,backendOrigin:'https://backend.example',siteOrigin:'https://site.example'};
  const gateway=createGateway(()=>cfg,{api:api.address().port,game:1});
  await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
  t.after(()=>{gateway.closeAllConnections();gateway.close();api.closeAllConnections();api.close();});
  const request=(path,extra={})=>new Promise((resolve,reject)=>{
    const req=http.get({hostname:'127.0.0.1',port:gateway.address().port,path,headers:{host:'backend.example',...extra}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);
  });
  assert.equal(await request('/player-api/wiki?locale=en',{'x-aochain-client-ip':'1.2.3.4','x-game-data-admin-token':'fake','x-forwarded-for':'1.2.3.4'}),200);
  assert.equal(received[0].url,'/wiki?locale=en');
  assert.equal(received[0].headers['x-aochain-client-ip'],undefined);
  assert.equal(received[0].headers['x-game-data-admin-token'],undefined);
  assert.equal(await request('/player-api/internal/runtime-config'),404);
  assert.equal(await request('/player-api/wiki',{origin:'https://evil.example'}),403);
  assert.equal(await request('/player-api/wiki',{host:'evil.example'}),503);
  cfg.enabled=false;assert.equal(await request('/player-api/wiki'),503);cfg.enabled=true;
  const upgrade=await new Promise((resolve,reject)=>{
    const socket=net.connect(gateway.address().port,'127.0.0.1',()=>socket.write('GET /game-socket HTTP/1.1\r\nHost: backend.example\r\nOrigin: https://evil.example\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'));
    socket.on('data',bytes=>{resolve(bytes.toString());socket.destroy();});socket.on('error',reject);
  });
  assert.match(upgrade,/403 Forbidden/);
  assert.equal(received.length,1);
  cfg.testingExpiresAt=new Date(Date.now()-1000).toISOString();
  assert.equal(await request('/player-api/wiki'),503);
  cfg.testingExpiresAt='invalid';assert.equal(await request('/player-api/wiki'),503);
  cfg.testingExpiresAt=new Date(Date.now()+60000).toISOString();
  assert.equal(await request('/player-api/wiki'),200);
});
