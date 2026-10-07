import {createHmac} from 'node:crypto';
import {Keypair,PublicKey,SystemProgram,TransactionInstruction} from '@solana/web3.js';
import {createUmi} from '@metaplex-foundation/umi-bundle-defaults';
import {createSignerFromKeypair,createNoopSigner,keypairIdentity,publicKey,lamports,type TransactionBuilder} from '@metaplex-foundation/umi';
import {create,mplCore,deserializeAssetV1,approvePluginAuthority,updatePlugin,transfer,burn,MPL_CORE_PROGRAM_ID} from '@metaplex-foundation/mpl-core';
import {checkedChain,economyAuthority,createEconomyTransaction,validateSignedTransaction} from './economy-chain';

export type AssetRecord={id:string;kind:'character'|'item';asset_address:string;issuer_address:string;character_id:string;item_id?:number;quantity?:number;metadata_uri:string};
export type AssetAction='mint'|'stake'|'unstake'|'item-export'|'item-import';
export type Settlement={version:number;hash:string};
export function assetReady(){return Boolean(process.env.AOWEB_GOLD_AUTHORITY_FILE&&process.env.AOWEB_DEVNET_METADATA_URL);}
function context(wallet:string){
 const issuer=economyAuthority();
 const umi=createUmi(process.env.AOWEB_DEVNET_RPC||'https://api.devnet.solana.com').use(mplCore());
 const key=umi.eddsa.createKeypairFromSecretKey(issuer.secretKey);
 umi.use(keypairIdentity(key,false));umi.payer=createNoopSigner(publicKey(wallet));
 return {umi,issuer,signer:createSignerFromKeypair(umi,key)};
}
export function assetIdentity(id:string){
 const issuer=economyAuthority();
 const key=Keypair.fromSeed(createHmac('sha256',issuer.secretKey).update(`aochain:game-asset:v1:${id}`).digest());
 return {key,address:key.publicKey.toBase58(),issuer:issuer.publicKey.toBase58()};
}
function decodeGameAsset(address:string,account:Awaited<ReturnType<import('@solana/web3.js').Connection['getAccountInfo']>>){
 if(!account)return null;
 if(account.owner.toBase58()!==MPL_CORE_PROGRAM_ID.toString())throw Error('assets.invalidAsset');
 return deserializeAssetV1({publicKey:publicKey(address),owner:publicKey(account.owner.toBase58()),lamports:lamports(account.lamports),executable:account.executable,rentEpoch:BigInt(account.rentEpoch??0),data:new Uint8Array(account.data)});
}
export async function fetchGameAsset(address:string){
 return decodeGameAsset(address,await (await checkedChain()).getAccountInfo(new PublicKey(address),'finalized'));
}
/** Batch RPC reads; retain nulls and registration verification at the caller. */
export async function fetchGameAssets(addresses:string[]){
 const result=new Map<string,ReturnType<typeof decodeGameAsset>>();
 const connection=await checkedChain();
 for(let offset=0;offset<addresses.length;offset+=100){
  const batch=addresses.slice(offset,offset+100);
  const accounts=await connection.getMultipleAccountsInfo(batch.map(address=>new PublicKey(address)),'finalized');
  if(accounts.length!==batch.length)throw Error('assets.invalidAsset');
  for(let i=0;i<batch.length;i++)result.set(batch[i],decodeGameAsset(batch[i],accounts[i]));
 }
 return result;
}
export function attributes(record:AssetRecord,settlement?:Settlement){
 return [{key:'aochain_kind',value:record.kind},{key:'aochain_id',value:record.kind==='character'?record.character_id:record.id},
 ...(settlement?[{key:'snapshot_version',value:String(settlement.version)},{key:'snapshot_hash',value:settlement.hash}]:[]),
 ...(record.kind==='item'?[{key:'item_id',value:String(record.item_id)},{key:'quantity',value:String(record.quantity)}]:[])];
}
export async function verifiedAsset(record:AssetRecord,wallet?:string){
 const asset=await fetchGameAsset(record.asset_address);
 if(!asset||asset.updateAuthority.type!=='Address'||asset.updateAuthority.address!==record.issuer_address||asset.uri!==record.metadata_uri||(wallet&&asset.owner!==wallet))throw Error('assets.notOwned');
 const attrs=new Map(asset.attributes?.attributeList.map(a=>[a.key,a.value]));
 for(const a of attributes(record))if(attrs.get(a.key)!==a.value)throw Error('assets.invalidAsset');
 return asset;
}
export async function verifyPlayableAsset(address:string,wallet:string){
 const asset=await fetchGameAsset(address);const issuer=economyAuthority().publicKey.toBase58();
 return Boolean(asset&&asset.owner===wallet&&asset.updateAuthority.type==='Address'&&asset.updateAuthority.address===issuer&&asset.freezeDelegate?.frozen&&asset.freezeDelegate.authority.type==='Address'&&asset.freezeDelegate.authority.address===issuer);
}
function append(tx:ReturnType<typeof createEconomyTransaction>,builder:TransactionBuilder){
 for(const instruction of builder.getInstructions())tx.add(new TransactionInstruction({programId:new PublicKey(instruction.programId),keys:instruction.keys.map(k=>({pubkey:new PublicKey(k.pubkey),isSigner:k.isSigner,isWritable:k.isWritable})),data:Buffer.from(instruction.data)}));
}
export async function prepareAssetTransaction(action:AssetAction,operation:string,record:AssetRecord,wallet:string,name:string,settlement?:Settlement){
 const conn=await checkedChain();const {blockhash,lastValidBlockHeight}=await conn.getLatestBlockhash('finalized');
 const {umi,issuer,signer}=context(wallet);const tx=createEconomyTransaction(new PublicKey(wallet),blockhash);
 let mintKey:Keypair|undefined;
 if(action==='mint'||action==='item-export'){
  if(await fetchGameAsset(record.asset_address))throw Error('assets.alreadyMinted');
  mintKey=assetIdentity(record.id).key;
  if(mintKey.publicKey.toBase58()!==record.asset_address)throw Error('assets.invalidAsset');
  const assetSigner=createSignerFromKeypair(umi,umi.eddsa.createKeypairFromSecretKey(mintKey.secretKey));
  append(tx,create(umi,{asset:assetSigner,owner:publicKey(wallet),updateAuthority:signer.publicKey,name,uri:record.metadata_uri,plugins:[
   {type:'Attributes',attributeList:attributes(record,settlement)},
   ...(action==='mint'?[{type:'FreezeDelegate' as const,frozen:true,authority:{type:'Address' as const,address:signer.publicKey}},{type:'TransferDelegate' as const,authority:{type:'Address' as const,address:signer.publicKey}}]:[])
  ]}));
 }else{
  const asset=await verifiedAsset(record,wallet);
  if(action==='stake'){
   if(asset.freezeDelegate?.frozen)throw Error('assets.alreadyStaked');
   // Withdrawing thaws the asset but retains our delegates. Core rejects
   // approving an already delegated plugin; transfers reset these to Owner.
   for(const type of ['FreezeDelegate','TransferDelegate'] as const){
    const authority=(type==='FreezeDelegate'?asset.freezeDelegate:asset.transferDelegate)?.authority;
    if(authority?.type==='Address'&&authority.address===signer.publicKey)continue;
    append(tx,approvePluginAuthority(umi,{asset:asset.publicKey,authority:umi.payer,plugin:{type},newAuthority:{type:'Address',address:signer.publicKey}}));
   }
   append(tx,updatePlugin(umi,{asset:asset.publicKey,authority:signer,plugin:{type:'FreezeDelegate',frozen:true}}));
  }else if(action==='unstake'){
   if(!asset.freezeDelegate?.frozen||asset.freezeDelegate.authority.address!==record.issuer_address||!settlement)throw Error('assets.notStaked');
   append(tx,updatePlugin(umi,{asset:asset.publicKey,authority:signer,plugin:{type:'Attributes',attributeList:attributes(record,settlement)}}));
   append(tx,updatePlugin(umi,{asset:asset.publicKey,authority:signer,plugin:{type:'FreezeDelegate',frozen:false}}));
  }else append(tx,burn(umi,{asset,authority:umi.payer}));
 }
 tx.add(new TransactionInstruction({programId:new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),keys:[{pubkey:issuer.publicKey,isSigner:true,isWritable:false}],data:Buffer.from(`aochain:assets:v1:${action}:${operation}`)}));
 return {transaction_bytes:tx.serialize({requireAllSignatures:false}).toString('base64'),message_bytes:tx.serializeMessage().toString('base64'),last_valid_height:lastValidBlockHeight};
}
/** Payment and NFT delivery occur in the same Solana transaction. */
export async function prepareCharacterPurchase(operation:string,record:AssetRecord,buyer:string,seller:string,amount:number){
 const asset=await verifiedAsset(record,seller);
 if(asset.freezeDelegate?.frozen||asset.transferDelegate?.authority.type!=='Address'||asset.transferDelegate.authority.address!==record.issuer_address)throw Error('assets.unstakeFirst');
 const {umi,issuer,signer}=context(buyer);const {blockhash,lastValidBlockHeight}=await (await checkedChain()).getLatestBlockhash('finalized');
 const tx=createEconomyTransaction(new PublicKey(buyer),blockhash).add(SystemProgram.transfer({fromPubkey:new PublicKey(buyer),toPubkey:new PublicKey(seller),lamports:amount}));
 append(tx,transfer(umi,{asset,newOwner:publicKey(buyer),authority:signer}));
 tx.add(new TransactionInstruction({programId:new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),keys:[],data:Buffer.from(`aochain:character-sale:v1:${operation}:${record.asset_address}`)}));
 return {transaction_bytes:tx.serialize({requireAllSignatures:false}).toString('base64'),message_bytes:tx.serializeMessage().toString('base64'),last_valid_height:lastValidBlockHeight};
}

export function signAssetSubmission(raw:string,message:string,wallet:string,action:AssetAction|'purchase',record:AssetRecord){
 const issuer=economyAuthority();
 if(issuer.publicKey.toBase58()!==record.issuer_address)throw Error('assets.invalidAsset');
 const signers=[issuer];
 if(action==='mint'||action==='item-export'){
  const key=assetIdentity(record.id).key;
  if(key.publicKey.toBase58()!==record.asset_address)throw Error('assets.invalidAsset');
  signers.push(key);
 }
 return validateSignedTransaction(raw,message,wallet,signers);
}
