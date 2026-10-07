import {startOperationRecovery} from './operationRecovery';
import {prepareCharacterPurchase,signAssetSubmission} from "./game-asset-chain";
import {itemEligibilitySql,requireTradableItem,itemQuantity,inventoryDelivery} from './item-economy';
import {randomUUID} from 'node:crypto';
import type {Express,Request} from 'express';
import type {PoolClient} from 'pg';
import pool from './db';
import {getPublicSessionByToken} from './repositories/auth';
import {assertCharacterAvailable,goldAmount,saleLamports,MAX_GOLD} from './economy-policy';
import {economyReady,economyAuthority,hasPreparedSignatures,canWalletBroadcastPrepared,prepareTransaction,validateSignedTransaction,receiptState,economyConnection} from './economy-chain';
async function identity(req:Request){const t=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];const s=t?await getPublicSessionByToken(t):null;if(!s)throw Error('economy.signIn');return s.account._id;}
async function wallet(client:PoolClient,id:string){const r=(await client.query('SELECT address FROM account_wallets WHERE account_id=$1 FOR UPDATE',[id])).rows[0];if(!r)throw Error('economy.linkWallet');return r.address as string;}
async function transaction<T>(fn:(c:PoolClient)=>Promise<T>){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('aoweb.economy_writer','yes',true)");const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function ownCharacter(c:PoolClient,id:string,account:string,sale=false){const r=(await c.query('SELECT * FROM characters WHERE id=$1 AND account_id=$2 AND deleted_at IS NULL FOR UPDATE',[id,account])).rows[0];if(!r)throw Error('economy.notOwned');assertCharacterAvailable(r,sale);if(!sale&&(r.chain_state==='unstaked'||(r.chain_required&&r.chain_state!=='staked')))throw Error('economy.stakeFirst');return r;}
async function invalidateTickets(c:PoolClient,id:string){await c.query('UPDATE game_tickets SET consumed_at=NOW() WHERE character_id=$1 AND consumed_at IS NULL',[id]);}
export function installEconomyRoutes(app:Express){
 function route(path:string,fn:(req:Request,id:string)=>Promise<unknown>,get=false){const handle=async(req:Request,res:any)=>{try{const id=await identity(req);res.json(await fn(req,id));}catch(e){const message=e instanceof Error&&e.message.startsWith('economy.')?e.message:'economy.failed';if(message==='economy.failed'&&e instanceof Error)console.error('[ECONOMY]',path,{name:e.name,code:(e as Error&{code?:string}).code??'unknown',message:e.message.split('\n')[0].slice(0,160)});res.status(message==='economy.signIn'?401:409).json({error:message});}};if(get)app.get(path,handle);else app.post(path,handle);}
 route('/auth/economy',async(_,id)=>{
 const characters=(await pool.query(`SELECT id,name,level,gold,connected,economy_lock,chain_state,asset_address,id_body,id_head,id_weapon,id_shield,id_helmet,
 COALESCE((SELECT json_agg(json_build_object('slot',i.id_pos,'item',i.id_item,'name',o.name,'quantity',i.cant,'equipped',i.equipped,'tradable',(${itemEligibilitySql}))) FROM character_items i JOIN game_objects o ON o.id=i.id_item WHERE i.character_id=characters.id),'[]') AS inventory FROM characters WHERE account_id=$1 AND deleted_at IS NULL ORDER BY name`,[id])).rows;
 const listings=(await pool.query(`SELECT s.id,s.character_id,s.price::text,s.state,c.name,c.level,c.gold,c.id_clase,c.id_body,c.id_head,c.id_weapon,c.id_shield,c.id_helmet,
 s.seller_id=$1 AS mine,COALESCE((SELECT json_agg(json_build_object('item',i.id_item,'name',(SELECT name FROM game_objects WHERE id=i.id_item),'quantity',i.cant,'equipped',i.equipped)) FROM character_items i WHERE i.character_id=c.id),'[]') AS inventory,
 COALESCE((SELECT json_agg(json_build_object('item',i.id_item,'name',(SELECT name FROM game_objects WHERE id=i.id_item),'quantity',i.cant)) FROM character_bank_items i WHERE i.character_id=c.id),'[]') AS bank,
 COALESCE((SELECT json_agg(a.kind) FROM character_achievements a WHERE a.character_id=c.id),'[]') AS achievements
 FROM character_sales s JOIN characters c ON c.id=s.character_id WHERE s.state IN ('listed','reserved') ORDER BY s.created_at DESC LIMIT 100`,[id])).rows;
 const intents=(await pool.query('SELECT id,kind,state,amount::text,signature,character_id,listing_id,item_listing_id FROM economy_intents WHERE account_id=$1 ORDER BY created_at DESC LIMIT 30',[id])).rows;
 const itemListings=(await pool.query(`SELECT s.id,s.character_id,s.item_id,s.quantity,s.price::text,s.state,o.name,(o.data->>'grhIndex')::int AS graphic_id,c.name AS seller_name,s.seller_id=$1 AS mine FROM item_sales s JOIN game_objects o ON o.id=s.item_id JOIN characters c ON c.id=s.character_id WHERE s.state IN ('listed','reserved') ORDER BY s.created_at DESC LIMIT 100`,[id])).rows;
 const marketActivity=(await pool.query(`SELECT s.id,'character' AS kind,c.name,s.price::text,s.state,COALESCE(s.sold_at,s.created_at) AS created_at FROM character_sales s JOIN characters c ON c.id=s.character_id UNION ALL SELECT s.id,'item' AS kind,o.name,s.price::text,s.state,COALESCE(s.sold_at,s.created_at) AS created_at FROM item_sales s JOIN game_objects o ON o.id=s.item_id ORDER BY created_at DESC LIMIT 100`)).rows;
 return {marketActivity,itemListings,network:'devnet',goldMint:process.env.AOWEB_GOLD_MINT??null,goldReady:economyReady(),characters,listings,intents};
 },true);
 route('/auth/economy/list',async(req,id)=>{const price=saleLamports(req.body?.price);return transaction(async c=>{const char=await ownCharacter(c,req.body?.characterId,id,true);if(char.asset_address&&char.chain_state!=='unstaked')throw Error('economy.unstakeFirst');if((await c.query("SELECT 1 FROM market_listings WHERE seller_character_id=$1 AND status='active' UNION ALL SELECT 1 FROM market_claims WHERE owner_character_id=$1 UNION ALL SELECT 1 FROM item_sales WHERE character_id=$1 AND state IN ('listed','reserved') LIMIT 1",[char.id])).rowCount)throw Error('economy.clearMarket');const address=await wallet(c,id);const listing=randomUUID();await c.query('INSERT INTO character_sales(id,character_id,seller_id,seller_wallet,price,state) VALUES($1,$2,$3,$4,$5,\'listed\')',[listing,char.id,id,address,price]);await c.query('UPDATE characters SET economy_lock=$2 WHERE id=$1',[char.id,listing]);await invalidateTickets(c,char.id);return {id:listing};});});
 route('/auth/economy/cancel',async(req,id)=>transaction(async c=>{const s=(await c.query('SELECT * FROM character_sales WHERE id=$1 AND seller_id=$2 FOR UPDATE',[req.body?.listingId,id])).rows[0];if(!s||s.state!=='listed')throw Error('economy.reserved');await c.query("UPDATE character_sales SET state='cancelled' WHERE id=$1",[s.id]);await c.query('UPDATE characters SET economy_lock=NULL WHERE id=$1 AND economy_lock=$2',[s.character_id,s.id]);return {ok:true};}));
 route('/auth/economy/item-list',async(req,id)=>transaction(async c=>{
 const price=saleLamports(req.body?.price),quantity=itemQuantity(req.body?.quantity),char=await ownCharacter(c,req.body?.characterId,id);
 const address=await wallet(c,id);if(Number((await c.query("SELECT count(*) FROM item_sales WHERE seller_id=$1 AND state IN ('listed','reserved')",[id])).rows[0].count)>=20)throw Error('economy.itemLimit');
 const source=(await c.query('SELECT * FROM character_items WHERE character_id=$1 AND id_pos=$2 FOR UPDATE',[char.id,req.body?.slot])).rows[0];
 if(!source||source.equipped||source.cant<quantity)throw Error('economy.itemUnavailable');await requireTradableItem(c,source.id_item);
 if(source.cant===quantity)await c.query('DELETE FROM character_items WHERE character_id=$1 AND id_pos=$2',[char.id,source.id_pos]);else await c.query('UPDATE character_items SET cant=cant-$3 WHERE character_id=$1 AND id_pos=$2',[char.id,source.id_pos,quantity]);
 const listing=randomUUID();await c.query("INSERT INTO item_sales(id,character_id,seller_id,seller_wallet,item_id,quantity,price,state) VALUES($1,$2,$3,$4,$5,$6,$7,'listed')",[listing,char.id,id,address,source.id_item,quantity,price]);await invalidateTickets(c,char.id);return {id:listing};
 }));
 route('/auth/economy/item-cancel',async(req,id)=>transaction(async c=>{
 const s=(await c.query('SELECT * FROM item_sales WHERE id=$1 AND seller_id=$2 FOR UPDATE',[req.body?.listingId,id])).rows[0];if(!s||s.state!=='listed')throw Error('economy.reserved');const char=await ownCharacter(c,s.character_id,id);
 await inventoryDelivery(c,char.id,s.item_id,s.quantity,true);await c.query("UPDATE item_sales SET state='cancelled' WHERE id=$1",[s.id]);await invalidateTickets(c,char.id);return {ok:true};
 }));
 route('/auth/economy/prepare',async(req,id)=>transaction(async c=>{
 const kind=req.body?.kind;if(!['purchase','item-purchase','deposit','withdraw'].includes(kind))throw Error('economy.invalidRequest');const address=await wallet(c,id);let charId:string,amount:number,listing:any;
 if(kind==='item-purchase'){
 listing=(await c.query('SELECT * FROM item_sales WHERE id=$1 FOR UPDATE',[req.body?.listingId])).rows[0];if(!listing||listing.state!=='listed'||listing.seller_id===id)throw Error('economy.reserved');
 const sellerWallet=(await c.query('SELECT address FROM account_wallets WHERE account_id=$1',[listing.seller_id])).rows[0]?.address;if(sellerWallet!==listing.seller_wallet)throw Error('economy.walletChanged');
 const char=await ownCharacter(c,req.body?.characterId,id);await requireTradableItem(c,listing.item_id);await inventoryDelivery(c,char.id,listing.item_id,listing.quantity);charId=char.id;amount=Number(listing.price);
 }else if(kind==='purchase'){listing=(await c.query('SELECT * FROM character_sales WHERE id=$1 FOR UPDATE',[req.body?.listingId])).rows[0];if(!listing||listing.state!=='listed'||listing.seller_id===id)throw Error('economy.reserved');
 const sellerWallet=(await c.query('SELECT address FROM account_wallets WHERE account_id=$1',[listing.seller_id])).rows[0]?.address;if(sellerWallet!==listing.seller_wallet)throw Error('economy.walletChanged');
 const char=(await c.query('SELECT * FROM characters WHERE id=$1 FOR UPDATE',[listing.character_id])).rows[0];if(char.account_id!==listing.seller_id||char.economy_lock!==listing.id||char.connected)throw Error('economy.reserved');charId=listing.character_id;amount=Number(listing.price);
 }else {if(!economyReady())throw Error('economy.unavailable');const char=await ownCharacter(c,req.body?.characterId,id);charId=char.id;amount=goldAmount(req.body?.amount);if(kind==='withdraw'&&char.gold<amount)throw Error('economy.insufficientGold');if(kind==='deposit'&&char.gold>MAX_GOLD-amount)throw Error('economy.goldOverflow');}
 const intent=randomUUID();const tokenized=kind==='purchase'?(await c.query("SELECT a.* FROM game_assets a JOIN characters c ON c.id=a.character_id WHERE a.character_id=$1 AND a.kind='character' AND a.state='active' AND c.asset_address=a.asset_address",[charId])).rows[0]:null;
 if(kind==='purchase'&&!tokenized&&(await c.query('SELECT asset_address FROM characters WHERE id=$1',[charId])).rows[0]?.asset_address)throw Error('economy.reserved');
 const prepared=tokenized?await prepareCharacterPurchase(intent,tokenized,address,listing.seller_wallet,amount):await prepareTransaction(kind==='item-purchase'?'purchase':kind,intent,address,amount,listing?.seller_wallet);
 await c.query(`INSERT INTO economy_intents(id,account_id,character_id,kind,amount,wallet,transaction_bytes,message_bytes,last_valid_height,listing_id,item_listing_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[intent,id,charId,kind,amount,address,prepared.transaction_bytes,prepared.message_bytes,prepared.last_valid_height,kind==='purchase'?listing.id:null,kind==='item-purchase'?listing.id:null]);
 if(kind==='item-purchase'){await c.query("UPDATE item_sales SET state='reserved',buyer_id=$2,intent_id=$3 WHERE id=$1",[listing.id,id,intent]);await c.query('UPDATE characters SET economy_lock=$2 WHERE id=$1',[charId,intent]);await invalidateTickets(c,charId);}else if(listing)await c.query("UPDATE character_sales SET state='reserved',buyer_id=$2,intent_id=$3 WHERE id=$1",[listing.id,id,intent]);else {await c.query('UPDATE characters SET economy_lock=$2,gold=gold-$3 WHERE id=$1',[charId,intent,kind==='withdraw'?amount:0]);await invalidateTickets(c,charId);}
 return {id:intent,transaction:prepared.transaction_bytes,wallet:address,network:'devnet'};
 }));
 route('/auth/economy/submit',async(req,id)=>{
 const intent=await transaction(async c=>{const row=(await c.query('SELECT * FROM economy_intents WHERE id=$1 AND account_id=$2 FOR UPDATE',[req.body?.intentId,id])).rows[0];if(!row)throw Error('economy.notOwned');if(row.state==='complete'||row.state==='failed')return row;
 const asset=row.kind==='purchase'?(await c.query("SELECT a.* FROM game_assets a JOIN characters c ON c.asset_address=a.asset_address WHERE c.id=$1 AND a.kind='character' AND a.state='active'",[row.character_id])).rows[0]:null;
 const signed=asset?signAssetSubmission(req.body?.transaction??'',row.message_bytes,row.wallet,'purchase',asset):validateSignedTransaction(req.body?.transaction??'',row.message_bytes,row.wallet,[economyAuthority()]);if(row.signature&&row.signature!==signed.signature)throw Error('economy.invalidTransaction');await c.query("UPDATE economy_intents SET state='signed',signature=$2,transaction_bytes=$3 WHERE id=$1",[row.id,signed.signature,signed.bytes]);return {...row,state:'signed',signature:signed.signature,transaction_bytes:signed.bytes};});
 if(intent.state!=='complete'&&intent.state!=='failed'){try{await economyConnection.sendRawTransaction(Buffer.from(intent.transaction_bytes,'base64'),{skipPreflight:false,maxRetries:2});}catch{/* Keep the persisted receipt; an RPC error does not prove failure. */}}
 return {id:intent.id,state:intent.state,signature:intent.signature};
 });
 route('/auth/economy/reconcile',async(req,id)=>reconcileIntent(req.body?.intentId,id));
}
export async function reconcileIntent(intentId:string,accountId?:string){
 const initial=(await pool.query('SELECT * FROM economy_intents WHERE id=$1',[intentId])).rows[0];if(!initial||accountId&&initial.account_id!==accountId)throw Error('economy.notOwned');if(initial.state==='complete'||initial.state==='failed')return {state:initial.state};
 const proof=await receiptState(initial.signature,Number(initial.last_valid_height));if(proof==='pending'){if(initial.state==='signed')try{await economyConnection.sendRawTransaction(Buffer.from(initial.transaction_bytes,'base64'),{skipPreflight:false,maxRetries:1});}catch{}return {state:'pending'};}
 if(proof==='failed'&&initial.state==='prepared'&&(hasPreparedSignatures(initial.transaction_bytes)||canWalletBroadcastPrepared(initial.transaction_bytes,initial.wallet)))return {state:'pending'};
 if(proof==='complete'&&initial.state!=='signed')throw Error('economy.inconsistent');
 return transaction(async c=>{const i=(await c.query('SELECT * FROM economy_intents WHERE id=$1 FOR UPDATE',[intentId])).rows[0];if(i.state==='complete'||i.state==='failed')return {state:i.state};
 if(i.state!==initial.state||i.signature!==initial.signature)return {state:'pending'};
 const char=(await c.query('SELECT * FROM characters WHERE id=$1 FOR UPDATE',[i.character_id])).rows[0];
 if(i.kind==='item-purchase'){
 const s=(await c.query('SELECT * FROM item_sales WHERE id=$1 FOR UPDATE',[i.item_listing_id])).rows[0];if(!s||s.state!=='reserved'||s.intent_id!==i.id||s.buyer_id!==i.account_id||char.economy_lock!==i.id||char.account_id!==i.account_id)throw Error('economy.inconsistent');
 if(proof==='complete'){await inventoryDelivery(c,char.id,s.item_id,s.quantity,true);await c.query("UPDATE item_sales SET state='sold',sold_at=NOW() WHERE id=$1",[s.id]);}else await c.query("UPDATE item_sales SET state='listed',buyer_id=NULL,intent_id=NULL WHERE id=$1",[s.id]);
 await c.query('UPDATE characters SET economy_lock=NULL WHERE id=$1',[char.id]);await invalidateTickets(c,char.id);
 }else if(i.kind==='purchase'){const s=(await c.query('SELECT * FROM character_sales WHERE id=$1 FOR UPDATE',[i.listing_id])).rows[0];if(s.state!=='reserved'||s.intent_id!==i.id||char.economy_lock!==s.id||char.account_id!==s.seller_id)throw Error('economy.inconsistent');
 if(proof==='complete'){await c.query('UPDATE characters SET account_id=$2,economy_lock=NULL,economy_login_until=NULL WHERE id=$1',[char.id,i.account_id]);await c.query("UPDATE character_sales SET state='sold',sold_at=NOW() WHERE id=$1",[s.id]);await c.query('UPDATE auth_sessions SET selected_character_id=NULL WHERE selected_character_id=$1',[char.id]);await invalidateTickets(c,char.id);}
 else await c.query("UPDATE character_sales SET state='listed',buyer_id=NULL,intent_id=NULL WHERE id=$1",[s.id]);
 }else {if(char.economy_lock!==i.id||char.account_id!==i.account_id)throw Error('economy.inconsistent');const delta=proof==='complete'?(i.kind==='deposit'?Number(i.amount):0):(i.kind==='withdraw'?Number(i.amount):0);if(char.gold+delta>MAX_GOLD)throw Error('economy.goldOverflow');await c.query('UPDATE characters SET gold=gold+$2,economy_lock=NULL WHERE id=$1',[char.id,delta]);if(proof==='complete')await c.query('INSERT INTO gold_ledger(intent_id,character_id,delta) VALUES($1,$2,$3)',[i.id,char.id,i.kind==='deposit'?Number(i.amount):-Number(i.amount)]);}
 const state=proof==='complete'?'complete':'failed';await c.query('UPDATE economy_intents SET state=$2,completed_at=NOW() WHERE id=$1',[i.id,state]);return {state};
 });
}
export function startEconomyRecovery(){startOperationRecovery('economy_intents',reconcileIntent);}



