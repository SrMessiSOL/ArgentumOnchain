const http = require('node:http');
const fs = require('node:fs');
const {fields:proxyFields,createVerifier}=require('./backend-proxy-proof.cjs');

const routes = {
  GET: [
    /^\/(runtime-config|ranking|wiki|user-online-stats|game-assets\/metadata)$/,
    /^\/auth\/(session|me|character-settings|preferences|wallet|achievements|economy|cosmetics|game-assets(?:\/wallet)?|clans(?:\/[0-9a-f-]{36})?)$/i,
    /^\/auth\/password-reset\/[A-Za-z0-9_-]+$/,
  ],
  POST: [
    /^\/auth\/(register|login|logout|select-character|create-character|game-ticket|password-reset\/(request|confirm)|wallet\/(challenge|verify)|achievements\/title|cosmetics\/(claim|equip)|game-assets\/(prepare|submit|reconcile)|economy\/(list|cancel|item-list|item-cancel|prepare|submit|reconcile))$/,
  ],
  PUT: [/^\/auth\/(character-settings|preferences)$/],
  DELETE: [/^\/auth\/characters\/[0-9a-f-]{36}$/i],
};

function playerRoute(method, path) {
  // Reject encoded separators, dot segments and parser normalization tricks.
  if (!path.startsWith('/player-api/') || /[%\\]|\/\/?\./.test(path)) return null;
  const target = path.slice('/player-api'.length);
  return routes[method]?.some(pattern => pattern.test(target)) ? target : null;
}

function validateConfig(cfg) {
  if(cfg.metadataEnabled!==undefined&&typeof cfg.metadataEnabled!=='boolean')throw Error('Invalid metadata switch');
  if(cfg.proxyHmacKey!==undefined&&!/^[a-f0-9]{64}$/i.test(cfg.proxyHmacKey))throw Error('Invalid separate proxy credential');
  for (const field of ['backendOrigin', 'siteOrigin']) {
    const url = new URL(cfg[field]);
    if (url.protocol !== 'https:' || url.origin !== cfg[field]) throw Error('Expected exact HTTPS origins');
  }
  return cfg;
}

