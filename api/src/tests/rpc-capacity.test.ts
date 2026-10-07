import {test,expect,vi,afterEach} from 'vitest';
import {RpcCapacity,createBoundedRpcFetch} from '../rpcCapacity';
afterEach(()=>vi.useRealTimers());
function deferred(){let resolve!:(v:number)=>void;const promise=new Promise<number>(r=>resolve=r);return {promise,resolve};}
test('bounds active and queued work; overload does not execute and FIFO releases after failure',async()=>{
 const cap=new RpcCapacity(1,1,1000);const first=deferred(),order:number[]=[];
 const a=cap.run(()=>first.promise);const b=cap.run(async()=>{order.push(2);throw Error('Network failure');});
 const failed=expect(b).rejects.toThrow('Network failure');
 await expect(cap.run(async()=>{order.push(3);return 3;})).rejects.toThrow('economy.rpcBusy');
 first.resolve(1);expect(await a).toBe(1);await failed;expect(order).toEqual([2]);expect(await cap.run(async()=>4)).toBe(4);
});
test('expired queued work is removed and never runs later',async()=>{
 vi.useFakeTimers();const cap=new RpcCapacity(1,2,1000),first=deferred();const a=cap.run(()=>first.promise);const execute=vi.fn(async()=>2);
 const b=cap.run(execute);const rejected=expect(b).rejects.toThrow('economy.rpcBusy');await vi.advanceTimersByTimeAsync(1000);await rejected;first.resolve(1);await a;
 expect(execute).not.toHaveBeenCalled();expect(await cap.run(async()=>3)).toBe(3);
});
test('response bodies remain inside capacity and oversized decompressed responses are rejected',async()=>{
 const cap=new RpcCapacity(1,0,1000);let finish!:()=>void;
 const body=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('ok'));finish=()=>controller.close();}});
 const request=vi.fn(async()=>new Response(body,{headers:{'Content-Encoding':'gzip','Content-Length':'1'}}));
 const guarded=createBoundedRpcFetch(request as typeof fetch,cap,8);const first=guarded('https://rpc.invalid');await Promise.resolve();await Promise.resolve();
 await expect(guarded('https://rpc.invalid')).rejects.toThrow('economy.rpcBusy');finish();const result=await first;expect(await result.text()).toBe('ok');expect(result.headers.has('content-encoding')).toBe(false);
 const large=createBoundedRpcFetch(vi.fn(async()=>new Response('123456789')) as typeof fetch,cap,8);await expect(large('https://rpc.invalid')).rejects.toThrow('economy.rpcBusy');
 expect(await (await createBoundedRpcFetch(vi.fn(async()=>new Response('{}')) as typeof fetch,cap,8)('https://rpc.invalid')).json()).toEqual({});
});
test('failed transports release capacity and invalid settings fail closed',async()=>{
 const cap=new RpcCapacity(1,0,1000);const request=vi.fn().mockRejectedValueOnce(Error('Unavailable')).mockResolvedValue(new Response('{}'));
 const guarded=createBoundedRpcFetch(request,cap);await expect(guarded('https://rpc.invalid')).rejects.toThrow('Unavailable');expect((await guarded('https://rpc.invalid')).status).toBe(200);
 expect(()=>new RpcCapacity(0)).toThrow();expect(()=>new RpcCapacity(1,-1)).toThrow();
});
