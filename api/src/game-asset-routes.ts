import {randomUUID} from 'node:crypto';
import type {Express,Request} from 'express';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import pool from './db';
import {readWalletInventory} from './wallet-inventory';
import {getPublicSessionByToken} from './repositories/auth';
import {assertCharacterAvailable} from './economy-policy';
import {itemEligibilitySql,itemQuantity,requireTradableItem,inventoryDelivery} from './item-economy';
import {assetReady,assetIdentity,signAssetSubmission,prepareAssetTransaction,verifiedAsset,type AssetRecord,type AssetAction} from './game-asset-chain';
import {saveSnapshot,readBundle,bundleHash} from './game-asset-policy';
import {receiptState,hasPreparedSignatures,economyConnection} from './economy-chain';

async function identity(req:Request){const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];const session=token?await getPublicSessionByToken(token):null;if(!session)throw Error('assets.signIn');return session.account._id;}
async function transaction<T>(fn:(c:PoolClient)=>Promise<T>){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SELECT set_config('aoweb.economy_writer','yes',true)");const value=await fn(c);await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function wallet(c:PoolClient,account:string){const row=(await c.query('SELECT address FROM account_wallets WHERE account_id=$1 FOR UPDATE',[account])).rows[0];if(!row)throw Error('assets.linkWallet');return row.address as string;}
async function invalidate(c:PoolClient,id:string){await c.query('UPDATE game_tickets SET consumed_at=NOW() WHERE character_id=$1 AND consumed_at IS NULL',[id]);}
async function clearMarket(c:PoolClient,id:string){if((await c.query("SELECT 1 FROM character_sales WHERE character_id=$1 AND state IN ('listed','reserved') UNION ALL SELECT 1 FROM item_sales WHERE character_id=$1 AND state IN ('listed','reserved') UNION ALL SELECT 1 FROM market_listings WHERE seller_character_id=$1 AND status='active' UNION ALL SELECT 1 FROM market_claims WHERE owner_character_id=$1 LIMIT 1",[id])).rowCount)throw Error('economy.clearMarket');}
function metadataUri(id:string){const url=new URL(process.env.AOWEB_DEVNET_METADATA_URL!);if(url.protocol!=='https:')throw Error('assets.unavailable');url.pathname='/api/game-assets/metadata';url.search='';url.searchParams.set('id',id);return url.toString();}
const prepareInput=z.object({kind:z.enum(['mint','stake','unstake','item-export','item-import']),characterId:z.string().uuid().optional(),asset:z.string().min(32).max(44).optional(),slot:z.number().int().min(0).max(21).optional(),quantity:z.number().int().min(1).max(10000).optional()}).strict();
export function installGameAssetRoutes(app:Express){
 function route(action:string,fn:(req:Request,account:string)=>Promise<unknown>,get=false){const handler=async(req:Request,res:any)=>{try{res.json(await fn(req,await identity(req)));}catch(e){const message=e instanceof Error&&/^(assets|economy)\./.test(e.message)?e.message:'assets.failed';res.status(message==='assets.signIn'?401:409).json({error:message});}};if(get)app.get('/auth/game-assets'+action,handler);else app.post('/auth/game-assets'+action,handler);}
 route('/wallet',async(_,account)=>{
  const address=(await pool.query('SELECT address FROM account_wallets WHERE account_id=$1',[account])).rows[0]?.address;
  if(!address)throw Error('assets.linkWallet');
  return readWalletInventory(address);
 },true);
 route('',async(_,account)=>{
  const chars=(await pool.query(`SELECT c.id,c.name,c.level,c.gold,c.id_body,c.id_head,c.id_weapon,c.id_shield,c.id_helmet,c.chain_required,c.chain_state,c.asset_address,c.connected,c.economy_lock,
   COALESCE((SELECT json_agg(json_build_object('slot',i.id_pos,'item',i.id_item,'name',o.name,'quantity',i.cant,'equipped',i.equipped,'tradable',(${itemEligibilitySql}))) FROM character_items i JOIN game_objects o ON o.id=i.id_item WHERE i.character_id=c.id),'[]') AS inventory
   FROM characters c WHERE c.account_id=$1 AND c.deleted_at IS NULL ORDER BY c.name`,[account])).rows;
  const operations=(await pool.query('SELECT p.id,p.kind,p.state,p.signature,p.character_id,p.asset_id,a.item_id FROM game_asset_operations p JOIN game_assets a ON a.id=p.asset_id WHERE p.account_id=$1 ORDER BY p.created_at DESC LIMIT 30',[account])).rows;
  const items=(await pool.query("SELECT a.asset_address,a.item_id,a.quantity,o.name FROM game_assets a JOIN game_asset_operations p ON p.asset_id=a.id AND p.kind='item-export' AND p.state='complete' JOIN game_objects o ON o.id=a.item_id WHERE p.account_id=$1 AND a.state='active' ORDER BY a.created_at DESC LIMIT 50",[account])).rows;
  const goldOperations=(await pool.query("SELECT id,kind,state,signature,amount::text FROM economy_intents WHERE account_id=$1 AND kind IN ('deposit','withdraw') ORDER BY created_at DESC LIMIT 30",[account])).rows;
  return {goldOperations,ready:assetReady(),network:'devnet',wallet:(await pool.query('SELECT address FROM account_wallets WHERE account_id=$1',[account])).rows[0]?.address??null,characters:chars,operations,items};
 },true);
 route('/prepare',async(req,account)=>{
  if(!assetReady())throw Error('assets.unavailable');const body=prepareInput.parse(req.body);const kind=body.kind;
  return transaction(async c=>{
   const address=await wallet(c,account);let record:AssetRecord;let character:any;let settlement:{version:number;hash:string}|undefined;
   if(kind==='stake'||kind==='item-import'){
    record=(await c.query("SELECT * FROM game_assets WHERE asset_address=$1 AND state='active' FOR UPDATE",[body.asset])).rows[0];
    if(!record||record.kind!==(kind==='stake'?'character':'item'))throw Error('assets.invalidAsset');
    await verifiedAsset(record,address);
    character=(await c.query('SELECT * FROM characters WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[kind==='stake'?record.character_id:body.characterId])).rows[0];
   }else{
    character=(await c.query('SELECT * FROM characters WHERE id=$1 AND account_id=$2 AND deleted_at IS NULL FOR UPDATE',[body.characterId,account])).rows[0];
    if(!character)throw Error('assets.notOwned');
    if(kind==='unstake')record=(await c.query("SELECT * FROM game_assets WHERE character_id=$1 AND kind='character' AND state='active' FOR UPDATE",[character.id])).rows[0];
    else {
     const id=kind==='mint'?character.id:randomUUID();const derived=assetIdentity(id);
     record={id,kind:kind==='mint'?'character':'item',character_id:character.id,asset_address:derived.address,issuer_address:derived.issuer,metadata_uri:metadataUri(id)};
    }
   }
   if(!character||!record)throw Error('assets.notOwned');assertCharacterAvailable(character);
   // Individual item operations touch inventory only. Other escrowed items
   // remain separate; whole-character ownership transitions require clearing them.
   if(kind!=='item-export'&&kind!=='item-import')await clearMarket(c,character.id);
   if(kind==='mint'){
    if(character.asset_address||character.chain_state!=='offchain')throw Error('assets.alreadyMinted');
    settlement=await saveSnapshot(c,character);
   }else if(kind==='stake'){
    if(character.chain_state!=='unstaked'||character.asset_address!==record.asset_address)throw Error('assets.alreadyStaked');
    const snapshot=(await c.query('SELECT version,hash FROM character_snapshots WHERE character_id=$1 AND settled=TRUE ORDER BY version DESC LIMIT 1',[character.id])).rows[0];
    const asset=await verifiedAsset(record,address);const attrs=new Map(asset.attributes?.attributeList.map(a=>[a.key,a.value]));
    if(!snapshot||bundleHash(await readBundle(c,character))!==snapshot.hash||attrs.get('snapshot_hash')!==snapshot.hash||attrs.get('snapshot_version')!==String(snapshot.version))throw Error('assets.inconsistent');
   }else if(kind==='unstake'){
    if(character.account_id!==account||character.chain_state!=='staked')throw Error('assets.notStaked');
    settlement=await saveSnapshot(c,character);
   }else{
    if(character.account_id!==account||character.chain_state==='unstaked'||(character.chain_required&&character.chain_state!=='staked'))throw Error('assets.stakeFirst');
    if(character.asset_address)await verifiedAsset((await c.query("SELECT * FROM game_assets WHERE asset_address=$1",[character.asset_address])).rows[0],address);
    if(kind==='item-export'){
     const quantity=itemQuantity(body.quantity);const source=(await c.query('SELECT * FROM character_items WHERE character_id=$1 AND id_pos=$2 FOR UPDATE',[character.id,body.slot])).rows[0];
     if(!source||source.equipped||source.cant<quantity)throw Error('economy.itemUnavailable');await requireTradableItem(c,source.id_item);
     record.item_id=source.id_item;record.quantity=quantity;
     if(source.cant===quantity)await c.query('DELETE FROM character_items WHERE character_id=$1 AND id_pos=$2',[character.id,source.id_pos]);else await c.query('UPDATE character_items SET cant=cant-$3 WHERE character_id=$1 AND id_pos=$2',[character.id,source.id_pos,quantity]);
    }else {await requireTradableItem(c,record.item_id!);await inventoryDelivery(c,character.id,record.item_id!,record.quantity!);}
   }
   if(kind==='mint'||kind==='item-export'){
    const saved=await c.query(`INSERT INTO game_assets(id,kind,character_id,asset_address,issuer_address,metadata_uri,item_id,quantity,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'reserved') ON CONFLICT(id) DO UPDATE SET state='reserved',metadata_uri=EXCLUDED.metadata_uri,asset_address=EXCLUDED.asset_address,issuer_address=EXCLUDED.issuer_address WHERE game_assets.state='failed'`,[record.id,record.kind,record.character_id,record.asset_address,record.issuer_address,record.metadata_uri,record.item_id??null,record.quantity??null]);
    if(!saved.rowCount)throw Error('assets.alreadyMinted');
   }
   const pending=(await c.query("SELECT 1 FROM game_asset_operations WHERE asset_id=$1 AND state IN ('prepared','signed')",[record.id])).rowCount;if(pending)throw Error('assets.pending');
   const operation=randomUUID();const name=kind==='item-export'?`AOCHAIN Item ${record.item_id} × ${record.quantity}`:`AOCHAIN · ${character.name}`;
   const prepared=await prepareAssetTransaction(kind,operation,record,address,name,settlement);
   await c.query(`INSERT INTO game_asset_operations(id,account_id,character_id,asset_id,kind,wallet,transaction_bytes,message_bytes,last_valid_height,snapshot_version,source_slot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[operation,account,character.id,record.id,kind,address,prepared.transaction_bytes,prepared.message_bytes,prepared.last_valid_height,settlement?.version??null,body.slot??null]);
   await c.query('UPDATE characters SET economy_lock=$2 WHERE id=$1',[character.id,operation]);await invalidate(c,character.id);
   return {id:operation,transaction:prepared.transaction_bytes,wallet:address,asset:record.asset_address,network:'devnet'};
  });
 });
 route('/submit',async(req,account)=>{
  const body=z.object({operationId:z.string().uuid(),transaction:z.string().max(2200)}).strict().parse(req.body);
  const row=await transaction(async c=>{
   const op=(await c.query('SELECT * FROM game_asset_operations WHERE id=$1 AND account_id=$2 FOR UPDATE',[body.operationId,account])).rows[0];if(!op)throw Error('assets.notOwned');
   if(op.state==='complete'||op.state==='failed')return op;
   const record=(await c.query('SELECT * FROM game_assets WHERE id=$1',[op.asset_id])).rows[0];if(!record)throw Error('assets.inconsistent');
   const signed=signAssetSubmission(body.transaction,op.message_bytes,op.wallet,op.kind,record);
   if(op.signature&&op.signature!==signed.signature)throw Error('economy.invalidTransaction');
   await c.query("UPDATE game_asset_operations SET state='signed',signature=$2,transaction_bytes=$3 WHERE id=$1",[op.id,signed.signature,signed.bytes]);return {...op,...{state:'signed',signature:signed.signature,transaction_bytes:signed.bytes}};
  });
  if(row.state==='signed')try{await economyConnection.sendRawTransaction(Buffer.from(row.transaction_bytes,'base64'),{skipPreflight:false,maxRetries:1});}catch{/* Keep exact signed bytes for recovery; do not release reservations. */}
  return {id:row.id,signature:row.signature,...await reconcileAssetOperation(row.id,account)};
 });
 route('/reconcile',async(req,account)=>reconcileAssetOperation(z.string().uuid().parse(req.body?.operationId),account));
 app.get('/game-assets/metadata',async(req,res)=>{
  const id=z.string().uuid().safeParse(req.query.id);if(!id.success){res.status(404).json({error:'Not found'});return;}
  const record=(await pool.query("SELECT a.*,o.name AS item_name FROM game_assets a LEFT JOIN game_objects o ON o.id=a.item_id WHERE a.id=$1 AND a.state<>'failed'",[id.data])).rows[0];if(!record){res.status(404).json({error:'Not found'});return;}
  const snapshot=(await pool.query('SELECT version,hash,summary FROM character_snapshots WHERE character_id=$1 ORDER BY settled DESC,version DESC LIMIT 1',[record.character_id])).rows[0];
  const origin=new URL(process.env.AOWEB_DEVNET_METADATA_URL!).origin;
  const name=record.kind==='character'?`AOCHAIN · ${snapshot?.summary.name??'Character'}`:`${record.item_name} × ${record.quantity}`;
  res.setHeader('Cache-Control','no-store');res.json({name,description:record.kind==='character'?'An AOCHAIN character with its complete in-game inventory, bank, skills and progress. Stake to play; unstake to transfer.':'An exported AOCHAIN item receipt. Deposit burns this NFT and returns its registered item quantity to your character.',image:origin+'/brand/mark.svg',external_url:origin+'/wallet',attributes:record.kind==='character'?[{trait_type:'Level',value:snapshot?.summary.level??0},{trait_type:'Inventory slots',value:snapshot?.summary.inventory??0},{trait_type:'Bank slots',value:snapshot?.summary.bank??0},{trait_type:'Snapshot version',value:snapshot?.version??0},{trait_type:'Snapshot hash',value:snapshot?.hash??''}]:[{trait_type:'Item ID',value:record.item_id},{trait_type:'Quantity',value:record.quantity}],properties:{category:'image'},aochain:{network:'devnet',asset:record.asset_address}});
 });
}
export async function reconcileAssetOperation(id:string,account?:string){
 const initial=(await pool.query('SELECT * FROM game_asset_operations WHERE id=$1',[id])).rows[0];if(!initial||(account&&initial.account_id!==account))throw Error('assets.notOwned');
 if(['complete','failed'].includes(initial.state))return {state:initial.state};
 const proof=await receiptState(initial.signature,Number(initial.last_valid_height));
 if(proof==='pending'){if(initial.state==='signed')try{await economyConnection.sendRawTransaction(Buffer.from(initial.transaction_bytes,'base64'),{skipPreflight:false,maxRetries:1});}catch{}return {state:'pending'};}
 if(proof==='failed'&&initial.state==='prepared'&&hasPreparedSignatures(initial.transaction_bytes))return {state:'pending'};
 if(proof==='complete'&&initial.state!=='signed')throw Error('assets.inconsistent');
 return transaction(async c=>{
  const op=(await c.query('SELECT * FROM game_asset_operations WHERE id=$1 FOR UPDATE',[id])).rows[0];if(['complete','failed'].includes(op.state))return {state:op.state};
  if(op.state!==initial.state||op.signature!==initial.signature)return {state:'pending'};
  const character=(await c.query('SELECT * FROM characters WHERE id=$1 FOR UPDATE',[op.character_id])).rows[0];
  const asset=(await c.query('SELECT * FROM game_assets WHERE id=$1 FOR UPDATE',[op.asset_id])).rows[0];
  if(!character||character.economy_lock!==op.id)throw Error('assets.inconsistent');
  if(proof==='complete'){
   if(op.kind==='mint'||op.kind==='stake'){
    await c.query("UPDATE characters SET chain_state='staked',chain_required=TRUE,asset_address=$2,account_id=$3,economy_login_until=NULL WHERE id=$1",[character.id,asset.asset_address,op.account_id]);
    await c.query('UPDATE auth_sessions SET selected_character_id=NULL WHERE selected_character_id=$1',[character.id]);
   }else if(op.kind==='unstake')await c.query("UPDATE characters SET chain_state='unstaked',economy_login_until=NULL WHERE id=$1",[character.id]);
   else if(op.kind==='item-import')await inventoryDelivery(c,character.id,asset.item_id,asset.quantity,true);
   if(op.snapshot_version)await c.query('UPDATE character_snapshots SET settled=TRUE WHERE character_id=$1 AND version=$2',[character.id,op.snapshot_version]);
   await c.query('UPDATE game_assets SET state=$2 WHERE id=$1',[asset.id,op.kind==='item-import'?'burned':'active']);
  }else if(op.kind==='mint'||op.kind==='item-export'){
   if(op.kind==='item-export')await inventoryDelivery(c,character.id,asset.item_id,asset.quantity,true);
   await c.query("UPDATE game_assets SET state='failed' WHERE id=$1",[asset.id]);
  }
  await c.query('UPDATE characters SET economy_lock=NULL WHERE id=$1',[character.id]);await invalidate(c,character.id);
  const state=proof==='complete'?'complete':'failed';await c.query('UPDATE game_asset_operations SET state=$2,completed_at=NOW() WHERE id=$1',[op.id,state]);return {state};
 });
}
export function startAssetRecovery(){let busy=false;const timer=setInterval(async()=>{if(busy)return;busy=true;try{const rows=(await pool.query("SELECT id FROM game_asset_operations WHERE state IN ('prepared','signed') ORDER BY created_at LIMIT 20")).rows;for(const r of rows)try{await reconcileAssetOperation(r.id);}catch{/* No unlock on RPC ambiguity. */}}catch{}finally{busy=false;}},5000);timer.unref();}
