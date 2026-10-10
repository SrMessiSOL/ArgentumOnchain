import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8').replace(/^\uFEFF/,''));
const catalog=read('../lib/crafting-catalog-snapshot.json'),rows=read('../lib/crafting-wiki.json'),objects=new Map(read('../lib/wiki-snapshot.json').equipment.map(r=>[Number(r.id),r]));
const active=[...catalog.recipes,...catalog.smelting.filter(r=>!r.deleted).map(r=>({profession:'smelting',itemId:r.ingotItemId,skill:r.requiredSkill,materials:[{itemId:r.mineralItemId,amount:r.mineralsPerIngot}]}))];
assert.equal(rows.length,active.length);assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
for(const r of active){const shown=rows.find(s=>s.profession===r.profession&&s.output.itemId===r.itemId);assert.ok(shown,'Installed recipe omitted');assert.equal(shown.skill,r.skill);assert.equal(shown.pending,false);assert.deepEqual(shown.materials.map(m=>({itemId:m.itemId,amount:m.amount})),r.materials);assert.equal(shown.resolved,objects.has(r.itemId)&&r.materials.every(m=>objects.has(m.itemId)));assert.ok(r.skill>=0&&r.skill<=100);for(const m of shown.materials)assert.ok(Number.isSafeInteger(m.amount)&&m.amount>0);}
console.log(`PASS: ${rows.length} active installed recipes; deleted recipes excluded and unresolved references explicit.`);
