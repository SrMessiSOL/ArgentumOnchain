const fs=require('node:fs'),assert=require('node:assert/strict'),{Client}=require('pg');
(async()=>{
 const base=new URL(process.env.AOCHAIN_SECURITY_ADMIN_DATABASE_URL||'http://invalid');
 if(!['postgres:','postgresql:'].includes(base.protocol)||base.hostname!=='127.0.0.1'||base.username!=='aochain_test_admin')throw Error('Dedicated disposable host test cluster required');
 base.pathname='/postgres';const admin=new Client({connectionString:base.toString()});await admin.connect();
 const name='aochain_signer_test_'+Date.now();let databaseCreated=false,roleCreated=false,client;
 try{
  assert.equal((await admin.query("SELECT count(*)::int n FROM pg_roles WHERE rolname='aoweb_signer_reader'")).rows[0].n,0,'Do not reuse an existing role');
  await admin.query('CREATE DATABASE "'+name+'"');databaseCreated=true;
  const target=new URL(base);target.pathname='/'+name;client=new Client({connectionString:target.toString()});await client.connect();
  for(const file of ['schema.sql','wallet-schema.sql','economy-schema.sql','game-assets-schema.sql'])await client.query(fs.readFileSync(file,'utf8'));
  const sql=fs.readFileSync('signer-reader-schema.sql','utf8').replace('GRANT CONNECT ON DATABASE aochain_fresh','GRANT CONNECT ON DATABASE '+name);
  await client.query(sql);roleCreated=true;await client.query(sql);
  await client.query('SET ROLE aoweb_signer_reader');
  await client.query('SELECT * FROM economy_intents');await client.query('SELECT id,account_id,chain_state,chain_required,name FROM characters');
  await client.query('SELECT * FROM game_asset_operations');await client.query('SELECT character_id,version,hash,settled FROM character_snapshots');
  for(const sql of ['UPDATE economy_intents SET state=state','DELETE FROM game_assets','SELECT bundle FROM character_snapshots','SELECT * FROM auth_sessions','CREATE TABLE signer_forbidden(id int)','UPDATE account_wallets SET address=address'])await assert.rejects(()=>client.query(sql),{code:'42501'});
  await client.query('RESET ROLE');
  const props=(await client.query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname='aoweb_signer_reader'")).rows[0];assert.equal(Object.values(props).some(Boolean),false);
  await client.query('ALTER ROLE aoweb_signer_reader BYPASSRLS');
  await assert.rejects(()=>client.query(sql));
  await client.query('ALTER ROLE aoweb_signer_reader NOBYPASSRLS');
  console.log('Disposable signer reader SQL passed: permitted reads, forbidden writes/private columns and NOLOGIN privilege checks.');
 }finally{
  if(client)await client.end();
  if(databaseCreated)await admin.query('DROP DATABASE "'+name+'" WITH (FORCE)');
  if(roleCreated)await admin.query('DROP ROLE aoweb_signer_reader');
  await admin.end();
 }
})().catch(()=>{console.error('Signer database regression failed; inspect the disposable fixture locally.');process.exitCode=1;});
