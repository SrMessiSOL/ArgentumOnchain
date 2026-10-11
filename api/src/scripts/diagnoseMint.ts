import pool from '../db';
import {Connection,PublicKey} from '@solana/web3.js';
async function main(){
 const name=process.argv[2]?.trim();if(!name)throw Error('Pass the exact character name.');
 const client=await pool.connect();let characters:any[]=[],operations:any[]=[],wallets:any[]=[];
 try{await client.query('BEGIN READ ONLY');characters=(await client.query('SELECT id,name,connected,chain_state,chain_required,asset_address,economy_lock FROM characters WHERE lower(name)=lower($1)',[name])).rows;
 for(const character of characters){operations.push(...(await client.query('SELECT id,character_id,kind,state,wallet,signature,created_at,completed_at,last_valid_height FROM game_asset_operations WHERE character_id=$1 ORDER BY created_at DESC LIMIT 10',[character.id])).rows);wallets.push(...(await client.query('SELECT w.address FROM account_linked_wallets w JOIN characters c ON c.account_id=w.account_id WHERE c.id=$1 ORDER BY w.linked_at',[character.id])).rows);}
 await client.query('ROLLBACK');}finally{client.release();}
 console.log(JSON.stringify({characterName:name,found:characters.length>0,characters,operations,linkedWallets:wallets},null,2));
 if(!characters.length)return;
 const rpc=new Connection(process.env.AOWEB_DEVNET_RPC||'https://api.devnet.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true});
 for(const address of new Set<string>([...operations.map(o=>o.wallet),...wallets.map(w=>w.address)])){try{console.log(JSON.stringify({wallet:address,balanceLamports:await rpc.getBalance(new PublicKey(address))}));}catch{console.log(JSON.stringify({wallet:address,rpcRead:'unavailable'}));}}
 for(const operation of operations.filter(o=>o.signature)){try{const status=(await rpc.getSignatureStatuses([operation.signature],{searchTransactionHistory:true})).value[0];console.log(JSON.stringify({operationId:operation.id,signature:operation.signature,chainStatus:status}));if(status?.err){const tx=await rpc.getTransaction(operation.signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});console.log(JSON.stringify({operationId:operation.id,transactionError:tx?.meta?.err,programLogs:tx?.meta?.logMessages}));}}catch{console.log(JSON.stringify({operationId:operation.id,rpcRead:'unavailable'}));}}
}
main().catch(()=>{console.error('Mint diagnostic could not complete. Check database/RPC access on the host; credentials and private URLs are omitted.');process.exitCode=1;}).finally(()=>pool.end());
