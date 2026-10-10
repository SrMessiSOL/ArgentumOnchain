import {strict as assert} from 'node:assert';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {readVendorMapLocations} from '../lib/vendorMapLocations';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aochain-vendor-maps-'));
try{
 const maps=path.join(temp,'maps'),state=path.join(temp,'state');
 fs.mkdirSync(path.join(maps,'mapa_1'),{recursive:true});
 fs.writeFileSync(path.join(maps,'mapa_1','meta.json'),JSON.stringify({zona:'CIUDAD',name:'Ullathorpe'}));
 assert.deepEqual(readVendorMapLocations(maps),{});
 fs.writeFileSync(path.join(maps,'mapa_1','npcs.json'),'[{"npcIndex":10}]');
 assert.deepEqual(readVendorMapLocations(maps),{10:['Ullathorpe']});
 fs.mkdirSync(path.join(state,'mapa_1'),{recursive:true});fs.writeFileSync(path.join(state,'mapa_1','npcs.json'),'[{"npcIndex":20}]');
 assert.deepEqual(readVendorMapLocations(maps,state),{20:['Ullathorpe']});
 fs.writeFileSync(path.join(state,'mapa_1','npcs.json'),'{}');assert.throws(()=>readVendorMapLocations(maps,state));
 console.log('PASS: missing NPC files, bundled placements, authoritative overrides and malformed data rejection.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
