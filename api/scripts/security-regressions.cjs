const path=require('node:path'),{spawnSync}=require('node:child_process'),{Client}=require('pg');
const api=path.resolve(__dirname,'..');
const connectionString=process.env.AOCHAIN_SECURITY_ADMIN_DATABASE_URL;
if(!connectionString){console.error('Set AOCHAIN_SECURITY_ADMIN_DATABASE_URL to a local database administrator URL. All test databases are disposable.');process.exit(1);}
const base=new URL(connectionString);if(!['localhost','127.0.0.1','[::1]'].includes(base.hostname)){console.error('Security fixtures require a local database.');process.exit(1);}
const cases=[['gold-ledger-security.integration.test.ts','aoweb_ledger_test_'],['market-receipts.integration.test.ts','aoweb_market_test_'],['session-security.integration.test.ts','aoweb_session_test_'],['wallet-security.integration.test.ts','aoweb_wallet_test_'],['game-assets.integration.test.ts','aoweb_assets_test_'],['economy.integration.test.ts','aoweb_economy_test_'],['character-receipts.integration.test.ts','aoweb_character_test_'],['vault-receipts.integration.test.ts','aoweb_vault_test_']];
(async()=>{
 const control=new URL(base);control.pathname='/postgres';const admin=new Client({connectionString:control.toString()});await admin.connect();
 try{
  for(const [file,prefix]of cases){
   const name=prefix+Date.now();if(!/^[a-z0-9_]+$/.test(name))throw Error('Invalid fixture name');
   await admin.query('CREATE DATABASE "'+name+'"');const target=new URL(base);target.pathname='/'+name;
   try{const r=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','src/tests/'+file],{cwd:api,env:{...process.env,DATABASE_URL:target.toString(),NODE_ENV:'test'},stdio:'inherit',timeout:180000});if(r.status!==0)throw Error('Security fixture failed: '+file);}
   finally{await admin.query('DROP DATABASE "'+name+'" WITH (FORCE)');}
  }
  const unit=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','src/tests/security-controls.test.ts','src/tests/receipt-finality.test.ts','src/tests/economy-transaction.test.ts','src/tests/game-asset-transactions.test.ts','src/tests/settlement-authorization.test.ts','src/tests/chain-request-budget.test.ts','src/tests/request-body-limits.test.ts','src/tests/rpc-capacity.test.ts','src/tests/internal-service-policy.test.ts','src/tests/security-health-policy.test.ts','src/tests/wallet-inventory-security.test.ts'],{cwd:api,env:{...process.env,DATABASE_URL:base.toString(),NODE_ENV:'test'},stdio:'inherit',timeout:60000});if(unit.status!==0)throw Error('Security unit tests failed');
 }finally{await admin.end();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
