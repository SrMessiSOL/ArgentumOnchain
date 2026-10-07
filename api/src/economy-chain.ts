import fs from 'node:fs';
import {Connection,Keypair,PublicKey,SystemProgram,Transaction,TransactionInstruction,ComputeBudgetProgram} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction,createBurnCheckedInstruction,createMintToCheckedInstruction,getMint} from '@solana/spl-token';
import bs58 from 'bs58';
import {requireDevnet} from './cosmetic-policy';
import {createDevnetFetch} from './economy-rpc';
export const economyConnection=new Connection(process.env.AOWEB_DEVNET_RPC||'https://api.devnet.solana.com',{commitment:'finalized',disableRetryOnRateLimit:true,fetch:createDevnetFetch()});
export function economyAuthority(){const file=process.env.AOWEB_GOLD_AUTHORITY_FILE;if(!file)throw Error('economy.unavailable');return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file,'utf8'))));}
export function economyReady(){return Boolean(process.env.AOWEB_GOLD_MINT&&process.env.AOWEB_GOLD_AUTHORITY_FILE);}
let verifiedUntil=0,verification:Promise<void>|null=null;
export async function checkedChain(){
 if(Date.now()>=verifiedUntil){
  if(!verification)verification=(async()=>{requireDevnet(await economyConnection.getGenesisHash());verifiedUntil=Date.now()+300000;})().finally(()=>{verification=null;});
  await verification;
 }
 return economyConnection;
}
export async function checkedMint(){const mint=new PublicKey(process.env.AOWEB_GOLD_MINT!);const info=await getMint(await checkedChain(),mint,'finalized',TOKEN_PROGRAM_ID);const authority=economyAuthority();if(info.decimals!==0||!info.mintAuthority?.equals(authority.publicKey)||info.freezeAuthority)throw Error('economy.unavailable');return {mint,authority};}
export function createEconomyTransaction(payer:PublicKey,blockhash:string){
 // Phantom leaves existing compute-budget instructions intact. Bind the small
 // devnet priority fee before signing, so exact-message validation stays strict.
 return new Transaction({feePayer:payer,recentBlockhash:blockhash}).add(
  ComputeBudgetProgram.setComputeUnitLimit({units:200000}),
  ComputeBudgetProgram.setComputeUnitPrice({microLamports:1000}),
 );
}
export async function prepareTransaction(kind:'purchase'|'deposit'|'withdraw',id:string,wallet:string,amount:number,seller?:string){
 const conn=await checkedChain();const {blockhash,lastValidBlockHeight}=await conn.getLatestBlockhash('finalized');const payer=new PublicKey(wallet);const tx=createEconomyTransaction(payer,blockhash);
 if(kind==='purchase')tx.add(SystemProgram.transfer({fromPubkey:payer,toPubkey:new PublicKey(seller!),lamports:amount}));
 else {const {mint,authority}=await checkedMint();const ata=getAssociatedTokenAddressSync(mint,payer,false,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID);
 if(kind==='deposit')tx.add(createBurnCheckedInstruction(ata,mint,payer,BigInt(amount),0,[],TOKEN_PROGRAM_ID));
 else tx.add(createAssociatedTokenAccountIdempotentInstruction(payer,ata,payer,mint),createMintToCheckedInstruction(mint,ata,authority.publicKey,BigInt(amount),0,[],TOKEN_PROGRAM_ID));}
 // Authority approval prevents wallet-only broadcast before the API has persisted its signature.
 const approval=economyAuthority().publicKey;
 tx.add(new TransactionInstruction({programId:new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),keys:[{pubkey:approval,isSigner:true,isWritable:false}],data:Buffer.from(`aoweb:devnet:${kind}:${id}`)}));
 return {transaction_bytes:tx.serialize({requireAllSignatures:false}).toString('base64'),message_bytes:tx.serializeMessage().toString('base64'),last_valid_height:lastValidBlockHeight};
}
// Server signatures are issued only after the wallet proof is verified inside
// the operation's DB transaction. Persist signed bytes before broadcasting.
export function validateSignedTransaction(raw:string,message:string,wallet:string,cosigners:Keypair[]=[]){
 try{
  if(typeof raw!=='string'||raw.length>2200)throw Error();
  const tx=Transaction.from(Buffer.from(raw,'base64'));
  if(tx.serializeMessage().toString('base64')!==message||tx.feePayer?.toString()!==wallet||!tx.signature||!tx.verifySignatures(false))throw Error();
  // Legacy messages may not require the approval signer; never change their message.
  const required=tx.compileMessage();
  const needed=cosigners.filter(key=>required.accountKeys.slice(0,required.header.numRequiredSignatures).some(address=>address.equals(key.publicKey)));
  if(needed.length)tx.partialSign(...needed);
  if(!tx.verifySignatures())throw Error();
  return {bytes:tx.serialize().toString('base64'),signature:bs58.encode(tx.signature!)};
 }catch{throw Error('economy.invalidTransaction');}
}
// Legacy preparations already handed authority signatures to the wallet.
// Expiry without a reported signature cannot prove they were never broadcast.
export function hasPreparedSignatures(raw:string){
 try{return Transaction.from(Buffer.from(raw,'base64')).signatures.some(s=>Boolean(s.signature));}catch{return true;}
}
/** A wallet-only legacy preparation could already have landed without API submission. */
export function canWalletBroadcastPrepared(raw:string,wallet:string):boolean {
 try {
  const tx=Transaction.from(Buffer.from(raw,'base64'));
  if(tx.feePayer?.toBase58()!==wallet)return true;
  const message=tx.compileMessage();
  return message.accountKeys.slice(0,message.header.numRequiredSignatures).every(key=>key.toBase58()===wallet);
 }catch{return true;}
}
export async function receiptState(signature:string|null,height:number){
 const conn=await checkedChain();
 if(signature){
  const result=(await conn.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];
  // Expiry prevents future execution; missing history does not disprove past execution.
  // Never release a signed operation on a provisional fork or absent RPC history.
  if(!result || result.confirmationStatus!=='finalized')return 'pending';
  return result.err?'failed':'complete';
 }
 // A never-signed preparation cannot land once its validity window expires.
 return (await conn.getBlockHeight('finalized'))>height?'failed':'pending';
}
