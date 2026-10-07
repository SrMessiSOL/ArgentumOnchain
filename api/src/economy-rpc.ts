import {requireDevnet} from './cosmetic-policy';
// Retry reads/broadcasts only; the caller persists signed bytes before broadcast.
export async function economyRpcFetch(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1],request:typeof fetch=fetch,pause:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))):Promise<Response>{
 for(let attempt=0;attempt<3;attempt++){
  const response=await request(input,{...init,signal:AbortSignal.timeout(5000)});
  if(response.status!==429)return response;
  await response.body?.cancel();
  if(attempt===2)throw Error('economy.rpcBusy');
  await pause(attempt===0?250:750);
 }
 throw Error('economy.rpcBusy');
}

export function createDevnetFetch(request:typeof fetch=fetch,now:()=>number=Date.now,pause:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))):typeof fetch{
 const fallback='https://solana-devnet.gateway.tatum.io';
 let verifiedUntil=0,verification:Promise<void>|null=null;
 const calls:number[]=[];
 function reserve(){const time=now();while(calls.length&&calls[0]<=time-60000)calls.shift();if(calls.length>=5)throw Error('economy.rpcBusy');calls.push(time);}
 async function verify(){if(now()<verifiedUntil)return;if(!verification)verification=(async()=>{
  reserve();const response=await request(fallback,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getGenesisHash',params:[]}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error('economy.rpcBusy');const data=await response.json();requireDevnet(data.result);verifiedUntil=now()+300000;
 })().finally(()=>{verification=null;});await verification;}
 return async(input,init)=>{
  try{return await economyRpcFetch(input,init,request,pause);}catch(error){
   if(!(error instanceof Error)||error.message!=='economy.rpcBusy')throw error;
   await verify();reserve();
   // Broadcast the exact persisted signed bytes; no new signature or intent.
   const response=await request(fallback,{...init,signal:AbortSignal.timeout(5000)});
   if(response.status===429){await response.body?.cancel();throw Error('economy.rpcBusy');}
   return response;
  }
 };
}
