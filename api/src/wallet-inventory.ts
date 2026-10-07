import {PublicKey} from '@solana/web3.js';
import {getAssociatedTokenAddressSync,unpackAccount,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import pool from './db';
import {checkedChain} from './economy-chain';
import {fetchGameAssets,attributes,type AssetRecord} from './game-asset-chain';

export async function readWalletInventory(wallet:string){
 const connection=await checkedChain();
 const records=(await pool.query("SELECT a.*,c.id_body,c.id_head,c.id_weapon,c.id_shield,c.id_helmet,COALESCE(o.name,c.name) AS name FROM game_assets a LEFT JOIN game_objects o ON o.id=a.item_id LEFT JOIN characters c ON c.id=a.character_id WHERE a.state='active' ORDER BY a.created_at DESC LIMIT 5001")).rows;
 // Fail visibly instead of returning a partial inventory when a realm exceeds this bounded fallback.
 if(records.length>5000)throw Error('economy.rpcBusy');
 const chainAssets=await fetchGameAssets(records.map(record=>record.asset_address));
 const assets:{address:string;kind:string;name:string;quantity:number|null;characterId:string;staked:boolean;itemId?:number;appearance?:{bodyId:number;headId:number;weaponId:number;shieldId:number;helmetId:number}}[]=[];
 for(const record of records as (AssetRecord&{name:string;id_body:number;id_head:number;id_weapon:number;id_shield:number;id_helmet:number})[]){
  const asset=chainAssets.get(record.asset_address);
  if(!asset||asset.owner!==wallet||asset.updateAuthority.type!=='Address'||asset.updateAuthority.address!==record.issuer_address||asset.uri!==record.metadata_uri)continue;
  const registered=new Map(asset.attributes?.attributeList.map(a=>[a.key,a.value]));
  if(attributes(record).some(a=>registered.get(a.key)!==a.value))continue;
  assets.push({address:record.asset_address,kind:record.kind,name:record.name,quantity:record.quantity??null,characterId:record.character_id,staked:Boolean(asset.freezeDelegate?.frozen),itemId:record.item_id,appearance:record.kind==='character'?{bodyId:record.id_body,headId:record.id_head,weaponId:record.id_weapon,shieldId:record.id_shield,helmetId:record.id_helmet}:undefined});
 }
 let goldBalance:string|null=null;
 const goldMint=process.env.AOWEB_GOLD_MINT??null;
 if(goldMint){
  const mint=new PublicKey(goldMint),owner=new PublicKey(wallet),ata=getAssociatedTokenAddressSync(mint,owner);
  const info=await connection.getAccountInfo(ata,'finalized');
  if(!info)goldBalance='0';
  else{const account=unpackAccount(ata,info,TOKEN_PROGRAM_ID);if(!account.owner.equals(owner)||!account.mint.equals(mint)||account.isFrozen)throw Error('assets.invalidAsset');goldBalance=account.amount.toString();}
 }
 assets.sort((a,b)=>a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name)||a.address.localeCompare(b.address));
 return {wallet,network:'devnet',assets,goldMint,goldBalance,checkedAt:new Date().toISOString()};
}
