import {test,expect,vi} from 'vitest';
vi.mock('../repositories/auth',()=>({getPublicSessionByToken:vi.fn()}));
import {createChainRequestBudget} from '../chainRequestBudget';
function request(path:string,token='valid',method='POST'){const next=vi.fn(),json=vi.fn(),setHeader=vi.fn(),status=vi.fn(()=>({json}));return {req:{method,path,headers:{authorization:token?'Bearer '+token:undefined}},res:{status,setHeader},next,json};}
test('chain budgets follow accounts across sessions and share expensive prepare endpoints',async()=>{
 let now=0;const middleware=createChainRequestBudget(async()=> 'account',()=>now);
 for(let i=0;i<12;i++){const r=request(i%2?'/auth/economy/prepare':'/auth/game-assets/prepare','session-'+i);await middleware(r.req as any,r.res as any,r.next);expect(r.next).toHaveBeenCalledOnce();}
 const blocked=request('/auth/economy/prepare','different-session');await middleware(blocked.req as any,blocked.res as any,blocked.next);expect(blocked.res.status).toHaveBeenCalledWith(429);expect(blocked.next).not.toHaveBeenCalled();expect(blocked.res.setHeader).toHaveBeenCalledWith('Retry-After','60');
 now=60000;const retry=request('/auth/economy/prepare');await middleware(retry.req as any,retry.res as any,retry.next);expect(retry.next).toHaveBeenCalledOnce();
});
test('global cost caps apply across accounts while recovery has a separate allowance',async()=>{
 const middleware=createChainRequestBudget(async token=>token);for(let i=0;i<240;i++){const r=request('/auth/economy/prepare','account-'+i);await middleware(r.req as any,r.res as any,r.next);expect(r.next).toHaveBeenCalledOnce();}
 const blocked=request('/auth/game-assets/prepare','another-account');await middleware(blocked.req as any,blocked.res as any,blocked.next);expect(blocked.res.status).toHaveBeenCalledWith(429);
 const recovery=request('/auth/economy/reconcile','another-account');await middleware(recovery.req as any,recovery.res as any,recovery.next);expect(recovery.next).toHaveBeenCalledOnce();
});
test('unauthenticated requests cannot spend a chain budget; missing auth and auth outages fail closed',async()=>{
 const resolve=vi.fn(async(token:string)=>token==='valid'?'account':null);const middleware=createChainRequestBudget(resolve);
 for(let i=0;i<20;i++){const r=request('/auth/game-assets/wallet','invalid','GET');await middleware(r.req as any,r.res as any,r.next);expect(r.res.status).toHaveBeenCalledWith(401);}
 const valid=request('/auth/game-assets/wallet','valid','GET');await middleware(valid.req as any,valid.res as any,valid.next);expect(valid.next).toHaveBeenCalledOnce();
 const missing=request('/auth/economy/prepare','');await middleware(missing.req as any,missing.res as any,missing.next);expect(missing.res.status).toHaveBeenCalledWith(401);
 const outage=createChainRequestBudget(async()=>{throw Error('Private DB details');}),failed=request('/auth/economy/prepare');await outage(failed.req as any,failed.res as any,failed.next);expect(failed.res.status).toHaveBeenCalledWith(503);expect(failed.json).toHaveBeenCalledWith({error:'economy.unavailable'});
});
test('wallet reads are capped independently; ordinary reads and cancellations remain available',async()=>{
 const middleware=createChainRequestBudget(async()=> 'account');for(let i=0;i<6;i++){const r=request('/auth/game-assets/wallet','valid','GET');await middleware(r.req as any,r.res as any,r.next);expect(r.next).toHaveBeenCalledOnce();}
 const blocked=request('/auth/game-assets/wallet','valid','GET');await middleware(blocked.req as any,blocked.res as any,blocked.next);expect(blocked.res.status).toHaveBeenCalledWith(429);
 for(const path of ['/auth/economy/cancel','/auth/game-assets','/health']){const r=request(path);await middleware(r.req as any,r.res as any,r.next);expect(r.next).toHaveBeenCalledOnce();}
});
