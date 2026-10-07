import assert from 'node:assert/strict';
import {CosmeticReplication,encodeCosmeticSnapshot,type CrestSubject} from './cosmeticReplication';
async function main(){
 let now=100,kind:unknown='first-hunt',failed=false,calls=0;
 const replication=new CosmeticReplication(async()=>{calls++;if(failed)throw Error('RPC down');return kind;},()=>now);
 const a:CrestSubject={id:'101',_id:'a',map:1,connected:true};
 const b:CrestSubject={id:102,_id:'b',map:1,connected:true};
 const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
 replication.refresh([a,b]);await settle();
 assert.deepEqual(replication.snapshot(1,[a,b]),[{id:101,kind:'first-hunt'},{id:102,kind:'first-hunt'}]);
 replication.refresh([a,b]);assert.equal(calls,2);
 assert.deepEqual(replication.snapshot(2,[a,b]),[]);
 assert.deepEqual(replication.snapshot(1,[{...a}]),[],'new session must not inherit prior crest');
 b.connected=false;assert.equal(replication.snapshot(1,[a,b]).length,1);
 for(const flag of ['dead','invisibleAdmin','invisibleSpell','hiddenSkill'] as const){a[flag]=true;assert.deepEqual(replication.snapshot(1,[a]),[]);a[flag]=false;}
 kind=null;now+=15000;replication.refresh([a]);await settle();assert.deepEqual(replication.snapshot(1,[a]),[],'unequip clears crest');
 kind='explorer';now+=15000;replication.refresh([a]);await settle();assert.equal(replication.snapshot(1,[a])[0].kind,'explorer');
 now+=35000;assert.deepEqual(replication.snapshot(1,[a]),[],'stale ownership fails closed');
 failed=true;replication.refresh([a]);await settle();assert.deepEqual(replication.snapshot(1,[a]),[]);
 const frame=encodeCosmeticSnapshot(1,[{id:101,kind:'first-hunt'}]);assert.equal(frame[0],82);assert.equal(frame.readDoubleLE(5),101);assert.equal(frame[13],2);
 let active=0;const bounded=new CosmeticReplication(()=>{active++;return new Promise(()=>{});},()=>now);
 bounded.refresh(Array.from({length:20},(_,i)=>({id:i+1,_id:String(i),map:1,connected:true})));assert.equal(active,8);

 let holder='alice',available=true;
 const ownership=new CosmeticReplication(async id=>{if(!available)throw Error('RPC outage');return id===holder?'first-hunt':null;},()=>now);
 const alice:CrestSubject={id:201,_id:'alice',map:1,connected:true};
 const bob:CrestSubject={id:202,_id:'bob',map:1,connected:true};
 ownership.refresh([alice,bob]);await settle();assert.deepEqual(ownership.snapshot(1,[alice,bob]),[{id:201,kind:'first-hunt'}]);
 holder='bob';now+=15000;ownership.refresh([alice,bob]);await settle();
 assert.deepEqual(ownership.snapshot(1,[alice,bob]),[{id:202,kind:'first-hunt'}],'transfer replaces old holder after re-verification');
 const reconnect={...bob};assert.deepEqual(ownership.snapshot(1,[reconnect]),[]);
 ownership.refresh([reconnect]);await settle();assert.deepEqual(ownership.snapshot(1,[reconnect]),[{id:202,kind:'first-hunt'}]);
 available=false;now+=15000;ownership.refresh([alice,reconnect]);await settle();assert.deepEqual(ownership.snapshot(1,[alice,reconnect]),[]);
 available=true;now+=15000;ownership.refresh([alice,reconnect]);await settle();assert.deepEqual(ownership.snapshot(1,[alice,reconnect]),[{id:202,kind:'first-hunt'}]);
 holder='nobody';now+=15000;ownership.refresh([alice,reconnect]);await settle();assert.deepEqual(ownership.snapshot(1,[alice,reconnect]),[]);
 console.log('PASS: ownership transfer between two sessions, reconnect, outage, recovery and transfer to an unlinked holder.');
 console.log('PASS: multi-player replication, unequip, swap, expiry, outage, session isolation, map filtering and bounded verification.');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});

