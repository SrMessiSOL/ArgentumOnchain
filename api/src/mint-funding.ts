import {PublicKey,Transaction,type Connection} from '@solana/web3.js';
/** Read-only fee preflight. Never signs, broadcasts, or claims to estimate NFT rent. */
export async function assertMintFeeFunding(connection:Pick<Connection,'getBalance'|'getFeeForMessage'>,wallet:string,bytes:string){
 const tx=Transaction.from(Buffer.from(bytes,'base64'));
 if(tx.feePayer?.toBase58()!==wallet)throw Error('assets.invalidTransaction');
 const balance=await connection.getBalance(new PublicKey(wallet),'confirmed');
 if(!Number.isSafeInteger(balance)||balance<0)throw Error('economy.rpcBusy');
 if(balance===0)throw Error('assets.insufficientSol');
 const fee=(await connection.getFeeForMessage(tx.compileMessage(),'confirmed')).value;
 if(fee===null||!Number.isSafeInteger(fee)||fee<=0)throw Error('economy.rpcBusy');
 if(balance<fee)throw Error('assets.insufficientSol');
}
