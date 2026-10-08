import http from 'node:http';
import path from 'node:path';
import {signerHttpHandler} from './http';
import {Pool} from 'pg';
import {Keypair,PublicKey} from '@solana/web3.js';
import {checkedChain} from '../economy-chain';
import {approveEconomySubmission,type EconomyApproval} from './economy-policy';
import {recordSignedReceipt} from './journal';
import {reserveIssuance,type IssuanceBudget} from './budget';
import {signCommittedCharacterPurchase,type CharacterPurchaseApproval} from './market-policy';

export function validateSignerEnvironment(env:NodeJS.ProcessEnv){
 const deny=()=>{throw Error('Signer startup policy failed');};
 if(env.NODE_ENV!=='production'||env.HOST!=='127.0.0.1'||env.AOWEB_SIGNER_ENABLED!=='0')deny();
 if(!env.AOWEB_SIGNER_TOKEN||env.AOWEB_SIGNER_TOKEN.length<64||!env.AOWEB_SIGNER_JOURNAL_DIR||!env.AOWEB_GOLD_AUTHORITY_FILE)deny();
 if(!path.isAbsolute(env.AOWEB_SIGNER_JOURNAL_DIR!)||!path.isAbsolute(env.AOWEB_GOLD_AUTHORITY_FILE!))deny();
 if(env.TOKEN_AUTH||env.GAME_SERVICE_TOKEN||env.AOWEB_DEVNET_ISSUER_FILE)deny();
 const url=new URL(env.DATABASE_URL!);
 if(!['postgres:','postgresql:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.username!=='aoweb_signer_reader'||!url.password||url.port!=='55432'||url.pathname!=='/aochain_fresh'||url.search||url.hash)deny();
 const port=Number(env.PORT),gold=Number(env.AOWEB_SIGNER_MAX_GOLD),lamports=Number(env.AOWEB_SIGNER_MAX_LAMPORTS);
 if(!Number.isInteger(port)||port<1024||port>65535||![gold,lamports].every(n=>Number.isSafeInteger(n)&&n>0))deny();
 new PublicKey(env.AOWEB_GOLD_MINT!);
}

export function validateSignerDatabaseRole(row:Record<string,unknown>|undefined){
 const attributes=['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls'];
 if(!row||attributes.some(key=>row[key]!==false))throw Error('Signer database role is privileged');
}

// Preparation-only service: disabled is deliberately the only accepted startup mode.
// Activation requires the custody/privilege/restore/lifecycle review in the release gate.
export async function startSigner(){
 validateSignerEnvironment(process.env);
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:3000,query_timeout:3000,options:'-c default_transaction_read_only=on -c statement_timeout=3000'});
 const privileges=await pool.query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user");
 validateSignerDatabaseRole(privileges.rows[0]);
 const forbidden=await pool.query(`SELECT has_schema_privilege(current_user,'public','CREATE') AS schema_create,
 has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
 EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS memberships,
 EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND
 (has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') OR has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE'))) AS writes`);
 if(Object.values(forbidden.rows[0]).some(Boolean))throw Error('Signer database role is writable');
 // No production signing hooks are bound: activation remains a separate gate.
 const server=http.createServer(signerHttpHandler(process.env.AOWEB_SIGNER_TOKEN!,false));
 server.requestTimeout=5000;server.headersTimeout=5000;server.maxHeadersCount=20;
 server.listen(Number(process.env.PORT),'127.0.0.1');
 server.on('close',()=>{void pool.end();});
 return server;
}

/** Reviewed signing core, not exposed by the preparation service. No broadcast. */
export async function signCommittedEconomyOperation(pool:Pool,id:string,raw:string,issuer:Keypair,policy:{mint:string;maximumGold:number;maximumLamports:number},journal:string,budget:IssuanceBudget,metadataOrigin?:string){
 const result=await pool.query<CharacterPurchaseApproval>(`SELECT i.*,w.address AS linked_wallet,c.account_id AS owner_id,c.economy_lock,c.connected,c.deleted_at,c.chain_state,c.asset_address AS character_asset,to_jsonb(a) AS record,
 COALESCE(s.seller_id,t.seller_id) AS seller_id,COALESCE(s.seller_wallet,t.seller_wallet) AS seller_wallet,COALESCE(s.state,t.state) AS listing_state,
 COALESCE(s.intent_id,t.intent_id) AS listing_intent,COALESCE(s.buyer_id,t.buyer_id) AS buyer_id,
 COALESCE(s.price,t.price)::text AS price,sw.address AS seller_linked_wallet,(c.asset_address IS NOT NULL AND i.kind='purchase') AS tokenized
 FROM economy_intents i JOIN characters c ON c.id=i.character_id JOIN account_wallets w ON w.account_id=i.account_id
 LEFT JOIN character_sales s ON s.id=i.listing_id LEFT JOIN item_sales t ON t.id=i.item_listing_id
 LEFT JOIN game_assets a ON a.asset_address=c.asset_address
 LEFT JOIN account_wallets sw ON sw.account_id=COALESCE(s.seller_id,t.seller_id) WHERE i.id=$1`,[id]);
 const row=result.rows[0];if(!row)throw Error('signer.denied');
 const chain=await checkedChain();
 if((await chain.getBlockHeight('finalized'))>Number(row.last_valid_height))throw Error('signer.expired');
 if(row.tokenized){
  if(!metadataOrigin)throw Error('signer.denied');
  return signCommittedCharacterPurchase(row,raw,issuer,metadataOrigin,policy,journal,budget);
 }
 const receipt=approveEconomySubmission(row,raw,issuer,policy);
 reserveIssuance(budget,id,row.message_bytes,{gold:row.kind==='withdraw'?Number(row.amount):0,assets:0,cosmetics:0});
 return recordSignedReceipt(journal,{id,message:row.message_bytes,...receipt});
}

if(require.main===module){startSigner().catch(()=>{console.error('Signer startup failed; inspect protected configuration locally');process.exitCode=1;});}
