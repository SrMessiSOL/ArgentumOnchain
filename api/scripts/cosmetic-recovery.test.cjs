const assert=require('node:assert/strict'),http=require('node:http');
const {randomUUID}=require('node:crypto');
const {Keypair,Connection}=require('@solana/web3.js');
const savedEnv={...process.env};
process.env.DATABASE_URL='postgresql://fixture:unused@127.0.0.1:1/never_connected';process.env.TOKEN_AUTH='offline-fixture-operations';process.env.GAME_SERVICE_TOKEN='offline-fixture-game';
const pool=require('../dist/db').default,chain=require('../dist/economy-chain');
const {cosmeticIdentity,approveCosmeticSubmission}=require('../dist/signer/cosmetic-policy');
const {COSMETIC_SEASON}=require('../dist/cosmetic-policy');
const {cosmeticChain}=require('../dist/cosmetic-chain');
const originalQuery=pool.query,originalGenesis=Connection.prototype.getGenesisHash;
const issuer=Keypair.generate(),owner=Keypair.generate(),account=randomUUID(),metadata='https://fixture.invalid/api/cosmetics/metadata';
let row,events=[],broadcasts=0,failBroadcast=false,failRecordedReply=false,finalized=false;
function reset(){row={operation_id:randomUUID(),account_id:account,season:COSMETIC_SEASON,state:'prepared',asset_address:cosmeticIdentity(issuer,account,COSMETIC_SEASON).publicKey.toBase58(),wallet_address:owner.publicKey.toBase58(),issuer_address:issuer.publicKey.toBase58(),metadata_uri:metadata,linked_wallet:owner.publicKey.toBase58(),eligible:true,hunt_eligible:false,supply_reserved:false,reserved_count:0,signature:null};events=[];broadcasts=0;failBroadcast=false;failRecordedReply=false;finalized=false;}
pool.query=async(sql,params)=>{
 if(sql.startsWith('SELECT *'))return {rows:[{...row}]};
 if(sql.includes('SET transaction_bytes')){assert.equal(row.message_bytes,undefined);row={...row,transaction_bytes:params[2],message_bytes:params[3],last_valid_height:params[4]};events.push('prepared-committed');return {rowCount:1};}
 if(sql.includes('SET signed_bytes')){assert.equal(params[4],row.message_bytes);row={...row,signed_bytes:params[2],signature:params[3]};events.push('signed-committed');if(failRecordedReply){failRecordedReply=false;throw Error('lost database response');}return {rowCount:1};}
 throw Error('Unexpected fixture query');
};
Connection.prototype.getGenesisHash=async()=> 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
chain.checkedChain=async()=>({
 getLatestBlockhash:async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}),
 getBlockHeight:async()=>10,
 getSignatureStatuses:async()=>({value:[finalized?{confirmationStatus:'finalized',err:null}:null]}),
 sendRawTransaction:async bytes=>{assert.ok(row.signed_bytes);assert.equal(Buffer.from(row.signed_bytes,'base64').equals(bytes),true);events.push('broadcast');broadcasts++;if(failBroadcast){failBroadcast=false;throw Error('lost provider response');}return row.signature;},
 confirmTransaction:async()=>({value:{err:null}})
});
const server=http.createServer(async(req,res)=>{
 assert.equal(req.headers.authorization,'Bearer '+'f'.repeat(64));
 let body='';for await(const chunk of req)body+=chunk;
 const input=JSON.parse(body);
 try{assert.equal(input.id,row.operation_id);assert.ok(row.message_bytes);events.push('signer-read-committed');const signed=approveCosmeticSubmission({...row,last_valid_height:String(row.last_valid_height)},input.transaction,issuer,metadata);res.setHeader('content-type','application/json');res.end(JSON.stringify({id:row.operation_id,message:row.message_bytes,...signed}));}
 catch{res.writeHead(400).end('{}');}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 process.env.AOWEB_SIGNER_URL='http://127.0.0.1:'+server.address().port;process.env.AOWEB_SIGNER_TOKEN='f'.repeat(64);process.env.AOWEB_GOLD_AUTHORITY_PUBLIC_KEY=issuer.publicKey.toBase58();process.env.AOWEB_DEVNET_METADATA_URL=metadata;delete process.env.AOWEB_GOLD_AUTHORITY_FILE;delete process.env.AOWEB_DEVNET_ISSUER_FILE;
 const isolated=await cosmeticChain();
 reset();failBroadcast=true;await assert.rejects(()=>isolated.mint(account,row.wallet_address,metadata));assert.ok(row.signed_bytes);assert.equal(broadcasts,1);assert.deepEqual(events.slice(0,3),['prepared-committed','signer-read-committed','signed-committed']);
 const signedBytes=row.signed_bytes;finalized=true;assert.equal(await isolated.mint(account,row.wallet_address,metadata),row.signature);assert.equal(broadcasts,1);assert.equal(row.signed_bytes,signedBytes);
 reset();failRecordedReply=true;await assert.rejects(()=>isolated.mint(account,row.wallet_address,metadata));assert.ok(row.signed_bytes);assert.equal(broadcasts,0);assert.equal(await isolated.mint(account,row.wallet_address,metadata),row.signature);assert.equal(broadcasts,1);assert.equal(events.filter(x=>x==='signer-read-committed').length,1);
 reset();row.eligible=false;await assert.rejects(()=>isolated.mint(account,row.wallet_address,metadata));assert.equal(broadcasts,0);assert.equal(row.signed_bytes,undefined);
 console.log('Cosmetic API recovery fixture passed: committed preparation, signed bytes before broadcast, lost DB/provider responses, finalized reconciliation without resend and ineligible denial. Real loopback signer; simulated database/RPC; no live transactions.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{pool.query=originalQuery;Connection.prototype.getGenesisHash=originalGenesis;process.env=savedEnv;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await pool.end();});
