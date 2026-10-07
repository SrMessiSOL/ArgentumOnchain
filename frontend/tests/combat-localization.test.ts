import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {localizeConsoleEntry,localizeGameMessage} from '../lib/game-i18n';
import {parseServerPacket} from '../lib/aowProtocol';
import {handleIncomingUiPacket} from '../components/game/session/incomingUiPackets';
const require=createRequire(import.meta.url);
const pkg=require('../../server/src/package.ts');

async function main(){
 const messages=[
  ['Has lanzado Dardo Mágico sobre Mago','You cast Magic Dart on NAME'],
  ['Le has quitado 12 puntos de vida a Mago','You dealt 12 damage to NAME'],
  ['Le has curado 12 puntos de vida a Mago','You healed NAME for 12 health'],
  ['¡Has apuñalado a Mago por 12!','You backstabbed NAME for 12!'],
  ['¡Has matado a Mago!','You killed NAME!'],
  ['Mago ha fallado un golpe.','NAME missed an attack.'],
  ['Mago te ha pegado en el torso por 12','NAME hit your torso for 12 damage.'],
  ['Mago te ha matado.','NAME killed you.'],
 ];
 for(const [source,expected]of messages){
  for(const npcName of [undefined,'Mago','Another creature']){
   const entry={text:source,source:'console',npcName};
   assert.equal(localizeConsoleEntry(entry,'en'),expected.replace('NAME',npcName==='Mago'?'Mage':'Mago'));
   assert.equal(localizeConsoleEntry(entry,'es'),source);
   assert.equal(localizeConsoleEntry({...entry,senderName:'Player'},'en'),source);
  }
 }
 for(const [source,english] of [
  ['Rata Salvaje te ha paralizado.','Wild Rat paralyzed you.'],
  ['Rata Salvaje te ha inmovilizado.','Wild Rat immobilized you.'],
  ['Le has pegado a Rata Salvaje por 12','You hit Wild Rat for 12'],
  ['Mago te ha lanzado Dardo Mágico por 12','Mage cast Magic Dart on you for 12'],
  ['La Espada Mata Dragones atraviesa a Rata Salvaje de un golpe y se consume.','The Dragonslayer Sword strikes through Wild Rat in one blow and is consumed.'],
  ['[Retos] Ganador: Mago / Guerrero (abandono)','[Challenges] Winner: Mago / Guerrero (forfeit)'],
  ['[Retos] Mago / Guerrero ganó el reto contra Rata / Lobo (abandono).','[Challenges] Mago / Guerrero won the challenge against Rata / Lobo (forfeit).'],
 ]){assert.equal(localizeGameMessage(source,'en'),english,source);assert.equal(localizeGameMessage(source,'es'),source);}
 // Encode with the real server writer, decode with the real browser parser, then
 // pass through the UI handler. Old packets must also remain readable.
 for(const npcName of [undefined,'Mago']){
  pkg.setPackageID(pkg.clientPacketID.console);
  pkg.writeString('¡Has matado a Mago!');pkg.writeByte(0);pkg.writeByte(1);pkg.writeByte(0);
  pkg.writeByte(1);pkg.writeString('console');pkg.writeByte(0);
  if(npcName)pkg.writeString(npcName);
  const buffer=pkg.dataSend();
  const packet=parseServerPacket(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));
  assert.equal(packet.type,'console');
  let entry:any;
  await handleIncomingUiPacket({packet,engine:{},ctx:{onConsoleMessage:(value:any)=>{entry=value},emitStatus:()=>{}}} as any);
  assert.equal(entry.npcName,npcName);
  assert.equal(localizeConsoleEntry(entry,'en'),`You killed ${npcName?'Mage':'Mago'}!`);
 }
 // Guard every current NPC-name console call against losing its identity tag.
 let marked=0;
 for(const file of ['game.ts','npcs.ts','respawn.ts']){
  const source=ts.createSourceFile(file,fs.readFileSync('../server/src/'+file,'utf8'),99,true);
  function visit(node:ts.Node){
   if(ts.isCallExpression(node)&&node.expression.getText(source)==='handleProtocol.console'){
    const msg=node.arguments[0]?.getText(source)??'';
    const name=msg.includes('npc.nameCharacter')?'npc.nameCharacter':msg.includes('vars.npcs[idPersonaje].nameCharacter')?'vars.npcs[idPersonaje].nameCharacter':undefined;
    if(name){assert.equal(node.arguments[7]?.getText(source),name,`${file}: missing NPC identity`);marked++;}
   }ts.forEachChild(node,visit);
  }visit(source);
 }
 assert.equal(marked,19);
 console.log('PASS: NPC/player name isolation, 19 tagged combat paths, bilingual effects, challenge forfeits, legacy/new packet decoding and UI propagation.');
}
main();
