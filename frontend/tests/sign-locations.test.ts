import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {getLocalizedSignLabel} from '../lib/sign-labels';
import {getSignFace} from '../lib/sign-layout';

// Old gateways have 31px transparent right padding; the newer Banderbill gate does not.
for (const id of [531,545,660]) {
 const face=getSignFace(id,160,128);
 assert.deepEqual(face,{x:4,y:7,w:120,h:30});
 assert.ok(face.x+face.w<129 && face.y+face.h<=40);
}
assert.deepEqual(getSignFace(22474,160,128),{x:4,y:6,w:152,h:31});
assert.deepEqual(getSignFace(4986,128,64),{x:16,y:6,w:96,h:43});
assert.ok(getSignFace(529,64,32).h<18,'shop lettering must stay above posts');

const mapsRoot=path.resolve('../server/mapas_source');
const sites:number[]=[];
for(const dir of fs.readdirSync(mapsRoot)){
 const file=path.join(mapsRoot,dir,'terrain.json');
 if(!fs.existsSync(file))continue;
 const map=JSON.parse(fs.readFileSync(file,'utf8'));
 const used=new Set(map.rows.flat());
 for(const key of used){
  const graphics=map.palette[String(key)]?.graphics;
  if((Array.isArray(graphics)?graphics:[graphics]).includes(4986))sites.push(map.id);
 }
}
assert.deepEqual([...new Set(sites)].sort((a,b)=>a-b),[1,34]);
assert.equal(getLocalizedSignLabel(4986,1),'NOTICE TO TRAVELERS\nWelcome to Ullathorpe.');
assert.equal(getLocalizedSignLabel(4986,34),'NOTICE TO TRAVELERS\nWelcome to Nix.');
assert.equal(getLocalizedSignLabel(4986,60),'NOTICE TO TRAVELERS\nWelcome, travelers.');
assert.equal(getLocalizedSignLabel(22474,58),'Welcome to\nBanderbill');
assert.equal(getLocalizedSignLabel(531,1),'Welcome to\nUllathorpe');
assert.equal(getLocalizedSignLabel(545,34),'Welcome to\nNix');
assert.equal(getLocalizedSignLabel(-1,1),undefined);
assert.match(fs.readFileSync('components/game/rendering/sceneRenderer.ts','utf8'),/addLocalizedSign\(sprite,graphicId,graphicData.width,graphicData.height,engine.mapNumber\)/);
console.log('PASS: actual shared-notice placements use Ullathorpe and Nix; Banderbill gateway and neutral fallback preserved.');
