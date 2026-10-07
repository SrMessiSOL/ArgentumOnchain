import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {englishCommandAliases,resolveCommandAlias,normalizeClassInput,parseNpcSpawnOptions,formatAdminBotName} from './commandAliases';
const dispatcher=fs.readFileSync(path.join(__dirname,'commands.ts'),'utf8');
for(const [english,original] of Object.entries(englishCommandAliases)) {
 assert.equal(resolveCommandAlias(english.toUpperCase()),original);
 assert.equal(resolveCommandAlias(original),original);
 assert.ok(dispatcher.includes(`case "${original}":`),`Missing handler: ${english}`);
}
assert.equal(resolveCommandAlias('/unknown'),'/unknown');
assert.equal(resolveCommandAlias('constructor'),'constructor');
assert.equal(resolveCommandAlias('/homeward'),'/homeward');
assert.equal(resolveCommandAlias('/party'),'/party');
assert.equal(normalizeClassInput('Mage'),'mago');
assert.equal(normalizeClassInput('CLÉRIGO'),'clerigo');
assert.equal(normalizeClassInput('warrior'),'guerrero');
assert.equal(normalizeClassInput('12'),'12');
assert.equal(normalizeClassInput('clear'),'clear');
assert.equal(normalizeClassInput('constructor'),'constructor');
for(const [source,english]of Object.entries({Mago:'Mage',Clerigo:'Cleric',Guerrero:'Warrior',Asesino:'Assassin',Bardo:'Bard',Druida:'Druid','Paladín':'Paladin',Cazador:'Hunter'})) {
 assert.equal(formatAdminBotName(source,25,2),`Bot ${english} 25 #2`);
}
assert.equal(formatAdminBotName('constructor',1,1),'Bot constructor 1 #1');
for(const option of ['save','saved','fixed','persistent','guardar','guardado','fijo','persistente']) {
 assert.deepEqual(parseNpcSpawnOptions(option.toUpperCase(),'move'),{persist:true,persistMovement:true});
}
for(const option of ['move','mobile','moving','mover','movil','móvil']) {
 assert.deepEqual(parseNpcSpawnOptions('save',option),{persist:true,persistMovement:true});
}
assert.deepEqual(parseNpcSpawnOptions(),{persist:false,persistMovement:false});
assert.deepEqual(parseNpcSpawnOptions('constructor','toString'),{persist:false,persistMovement:false});
console.log('PASS: all English aliases reach existing handlers; case-insensitive and unknown-token behavior preserved.');
