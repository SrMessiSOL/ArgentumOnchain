import pool from '../db';
import expansion from '../jsons/tailoringExpansion.json';
import {computeChecksum,normalizeCraftingRecipeData,type GameCraftingRecipeRecordData} from '../lib/gameData';
async function main(){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('aochain-tailoring-expansion'))");
  const existing=await client.query('SELECT id,data FROM game_crafting_recipes ORDER BY id FOR UPDATE');
  const objects=await client.query('SELECT id,data FROM game_objects FOR SHARE');
  const ids=new Set(objects.rows.map(row=>Number(row.id)));
  const additions=expansion.filter(recipe=>!existing.rows.some(row=>row.data.profession===recipe.profession && Number(row.data.itemId)===recipe.itemId && !row.data.deleted));
  for(const recipe of additions)if(!ids.has(recipe.itemId)||recipe.materials.some(m=>!ids.has(m.itemId)))throw Error('Recipe references unresolved live objects.');
  console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'dry-run',additions:additions.map(r=>({itemId:r.itemId,skill:r.skill,materials:r.materials}))},null,2));
  if(!process.argv.includes('--apply')){await client.query('ROLLBACK');return;}
  let nextId=Math.max(0,...existing.rows.map(row=>Number(row.id)));
  for(const recipe of additions){
   const id=++nextId,data=normalizeCraftingRecipeData({...recipe,id} as GameCraftingRecipeRecordData),checksum=computeChecksum(data);
   const revision=await client.query("INSERT INTO game_data_revisions(kind,entity_id,action,checksum) VALUES('crafting_recipes',$1,'upsert',$2) RETURNING id",[id,checksum]);
   await client.query('INSERT INTO game_crafting_recipes(id,profession,category,item_id,skill,data,checksum,version,updated_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,NOW())',[id,data.profession,data.category,data.itemId,data.skill,JSON.stringify(data),checksum,revision.rows[0].id]);
  }
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
main().catch(()=>{console.error('Tailoring update failed; no additions were committed. Check the live catalog/schema.');process.exitCode=1;}).finally(()=>pool.end());
