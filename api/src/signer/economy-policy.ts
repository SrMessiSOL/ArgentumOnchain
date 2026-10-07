import {PublicKey,Keypair,Transaction,TransactionInstruction,SystemProgram} from '@solana/web3.js';
import {getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction,createBurnCheckedInstruction,createMintToCheckedInstruction,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {createEconomyTransaction,validateSignedTransaction} from '../economy-chain';

export type EconomyApproval={id:string;kind:string;state:string;wallet:string;amount:string;message_bytes:string;signature:string|null;last_valid_height:string;account_id:string;character_id:string;linked_wallet:string;owner_id:string;economy_lock:string|null;connected:boolean;deleted_at:unknown;listing_id:string|null;item_listing_id:string|null;seller_id:string|null;seller_wallet:string|null;listing_state:string|null;listing_intent:string|null;buyer_id:string|null;price:string|null;seller_linked_wallet:string|null;tokenized:boolean};
export type SignerPolicy={mint:string;maximumGold:number;maximumLamports:number};
/** Reconstruct instructions independently; never trust a caller-supplied message. */
export function approveEconomySubmission(row:EconomyApproval,raw:string,issuer:Keypair,policy:SignerPolicy){
 const deny=()=>{throw Error('signer.denied');};
 if(![policy.maximumGold,policy.maximumLamports].every(n=>Number.isSafeInteger(n)&&n>0))deny();
 if(!row||!['prepared','signed'].includes(row.state)||row.deleted_at!==null||row.connected!==false||row.linked_wallet!==row.wallet||row.tokenized!==false||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id))deny();
 const amount=Number(row.amount);
 if(!Number.isSafeInteger(amount)||amount<=0)deny();
 const purchase=row.kind==='purchase'||row.kind==='item-purchase';
 if(!purchase&&!['deposit','withdraw'].includes(row.kind))deny();
 if(amount>(purchase?policy.maximumLamports:policy.maximumGold))deny();
 if(purchase){
  if(row.listing_state!=='reserved'||row.listing_intent!==row.id||row.buyer_id!==row.account_id||row.price!==row.amount||!row.seller_wallet||row.seller_linked_wallet!==row.seller_wallet)deny();
  if(!row.seller_id||row.seller_id===row.account_id)deny();
  if(row.kind==='purchase'&&(!row.listing_id||row.owner_id!==row.seller_id||row.economy_lock!==row.listing_id))deny();
  if(row.kind==='item-purchase'&&(!row.item_listing_id||row.owner_id!==row.account_id||row.economy_lock!==row.id))deny();
 }else if(row.owner_id!==row.account_id||row.economy_lock!==row.id)deny();
 let walletTx:Transaction;
 try{if(typeof raw!=='string'||raw.length>2200)deny();walletTx=Transaction.from(Buffer.from(raw,'base64'));}catch{ return deny(); }
 const payer=new PublicKey(row.wallet);
 if(!walletTx.recentBlockhash)deny();
 const expected=createEconomyTransaction(payer,walletTx.recentBlockhash!);
 if(purchase)expected.add(SystemProgram.transfer({fromPubkey:payer,toPubkey:new PublicKey(row.seller_wallet!),lamports:amount}));
 else {
  const mint=new PublicKey(policy.mint),ata=getAssociatedTokenAddressSync(mint,payer,false,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID);
  if(row.kind==='deposit')expected.add(createBurnCheckedInstruction(ata,mint,payer,BigInt(amount),0,[],TOKEN_PROGRAM_ID));
  else expected.add(createAssociatedTokenAccountIdempotentInstruction(payer,ata,payer,mint),createMintToCheckedInstruction(mint,ata,issuer.publicKey,BigInt(amount),0,[],TOKEN_PROGRAM_ID));
 }
 expected.add(new TransactionInstruction({programId:new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),keys:[{pubkey:issuer.publicKey,isSigner:true,isWritable:false}],data:Buffer.from(`aoweb:devnet:${purchase?'purchase':row.kind}:${row.id}`)}));
 if(expected.serializeMessage().toString('base64')!==row.message_bytes)deny();
 const signed=validateSignedTransaction(raw,row.message_bytes,row.wallet,[issuer]);
 if(row.signature&&row.signature!==signed.signature)deny();
 return signed;
}
