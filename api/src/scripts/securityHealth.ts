import {securityHealthIssues} from '../securityHealthPolicy';
import fs from 'node:fs/promises';
import path from 'node:path';
import pool from '../db';
import {bundleHash} from '../game-asset-policy';
import {checkedMint} from '../economy-chain';
import {verifyPlayableAsset} from '../game-asset-chain';
async function main(){
 const report:Record<string,unknown>={checkedAt:new Date().toISOString(),mode:'read-only',automaticRepair:false};
 const client=await pool.connect();
 try{
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  for(const [label,table]of [['economy','economy_intents'],['assets','game_asset_operations']])report[label]=(await client.query(`SELECT state,count(*)::int AS count,MIN(created_at) AS oldest FROM ${table} WHERE state IN ('prepared','signed') GROUP BY state`)).rows;
  report.ledgerMismatches=(await client.query(`SELECT count(*)::int AS count FROM economy_intents i LEFT JOIN gold_ledger l ON l.intent_id=i.id WHERE ((i.kind IN ('deposit','withdraw') AND i.state='complete') OR l.intent_id IS NOT NULL) AND (i.kind NOT IN ('deposit','withdraw') OR i.state<>'complete' OR l.intent_id IS NULL OR l.character_id<>i.character_id OR l.delta<>CASE WHEN i.kind='deposit' THEN i.amount ELSE -i.amount END)`)).rows[0].count;
  report.rawCredentials=(await client.query("SELECT (SELECT count(*) FROM auth_sessions WHERE token NOT LIKE 'sha256:%')::int AS sessions,(SELECT count(*) FROM game_tickets WHERE ticket NOT LIKE 'sha256:%' OR auth_token NOT LIKE 'sha256:%')::int AS tickets")).rows[0];
  let snapshots=0,mismatches=0;
  const cursor=await client.query('SELECT character_id,version,hash,bundle FROM character_snapshots ORDER BY character_id,version');
  for(const row of cursor.rows){snapshots++;if(bundleHash(row.bundle)!==row.hash)mismatches++;}
  report.snapshots={checked:snapshots,hashMismatches:mismatches};
  report.pendingReceiptCounts={};
  const journals=[['vault','AOWEB_VAULT_JOURNAL_DIR','vault-operations','vault_operation_receipts'],['character','AOWEB_CHARACTER_JOURNAL_DIR','character-operations','character_save_receipts'],['world','AOWEB_WORLD_JOURNAL_DIR','world-operations','floor_spawn_receipts'],['market','AOWEB_MARKET_JOURNAL_DIR','market-operations','market_operation_receipts']];
  for(const [label,variable,folder,table]of journals){
   const directory=process.env[variable]||path.resolve(__dirname,'../../../../../work',folder);let pending=0,bytes=0,malformed=0,receiptExists=0;
   for(const name of await fs.readdir(directory).catch((error:NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return [];throw error;})){
    if(!name.endsWith('.json'))continue;pending++;const target=path.join(directory,name);const info=await fs.lstat(target);bytes+=info.size;
    if(!info.isFile()||info.size>4*1024*1024){malformed++;continue;}
    try{const entry=JSON.parse(await fs.readFile(target,'utf8'));if(!/^[0-9a-f-]{36}$/i.test(entry.operationId)||name!==entry.operationId+'.json')throw Error();
     if((await client.query(`SELECT 1 FROM ${table} WHERE operation_id=$1`,[entry.operationId])).rowCount)receiptExists++;
    }catch{malformed++;}
   }
   (report.pendingReceiptCounts as Record<string,unknown>)[label]={pending,bytes,malformed,receiptExists,receiptPayloadVerificationRequired:true};
  }
  report.databaseBytes=(await client.query('SELECT pg_database_size(current_database())::text AS bytes')).rows[0].bytes;
  report.settlementNetMinted=(await client.query("SELECT COALESCE(-sum(l.delta),0)::text AS net FROM gold_ledger l JOIN economy_intents i ON i.id=l.intent_id WHERE i.kind IN ('deposit','withdraw')")).rows[0].net;
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 if(process.argv.includes('--chain')){
  const {mint}=await checkedMint();const {getMint,TOKEN_PROGRAM_ID}=await import('@solana/spl-token');const {checkedChain}=await import('../economy-chain.js');
  report.chainSupply=(await getMint(await checkedChain(),mint,'finalized',TOKEN_PROGRAM_ID)).supply.toString();report.supplyBaselineRequired=true;
  const rows=(await pool.query("SELECT c.asset_address,w.address FROM characters c LEFT JOIN account_wallets w ON w.account_id=c.account_id WHERE c.chain_state='staked' AND c.deleted_at IS NULL")).rows;
  let verified=0,failed=0;for(const row of rows){try{if(row.address&&await verifyPlayableAsset(row.asset_address,row.address))verified++;else failed++;}catch{failed++;}}
  report.stakes={checked:rows.length,verified,unverified:failed};
 }
 const storage=await fs.statfs(path.resolve(__dirname,'../../../../../work'),{bigint:true});
 report.availableDiskBytes=(storage.bavail*storage.bsize).toString();
 report.issues=securityHealthIssues(report);report.measuredChecksPassed=(report.issues as string[]).length===0;
 if(!report.measuredChecksPassed)process.exitCode=1;
 console.log(JSON.stringify(report,null,2));
}
main().catch((error:unknown)=>{console.error('Read-only security health check failed. No automatic repair was performed.',{name:(error as Error).name,code:(error as {code?:string}).code??'unavailable'});process.exitCode=1;}).finally(()=>pool.end());
