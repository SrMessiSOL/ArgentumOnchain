import type {Locale} from './i18n';
export const AOCHAIN_X_URL='https://x.com/ArgentumOnchain';
// Compatibility with the welcome packets still sent by an older game server.
const welcomeMessages=new Set([
 'Bienvenido a AOCHAIN.', 'Welcome to AOCHAIN.',
 ...['AOWeb','AOCHAIN'].flatMap(name=>[
  `Bienvenido a ${name}. Si quieres enterarte de las últimas actualizaciones del juego, puedes ingresar a nuestro Discord.`,
  `Welcome to ${name}. Join our Discord for the latest game updates.`,
 ]),
]);
const feedbackMessages=new Set([
 '- Si quieres reportar erorres o sugerir cambios, puedes hacerlo en: https://forms.gle/Df2cmGExTBjjJhAR8',
 '- Report bugs or suggest changes at: https://forms.gle/Df2cmGExTBjjJhAR8',
 `- Actualizaciones, errores y sugerencias: ${AOCHAIN_X_URL}`,
 `- Updates, bugs and suggestions: ${AOCHAIN_X_URL}`,
]);
export function welcomeConsoleText(text:string,locale:Locale):string|null {
 if(welcomeMessages.has(text))return locale==='es'?'Bienvenido a AOCHAIN.':'Welcome to AOCHAIN.';
 if(feedbackMessages.has(text))return locale==='es'?`- Actualizaciones, errores y sugerencias: ${AOCHAIN_X_URL}`:`- Updates, bugs and suggestions: ${AOCHAIN_X_URL}`;
 return null;
}
