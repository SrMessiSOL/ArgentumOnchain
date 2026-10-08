import {Keypair,Transaction} from '@solana/web3.js';
import type {Pool} from 'pg';
import {prepareAssetTransaction,signAssetSubmission,verifiedAsset,type AssetRecord,type AssetAction} from '../game-asset-chain';
import {checkedChain} from '../economy-chain';
import {recordSignedReceipt} from './journal';
import {reserveIssuance,type IssuanceBudget} from './budget';

export type AssetApproval={id:string;kind:AssetAction;state:string;account_id:string;character_id:string;wallet:string;message_bytes:string;signature:string|null;last_valid_height:string;snapshot_version:number|null;snapshot_hash:string|null;record:AssetRecord&{state:string};linked_wallet:string;owner_id:string;economy_lock:string|null;connected:boolean;deleted_at:unknown;chain_state:string;chain_required:boolean;character_asset:string|null;name:string};
export function checkAssetApproval(row:AssetApproval,issuer:string,metadataOrigin:string){
 const deny=()=>{throw Error('signer.denied');};
 if(!row||!['prepared','signed'].includes(row.state)||row.connected!==false||row.deleted_at!==null||row.economy_lock!==row.id||row.linked_wallet!==row.wallet||(row.kind!=='stake'&&row.owner_id!==row.account_id))deny();
 if(!['mint','stake','unstake','item-export','item-import'].includes(row.kind)||row.record.issuer_address!==issuer)deny();
 const mint=row.kind==='mint'||row.kind==='item-export';
 if(row.record.state!==(mint?'reserved':'active'))deny();
 if(row.record.kind!==(row.kind.startsWith('item-')?'item':'character'))deny();
 if(row.kind!=='item-import'&&row.record.character_id!==row.character_id)deny();
 if(row.record.kind==='item'&&(!Number.isSafeInteger(row.record.item_id)||!Number.isInteger(row.record.quantity)||row.record.quantity!<1||row.record.quantity!>10000))deny();
 if(row.kind==='mint'&&(row.chain_state!=='offchain'||row.character_asset||row.record.id!==row.character_id))deny();
 if(row.kind==='stake'&&(row.chain_state!=='unstaked'||row.character_asset!==row.record.asset_address))deny();
 if(row.kind==='unstake'&&(row.chain_state!=='staked'||row.character_asset!==row.record.asset_address))deny();
 if(row.kind.startsWith('item-')&&(row.chain_state==='unstaked'||(row.chain_required&&row.chain_state!=='staked')))deny();
 if(['mint','unstake','stake'].includes(row.kind)&&(!row.snapshot_version||!row.snapshot_hash||!/^[a-f0-9]{64}$/.test(row.snapshot_hash)))deny();
 const uri=new URL(row.record.metadata_uri),expected=new URL('/api/game-assets/metadata',metadataOrigin);
 expected.searchParams.set('id',row.record.id);
 if(uri.protocol!=='https:'||uri.toString()!==expected.toString())deny();
}

/** No HTTP exposure until issuance budgets, custody and integration checks pass. */
export async function signCommittedAssetOperation(pool:Pool,id:string,raw:string,issuer:Keypair,metadataOrigin:string,journal:string,budget:IssuanceBudget){
 if(!/^[0-9a-f-]{36}$/i.test(id)||typeof raw!=='string'||raw.length>2200)throw Error('signer.denied');
 const result=await pool.query<AssetApproval>(`SELECT p.*,COALESCE(p.snapshot_version,s.version) AS snapshot_version,to_jsonb(a) AS record,w.address AS linked_wallet,c.account_id AS owner_id,c.economy_lock,c.connected,c.deleted_at,c.chain_state,c.chain_required,c.asset_address AS character_asset,c.name,s.hash AS snapshot_hash
 FROM game_asset_operations p JOIN game_assets a ON a.id=p.asset_id JOIN characters c ON c.id=p.character_id
 JOIN account_wallets w ON w.account_id=p.account_id LEFT JOIN LATERAL (SELECT version,hash FROM character_snapshots WHERE character_id=p.character_id AND ((p.kind='stake' AND settled=TRUE) OR version=p.snapshot_version) ORDER BY version DESC LIMIT 1) s ON TRUE WHERE p.id=$1`,[id]);
 const row=result.rows[0];checkAssetApproval(row,issuer.publicKey.toBase58(),metadataOrigin);
 const chain=await checkedChain();if((await chain.getBlockHeight('finalized'))>Number(row.last_valid_height))throw Error('signer.expired');
 if(row.kind==='stake'){
  const asset=await verifiedAsset(row.record,row.wallet),attrs=new Map(asset.attributes?.attributeList.map(a=>[a.key,a.value]));
  if(attrs.get('snapshot_version')!==String(row.snapshot_version)||attrs.get('snapshot_hash')!==row.snapshot_hash)throw Error('signer.denied');
 }
 const walletTx=Transaction.from(Buffer.from(raw,'base64'));
 const name=row.kind==='item-export'?`AOCHAIN Item ${row.record.item_id} × ${row.record.quantity}`:`AOCHAIN · ${row.name}`;
 const settlement=row.snapshot_version&&row.snapshot_hash?{version:row.snapshot_version,hash:row.snapshot_hash}:undefined;
 const expected=await prepareAssetTransaction(row.kind,id,row.record,row.wallet,name,settlement,walletTx.recentBlockhash,issuer);
 if(expected.message_bytes!==row.message_bytes)throw Error('signer.denied');
 const resultSigned=signAssetSubmission(raw,row.message_bytes,row.wallet,row.kind,row.record,issuer);
 if(row.signature&&row.signature!==resultSigned.signature)throw Error('signer.denied');
 reserveIssuance(budget,id,row.message_bytes,{gold:0,assets:['mint','item-export'].includes(row.kind)?1:0,cosmetics:0});
 return recordSignedReceipt(journal,{id,message:row.message_bytes,...resultSigned});
}
