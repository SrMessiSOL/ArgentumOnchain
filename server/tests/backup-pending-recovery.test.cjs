// Disposable journal/receipt rehearsal. No live database, service or RPC is used.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {randomUUID, randomBytes} = require('node:crypto');
const {VaultJournal} = require('../dist/vaultJournal.js');
const {encrypt, decrypt} = require('../../scripts/realm-backup-crypto.cjs');

async function main() {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aochain-pending-restore-'));
 try {
  const modes = [
   {name:'vault', endpoint:`/internal/vaults/account/${randomUUID()}`, options:{}},
   {name:'character', endpoint:`/character_save/${randomUUID()}`, options:{allowCharacterSaves:true}},
   {name:'world', endpoint:'/internal/floor-spawns', options:{allowFloorSpawns:true}},
   {name:'market', endpoint:'/internal/market/listings', options:{allowMarket:true}},
  ];
  const receipts = new Set(); let effects = 0;
  const entries = [];
  const outage = new Error('fixture outage');
  // Half committed with their reply lost; half never reached the API.
  // Both must remain durable until a committed receipt is acknowledged.
  for (const mode of modes) {
   for (const committed of [true, false]) {
    const operationId = randomUUID();
    const entry = {operationId, endpoint:mode.endpoint, payload:JSON.stringify({operationId, value:25})};
    const directory = path.join(root, 'original', mode.name);
    await assert.rejects(new VaultJournal({...mode.options, directory,
     submit:async()=>{if(committed){receipts.add(operationId);effects++;}throw outage;},
     delay:async()=>{throw outage;},
    }).persist(entry), /fixture outage/);
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, operationId+'.json'),'utf8')), entry);
    entries.push({mode:mode.name, entry});
   }
  }
  // Model a later state change after the first committed operation. Replaying
  // its saved payload must return its receipt, without overwriting newer state.
  effects += 17;
  const snapshot = {entries, receipts:[...receipts], effects};
  const source = path.join(root,'snapshot.json'), key = path.join(root,'key');
  const archive = path.join(root,'snapshot.aobak'), restored = path.join(root,'restored.json');
  await fs.writeFile(source, JSON.stringify(snapshot)); await fs.writeFile(key, randomBytes(32));
  await encrypt(source, archive, key); await decrypt(archive, restored, key);
  const recovered = JSON.parse(await fs.readFile(restored,'utf8'));
  const committed = new Set(recovered.receipts); let recoveredEffects = recovered.effects;
  for (const {mode,entry} of recovered.entries) {
   const directory = path.join(root,'restored',mode);
   await fs.mkdir(directory,{recursive:true});
   await fs.writeFile(path.join(directory,entry.operationId+'.json'),JSON.stringify(entry));
  }
  let retries = 0;
  for (const mode of modes) {
   const directory = path.join(root,'restored',mode.name);
   const journal = new VaultJournal({...mode.options,directory,
    submit:async(endpoint,payload)=>{
     const id = JSON.parse(payload).operationId;
     assert.equal(endpoint,mode.endpoint);
     assert.ok((await fs.readdir(directory)).includes(id+'.json'));
     if(!committed.has(id)){committed.add(id);recoveredEffects++;throw outage;}
     return {ok:true};
    },delay:async()=>{retries++;},
   });
   await journal.recover();
   assert.deepEqual(await fs.readdir(directory),[]);
   await journal.recover(); // Another restart cannot apply any operation twice.
  }
  assert.equal(retries,4);
  assert.equal(committed.size,8);
  assert.equal(recoveredEffects,25, 'Four original commits, newer state +17, four missing commits');
  // A provider response without a committed receipt must not delete a journal.
  const pending = recovered.entries[0].entry, directory = path.join(root,'unconfirmed');
  await fs.mkdir(directory); await fs.writeFile(path.join(directory,pending.operationId+'.json'),JSON.stringify(pending));
  await assert.rejects(new VaultJournal({directory,submit:async()=>({ok:false}),delay:async()=>{throw outage;}}).recover(),/fixture outage/);
  assert.equal((await fs.readdir(directory)).length,1);
  console.log('Encrypted pending-journal recovery passed: four operation families, lost replies, unavailable API, repeated restart, newer state preserved and unconfirmed record retained. Simulated receipts; live PostgreSQL/gameplay/chain recovery remain separate.');
 } finally {await fs.rm(root,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
