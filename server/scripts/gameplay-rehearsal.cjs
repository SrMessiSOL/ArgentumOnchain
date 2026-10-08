// Real API/game processes on a disposable cluster. No live configuration is read.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn,spawnSync}=require('node:child_process');
const repo=path.resolve(__dirname,'../..');
const {Client}=require(path.join(repo,'api/node_modules/pg'));
const WebSocket=require(path.join(repo,'server/node_modules/ws'));
const ts=require(path.join(repo,'server/node_modules/typescript'));
const Module=require('node:module');
const protocolFile=path.join(repo,'frontend/lib/aowProtocol.ts');
const protocol=new Module(protocolFile);protocol.filename=protocolFile;protocol.paths=module.paths;
protocol._compile(ts.transpileModule(fs.readFileSync(protocolFile,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,protocolFile);
const p=protocol.exports;
const [rootArg,seed,pgBin]=process.argv.slice(2);
const root=path.resolve(rootArg||'');
const adminURL=new URL(process.env.AOCHAIN_SECURITY_ADMIN_DATABASE_URL||'');
if(adminURL.hostname!=='127.0.0.1'||adminURL.port!=='55433'||!path.basename(root).startsWith('host-regressions-'))throw Error('Disposable regression cluster on 55433 and protected fixture root required');
const db='aoweb_gameplay_test_'+Date.now(),url=new URL(adminURL);url.pathname='/'+db;
const admin=new Client({connectionString:adminURL.toString()}),fixture=new Client({connectionString:url.toString()});
const api='http://127.0.0.1:3121',game='http://127.0.0.1:7786';
const report={startedAt:new Date().toISOString(),scope:'two loopback clients; real API/game and disposable database; simulated chain ownership; no mint/stake/RPC',chainOwnershipSimulated:true,checks:[],passed:false};
const children=[],sockets=[];let fixtureConnected=false;
let stage='preflight';
async function health(child){
 if(child.exitCode!==null||child.signalCode!==null)throw Error('Fixture game process exited');
 const response=await fetch(game+'/health',{signal:AbortSignal.timeout(2000)});
 const body=await response.json();report.lastGameHealth={status:response.status,ready:body.ready,players:body.players,uptimeSeconds:body.uptimeSeconds};
 return body.ready===true;
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const check=(value,name)=>{if(!value)throw Error(name);report.checks.push(name);};
async function until(fn,timeout=90000){const end=Date.now()+timeout;while(Date.now()<end){try{if(await fn())return;}catch(error){if(error.message==='Fixture game process exited')throw error;}await pause(300);}throw Error('Fixture condition timed out');}
function launch(name,env){const dir=path.join(root,'gameplay',name);const out=fs.openSync(path.join(root,'gameplay',name+'.log'),'a');const child=spawn(process.execPath,[path.join(dir,name==='api'?'gameplay-api-bootstrap.cjs':'dist/server.js')],{cwd:dir,env,windowsHide:true,stdio:['ignore',out,out]});fs.closeSync(out);children.push(child);return child;}
async function request(route,token,body){const response=await fetch(api+route,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Fixture API '+route+' status '+response.status);return response.json();}
async function connect(account){const ticket=await request('/auth/game-ticket',account.sessionToken,{});const c={ws:new WebSocket('ws://127.0.0.1:7786'),character:null,positions:0,pongs:0,npcPackets:0,decodeErrors:0};sockets.push(c.ws);c.ws.on('error',()=>{});c.ws.on('open',()=>c.ws.send(p.createConnectCharacterPacket({ticket:ticket.ticket})));c.ws.on('message',buffer=>{try{const old=console.log;let packets;try{console.log=()=>{};packets=p.parseServerFrame(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));}finally{console.log=old;}for(const packet of packets){if(packet.type==='getMyCharacter')c.character=packet.payload;if(packet.type==='pong')c.pongs++;if(packet.type==='actPositionServer'||packet.type==='moveEntity')c.positions++;if(/npc/i.test(packet.type))c.npcPackets++;}}catch{c.decodeErrors++;}});await until(()=>!!c.character,20000);return c;}
async function stop(child){if(!child||child.exitCode!==null)return;child.kill();await until(()=>child.exitCode!==null||child.signalCode!==null,10000);}
async function main(){
 for(const port of [3121,7786])await new Promise((resolve,reject)=>{const probe=require('node:net').createServer();probe.once('error',reject);probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
 await admin.connect();await admin.query('CREATE DATABASE "'+db+'"');await fixture.connect();fixtureConnected=true;
 const seedText=fs.readFileSync(seed,'utf8');
 const seedReceipt=JSON.parse(fs.readFileSync(path.join(path.dirname(seed),'New-realm-seed-receipt.json'),'utf8').replace(/^\uFEFF/,''));
 check(crypto.createHash('sha256').update(seedText).digest('hex')===seedReceipt.seedSha256,'fresh content seed digest');
 const loaded=spawnSync(path.join(pgBin,'psql.exe'),['-X','-q','-h','127.0.0.1','-p','55433','-U',decodeURIComponent(url.username),'-d',db,'-v','ON_ERROR_STOP=1'],{env:{...process.env,PGPASSWORD:decodeURIComponent(url.password)},input:seedText,encoding:'utf8',windowsHide:true,timeout:120000});
 if(loaded.status!==0)throw Error('Disposable seed import failed');
 for(const file of ['schema.sql','wallet-schema.sql','preferences-schema.sql','cosmetics-schema.sql','economy-schema.sql','game-assets-schema.sql','vault-receipts-schema.sql','character-receipts-schema.sql','floor-items-schema.sql','floor-spawns-schema.sql','market-receipts-schema.sql','session-credentials-migration.sql','gold-ledger-integrity.sql'])await fixture.query(fs.readFileSync(path.join(repo,'api',file),'utf8'));
 const counts=await fixture.query('SELECT (SELECT count(*) FROM accounts)::int AS accounts,(SELECT count(*) FROM characters)::int AS characters');check(counts.rows[0].accounts===0&&counts.rows[0].characters===0,'fixture starts without accounts or characters');
 // Fixture-only legacy off-chain characters. The guards above pin this client
 // to the generated disposable database; production triggers remain intact.
 await fixture.query('ALTER TABLE characters ALTER COLUMN chain_required SET DEFAULT FALSE');
 const dir=path.join(root,'gameplay');fs.mkdirSync(dir,{recursive:true});
 for(const name of ['api','server']){const dest=path.join(dir,name);fs.mkdirSync(dest);fs.cpSync(path.join(repo,name,'dist'),path.join(dest,'dist'),{recursive:true});for(const file of fs.readdirSync(path.join(repo,name)))if(file.endsWith('.sql'))fs.copyFileSync(path.join(repo,name,file),path.join(dest,file));}
 for(const folder of ['jsons','mapas_source'])fs.cpSync(path.join(repo,'server',folder),path.join(dir,'server',folder),{recursive:true});
 fs.copyFileSync(path.join(__dirname,'gameplay-api-bootstrap.cjs'),path.join(dir,'api/gameplay-api-bootstrap.cjs'));
 const token=crypto.randomBytes(32).toString('hex');
 const base={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,NODE_ENV:'test',HOST:'127.0.0.1',NODE_PATH:[path.join(repo,'api/node_modules'),path.join(repo,'server/node_modules')].join(path.delimiter)};
 const apiEnv={...base,PORT:'3121',DATABASE_URL:url.toString(),TOKEN_AUTH:crypto.randomBytes(32).toString('hex'),GAME_SERVICE_TOKEN:token,AOWEB_RUN_MIGRATIONS:'0',AOWEB_SETTLEMENT_PAUSED:'1'};
 const gameEnv={...base,PORT:'7786',API_BASE_URL:api,TOKEN_AUTH:token,AOWEB_TEST_MODE:'true',RESET_CONNECTED_CHARACTERS_ON_STARTUP:'true',AOWEB_NPC_RESPAWN_FILE:path.join(dir,'respawns.json'),AOWEB_MAP_NPC_STATE_DIR:path.join(dir,'npc-state'),AOWEB_VAULT_JOURNAL_DIR:path.join(dir,'vault'),AOWEB_CHARACTER_JOURNAL_DIR:path.join(dir,'character'),AOWEB_WORLD_JOURNAL_DIR:path.join(dir,'world'),AOWEB_MARKET_JOURNAL_DIR:path.join(dir,'market')};
 stage='API startup';
 launch('api',apiEnv);await until(async()=>{const r=await fetch(api+'/ranking',{signal:AbortSignal.timeout(2000)});return r.ok;});
 check(true,'fixture API startup');
 stage='game startup';
 let server=launch('server',gameEnv);await until(()=>health(server),180000);
 check(true,'fixture game ready');stage='account creation and login';
 const accounts=[];
 for(let i=0;i<2;i++){const suffix=Array.from(crypto.randomBytes(8),v=>String.fromCharCode(97+v%26)).join('');const a=await request('/auth/register',null,{name:'Fixture'+suffix,email:suffix+'@example.invalid',password:crypto.randomBytes(20).toString('hex')});const created=await request('/auth/create-character',a.sessionToken,{name:'Fixture'+suffix,class:'guerrero',race:'humano',gender:'male',headId:1});const character=created.characters.find(c=>c.name==='Fixture'+suffix);await request('/auth/select-character',a.sessionToken,{characterId:character._id});a.id=character._id;accounts.push(a);}
 const clients=await Promise.all(accounts.map(connect));check((await(await fetch(game+'/health')).json()).players===2,'two authenticated players simultaneously connected');
 stage='inventory persistence';const originals=[];
 for(const [i,a] of accounts.entries()){
  const items=await fixture.query('SELECT id_pos,id_item,cant,equipped FROM character_items WHERE character_id=$1 ORDER BY id_pos',[a.id]);
  const source=items.rows.find(item=>item.id_pos!==21);
  check(!!source&&!items.rows.some(item=>item.id_pos===21),'fixture inventory has occupied source and empty target');
  originals.push(source);
  clients[i].ws.send(p.createReorderInventoryItemPacket(source.id_pos,21));
  await until(async()=>{const moved=await fixture.query('SELECT id_item,cant,equipped FROM character_items WHERE character_id=$1 AND id_pos=21',[a.id]);return moved.rows[0]?.id_item===source.id_item&&moved.rows[0]?.cant===source.cant&&moved.rows[0]?.equipped===source.equipped;},15000);
  const absent=await fixture.query('SELECT 1 FROM character_items WHERE character_id=$1 AND id_pos=$2',[a.id,source.id_pos]);
  check(absent.rowCount===0,'inventory reorder persisted without duplicate source');
 }
 stage='movement';for(let tick=0;tick<40;tick++){for(const [i,c] of clients.entries()){c.ws.send(p.createPingPacket(tick));c.ws.send(p.createPositionPacket([1,2,3,4][(Math.floor(tick/5)+i)%4],tick+1));}await pause(250);}
 check(clients.every(c=>c.pongs>3&&c.decodeErrors===0),'both clients receive decoded ping responses');check(clients.every(c=>c.positions>0),'authoritative position frames received');
 stage='world save';const saved=await fetch(game+'/internal/save',{method:'POST',headers:{authorization:token},signal:AbortSignal.timeout(60000)});check(saved.ok&&(await saved.json()).ok===true,'world save while two players connected');
 const before=await fixture.query('SELECT id,map_id,pos_x,pos_y FROM characters ORDER BY id');
 await stop(server);await until(()=>clients.every(c=>c.ws.readyState===WebSocket.CLOSED),15000);
 stage='game restart';server=launch('server',gameEnv);await until(()=>health(server),180000);stage='reconnect';
 const reconnected=await Promise.all(accounts.map(connect));check((await(await fetch(game+'/health')).json()).players===2,'both players reconnect after fixture game process restart');
 const after=await fixture.query('SELECT id,map_id,pos_x,pos_y FROM characters ORDER BY id');check(JSON.stringify(before.rows)===JSON.stringify(after.rows),'saved positions survive restart');check(reconnected.every(c=>c.decodeErrors===0),'reconnect snapshots decode');
 for(const [i,c] of reconnected.entries())check(c.character.inventory.some(item=>item.slot===21&&item.idItem===originals[i].id_item&&item.amount===originals[i].cant),'reconnected inventory reflects persisted reorder');
 report.passed=true;
}
main().catch(error=>{report.failure='Disposable gameplay rehearsal failed; inspect protected fixture logs locally.';report.failureStage=stage;report.failureCategory=error.name;fs.writeFileSync(path.join(root,'gameplay-error.log'),error.stack||String(error));process.exitCode=1;}).finally(async()=>{for(const ws of sockets)ws.terminate();for(const child of children.reverse())await stop(child).catch(()=>{report.passed=false;});if(fixtureConnected)await fixture.end();await admin.end().catch(()=>{});report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(root,'gameplay-receipt.json'),JSON.stringify(report,null,2));console.log(report.passed?'Two-player loopback movement/save/restart rehearsal passed. Combat, load, provider outages and chain lifecycle remain unverified.':'Gameplay fixture stopped at '+stage+'; inspect its protected receipt.');});
