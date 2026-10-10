import {strict as assert} from 'node:assert';
import {planTierOneVendorStock} from '../lib/tierOneVendorStock';
const objects=[
 {id:1,data:{name:'Daga',objType:2,tier:1}},
 {id:2,data:{name:'Armadura de Cuero',objType:3,tier:1}},
 {id:3,data:{name:'Túnica',objType:3,tier:1}},
 {id:4,data:{name:'Daga avanzada',objType:2,tier:2}},
 {id:5,data:{name:'Oro',objType:5,tier:1}},
 {id:6,data:{name:'Newbie',objType:2,tier:1,newbie:1}},
];
const npcs=[{id:10,data:{name:'Herrero',npcType:10,objs:[{item:1,cant:30}]}},{id:11,data:{name:'Armaduras',npcType:10,objs:[]}},{id:12,data:{name:'Sastre',npcType:10,objs:[]}}];
const before=JSON.stringify(npcs),plan=planTierOneVendorStock(objects,npcs);
assert.equal(plan.eligibleItems,3);assert.deepEqual(plan.unresolved,[]);
assert.equal(plan.changes.length,2);assert.deepEqual(plan.changes.map(c=>c.added),[[2],[3]]);
assert.equal(JSON.stringify(npcs),before,'planner must not mutate catalog');
const installed=npcs.map(n=>({id:n.id,data:plan.changes.find(c=>c.id===n.id)?.after??n.data}));
assert.equal(planTierOneVendorStock(objects,installed).changes.length,0,'repeat is idempotent');
assert.equal(planTierOneVendorStock(objects,[]).unresolved.length,3,'unmapped items reported');
assert.equal(planTierOneVendorStock([{id:99,data:{name:'Unsupported',tier:1,objType:99}}],npcs).unresolved.length,1);
const empty=[{id:10,data:{name:'Herrero',npcType:10,objs:[{item:1,cant:0}]}}];
assert.deepEqual(planTierOneVendorStock([objects[0]],empty).changes[0].after.objs,[{item:1,cant:1000}]);
console.log('PASS: Tier 1 mapping, preserved stock, exclusions, unresolved items, zero stock and idempotence.');
