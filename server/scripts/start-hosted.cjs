const fs=require('node:fs');
const path=require('node:path');
function validate(env,root) {
  if(fs.existsSync(path.join(root,'.env')))throw Error('Hosted game refuses checkout environment files');
  if(env.NODE_ENV!=='production'||env.HOST!=='127.0.0.1'||env.PORT!=='7766')throw Error('Hosted game requires production loopback on port 7766');
  if(!env.TOKEN_AUTH||env.TOKEN_AUTH.length<32||env.GAME_SERVICE_TOKEN||env.DATABASE_URL)throw Error('Hosted game requires only its game credential; no database or operations configuration');
  if(env.API_BASE_URL!=='http://127.0.0.1:3101')throw Error('Hosted game API must use the internal loopback listener');
  if(env.RESET_CONNECTED_CHARACTERS_ON_STARTUP!=='false')throw Error('Hosted startup must not reset connection records implicitly');
  for(const key of ['AOWEB_VAULT_JOURNAL_DIR','AOWEB_CHARACTER_JOURNAL_DIR','AOWEB_WORLD_JOURNAL_DIR','AOWEB_MARKET_JOURNAL_DIR']) {
    if(!env[key]||!path.isAbsolute(env[key]))throw Error('Hosted game requires explicit absolute journal directories');
  }
}
module.exports={validate};
if(require.main===module) {
  try {validate(process.env,path.resolve(__dirname,'..'));} catch(error) {console.error(error.message);process.exit(1);}
  try {require('../dist/server.js');} catch {console.error('Hosted game startup failed; inspect protected diagnostics');process.exitCode=1;}
}
