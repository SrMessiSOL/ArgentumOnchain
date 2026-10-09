import type {PoolClient} from 'pg';

// NPC availability does not restrict ordinary items. Starter gear remains bound;
// gold objects use the SPL balance flow rather than item NFT export.
export const itemEligibilitySql=`o.obj_type<>5 AND COALESCE((o.data->>'newbie')::int,0)=0`;
export async function requireTradableItem(c:PoolClient,item:number){
 const r=await c.query(`SELECT o.id FROM game_objects o WHERE o.id=$1 AND ${itemEligibilitySql}`,[item]);
 if(!r.rowCount)throw Error('economy.itemRestricted');
}
export function itemQuantity(value:unknown){if(typeof value!=='number'||!Number.isInteger(value)||value<1||value>10000)throw Error('economy.itemQuantity');return value;}
export async function inventoryDelivery(c:PoolClient,character:string,item:number,quantity:number,apply=false){
 const rows=(await c.query('SELECT id_pos,id_item,cant,equipped FROM character_items WHERE character_id=$1 ORDER BY id_pos FOR UPDATE',[character])).rows;
 let remaining=quantity;
 const changes:{slot:number;quantity:number;insert:boolean}[]=[];
 for(const r of rows){if(r.id_item!==item||r.cant>=10000)continue;const add=Math.min(remaining,10000-r.cant);if(add){changes.push({slot:r.id_pos,quantity:add,insert:false});remaining-=add;}}
 // The game uses at most 21 inventory slots; support its zero/one-based records.
 const used=new Set<number>(rows.map(r=>r.id_pos)),start=used.has(0)?0:1;
 for(let slot=start;remaining>0&&slot<start+21;slot++){if(used.has(slot))continue;const add=Math.min(remaining,10000);changes.push({slot,quantity:add,insert:true});remaining-=add;}
 if(remaining||rows.length+changes.filter(r=>r.insert).length>21)throw Error('economy.inventoryFull');
 if(apply)for(const change of changes){if(change.insert)await c.query('INSERT INTO character_items(character_id,id_pos,id_item,cant,equipped) VALUES($1,$2,$3,$4,false)',[character,change.slot,item,change.quantity]);else await c.query('UPDATE character_items SET cant=cant+$3 WHERE character_id=$1 AND id_pos=$2',[character,change.slot,change.quantity]);}
}
