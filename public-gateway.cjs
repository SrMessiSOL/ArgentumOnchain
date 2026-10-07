// Temporary public trial: only the production website and game WebSocket.
// PostgreSQL, the internal API and the Next development server are not routed.
const http = require('node:http');
const fs = require('node:fs');
const configFile = process.argv[2];
function config() {
  try { return JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch { return null; }
}
function allowed(req, cfg) {
  return cfg?.enabled && req.headers.host === new URL(cfg.url).host;
}
function headers(req, cfg) {
  const result = {...req.headers};
  delete result['x-forwarded-for'];
  delete result['x-real-ip'];
  delete result['x-aochain-client-ip'];
  result['x-aochain-client-ip'] = req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown';
  result['x-forwarded-host'] = new URL(cfg.url).host;
  result['x-forwarded-proto'] = 'https';
  return result;
}
const server = http.createServer((req, res) => {
  const cfg = config();
  if (!allowed(req, cfg)) { res.writeHead(503); return res.end('Server preparing for play.'); }
  const pathname = new URL(req.url, cfg.url).pathname;
  if (/^\/(?:internal|admin|api\/admin|__nextjs)(?:\/|$)/.test(pathname)) {
    res.writeHead(404); return res.end();
  }
  const upstream = http.request({hostname:'127.0.0.1', port:3102, path:req.url,
    method:req.method, headers:headers(req,cfg)}, reply => {
    res.writeHead(reply.statusCode, reply.headers); reply.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Game website unavailable.'); });
  upstream.setTimeout(60000, () => upstream.destroy());
  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
});
server.on('upgrade', (req, socket, head) => {
  const cfg = config();
  if (!allowed(req,cfg) || new URL(req.url,cfg.url).pathname !== '/game-socket' ||
      req.headers.origin !== cfg.url) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
  const upstream = http.request({hostname:'127.0.0.1',port:7766,path:'/',headers:headers(req,cfg)});
  upstream.on('upgrade',(reply,remote,remoteHead) => {
    socket.write(`HTTP/1.1 ${reply.statusCode} ${reply.statusMessage}\r\n` +
      reply.rawHeaders.reduce((all,value,index,array) => index % 2 ? all : all + value + ': ' + array[index+1] + '\r\n','') + '\r\n');
    if (head.length) remote.write(head);
    if (remoteHead.length) socket.write(remoteHead);
    socket.pipe(remote).pipe(socket);
    socket.on('error',()=>remote.destroy());
    remote.on('error',()=>socket.destroy());
    socket.on('close',()=>remote.destroy());
    remote.on('close',()=>socket.destroy());
  });
  upstream.on('response',()=>socket.destroy());
  upstream.on('error',()=>socket.destroy());
  socket.on('error',()=>upstream.destroy());
  upstream.end();
});
server.listen(3103,'127.0.0.1',()=>console.log('Public gateway ready on loopback 3103'));
