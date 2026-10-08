import {createHmac} from 'node:crypto';
import {Keypair,Transaction} from '@solana/web3.js';
import type {Pool} from 'pg';
import bs58 from 'bs58';
import {prepareCosmeticTransaction} from '../cosmetic-transaction';
import {checkedChain} from '../economy-chain';
import {recordSignedReceipt} from './journal';
import {reserveIssuance,type IssuanceBudget} from './budget';
import {COSMETIC_SEASON,HUNT_SEASON,HUNT_SUPPLY} from '../cosmetic-policy';
export type CosmeticApproval={account_id:string;season:string;state:string;asset_address:string;wallet_address:string;issuer_address:string;metadata_uri:string;linked_wallet:string;eligible:boolean;hunt_eligible:boolean;supply_reserved:boolean;reserved_count:number};
/** Public identity only leaves custody; preserve the original deterministic address. */
export function cosmeticIdentity(issuer:Keypair,account:string,season:string){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(account)||![COSMETIC_SEASON,HUNT_SEASON].includes(season))throw Error('signer.denied');
 return Keypair.fromSeed(createHmac('sha256',issuer.secretKey).update(`${season}:${account}`).digest());
}

export type CosmeticSubmission=CosmeticApproval&{operation_id:string;message_bytes:string;last_valid_height:string;signature:string|null};
export function approveCosmeticSubmission(row:CosmeticSubmission,raw:string,issuer:Keypair,metadataUrl:string){
 checkCosmeticApproval(row,issuer,metadataUrl);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.operation_id)||typeof raw!=='string'||raw.length>2200)throw Error('signer.denied');
 const tx=Transaction.from(Buffer.from(raw,'base64'));
 if(!tx.recentBlockhash||tx.feePayer?.toBase58()!==issuer.publicKey.toBase58())throw Error('signer.denied');
 const expected=prepareCosmeticTransaction(row.operation_id,row.season,row.asset_address,row.wallet_address,row.issuer_address,row.metadata_uri,tx.recentBlockhash);
 if(expected.message_bytes!==row.message_bytes||tx.serializeMessage().toString('base64')!==row.message_bytes)throw Error('signer.denied');
 tx.partialSign(issuer,cosmeticIdentity(issuer,row.account_id,row.season));
 if(!tx.verifySignatures()||!tx.signature)throw Error('signer.denied');
 const signature=bs58.encode(tx.signature);
 if(row.signature&&row.signature!==signature)throw Error('signer.denied');
 return {bytes:tx.serialize().toString('base64'),signature};
}
export async function signCommittedCosmeticOperation(pool:Pool,id:string,raw:string,issuer:Keypair,metadataUrl:string,journal:string,budget:IssuanceBudget){
 const result=await pool.query<CosmeticSubmission>(`SELECT q.*,w.address AS linked_wallet,
 EXISTS(SELECT 1 FROM characters c WHERE c.account_id=q.account_id AND c.deleted_at IS NULL AND c.level>=2) AS eligible,
 EXISTS(SELECT 1 FROM characters c WHERE c.account_id=q.account_id AND c.deleted_at IS NULL AND c.level>=2 AND c.npc_matados>=4) AS hunt_eligible,
 EXISTS(SELECT 1 FROM cosmetic_supply_reservations r WHERE r.account_id=q.account_id AND r.season=q.season AND r.asset_address=q.asset_address) AS supply_reserved,
 (SELECT count(*)::int FROM cosmetic_supply_reservations r WHERE r.season=q.season) AS reserved_count
 FROM cosmetic_claims q JOIN account_wallets w ON w.account_id=q.account_id WHERE q.operation_id=$1`,[id]);
 const row=result.rows[0];if(!row)throw Error('signer.denied');
 checkCosmeticApproval(row,issuer,metadataUrl);
 if(!Number.isSafeInteger(Number(row.last_valid_height))||Number(row.last_valid_height)<1)throw Error('signer.denied');
 const chain=await checkedChain();
 if(!/^\d+$/.test(String(row.last_valid_height))||(await chain.getBlockHeight('finalized'))>Number(row.last_valid_height))throw Error('signer.expired');
 const signed=approveCosmeticSubmission(row,raw,issuer,metadataUrl);
 reserveIssuance(budget,id,row.message_bytes,{gold:0,assets:0,cosmetics:1});
 return recordSignedReceipt(journal,{id,message:row.message_bytes,...signed});
}
export function checkCosmeticApproval(row:CosmeticApproval,issuer:Keypair,metadataUrl:string){
 const deny=()=>{throw Error('signer.denied');};
 if(!row||row.state!=='prepared'||row.linked_wallet!==row.wallet_address||row.eligible!==true||row.issuer_address!==issuer.publicKey.toBase58())deny();
 const asset=cosmeticIdentity(issuer,row.account_id,row.season);
 if(asset.publicKey.toBase58()!==row.asset_address)deny();
 const expected=new URL(metadataUrl);
 if(expected.protocol!=='https:'||expected.username||expected.password||expected.hash)deny();
 if(row.season===HUNT_SEASON){
  if(row.hunt_eligible!==true||row.supply_reserved!==true||!Number.isInteger(row.reserved_count)||row.reserved_count<1||row.reserved_count>HUNT_SUPPLY)deny();
  expected.searchParams.set('kind','first-hunt');
 }
 if(expected.toString()!==row.metadata_uri)deny();
 return {address:asset.publicKey.toBase58(),issuer:issuer.publicKey.toBase58()};
}
