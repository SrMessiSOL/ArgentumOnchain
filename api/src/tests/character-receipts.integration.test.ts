import { beforeAll, afterAll, test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import pool from '../db';
import { spawnFloorItem } from '../repositories/floorSpawns';
import { patchCharacter } from '../repositories/characters';
const id=randomUUID(),other=randomUUID();
beforeAll(async()=>{
 if(!process.env.DATABASE_URL?.includes('aoweb_character_test_'))throw Error('Isolated database required');
 await pool.query(`CREATE TABLE characters(id UUID PRIMARY KEY,gold INTEGER,deleted_at TIMESTAMPTZ,updated_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE character_spells(character_id UUID REFERENCES characters(id),id_pos INTEGER,id_spell INTEGER CHECK(id_spell<>999),PRIMARY KEY(character_id,id_pos));
 CREATE TABLE character_items(character_id UUID REFERENCES characters(id),id_pos INTEGER,id_item INTEGER,cant INTEGER CHECK(cant<>13),equipped BOOLEAN,PRIMARY KEY(character_id,id_pos));`);
 await pool.query(fs.readFileSync('character-receipts-schema.sql','utf8'));
 await pool.query(fs.readFileSync('floor-items-schema.sql','utf8'));
 await pool.query(fs.readFileSync('floor-spawns-schema.sql','utf8'));
 await pool.query('INSERT INTO characters(id,gold) VALUES($1,100),($2,100)',[id,other]);
});
afterAll(async()=>{await pool.end();});
test('old receipt replay preserves later gold and inventory',async()=>{
 const p={operationId:randomUUID(),gold:75,items:[{idPos:1,idItem:1,cant:2,equipped:false}]};
 const receipt=await patchCharacter(id,p);
 await patchCharacter(id,{operationId:randomUUID(),gold:50,items:[]});
 expect(await patchCharacter(id,p)).toEqual(receipt);
 expect((await pool.query('SELECT gold FROM characters WHERE id=$1',[id])).rows[0].gold).toBe(50);
 expect((await pool.query('SELECT count(*)::int n FROM character_items')).rows[0].n).toBe(0);
 await expect(patchCharacter(id,{...p,gold:999})).rejects.toThrow('does not match');
 await expect(patchCharacter(other,p)).rejects.toThrow('does not match');
});
test('concurrent retries commit one receipt',async()=>{
 const p={operationId:randomUUID(),gold:40};const receipts=await Promise.all(Array.from({length:5},()=>patchCharacter(id,p)));
 expect(receipts.every(r=>JSON.stringify(r)===JSON.stringify(receipts[0]))).toBe(true);
 expect((await pool.query('SELECT count(*)::int n FROM character_save_receipts WHERE operation_id=$1',[p.operationId])).rows[0].n).toBe(1);
});
test('failed inventory mutation rolls back gold and receipt',async()=>{
 const p={operationId:randomUUID(),gold:0,items:[{idPos:1,idItem:1,cant:13,equipped:false}]};
 await expect(patchCharacter(id,p)).rejects.toThrow();
 expect((await pool.query('SELECT gold FROM characters WHERE id=$1',[id])).rows[0].gold).toBe(40);
 expect((await pool.query('SELECT count(*)::int n FROM character_save_receipts WHERE operation_id=$1',[p.operationId])).rows[0].n).toBe(0);
 expect(await patchCharacter(randomUUID(),{operationId:randomUUID(),gold:0})).toBeNull();
});

test('spell learning and scroll consumption commit or roll back together',async()=>{
 await patchCharacter(id,{operationId:randomUUID(),items:[{idPos:1,idItem:1,cant:1,equipped:false}]});
 const bad={operationId:randomUUID(),items:[],spells:[{idPos:1,idSpell:999}]};
 await expect(patchCharacter(id,bad)).rejects.toThrow();
 expect((await pool.query('SELECT cant FROM character_items WHERE character_id=$1',[id])).rows[0].cant).toBe(1);
 expect((await pool.query('SELECT count(*)::int n FROM character_spells')).rows[0].n).toBe(0);
 expect((await pool.query('SELECT count(*)::int n FROM character_save_receipts WHERE operation_id=$1',[bad.operationId])).rows[0].n).toBe(0);
 const good={operationId:randomUUID(),items:[],spells:[{idPos:1,idSpell:1}]};
 await patchCharacter(id,good);await patchCharacter(id,good);
 expect((await pool.query('SELECT count(*)::int n FROM character_items WHERE character_id=$1',[id])).rows[0].n).toBe(0);
 expect((await pool.query('SELECT id_spell FROM character_spells WHERE character_id=$1',[id])).rows[0].id_spell).toBe(1);
});

test('drop and pickup are atomic and old receipt replay cannot resurrect ground items',async()=>{
 const dropId=randomUUID();
 const drop={operationId:randomUUID(),items:[],floorChanges:[{action:'put',dropId,map:1,x:2,y:3,itemId:1,amount:2}]};
 await patchCharacter(id,drop);
 expect((await pool.query('SELECT amount FROM dropped_floor_items WHERE drop_id=$1',[dropId])).rows[0].amount).toBe(2);
 const take={operationId:randomUUID(),items:[{idPos:1,idItem:1,cant:2,equipped:false}],floorChanges:[{action:'take',dropId}]};
 await patchCharacter(id,take);await patchCharacter(id,drop);await patchCharacter(id,take);
 expect((await pool.query('SELECT count(*)::int n FROM dropped_floor_items')).rows[0].n).toBe(0);
 expect((await pool.query('SELECT cant FROM character_items WHERE character_id=$1',[id])).rows[0].cant).toBe(2);
 const rejected={operationId:randomUUID(),gold:999,floorChanges:[{action:'take',dropId}]};
 await expect(patchCharacter(other,rejected)).rejects.toThrow('no longer available');
 expect((await pool.query('SELECT gold FROM characters WHERE id=$1',[other])).rows[0].gold).toBe(100);
 expect((await pool.query('SELECT count(*)::int n FROM character_save_receipts WHERE operation_id=$1',[rejected.operationId])).rows[0].n).toBe(0);
});

test('two characters competing for one ground item have only one committed winner',async()=>{
 const dropId=randomUUID();await patchCharacter(id,{operationId:randomUUID(),items:[],floorChanges:[{action:'put',dropId,map:1,x:8,y:9,itemId:1,amount:1}]});
 const results=await Promise.allSettled([id,other].map(character=>patchCharacter(character,{operationId:randomUUID(),items:[{idPos:1,idItem:1,cant:1,equipped:false}],floorChanges:[{action:'take',dropId}]})));
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
 expect((await pool.query('SELECT count(*)::int n FROM dropped_floor_items WHERE drop_id=$1',[dropId])).rows[0].n).toBe(0);
 expect((await pool.query('SELECT sum(cant)::int n FROM character_items WHERE character_id=ANY($1::uuid[])',[[id,other]])).rows[0].n).toBe(1);
});

test('world drop retries cannot resurrect loot after pickup',async()=>{
 const p={operationId:randomUUID(),map:1,x:20,y:21,itemId:1,amount:3};
 await Promise.all(Array.from({length:5},()=>spawnFloorItem(p)));
 expect((await pool.query('SELECT count(*)::int n FROM dropped_floor_items WHERE drop_id=$1',[p.operationId])).rows[0].n).toBe(1);
 await patchCharacter(id,{operationId:randomUUID(),items:[{idPos:1,idItem:1,cant:3,equipped:false}],floorChanges:[{action:'take',dropId:p.operationId}]});
 await spawnFloorItem(p);
 expect((await pool.query('SELECT count(*)::int n FROM dropped_floor_items WHERE drop_id=$1',[p.operationId])).rows[0].n).toBe(0);
 await expect(spawnFloorItem({...p,amount:99})).rejects.toThrow('does not match');
 await expect(spawnFloorItem({...p,operationId:randomUUID(),amount:-1})).rejects.toThrow();
});
test('world spawn collision cannot overwrite an existing drop or leave a receipt',async()=>{
 const p={operationId:randomUUID(),map:1,x:30,y:31,itemId:1,amount:4};await spawnFloorItem(p);
 const collision={...p,operationId:randomUUID(),amount:999};await expect(spawnFloorItem(collision)).rejects.toThrow();
 expect((await pool.query('SELECT amount FROM dropped_floor_items WHERE drop_id=$1',[p.operationId])).rows[0].amount).toBe(4);
 expect((await pool.query('SELECT count(*)::int n FROM floor_spawn_receipts WHERE operation_id=$1',[collision.operationId])).rows[0].n).toBe(0);
});
