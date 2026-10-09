import fs from 'node:fs';
import path from 'node:path';
import {Keypair,PublicKey} from '@solana/web3.js';
import {getMint,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import type {Pool} from 'pg';
import {checkedChain} from '../economy-chain';
import {createCustodyHandlers} from './handlers';
import {startSigner} from './service';

export function activationOptions(env:NodeJS.ProcessEnv){
 const positive=(key:string)=>{const n=Number(env[key]);if(!Number.isSafeInteger(n)||n<=0)throw Error('signer.invalidConfiguration');return n;};
 const directory=env.AOWEB_SIGNER_BUDGET_DIR;
 const metadataOrigin=env.AOWEB_SIGNER_METADATA_ORIGIN;
 const cosmeticMetadataUrl=env.AOWEB_COSMETIC_METADATA_URL;
 if(!directory||!path.isAbsolute(directory)||!metadataOrigin||!cosmeticMetadataUrl)throw Error('signer.invalidConfiguration');
 const origin=new URL(metadataOrigin),cosmetic=new URL(cosmeticMetadataUrl);
 if(origin.protocol!=='https:'||origin.origin!==metadataOrigin||cosmetic.origin!==metadataOrigin||cosmetic.username||cosmetic.password||cosmetic.hash)throw Error('signer.invalidConfiguration');
 return {metadataOrigin,cosmeticMetadataUrl,budget:{directory,maximumGold:positive('AOWEB_SIGNER_LIFETIME_GOLD'),maximumAssets:positive('AOWEB_SIGNER_LIFETIME_ASSETS'),maximumCosmetics:positive('AOWEB_SIGNER_LIFETIME_COSMETICS')}};
}

export function importCustodyKey(bytes:number[]):Keypair{
 if(!Array.isArray(bytes)||bytes.length!==64||!bytes.every(n=>Number.isInteger(n)&&n>=0&&n<=255))throw Error('signer.invalidCustody');
 const secret=Uint8Array.from(bytes);
 try{return Keypair.fromSecretKey(Uint8Array.from(secret));}finally{secret.fill(0);bytes.fill(0);}
}

/** Reads existing protected custody only. Never creates keys, requests funds or broadcasts. */
export async function loadActivatedHandlers(pool:Pool){
 const options=activationOptions(process.env);
 for(const dir of [options.budget.directory,process.env.AOWEB_SIGNER_JOURNAL_DIR!]){
  const stat=fs.lstatSync(dir);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('signer.invalidStorage');
 }
 const file=process.env.AOWEB_GOLD_AUTHORITY_FILE!;
 if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())throw Error('signer.invalidStorage');
 const bytes=JSON.parse(fs.readFileSync(file,'utf8'));
 // web3.js retains the supplied array; import gives custody its own buffer.
 const issuer=importCustodyKey(bytes);
 if(!issuer.publicKey.equals(new PublicKey(process.env.AOWEB_GOLD_AUTHORITY_PUBLIC_KEY!)))throw Error('signer.issuerMismatch');
 const chain=await checkedChain();
 const mint=await getMint(chain,new PublicKey(process.env.AOWEB_GOLD_MINT!),'finalized',TOKEN_PROGRAM_ID);
 if(mint.decimals!==0||mint.freezeAuthority||!mint.mintAuthority?.equals(issuer.publicKey))throw Error('signer.mintMismatch');
 return createCustodyHandlers({...options,issuer,pool,journal:process.env.AOWEB_SIGNER_JOURNAL_DIR!,mint:process.env.AOWEB_GOLD_MINT!,maximumGold:Number(process.env.AOWEB_SIGNER_MAX_GOLD),maximumLamports:Number(process.env.AOWEB_SIGNER_MAX_LAMPORTS)});
}

if(require.main===module){startSigner(true).catch((error:unknown)=>{const message=error instanceof Error?error.message:'';const category=/^signer\.[a-zA-Z]+$/.test(message)?message:'dependencyOrProviderFailure';console.error('Activated signer startup failed; category: '+category);process.exitCode=1;});}
