import assert from 'node:assert/strict';
import {welcomeConsoleText,AOCHAIN_X_URL} from '../lib/welcome-console';
import {translateSource} from '../lib/i18n';
const welcome='Bienvenido a AOWeb. Si quieres enterarte de las últimas actualizaciones del juego, puedes ingresar a nuestro Discord.';
const feedback='- Si quieres reportar erorres o sugerir cambios, puedes hacerlo en: https://forms.gle/Df2cmGExTBjjJhAR8';
for(const locale of ['en','es'] as const){
 for(const raw of [welcome,feedback]){
  const output=welcomeConsoleText(raw,locale)!;
  assert.ok(output);assert.ok(!/Discord|forms\.gle/.test(output));
  assert.equal(welcomeConsoleText(translateSource(raw,'en'),locale),output,'legacy server packets and translated packets agree');
 }
 assert.ok(welcomeConsoleText(feedback,locale)!.includes(AOCHAIN_X_URL));
}
assert.equal(welcomeConsoleText('Welcome to AOCHAIN.','en'),'Welcome to AOCHAIN.');
assert.equal(welcomeConsoleText('A player mentions Discord in chat','en'),null);
assert.equal(welcomeConsoleText('https://forms.gle/unrelated','en'),null);
assert.equal(AOCHAIN_X_URL,'https://x.com/ArgentumOnchain');
console.log('PASS: legacy/new bilingual welcome packets use AOCHAIN X; unrelated messages preserved.');
