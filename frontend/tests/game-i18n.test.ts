import assert from 'node:assert/strict';
import {localizeConsoleEntry,localizeGameMessage,localizeItemDetails,localizeLoadingDetail} from '../lib/game-i18n';
import {translateSource} from '../lib/i18n';
import {handleIncomingUiPacket} from '../components/game/session/incomingUiPackets';
async function main(){
const msg='No tienes oro suficiente.';
assert.equal(translateSource('Manzana Roja','en'),'Red apple');
assert.equal(translateSource('Hooooola jovencito, tengo las mejores provisiones de Ullathorpe!!','en'),'Heeello, young one! I have the best supplies in Ullathorpe!');
assert.equal(localizeLoadingDetail('Mapa 2 listo para transicion rapida.','en'),'Map 2 ready for travel.');
assert.equal(localizeLoadingDetail('Precargando apariencia de Spelltester...','en'),"Loading Spelltester's appearance...");
assert.equal(localizeLoadingDetail('Mapa 2 listo para transicion rapida.','es'),'Mapa 2 listo para transicion rapida.');
assert.equal(localizeConsoleEntry({text:msg,source:'console',channel:'console'},'en'),'You do not have enough gold.');
for(const entry of [{text:msg,source:'dialog'},{text:msg,source:'console',channel:'global'},{text:msg,source:'console',senderName:'Player'}]) assert.equal(localizeConsoleEntry(entry,'en'),msg);
assert.equal(localizeGameMessage('¡Has ganado 42 puntos de experiencia!','en'),'You gained 42 experience points!');
assert.equal(localizeGameMessage('Comienzas a resucitar a Tunnelwalker.','en'),'You begin resurrecting Tunnelwalker.');
assert.equal(localizeGameMessage(msg,'es'),msg);
const progression = [
 ['¡Has subido a nivel 2!','You reached level 2!'],
 ['¡Has ganado 7 puntos de vida!','You gained 7 health points!'],
 ['¡Has ganado 98 puntos de maná!','You gained 98 mana points!'],
 ['¡Tu golpe máximo aumento en 3 puntos!','Your maximum damage increased by 3 points!'],
 ['¡Tu golpe mínimo aumento en 0 puntos!','Your minimum damage increased by 0 points!'],
];
for (const [source,english] of progression) {
 assert.equal(localizeConsoleEntry({text:source,source:'console'},'en'),english);
 assert.equal(localizeGameMessage(source,'es'),source);
 assert.equal(localizeConsoleEntry({text:source,source:'console',channel:'global'},'en'),source);
}
assert.equal(localizeGameMessage('¡Has subido a nivel 2! player text','en'),'¡Has subido a nivel 2! player text');
assert.equal(localizeGameMessage('unknown packet /meditar','en'),'unknown packet /meditar');
const details='Defensa: 2/4 | Resistencia mágica: 10%';
assert.equal(localizeItemDetails(details,'en'),'Defense: 2/4 | Magic resistance: 10%');
assert.equal(localizeItemDetails(details,'es'),details);
assert.equal(translateSource('Dardo Mágico','en'),'Magic Dart');
assert.equal(localizeGameMessage('Has lanzado Dardo Mágico sobre Rata Salvaje','en','Rata Salvaje'),'You cast Magic Dart on Wild Rat');
assert.equal(localizeGameMessage('Rata Salvaje te ha pegado en el torso por 3','en','Rata Salvaje'),'Wild Rat hit your torso for 3 damage.');
assert.equal(localizeGameMessage('¡Has matado a Rata Salvaje!','en','Rata Salvaje'),'You killed Wild Rat!');
assert.equal(localizeGameMessage('¡Has ganado 6 monedas de oro!','en'),'You gained 6 gold!');
assert.equal(localizeGameMessage('Conectado como Spelltester','en'),'Connected as Spelltester');
assert.equal(localizeConsoleEntry({source:'dialog',text:'¡Has matado a Rata Salvaje!'},'en'),'¡Has matado a Rata Salvaje!');
assert.equal(translateSource('También puedes volver con el comando /hogar','en'),'You can also return with /home');
assert.equal(translateSource('También puedes volver al sacerdote con el comando /hogar','en'),'You can also return to the priest with /home');
assert.equal(translateSource('En zona insegura cerrá el personaje con /salir o quedará conectado por 10 segundos.','en'),'In an unsafe area, use /logout to log out or your character will remain connected for 10 seconds.');
assert.equal(localizeConsoleEntry({source:'console',text:'Uso: /expulsarparty {usuario}'},'en'),'Usage: /kickparty {player}');
assert.equal(localizeConsoleEntry({source:'console',text:'Use /hogar',senderName:'Player'},'en'),'Use /hogar');
assert.equal(localizeConsoleEntry({source:'console',text:'Uso: /expulsarparty {usuario}'},'es'),'Uso: /expulsarparty {usuario}');
const speech='¡Hola forastero! Bienvenido a nuestra humilde aldea.';
for(const isNpc of [true,false]){
 let shown='';
 await handleIncomingUiPacket({packet:{type:'dialog',payload:{id:1,msg:speech}},engine:{personajes:{1:{isNpc}}},ctx:{showDialogBubble:(_id:number,text:string)=>{shown=text},localizeNpcDialog:(text:string)=>translateSource(text,'en')}} as any);
 assert.equal(shown,isNpc?'Hello, stranger! Welcome to our humble village.':speech);
}
console.log('PASS: gameplay messages, numeric parameters, Spanish preservation, unchanged player chat, item stats display and NPC-only dialog translation.');
}
main();

