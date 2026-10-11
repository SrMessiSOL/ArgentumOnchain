import {Connection,PublicKey,Transaction} from '@solana/web3.js';
import {DEVNET_GENESIS} from './cosmetic-policy';

// Mint-only negative proof: never apply this to transfers, burns or SPL refunds.
export async function expiredMintAbsent(conn:Connection,op:{kind:string;state:string;signature:string|null;transaction_bytes:string;last_valid_height:unknown},assetAddress:string):Promise<boolean>{
 if(op.kind!=='mint'||op.state!=='signed'||!op.signature)return false;
 const height=Number(op.last_valid_height);if(!Number.isSafeInteger(height)||height<=0)return false;
 const tx=Transaction.from(Buffer.from(op.transaction_bytes,'base64'));
 if(!tx.recentBlockhash||!tx.verifySignatures()||!tx.instructions.some(i=>i.keys.some(k=>k.pubkey.toBase58()===assetAddress)))return false;
 // Confirm the recorded signature really belongs to the recorded signed bytes.
 const bs58=(await import('bs58')).default;
 if(!tx.signature||bs58.encode(tx.signature)!==op.signature)return false;
 const address=new PublicKey(assetAddress);
 for(let pass=0;pass<2;pass++){
  if(await conn.getGenesisHash()!==DEVNET_GENESIS)return false;
  if(await conn.getBlockHeight('finalized')<=height+150)return false;
  if((await conn.isBlockhashValid(tx.recentBlockhash,{commitment:'finalized'})).value!==false)return false;
  if((await conn.getSignatureStatuses([op.signature],{searchTransactionHistory:true})).value[0]!==null)return false;
  if(await conn.getTransaction(op.signature,{commitment:'finalized',maxSupportedTransactionVersion:0})!==null)return false;
  if(await conn.getAccountInfo(address,'finalized')!==null)return false;
  if((await conn.getSignaturesForAddress(address,{limit:1},'finalized')).length!==0)return false;
 }
 return true;
}
