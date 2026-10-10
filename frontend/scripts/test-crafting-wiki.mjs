import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const objects=read('../public/init/objs.json'),craft=read('../../server/jsons/craftingRecipes.json'),smelt=read('../../server/jsons/smeltingRecipes.json'),expansion=read('../../api/src/jsons/tailoringExpansion.json');
assert.deepEqual(craft,read('../../api/src/jsons/craftingRecipes.json'));
const item=id=>({itemId:id,name:objects[String(id)]?.name??`Item #${id}`});
const expected=craft.map(r=>({id:r.profession+'-'+r.itemId,profession:r.profession,skill:r.skill,output:item(r.itemId),materials:r.materials.map(m=>({...item(m.itemId),amount:m.amount})),resolved:Boolean(objects[String(r.itemId)]&&r.materials.every(m=>objects[String(m.itemId)])),pending:expansion.some(e=>e.itemId===r.itemId&&e.profession===r.profession)}));
expected.push(...smelt.map(r=>({id:'smelt-'+r.id,profession:'smelting',skill:r.requiredSkill,output:item(r.ingotItemId),materials:[{...item(r.mineralItemId),amount:r.mineralsPerIngot}],resolved:true,pending:false})));
assert.deepEqual(read('../lib/crafting-wiki.json'),expected,'Every configured recipe must be visible, including unresolved catalog references');
assert.equal(new Set(expected.map(r=>r.id)).size,expected.length);
for(const r of expected){assert.ok(r.skill>=0&&r.skill<=100);for(const m of r.materials)assert.ok(Number.isSafeInteger(m.amount)&&m.amount>0);}
assert.equal(expansion.length,10);
console.log(`PASS: all ${expected.length} recipes covered; ${expected.filter(r=>!r.resolved).length} unresolved references explicitly shown.`);
