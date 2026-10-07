const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
test('NPC runtime writes use external state and empty overrides survive reload',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aochain-npc-state-'));
 t.after(()=>{delete process.env.AOWEB_NPC_RESPAWN_FILE;delete process.env.AOWEB_MAP_NPC_STATE_DIR;fs.rmSync(root,{recursive:true});});
 process.env.AOWEB_NPC_RESPAWN_FILE=path.join(root,'cooldowns','respawns.json');
 process.env.AOWEB_MAP_NPC_STATE_DIR=path.join(root,'placements');
 const respawn=require('../dist/npcRespawnCooldowns.js');
 respawn.initializeNpcRespawnCooldowns(()=>{});
 assert.deepEqual(JSON.parse(fs.readFileSync(process.env.AOWEB_NPC_RESPAWN_FILE,'utf8')),[]);
 const storage=require('../dist/mapNpcStorage.js');
 const entry={mapNum:1,x:20,y:20,npcIndex:1};storage.writeMapNpcPlacements(1,[entry]);
 assert.deepEqual(storage.loadMapNpcPlacements(1),[entry]);
 storage.writeMapNpcPlacements(1,[]);
 assert.ok(fs.existsSync(path.join(process.env.AOWEB_MAP_NPC_STATE_DIR,'mapa_1','npcs.json')));
 assert.deepEqual(storage.loadMapNpcPlacements(1),[]);
});
