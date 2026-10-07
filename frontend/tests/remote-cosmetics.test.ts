import assert from 'node:assert/strict';
import fs from 'node:fs';
import {encodeCosmeticSnapshot} from '../../server/src/cosmeticReplication';
import {parseServerPacket} from '../lib/aowProtocol';
import {handleIncomingUiPacket} from '../components/game/session/incomingUiPackets';
import {visibleCosmetic} from '../lib/cosmetic-display';
async function main(){
 const frame=encodeCosmeticSnapshot(1,[{id:101,kind:'first-hunt'},{id:102,kind:'explorer'}]);
 const packet=parseServerPacket(Uint8Array.from(frame).buffer);
 assert.equal(packet.type,'cosmeticSnapshot');
 const engine:any={mapNumber:1,remoteCosmetics:new Map()};
 await handleIncomingUiPacket({packet,engine,ctx:{}} as any);
 assert.equal(visibleCosmetic(engine.remoteCosmetics.get(101),Date.now(),false),'first-hunt');
 assert.equal(visibleCosmetic(engine.remoteCosmetics.get(102),Date.now(),true),null);
 assert.equal(visibleCosmetic(engine.remoteCosmetics.get(102),Date.now()+6000,false),null);
 await handleIncomingUiPacket({packet:{type:'cosmeticSnapshot',payload:{map:2,entries:[]}},engine,ctx:{}} as any);assert.equal(engine.remoteCosmetics.size,2);
 await handleIncomingUiPacket({packet:{type:'cosmeticSnapshot',payload:{map:1,entries:[]}},engine,ctx:{}} as any);assert.equal(engine.remoteCosmetics.size,0);
 const transferred=parseServerPacket(Uint8Array.from(encodeCosmeticSnapshot(1,[{id:102,kind:'first-hunt'}])).buffer);
 await handleIncomingUiPacket({packet:transferred,engine,ctx:{}} as any);
 assert.equal(engine.remoteCosmetics.has(101),false,'old owner removed from browser snapshot');
 assert.equal(visibleCosmetic(engine.remoteCosmetics.get(102),Date.now(),false),'first-hunt');
 const bad=Uint8Array.from(frame);bad[13]=99;assert.throws(()=>parseServerPacket(bad.buffer));
 assert.throws(()=>parseServerPacket(Uint8Array.from(frame.subarray(0,10)).buffer));
 const source=fs.readFileSync('components/game/engine/Engine.ts','utf8');assert.match(source,/syncCosmeticCrest\(displayContainer, nameLabel, visibleCosmetic\(/);
 assert.match(source,/this\.remoteCosmetics\.get\(Number\(this\.user\.id\)\)/,'local crest follows the connected character snapshot, not another character selected in the account');
 console.log('PASS: actual server frame decoding, remote snapshot handler, replacement, map isolation, hidden/expired crests and malformed packets.');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
