// Harness-only bootstrap, copied into the disposable API fixture. Never used by
// production startup. It simulates ownership verification, not mint or staking.
const path=require('node:path');
function validate(env,cwd){
 const db=new URL(env.DATABASE_URL||'');
 if(env.NODE_ENV!=='test'||env.HOST!=='127.0.0.1'||env.PORT!=='3121'||env.AOWEB_SETTLEMENT_PAUSED!=='1'||env.VERCEL||env.AOWEB_GOLD_AUTHORITY_FILE||env.AOWEB_DEVNET_ISSUER_FILE||db.hostname!=='127.0.0.1'||db.port!=='55433'||!/^\/aoweb_gameplay_test_\d+$/.test(db.pathname)||path.basename(cwd)!=='api'||path.basename(path.dirname(cwd))!=='gameplay'||!path.basename(path.dirname(path.dirname(cwd))).startsWith('host-regressions-'))throw Error('Disposable gameplay bootstrap boundary refused');
}
module.exports={validate};
if(require.main===module){
 validate(process.env,process.cwd());
 const pool=require(path.join(process.cwd(),'dist/db.js')).default;
 const policy=require(path.join(process.cwd(),'dist/game-asset-policy.js'));
 policy.assertPlayableCharacter=async(id,account,connection)=>{
  const result=await (connection||pool).query(`SELECT c.account_id,c.asset_address,c.chain_required,c.chain_state,c.economy_lock,c.deleted_at,c.privileges,a.name,a.email FROM characters c JOIN accounts a ON a.id=c.account_id WHERE c.id=$1`,[id]);
  const row=result.rows[0];
  if(!row||row.account_id!==account||row.asset_address||row.chain_required||row.chain_state!=='offchain'||row.economy_lock||row.deleted_at||Number(row.privileges)!==0||!/^Fixture[a-z]{8}$/.test(row.name)||!/^([a-z]{8})@example\.invalid$/.test(row.email))throw Error('Fixture ownership denied');
 };
 console.log('Disposable fixture only: chain ownership verification simulated; settlement remains paused.');
 require(path.join(process.cwd(),'dist/server.js'));
}