function createGateway(readConfig, ports = {api:3101, game:7766}) {
  const windowOpen=cfg=>cfg.testingExpiresAt===undefined||(Number.isFinite(Date.parse(cfg.testingExpiresAt))&&Date.now()<Date.parse(cfg.testingExpiresAt));
  const verifyProxy=createVerifier();
  let metadataActive=0,metadataWindow=0,metadataReads=0;
  function getConfig(req) {
    try {
      const cfg = validateConfig(readConfig());
      if(!windowOpen(cfg))return null;
      return cfg.enabled === true && req.headers.host === new URL(cfg.backendOrigin).host ? cfg : null;
    } catch { return null; }
  }
  function headers(req, cfg,verifiedIp) {
    const result = {...req.headers};
    for (const name of [...proxyFields,'x-forwarded-for','x-real-ip','x-aochain-client-ip','cf-connecting-ip','x-game-data-admin-token','cookie']) delete result[name];
    if(verifiedIp)result['x-aochain-client-ip']=verifiedIp;
    // Only the verified Vercel proof may supply an API budget identity.
    result.host = '127.0.0.1';
    result['x-forwarded-proto'] = 'https';
    result['x-forwarded-host'] = new URL(cfg.backendOrigin).host;
    return result;
  }
  const server = http.createServer((req,res) => {
    // Public NFT metadata is read-only and may be available while player access
    // stays closed. Exact UUID query only; no cookies or credentials forwarded.
    if(req.method==='GET'&&/^\/player-api\/game-assets\/metadata\?id=[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(req.url||'')){
      try{
        const cfg=validateConfig(readConfig());
        if(cfg.metadataEnabled===true&&req.headers.host===new URL(cfg.backendOrigin).host){
          const now=Date.now();if(now-metadataWindow>=60000){metadataWindow=now;metadataReads=0;}
          if(metadataActive>=2||metadataReads>=60){res.writeHead(429,{'retry-after':'60'});return res.end();}
          metadataActive++;metadataReads++;let released=false;
          const release=()=>{if(!released){released=true;metadataActive--;}};
          const upstream=http.get({hostname:'127.0.0.1',port:ports.api,path:req.url.slice('/player-api'.length),headers:{accept:'application/json',host:'127.0.0.1'}},reply=>{
            let size=0;const chunks=[];reply.on('data',chunk=>{size+=chunk.length;if(size>32768){upstream.destroy();return;}chunks.push(chunk);});
            reply.on('end',()=>{release();if(![200,404].includes(reply.statusCode)){res.writeHead(503);return res.end();}try{const data=JSON.parse(Buffer.concat(chunks));res.writeHead(reply.statusCode,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));}catch{res.writeHead(502);res.end();}});
          });
          upstream.setTimeout(5000,()=>upstream.destroy());
          upstream.on('error',()=>{release();if(!res.headersSent)res.writeHead(502);res.end();});
          req.on('aborted',()=>upstream.destroy());res.on('close',()=>{release();upstream.destroy();});return;
        }
      }catch{res.writeHead(503);return res.end();}
    }
    // A fixed, authenticated diagnostic can establish Vercel key matching while
    // every player/internal route stays disabled. It never contacts the API.
    if(req.method==='GET'&&req.url==='/player-api/proxy-health'){
      try{
        const cfg=validateConfig(readConfig());
        if(req.headers.host!==new URL(cfg.backendOrigin).host){res.writeHead(503);return res.end();}
        if(req.headers.origin&&req.headers.origin!==cfg.siteOrigin){res.writeHead(403);return res.end();}
        if(!verifyProxy(req,cfg.proxyHmacKey)){res.writeHead(403);return res.end();}
        res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
        return res.end(JSON.stringify({proxyVerified:true,gatewayClosed:cfg.enabled!==true||!windowOpen(cfg)}));
      }catch{res.writeHead(503);return res.end();}
    }
    const cfg = getConfig(req);
    if (!cfg) { res.writeHead(503); return res.end('Realm access disabled.'); }
    const rawPath = req.url.split('?')[0];
    const target = playerRoute(req.method, rawPath);
    if (!target) { res.writeHead(404); return res.end(); }
    if (req.headers.origin && req.headers.origin !== cfg.siteOrigin) { res.writeHead(403); return res.end(); }
    const verifiedIp=cfg.proxyHmacKey?verifyProxy(req,cfg.proxyHmacKey):null;
    if(cfg.proxyHmacKey&&target.startsWith('/auth/')&&!verifiedIp){res.writeHead(403);return res.end();}
    const upstream = http.request({hostname:'127.0.0.1',port:ports.api,
      method:req.method,path:target + req.url.slice(rawPath.length),headers:headers(req,cfg,verifiedIp)}, reply => {
      res.writeHead(reply.statusCode,{...reply.headers,'cache-control':'no-store'}); reply.pipe(res);
    });
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Backend unavailable.');});
    upstream.setTimeout(60000,()=>upstream.destroy());
    req.on('aborted',()=>upstream.destroy());
    res.on('close',()=>upstream.destroy());
    req.pipe(upstream);
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on('upgrade',(req,socket,head)=>{
    const cfg=getConfig(req);
    if(!cfg || req.url !== '/game-socket' || req.headers.origin !== cfg.siteOrigin) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
    }
    const upstream=http.request({hostname:'127.0.0.1',port:ports.game,path:'/',headers:headers(req,cfg)});
    upstream.on('upgrade',(reply,remote,remoteHead)=>{
      socket.write(`HTTP/1.1 ${reply.statusCode} ${reply.statusMessage}\r\n` + reply.rawHeaders.reduce((all,value,index,array)=>index%2?all:all+value+': '+array[index+1]+'\r\n','')+'\r\n');
      if(head.length)remote.write(head);
      if(remoteHead.length)socket.write(remoteHead);
      socket.pipe(remote).pipe(socket);
      socket.on('error',()=>remote.destroy());remote.on('error',()=>socket.destroy());
      socket.on('close',()=>remote.destroy());remote.on('close',()=>socket.destroy());
    });
    upstream.setTimeout(10000,()=>upstream.destroy());
    upstream.on('response',()=>socket.destroy());upstream.on('error',()=>socket.destroy());
    socket.on('error',()=>upstream.destroy());upstream.end();
  });
  return server;
}
function parseGatewayConfig(text){return JSON.parse(text.replace(/^\uFEFF/,''));}
module.exports={playerRoute,validateConfig,createGateway,parseGatewayConfig};
if(require.main===module)createGateway(()=>parseGatewayConfig(fs.readFileSync(process.argv[2],'utf8'))).listen(3103,'127.0.0.1');
