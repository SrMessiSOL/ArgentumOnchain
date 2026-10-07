import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {translateSource} from '../lib/i18n';
import proper from '../tests/fixtures/world-proper-names-and-codes.json';
import exceptions from '../tests/fixtures/english-data-exceptions.json';

const require=createRequire(import.meta.url);
const {Pool}=require('../../api/node_modules/pg');
const root=path.resolve('..');
const pool=new Pool({
 connectionString:process.env.AOWEB_AUDIT_DATABASE_URL??'postgresql://aoweb_local@127.0.0.1:55432/aoweb_local',
 options:'-c default_transaction_read_only=on',
});
const allowed=new Set([...proper,...Object.keys(exceptions)]);
const missing=new Map<string,string>();
let checked=0,translated=0,preserved=0;
function scan(value:unknown,ref:string):void{
 if(typeof value==='string'&&/[a-záéíóúñ]/i.test(value)){
  checked++;
  if(translateSource(value,'en')!==value)translated++;
  else if(allowed.has(value))preserved++;
  else missing.set(value,ref);
 }else if(value&&typeof value==='object')for(const [key,child]of Object.entries(value))scan(child,`${ref}.${key}`);
}
async function main(){try{
 // Fixed, public game-definition tables only; never player or account records.
 for(const table of ['game_objects','game_npcs']){
  const {rows}=await pool.query(`SELECT id,name,data FROM ${table} ORDER BY id`);
  scan(rows,table);
 }
 for(const file of ['api/src/jsons/spells.json','api/src/jsons/craftingRecipes.json','api/src/jsons/smeltingRecipes.json','frontend/data/roadmap.json','frontend/data/changelog.json','frontend/public/init/world-map.json','frontend/public/init/world-map-grid-general.json'])scan(JSON.parse(fs.readFileSync(path.join(root,file),'utf8')),file);
 for(const dir of fs.readdirSync(path.join(root,'server/mapas_source'))){
  const file=path.join(root,'server/mapas_source',dir,'meta.json');
  if(fs.existsSync(file))scan(JSON.parse(fs.readFileSync(file,'utf8')).name,`${dir}.name`);
 }
 console.log(JSON.stringify({checked,translated,preserved,unclassified:[...missing].map(([source,ref])=>({source,ref}))},null,2));
 if(missing.size)process.exitCode=1;
}finally{await pool.end();}}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
