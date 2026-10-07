import {z} from 'zod';
import {createHash} from 'node:crypto';
import pool from '../db';
const schema=z.object({operationId:z.string().uuid(),map:z.number().int().positive(),x:z.number().int().min(0),y:z.number().int().min(0),itemId:z.number().int().positive(),amount:z.number().int().positive()}).strict();
export async function spawnFloorItem(input:unknown):Promise<{ok:true}> {
 const p=schema.parse(input),hash=createHash('sha256').update(JSON.stringify(p)).digest('hex');
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  const receipt=await client.query('INSERT INTO floor_spawn_receipts(operation_id,payload_hash) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING operation_id',[p.operationId,hash]);
  if(!receipt.rowCount){
   const old=(await client.query('SELECT payload_hash FROM floor_spawn_receipts WHERE operation_id=$1',[p.operationId])).rows[0];
   if(old?.payload_hash!==hash)throw Error('World drop ID does not match original operation');
  }else{
   // A world spawn must never replace an existing player's item.
   await client.query('INSERT INTO dropped_floor_items(drop_id,map_id,x,y,item_id,amount) VALUES($1,$2,$3,$4,$5,$6)',[p.operationId,p.map,p.x,p.y,p.itemId,p.amount]);
  }
  await client.query('COMMIT');return {ok:true};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
