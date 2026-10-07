import assert from 'node:assert/strict';
import {translateSource} from '../lib/i18n';
import {localizeConsoleEntry,localizeGameMessage} from '../lib/game-i18n';
import {toUserFriendlyError} from '../lib/api-errors';

const samples=[
 ['CON','CON'],
 ['Manzana Roja - 12','Red apple - 12'],
 ['[INFO] No se pudo invocar el bot: error desconocido.','[INFO] Could not summon the bot: unknown error.'],
 ['[INFO] No se pudo invocar el bot: foo, bar y baz.','[INFO] Could not summon the bot: foo, bar y baz.'],
 ['[INFO] Invocaste y guardaste a Rata Salvaje (ID 1) fijo en 1@40@40.','[INFO] Summoned and saved Wild Rat (ID 1) stationary at 1@40@40.'],
 ['[INFO] Uso: /invocarnpc ID_NPC [guardar|fijo|persistente] [mover|movil]','[INFO] Usage: /spawnnpc NPC_ID [save|fixed|persistent] [move|mobile]'],
 ['White Lady (H/E/EO-M)','White Lady (H/E/DE-F)'],
 ['[INFO] Personaje invalido.','[INFO] Invalid character.'],
 ['Comienzas a minar.','You start mining.'],
 ['[Retos] Reto publicado.','[Challenges] Challenge posted.'],
 ['Valya Silmeanar (H/E/EO-M)','Valya Silmeanar (H/E/DE-F)'],
 ['Rata Salvaje golpeó a tu Rata Salvaje por 12.','Wild Rat hit your Wild Rat for 12.'],
 ['Rata Salvaje golpeó a Rata Salvaje por 12.','Wild Rat hit Wild Rat for 12.'],
 [' Oro en la bóveda: 1,234.',' Gold in the vault: 1,234.'],
 ['[INFO] Has baneado a Mago de forma permanente.','[INFO] You banned Mago permanently.'],
 ['[INFO] Has baneado a Mago hasta 4/10/2026, 12:30:00.','[INFO] You banned Mago until 4/10/2026, 12:30:00.'],
 ['Sigues en la carcel por 2 minutos. Motivo: No atacar.','You remain in jail for 2 minutes. Reason: No atacar.'],
 ['Sigues en la carcel por 2 minutos. Motivo: No atacar, robar y molestar.','You remain in jail for 2 minutes. Reason: No atacar, robar y molestar.'],
 ['Ves a Rata Salvaje [NPC] [Invocación de Mago] [Vida: 12/30] [Paralizado] [Inmovilizado]','You see Wild Rat [NPC] [Mago\'s summon] [Health: 12/30] [Paralyzed] [Immobilized]'],
 ['Ves a Mago - Mago, nivel 2 - Ciudadano - [Aciertos: 4 | Errados: 1 | Porcentaje de aciertos: 80%]','You see Mago - Mage, level 2 - Citizen - [Hits: 4 | Misses: 1 | Accuracy: 80%]'],
 ['Ves a Rata Salvaje [NPC] [Target: ninguno] [Lock: no] [Agresor: Mago (9)] [Aggro reciente: si] [Memoria aggro: 100ms] [Presion: 2]','You see Wild Rat [NPC] [Target: none] [Lock: no] [Aggressor: Mago (9)] [Recent aggro: yes] [Aggro memory: 100ms] [Pressure: 2]'],
];
for(const [source,english]of samples){
 assert.equal(localizeGameMessage(source,'en'),english,source);
 assert.equal(localizeGameMessage(source,'es'),source);
 assert.equal(localizeConsoleEntry({text:source,source:'console',senderName:'Mago'},'en'),source);
}
const text='[Rata Salvaje]: ¡Hola forastero! Bienvenido a nuestra humilde aldea.';
const whisper={text:'[Privado] Mago: No tienes oro suficiente.',source:'console',channel:'whisper',senderName:'Mago'};
assert.equal(localizeConsoleEntry(whisper,'en'),'[Private] Mago: No tienes oro suficiente.');
assert.equal(localizeConsoleEntry(whisper,'es'),whisper.text);
assert.equal(localizeConsoleEntry({text,source:'dialog',speakerType:'npc'},'en'),'[Wild Rat]: Hello, stranger! Welcome to our humble village.');
assert.equal(localizeConsoleEntry({text,source:'dialog',speakerType:'user'},'en'),text);
assert.equal(localizeConsoleEntry({text,source:'dialog',speakerType:'npc'},'es'),text);
const error=toUserFriendlyError([
 {code:'too_small',origin:'string',path:['name'],minimum:7},
 {code:'invalid_format',format:'email',path:['email']},
]);
const translated=translateSource(error,'en');
assert.ok(translated.startsWith('Name must contain at least 7 characters.'),translated);
assert.ok(!translated.includes('Ingresa'),translated);
assert.equal(translateSource(error,'es'),error);
console.log('PASS: combined inspection messages, NPC speech, summons, bank gold, ban/jail details, multi-error validation and preserved player text.');
