import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const objects=read('../public/init/objs.json'),craft=read('../../server/jsons/craftingRecipes.json'),smelt=read('../../server/jsons/smeltingRecipes.json');
const item=id=>({itemId:id,name:objects[String(id)].name});
const valid=craft.filter(r=>objects[String(r.itemId)]&&r.materials.every(m=>objects[String(m.itemId)]));
const expected=valid.map(r=>({id:r.profession+'-'+r.itemId,profession:r.profession,skill:r.skill,output:item(r.itemId),materials:r.materials.map(m=>({...item(m.itemId),amount:m.amount}))}));
expected.push(...smelt.map(r=>({id:'smelt-'+r.id,profession:'smelting',skill:r.requiredSkill,output:item(r.ingotItemId),materials:[{...item(r.mineralItemId),amount:r.mineralsPerIngot}]})));
assert.deepEqual(read('../lib/crafting-wiki.json'),expected,'Wiki recipes must match the bundled crafting and smelting definitions');
assert.equal(new Set(expected.map(r=>r.id)).size,expected.length);
for(const r of expected){assert.ok(r.skill>=0&&r.skill<=100);for(const m of r.materials)assert.ok(Number.isSafeInteger(m.amount)&&m.amount>0);}
console.log(`PASS: ${expected.length} recipes match source data; ${craft.length-valid.length} unresolved outputs excluded.`);
