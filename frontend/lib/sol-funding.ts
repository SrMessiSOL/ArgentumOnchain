import {PublicKey,Transaction,VersionedTransaction,type Connection} from '@solana/web3.js';
export const fundingErrors=new Set(['economy.insufficientSol','economy.balanceUnavailable','economy.transactionUnavailable']);
export async function checkSolFunding(address:string,transaction:string|undefined,rpc:Pick<Connection,'getBalance'|'getFeeForMessage'|'simulateTransaction'>){
 const payer=new PublicKey(address);
 let tx:Transaction|undefined;
 if(transaction){tx=Transaction.from(Buffer.from(transaction,'base64'));if(tx.feePayer?.toBase58()!==address)throw Error('economy.wrongWallet');}
 const balance=await rpc.getBalance(payer,'confirmed');
 if(!Number.isSafeInteger(balance)||balance<0)throw Error('economy.balanceUnavailable');
 if(balance===0)throw Error('economy.insufficientSol');
 if(!tx)return {balanceLamports:balance};
 const fee=(await rpc.getFeeForMessage(tx.compileMessage(),'confirmed')).value;
 if(fee===null||!Number.isSafeInteger(fee)||fee<0)throw Error('economy.balanceUnavailable');
 if(balance<fee)throw Error('economy.insufficientSol');
 const simulation=await rpc.simulateTransaction(VersionedTransaction.deserialize(tx.serialize({requireAllSignatures:false})),{sigVerify:false,replaceRecentBlockhash:true});
 if(simulation.value.err){
  const detail=JSON.stringify(simulation.value.err)+' '+(simulation.value.logs??[]).join(' ');
  if(/InsufficientFundsForRent|InsufficientFundsForFee|insufficient lamports|insufficient funds for rent/i.test(detail))throw Error('economy.insufficientSol');
  throw Error('economy.transactionUnavailable');
 }
 return {balanceLamports:balance,feeLamports:fee};
}
export async function assertWalletHasSol(address:string,transaction?:string){
 let response:Response;
 try{response=await fetch('/api/wallet/funding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address,transaction}),signal:AbortSignal.timeout(20000)});}catch{throw Error('economy.balanceUnavailable');}
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw Error(data?.error??'economy.balanceUnavailable');
 return data;
}
