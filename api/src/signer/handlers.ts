import path from 'node:path';
import {Keypair,PublicKey} from '@solana/web3.js';
import type {Pool} from 'pg';
import type {SignerHandlers} from './http';
import type {IssuanceBudget} from './budget';
import {deriveAssetIdentity} from './asset-identity';
import {signCommittedEconomyOperation} from './service';
import {signCommittedAssetOperation} from './asset-policy';
import {cosmeticIdentity,signCommittedCosmeticOperation} from './cosmetic-policy';

export type CustodyOptions={issuer:Keypair;pool:Pool;journal:string;budget:IssuanceBudget;metadataOrigin:string;cosmeticMetadataUrl?:string;mint:string;maximumGold:number;maximumLamports:number};
/** Bind only committed-intent approval cores; never expose a generic signing hook. */
export function createCustodyHandlers(options:CustodyOptions):SignerHandlers{
 const origin=new URL(options.metadataOrigin);
 if(origin.protocol!=='https:'||origin.origin!==options.metadataOrigin||!path.isAbsolute(options.journal)||!path.isAbsolute(options.budget.directory))throw Error('signer.invalidConfiguration');
 if(![options.maximumGold,options.maximumLamports,options.budget.maximumGold,options.budget.maximumAssets,options.budget.maximumCosmetics].every(n=>Number.isSafeInteger(n)&&n>0))throw Error('signer.invalidConfiguration');
 new PublicKey(options.mint);
 if(options.cosmeticMetadataUrl){const uri=new URL(options.cosmeticMetadataUrl);if(uri.protocol!=='https:'||uri.origin!==options.metadataOrigin||uri.username||uri.password||uri.hash)throw Error('signer.invalidConfiguration');}
 const policy={mint:options.mint,maximumGold:options.maximumGold,maximumLamports:options.maximumLamports};
 return {
  identity:async id=>{
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('signer.denied');
   const result=deriveAssetIdentity(options.issuer,id);
   return {address:result.address,issuer:result.issuer};
  },
  economy:(id,transaction)=>signCommittedEconomyOperation(options.pool,id,transaction,options.issuer,policy,options.journal,options.budget,options.metadataOrigin),
  asset:(id,transaction)=>signCommittedAssetOperation(options.pool,id,transaction,options.issuer,options.metadataOrigin,options.journal,options.budget),
  ...(options.cosmeticMetadataUrl?{
   cosmeticIdentity:async(account:string,season:string)=>({address:cosmeticIdentity(options.issuer,account,season).publicKey.toBase58(),issuer:options.issuer.publicKey.toBase58()}),
   cosmetic:(id:string,transaction:string)=>signCommittedCosmeticOperation(options.pool,id,transaction,options.issuer,options.cosmeticMetadataUrl!,options.journal,options.budget)
  }:{})
 };
}
