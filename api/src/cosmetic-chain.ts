import fs from 'node:fs';
import {Connection,Transaction} from '@solana/web3.js';
import {createDevnetFetch} from './economy-rpc';
import {createHmac} from 'node:crypto';
import {createUmi} from '@metaplex-foundation/umi-bundle-defaults';
import {createSignerFromKeypair, keypairIdentity, publicKey} from '@metaplex-foundation/umi';
import {create, mplCore, safeFetchAssetV1} from '@metaplex-foundation/mpl-core';
import bs58 from 'bs58';
import {COSMETIC_SEASON, requireDevnet} from './cosmetic-policy';
import pool from './db';
import {isolatedSignerConfigured,isolatedCosmeticIdentity,isolatedSubmission} from './signer-client';
import {checkedChain,validateSignedTransaction} from './economy-chain';
import {prepareCosmeticTransaction} from './cosmetic-transaction';

// Hard-coded public devnet endpoint: no mainnet override or user's wallet secret.
export const DEVNET_RPC='https://api.devnet.solana.com';
const cosmeticConnection=new Connection(DEVNET_RPC,{commitment:'finalized',disableRetryOnRateLimit:true,fetch:createDevnetFetch()});
export function cosmeticChainReady() {return Boolean(process.env.AOWEB_DEVNET_METADATA_URL&&(isolatedSignerConfigured()?process.env.AOWEB_GOLD_AUTHORITY_PUBLIC_KEY:process.env.AOWEB_DEVNET_ISSUER_FILE));}
export async function cosmeticChain() {
  if(!cosmeticChainReady()) throw new Error('cosmetic.unavailable');
  if(isolatedSignerConfigured()){
    if(process.env.AOWEB_DEVNET_ISSUER_FILE||process.env.AOWEB_GOLD_AUTHORITY_FILE)throw Error('cosmetic.invalidCustody');
    const issuer=process.env.AOWEB_GOLD_AUTHORITY_PUBLIC_KEY!;
    const umi=createUmi(cosmeticConnection).use(mplCore());
    requireDevnet(await umi.rpc.getGenesisHash());
    return {
      issuer,
      async derive(accountId:string,season=COSMETIC_SEASON){return {publicKey:publicKey((await isolatedCosmeticIdentity(accountId,season)).address)};},
      async fetch(address:string){
        const asset=await safeFetchAssetV1(umi,publicKey(address),{commitment:'finalized'});
        if(!asset)return null;
        return {owner:asset.owner.toString(),issuer:asset.updateAuthority.type==='Address'?asset.updateAuthority.address?.toString()??'':'',name:asset.name,uri:asset.uri};
      },
      async mint(accountId:string,owner:string,uri:string,season=COSMETIC_SEASON,_name='AOWeb Explorer — Devnet'){
        const result=await pool.query('SELECT * FROM cosmetic_claims WHERE account_id=$1 AND season=$2',[accountId,season]);
        let row=result.rows[0];
        if(!row||row.state!=='prepared'||row.wallet_address!==owner||row.metadata_uri!==uri||row.issuer_address!==issuer)throw Error('cosmetic.claimConflict');
        const chain=await checkedChain();
        if(!row.message_bytes){
          const {blockhash,lastValidBlockHeight}=await chain.getLatestBlockhash('finalized');
          const prepared=prepareCosmeticTransaction(row.operation_id,season,row.asset_address,owner,issuer,uri,blockhash);
          // Autocommit preparation before a read-only signer attempts approval.
          await pool.query('UPDATE cosmetic_claims SET transaction_bytes=$3,message_bytes=$4,last_valid_height=$5 WHERE account_id=$1 AND season=$2 AND message_bytes IS NULL AND signed_bytes IS NULL AND signature IS NULL',[accountId,season,prepared.transaction_bytes,prepared.message_bytes,lastValidBlockHeight]);
          row=(await pool.query('SELECT * FROM cosmetic_claims WHERE account_id=$1 AND season=$2',[accountId,season])).rows[0];
        }
        if(!row?.message_bytes||!row.transaction_bytes||!Number.isSafeInteger(Number(row.last_valid_height)))throw Error('cosmetic.claimConflict');
        if(!row.signed_bytes){
          const signed=await isolatedSubmission('cosmetic',row.operation_id,row.transaction_bytes,row.message_bytes,issuer);
          // A lost response/retry cannot replace a signed receipt or its message.
          const recorded=await pool.query('UPDATE cosmetic_claims SET signed_bytes=$3,signature=$4 WHERE account_id=$1 AND season=$2 AND message_bytes=$5 AND (signed_bytes IS NULL OR signed_bytes=$3) AND (signature IS NULL OR signature=$4)',[accountId,season,signed.bytes,signed.signature,row.message_bytes]);
          if(recorded.rowCount!==1)throw Error('cosmetic.claimConflict');
          row={...row,signed_bytes:signed.bytes,signature:signed.signature};
        }
        const signedTx=Transaction.from(Buffer.from(row.signed_bytes,'base64'));
        const expected=prepareCosmeticTransaction(row.operation_id,season,row.asset_address,owner,issuer,uri,signedTx.recentBlockhash!);
        if(expected.message_bytes!==row.message_bytes||validateSignedTransaction(row.signed_bytes,row.message_bytes,issuer).signature!==row.signature)throw Error('cosmetic.claimConflict');
        const existing=await chain.getSignatureStatuses([row.signature],{searchTransactionHistory:true});
        if(existing.value[0]?.confirmationStatus==='finalized'){
          if(existing.value[0].err)throw Error('cosmetic.retry');
          return row.signature;
        }
        if(await chain.getBlockHeight('finalized')>Number(row.last_valid_height))throw Error('cosmetic.expired');
        const signature=await chain.sendRawTransaction(Buffer.from(row.signed_bytes,'base64'),{skipPreflight:false,maxRetries:0});
        if(signature!==row.signature)throw Error('cosmetic.claimConflict');
        const confirmation=await chain.confirmTransaction({signature,blockhash:signedTx.recentBlockhash!,lastValidBlockHeight:Number(row.last_valid_height)},'finalized');
        if(confirmation.value.err)throw Error('cosmetic.retry');
        return signature;
      }
    };
  }
  const secret=Uint8Array.from(JSON.parse(fs.readFileSync(process.env.AOWEB_DEVNET_ISSUER_FILE!, 'utf8')));
  const umi=createUmi(cosmeticConnection).use(mplCore());
  const key=umi.eddsa.createKeypairFromSecretKey(secret);
  umi.use(keypairIdentity(key));
  requireDevnet(await umi.rpc.getGenesisHash());
  return {
    issuer: key.publicKey.toString(),
    derive(accountId: string, season = COSMETIC_SEASON) {
      const seed=createHmac('sha256',secret).update(`${season}:${accountId}`).digest();
      return createSignerFromKeypair(umi,umi.eddsa.createKeypairFromSeed(seed));
    },
    async fetch(address:string) {
      const asset=await safeFetchAssetV1(umi,publicKey(address),{commitment:'finalized'});
      if(!asset)return null;
      return {owner:asset.owner.toString(),issuer:asset.updateAuthority.type==='Address' ? asset.updateAuthority.address?.toString() ?? '' : '',name:asset.name,uri:asset.uri};
    },
    async mint(accountId:string,owner:string,uri:string,season=COSMETIC_SEASON,name='AOWeb Explorer — Devnet') {
      const asset=this.derive(accountId,season);
      const receipt=await create(umi,{asset,owner:publicKey(owner),updateAuthority:key.publicKey,name,uri}).sendAndConfirm(umi,{confirm:{commitment:'finalized'}});
      return bs58.encode(receipt.signature);
    },
  };
}
