import fs from 'node:fs';
import crypto from 'node:crypto';
import {performance} from 'node:perf_hooks';
import WebSocket from 'ws';
import {Pool} from '../../api/node_modules/pg';
import {createConnectCharacterPacket,createPingPacket,createPositionPacket,createDialogPacket,parseServerFrame} from '../../frontend/lib/aowProtocol';
const api='http://127.0.0.1:3111',wsUrl='ws://127.0.0.1:7776';
const [database,output]=process.argv.slice(2);
if(!/^aoweb_restore_\d+$/.test(database)||!output)throw Error('Only an isolated aoweb_restore_<digits> database is allowed');
const pool=new Pool({connectionString:`postgresql://aoweb_local@127.0.0.1:55432/${database}`});
const log=console.log.bind(console);console.log=()=>{}; // Existing decoder has a per-packet debug log.
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const report:any={startedAt:new Date().toISOString(),environment:'isolated local loopback, copied game data and restored DB',workload:'authenticated clients, 20s idle plus 40s attempted walking per tier, one ping/s; not combat or WAN/browser rendering',tiers:[],errors:[]};
const clients:any[]=[];const accounts:any[]=[];
async function request(path:string,token?:string,body?:unknown){
 const r=await fetch(api+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
 const d=await r.json();if(!r.ok)throw Error(`${path}: ${r.status} ${d.error}`);return d;
}
const percentile=(a:number[],p:number)=>{const b=[...a].sort((x,y)=>x-y);return b.length?Number(b[Math.min(b.length-1,Math.floor(b.length*p))].toFixed(2)):null;};
async function connect(a:any){
 const ticket=await request('/auth/game-ticket',a.sessionToken,{});
 const c:any={ws:new WebSocket(wsUrl),pings:new Map(),samples:[],moves:0,acceptedMoves:0,bytes:0,packets:0,errors:0,closed:0,id:null,x:null,y:null,moveId:0};
 clients.push(c);
 await new Promise<void>((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error('Game login timeout')),20000);
  c.ws.on('open',()=>c.ws.send(createConnectCharacterPacket({ticket:ticket.ticket})));
  c.ws.on('error',(e:Error)=>{c.errors++;clearTimeout(timeout);reject(e)});
  c.ws.on('close',()=>{c.closed++});
  c.ws.on('message',(buffer:Buffer)=>{
   c.bytes+=buffer.length;
   try{for(const packet of parseServerFrame(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength))){
    c.packets++;
    if(packet.type==='getMyCharacter'){c.id=packet.payload.id;c.x=packet.payload.pos.x;c.y=packet.payload.pos.y;clearTimeout(timeout);resolve();}
    if(packet.type==='pong'){const start=c.pings.get(packet.payload.token);if(start!==undefined){c.samples.push(performance.now()-start);c.pings.delete(packet.payload.token);}}
    if(packet.type==='actPositionServer'||(packet.type==='moveEntity'&&packet.payload.id===c.id)){
     const p=packet.payload;if(c.x!==p.x||c.y!==p.y)c.acceptedMoves++;c.x=p.x;c.y=p.y;
    }
    if(packet.type==='error')report.errors.push({phase:'game',message:packet.payload});
   }}catch(e){c.errors++;report.errors.push({phase:'decode',message:String(e)});}
  });
 });
 return c;
}
async function phase(count:number,moving:boolean,seconds:number){
 const starts=clients.map(c=>({samples:c.samples.length,bytes:c.bytes,moves:c.moves,accepted:c.acceptedMoves,errors:c.errors,closed:c.closed}));
 let tick=0;
 for(let elapsed=0;elapsed<seconds*1000;elapsed+=250){
  const now=performance.now();
  clients.forEach((c,index)=>{if(c.ws.readyState!==WebSocket.OPEN)return;
   if(tick%4===0){const token=++c.moveId;c.pings.set(token,now);c.ws.send(createPingPacket(token));}
   if(moving){c.moves++;c.ws.send(createPositionPacket([1,2,3,4][(Math.floor(tick/4)+index)%4],++c.moveId));}
  });tick++;await wait(250);
 }
 const samples=clients.flatMap((c,i)=>c.samples.slice(starts[i].samples));
 const health=await (await fetch(wsUrl.replace('ws:','http:')+'/health')).json();
 const result={count,mode:moving?'walking':'idle',seconds,connected:clients.filter(c=>c.ws.readyState===WebSocket.OPEN).length,serverPlayers:health.players,pingSamples:samples.length,pingP50Ms:percentile(samples,.5),pingP95Ms:percentile(samples,.95),pingP99Ms:percentile(samples,.99),receivedBytes:clients.reduce((n,c,i)=>n+c.bytes-starts[i].bytes,0),moveAttempts:clients.reduce((n,c,i)=>n+c.moves-starts[i].moves,0),observedOwnPositionChanges:clients.reduce((n,c,i)=>n+c.acceptedMoves-starts[i].accepted,0),errors:clients.reduce((n,c,i)=>n+c.errors-starts[i].errors,0),disconnects:clients.reduce((n,c,i)=>n+c.closed-starts[i].closed,0)};
 report.tiers.push(result);fs.writeFileSync(output,JSON.stringify(report,null,2));log(JSON.stringify(result));
}
async function main(){
 const health=await (await fetch('http://127.0.0.1:7776/health')).json();if(!health.ready)throw Error('Test server not ready');
 for(let i=0;i<110;i++){
  const suffix=Array.from(crypto.randomBytes(9),v=>String.fromCharCode(97+v%26)).join('');
  const a=await request('/auth/register',undefined,{name:'Load '+suffix,email:`load-${suffix}@example.invalid`,password:crypto.randomBytes(16).toString('hex')});
  const created=await request('/auth/create-character',a.sessionToken,{name:'Load'+suffix,class:'guerrero',race:'humano',gender:'male',headId:1});
  const char=created.characters.find((c:any)=>c.name==='Load'+suffix);await request('/auth/select-character',a.sessionToken,{characterId:char._id});accounts.push(a);
  if((i+1)%25===0)log(`Prepared ${i+1}/110 isolated test accounts`);
 }
 for(const count of [25,60,110]){
  while(clients.length<count){const base=clients.length;await Promise.all(accounts.slice(base,Math.min(base+5,count)).map(connect));}
  await phase(count,false,20);await phase(count,true,40);
 }
 report.finishedAt=new Date().toISOString();
}
main().catch(e=>{report.errors.push({phase:'harness',message:e.message});process.exitCode=1;log(e.message);}).finally(async()=>{
 for(const c of clients)if(c.ws.readyState===WebSocket.OPEN)c.ws.send(createDialogPacket('/logout'));
 await wait(11000);for(const c of clients)c.ws.close();
 report.completed=report.tiers.length===6&&report.errors.length===0;fs.writeFileSync(output,JSON.stringify(report,null,2));await pool.end();log('Report saved: '+output);
});
