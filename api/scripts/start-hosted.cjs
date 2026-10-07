const path = require('node:path');
const fs = require('node:fs');

function validateHostedFilesystem(apiRoot) {
  if (fs.existsSync(path.join(apiRoot, '.env'))) {
    throw new Error('Hosted startup refuses checkout .env files; load protected external configuration');
  }
}

function validateHostedEnvironment(env) {
  const reject = message => { throw new Error(message); };
  if (env.NODE_ENV !== 'production') reject('Hosted startup requires NODE_ENV=production');
  if (env.AOWEB_RUN_MIGRATIONS !== '0') reject('Hosted startup requires migrations disabled');
  if (env.HOST !== '127.0.0.1') reject('Hosted API must bind explicitly to IPv4 loopback');
  if (!env.TOKEN_AUTH || env.TOKEN_AUTH.length < 32 ||
      !env.GAME_SERVICE_TOKEN || env.GAME_SERVICE_TOKEN.length < 32 ||
      env.TOKEN_AUTH === env.GAME_SERVICE_TOKEN) {
    reject('Hosted startup requires distinct operations and game credentials of at least 32 characters');
  }
  let database, site;
  try { database = new URL(env.DATABASE_URL); } catch { reject('Invalid database configuration'); }
  if (!['postgres:', 'postgresql:'].includes(database.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname)) {
    reject('Hosted database must use loopback PostgreSQL');
  }
  try { site = new URL(env.SITE_URL); } catch { reject('Invalid site configuration'); }
  if (site.protocol !== 'https:' || site.username || site.password ||
      site.pathname !== '/' || site.search || site.hash || env.CORS_ORIGIN !== site.origin) {
    reject('Hosted startup requires one matching HTTPS site and CORS origin');
  }
  // Until signer custody is implemented, this entry point permits preparation only.
  if (env.AOWEB_SETTLEMENT_PAUSED !== '1') reject('Hosted preparation requires settlement paused');
  if (env.AOWEB_GOLD_AUTHORITY_FILE || env.AOWEB_DEVNET_ISSUER_FILE) {
    reject('Do not mount authority files into the hosted API; signer isolation remains unfinished');
  }
  if (env.AOWEB_SIGNER_URL || env.AOWEB_SIGNER_TOKEN || env.AOWEB_GOLD_AUTHORITY_PUBLIC_KEY) {
    let signer;
    try { signer = new URL(env.AOWEB_SIGNER_URL); } catch { reject('Invalid isolated signer configuration'); }
    if (signer.protocol !== 'http:' || signer.hostname !== '127.0.0.1' || !signer.port ||
        signer.pathname !== '/' || signer.username || signer.password || signer.search || signer.hash ||
        !env.AOWEB_SIGNER_TOKEN || env.AOWEB_SIGNER_TOKEN.length < 64 ||
        env.AOWEB_SIGNER_TOKEN === env.TOKEN_AUTH || env.AOWEB_SIGNER_TOKEN === env.GAME_SERVICE_TOKEN ||
        !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(env.AOWEB_GOLD_AUTHORITY_PUBLIC_KEY || '')) {
      reject('Isolated signer requires loopback, public authority and a separate credential');
    }
  }
}

module.exports = { validateHostedEnvironment, validateHostedFilesystem };
if (require.main === module) {
  try {
    validateHostedFilesystem(path.resolve(__dirname, '..'));
    validateHostedEnvironment(process.env);
  } catch (error) {
    // Validation errors contain policy names, never configured secret values.
    console.error(error.message);
    process.exit(1);
  }
  try {
    require(path.resolve(__dirname, '../dist/server.js'));
  } catch {
    console.error('Hosted API startup failed; inspect protected service diagnostics');
    process.exitCode = 1;
  }
}
