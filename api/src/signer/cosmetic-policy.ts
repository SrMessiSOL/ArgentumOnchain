import {createHmac} from 'node:crypto';
import {Keypair} from '@solana/web3.js';
import {COSMETIC_SEASON,HUNT_SEASON,HUNT_SUPPLY} from '../cosmetic-policy';
export type CosmeticApproval={account_id:string;season:string;state:string;asset_address:string;wallet_address:string;issuer_address:string;metadata_uri:string;linked_wallet:string;eligible:boolean;hunt_eligible:boolean;supply_reserved:boolean;reserved_count:number};
/** Public identity only leaves custody; preserve the original deterministic address. */
export function cosmeticIdentity(issuer:Keypair,account:string,season:string){
 if(!/^[0-9a-f-]{36}$/i.test(account)||![COSMETIC_SEASON,HUNT_SEASON].includes(season))throw Error('signer.denied');
 return Keypair.fromSeed(createHmac('sha256',issuer.secretKey).update(`${season}:${account}`).digest());
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
