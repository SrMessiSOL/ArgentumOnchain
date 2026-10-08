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
  if(cfg.proxyHmacKey!==undefined&&!/^[a-f0-9]{64}$/i.test(cfg.proxyHmacKey))throw Error('Invalid separate proxy credential');
  for (const field of ['backendOrigin', 'siteOrigin']) {
    const url = new URL(cfg[field]);
    if (url.protocol !== 'https:' || url.origin !== cfg[field]) throw Error('Expected exact HTTPS origins');
  }
  return cfg;
}

function createGateway(readConfig, ports = {api:3101, game:7766}) {
  const verifyProxy=createVerifier();
  function getConfig(req) {
    try {
      const cfg = validateConfig(readConfig());
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
    // A fixed, authenticated diagnostic can establish Vercel key matching while
    // every player/internal route stays disabled. It never contacts the API.
    if(req.method==='GET'&&req.url==='/player-api/proxy-health'){
      try{
        const cfg=validateConfig(readConfig());
        if(req.headers.host!==new URL(cfg.backendOrigin).host){res.writeHead(503);return res.end();}
        if(req.headers.origin&&req.headers.origin!==cfg.siteOrigin){res.writeHead(403);return res.end();}
        if(!verifyProxy(req,cfg.proxyHmacKey)){res.writeHead(403);return res.end();}
        res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
        return res.end(JSON.stringify({proxyVerified:true,gatewayClosed:cfg.enabled!==true}));
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
module.exports={playerRoute,validateConfig,createGateway};
if(require.main===module)createGateway(()=>JSON.parse(fs.readFileSync(process.argv[2],'utf8'))).listen(3103,'127.0.0.1');
