import {test,expect,vi} from 'vitest';
vi.mock('../db',()=>({default:{}}));
import {RecoverySweep} from '../operationRecovery';
import {AuthBudget,authIdentity} from '../authBudget';
test('unresolvable oldest operations do not starve later rows and failures remain visible',async()=>{
 const rows=Array.from({length:45},(_,i)=>({id:String(i),created_at:'2026-01-01'}));const seen:string[]=[];let warnings=0;
 const sweep=new RecoverySweep(async cursor=>rows.slice(cursor?Number(cursor.id)+1:0,(cursor?Number(cursor.id)+1:0)+20),async id=>{seen.push(id);if(Number(id)<20)throw Error('Unresolved');},()=>{warnings++;});
 await sweep.pass();await sweep.pass();await sweep.pass();
 expect(seen).toEqual(rows.map(r=>r.id));expect(warnings).toBe(20);
 await sweep.pass();expect(seen.slice(45)).toEqual(rows.slice(0,20).map(r=>r.id));
});
test('database scan failure preserves cursor for retry',async()=>{
 let fail=false;const seen:string[]=[];const rows=Array.from({length:21},(_,i)=>({id:String(i),created_at:'2026-01-01'}));
 const sweep=new RecoverySweep(async cursor=>{if(fail)throw Error('Unavailable');const start=cursor?Number(cursor.id)+1:0;return rows.slice(start,start+20);},async id=>{seen.push(id);},()=>{});
 await sweep.pass();fail=true;await expect(sweep.pass()).rejects.toThrow('Unavailable');fail=false;await sweep.pass();expect(seen).toEqual(rows.map(r=>r.id));
});
test('authentication budget bounds identity cardinality and expires without evicting active protection',()=>{
 let now=0;const b=new AuthBudget(2,()=>now);
 expect(b.allow('a',2,100)).toBe(true);expect(b.allow('a',2,100)).toBe(true);expect(b.allow('a',2,100)).toBe(false);
 expect(b.allow('b',1,100)).toBe(true);expect(b.allow('c',1,100)).toBe(false);
 now=100;expect(b.allow('c',1,100)).toBe(true);expect(b.allow('a',2,100)).toBe(true);
 expect(authIdentity(' Example@Email.com ')).toBe(authIdentity('example@email.com'));
});

import {settlementPause} from '../settlementPause';
test('incident pause blocks new settlements and permits recovery',()=>{
 vi.stubEnv('AOWEB_SETTLEMENT_PAUSED','1');
 try {for(const path of ['/auth/economy/prepare','/auth/economy/submit','/auth/economy/list','/auth/economy/item-list','/auth/game-assets/prepare','/auth/game-assets/submit','/auth/cosmetics/claim']){const next=vi.fn(),json=vi.fn(),status=vi.fn(()=>({json}));settlementPause({method:'POST',path} as any,{status} as any,next);expect(status).toHaveBeenCalledWith(503);expect(next).not.toHaveBeenCalled();}
 for(const path of ['/auth/economy/reconcile','/auth/economy/cancel','/auth/game-assets/reconcile']){const next=vi.fn();settlementPause({method:'POST',path} as any,{} as any,next);expect(next).toHaveBeenCalledOnce();}
 vi.stubEnv('AOWEB_SETTLEMENT_PAUSED','0');const next=vi.fn();settlementPause({method:'POST',path:'/auth/economy/prepare'} as any,{} as any,next);expect(next).toHaveBeenCalledOnce();
 }finally{vi.unstubAllEnvs();}
});
