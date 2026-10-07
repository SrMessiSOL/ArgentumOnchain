import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { VaultJournal } from '../src/vaultJournal';

async function main() {
 const directory = await fs.mkdtemp(path.join((await import('node:os')).tmpdir(),'aochain-market-journal-test-'));
 const owner=randomUUID(), operationId=randomUUID();
 const entry={operationId,endpoint:'/internal/market/listings',payload:JSON.stringify({operationId,gold:25})};
 let calls=0, balance=0;
 const committed=new Set<string>();
 const submit=async (_:string,payload:string) => {
  const parsed=JSON.parse(payload); calls++;
  assert.ok((await fs.readdir(directory)).includes(`${parsed.operationId}.json`), 'Journal must precede transmission');
  if(!committed.has(parsed.operationId)){balance=parsed.gold;committed.add(parsed.operationId);balance+=5;throw Error('Response lost after commit');}
  return {ok:true};
 };
 const journal=new VaultJournal({allowMarket:true,directory,submit,delay:async()=>{}});
 await journal.persist(entry);
 assert.equal(calls,2); assert.equal(balance,30,'Receipt retry must not overwrite newer state');
 assert.deepEqual(await fs.readdir(directory),[],'Committed journal is removed');

 // Simulate process death after commit and before deleting the durable record.
 await fs.writeFile(path.join(directory,`${operationId}.json`),JSON.stringify(entry));
 await new VaultJournal({allowMarket:true,directory,submit,delay:async()=>{}}).recover();
 assert.equal(balance,30);assert.deepEqual(await fs.readdir(directory),[]);

 const nextId=randomUUID();
 const pending={...entry,operationId:nextId,payload:JSON.stringify({operationId:nextId,gold:40})};
 let acknowledge!:()=>void;
 const gate=new Promise<void>(resolve=>{acknowledge=resolve;});
 let retryObserved!:()=>void;const retried=new Promise<void>(resolve=>{retryObserved=resolve;});
 let attempts=0;
 const pendingJournal=new VaultJournal({allowMarket:true,directory,submit:async()=>{
  if(++attempts===1)throw Error('Unknown outcome');
  retryObserved();await gate;return {ok:true};
 },delay:async()=>{}});
 let finished=false;
 const action=pendingJournal.persist(pending).then(()=>{finished=true;});
 await retried;
 assert.equal(finished,false);assert.ok((await fs.readdir(directory)).includes(`${nextId}.json`));
 acknowledge();await action;assert.deepEqual(await fs.readdir(directory),[]);

 // Inject failures into each file preparation stage, before any remote submission.
 for(const stage of ['open','write','sync','rename']){
  const originalOpen=fs.open,originalRename=fs.rename;let injected=false,sent=0,retries=0;
  (fs as any).open=async(...args:any[])=>{
   if(stage==='open'&&!injected){injected=true;throw Error('Injected open failure');}
   const file=await (originalOpen as any)(...args);
   return {writeFile:async(...values:any[])=>{if(stage==='write'&&!injected){injected=true;throw Error('Injected write failure');}return (file.writeFile as any)(...values);},
    sync:async()=>{if(stage==='sync'&&!injected){injected=true;throw Error('Injected sync failure');}return file.sync();},close:()=>file.close()};
  };
  (fs as any).rename=async(...args:any[])=>{if(stage==='rename'&&!injected){injected=true;throw Error('Injected rename failure');}return (originalRename as any)(...args);};
  try{
   const operationId=randomUUID();
   await new VaultJournal({allowMarket:true,directory,submit:async()=>{sent++;return {ok:true};},delay:async()=>{retries++;assert.equal(sent,0);}}).persist({...entry,operationId,payload:JSON.stringify({operationId})});
   assert.equal(injected,true);assert.equal(retries,1);assert.equal(sent,1);assert.deepEqual(await fs.readdir(directory),[]);
  }finally{fs.open=originalOpen;fs.rename=originalRename;}
 }

 // A pre-send disk failure must hold the operation until journaling can succeed.
 const blocked=path.join(directory,'blocked');await fs.writeFile(blocked,'not a directory');
 let diskRetries=0,transmissions=0;
 const diskJournal=new VaultJournal({allowMarket:true,directory:blocked,submit:async()=>{transmissions++;return {ok:true};},delay:async()=>{diskRetries++;assert.equal(transmissions,0);await fs.unlink(blocked);}});
 await diskJournal.persist({...entry,operationId:nextId,payload:JSON.stringify({operationId:nextId})});
 assert.equal(diskRetries,1);assert.equal(transmissions,1);await fs.rmdir(blocked);

 await fs.writeFile(path.join(directory,`${operationId}.json`),JSON.stringify({...entry,endpoint:'/auth/register'}));
 await assert.rejects(journal.recover(),/Invalid pending/);
 await fs.unlink(path.join(directory,`${operationId}.json`));await fs.rmdir(directory);
 console.log('Market journal tests passed: journal-before-send, lost reply, restart replay, pending retention, all pre-send disk failure stages and invalid-entry rejection.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
