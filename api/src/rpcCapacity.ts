/** Process-wide RPC transport capacity. Waiting work is bounded and expires. */
export class RpcCapacity {
 private active=0;
 private queue:{resolve:()=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}[]=[];
 constructor(private readonly concurrency=8,private readonly maxWaiting=32,private readonly waitMs=1000){
  if(!Number.isInteger(concurrency)||concurrency<1||!Number.isInteger(maxWaiting)||maxWaiting<0||!Number.isFinite(waitMs)||waitMs<1)throw Error('Invalid RPC capacity');
 }
 private async acquire():Promise<void>{
  if(this.active<this.concurrency){this.active++;return;}
  if(this.queue.length>=this.maxWaiting)throw Error('economy.rpcBusy');
  await new Promise<void>((resolve,reject)=>{
   const entry={resolve,reject,timer:setTimeout(()=>{
    const index=this.queue.indexOf(entry);if(index>=0)this.queue.splice(index,1);
    reject(Error('economy.rpcBusy'));
   },this.waitMs)};
   this.queue.push(entry);
  });
 }
 private release():void{
  const entry=this.queue.shift();
  if(entry){clearTimeout(entry.timer);entry.resolve();}else this.active--;
 }
 async run<T>(operation:()=>Promise<T>):Promise<T>{await this.acquire();try{return await operation();}finally{this.release();}}
}
/** Consume the response inside the lease and bound decompressed response bytes. */
export function createBoundedRpcFetch(request:typeof fetch,capacity=new RpcCapacity(),maxBytes=8*1024*1024):typeof fetch{
 return (input,init)=>capacity.run(async()=>{
  const response=await request(input,init);
  if(!response.body)return response;
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
    if(size>maxBytes){await reader.cancel();throw Error('economy.rpcBusy');}chunks.push(part.value);
   }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');
  return new Response(bytes,{status:response.status,statusText:response.statusText,headers});
 });
}
const sharedCapacity=new RpcCapacity();
/** Share capacity across primary, retries and fallback endpoints. */
export const boundedRpcFetch=createBoundedRpcFetch((input,init)=>fetch(input,init),sharedCapacity);
