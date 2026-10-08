const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {Keypair,Transaction,PublicKey,TransactionInstruction,SystemProgram}=require('@solana/web3.js');
const {getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction,createMintToCheckedInstruction}=require('@solana/spl-token');
const {createEconomyTransaction}=require('../dist/economy-chain');
const {approveEconomySubmission}=require('../dist/signer/economy-policy');
const {recordSignedReceipt}=require('../dist/signer/journal');
const {validateSignerEnvironment,validateSignerDatabaseRole}=require('../dist/signer/service');
// Ephemeral offline fixture keys only. This test performs no RPC or broadcast.
const issuer=Keypair.generate(),wallet=Keypair.generate(),mint=Keypair.generate().publicKey;
const id=randomUUID(),account=randomUUID(),character=randomUUID();
const policy={mint:mint.toBase58(),maximumGold:100,maximumLamports:1000000};
const tx=createEconomyTransaction(wallet.publicKey,Keypair.generate().publicKey.toBase58());
const ata=getAssociatedTokenAddressSync(mint,wallet.publicKey);
tx.add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey,ata,wallet.publicKey,mint),createMintToCheckedInstruction(mint,ata,issuer.publicKey,10n,0));
tx.add(new TransactionInstruction({programId:new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),keys:[{pubkey:issuer.publicKey,isSigner:true,isWritable:false}],data:Buffer.from(`aoweb:devnet:withdraw:${id}`)}));
const row={id,kind:'withdraw',state:'prepared',wallet:wallet.publicKey.toBase58(),amount:'10',message_bytes:tx.serializeMessage().toString('base64'),signature:null,last_valid_height:'100',account_id:account,character_id:character,linked_wallet:wallet.publicKey.toBase58(),owner_id:account,economy_lock:id,connected:false,deleted_at:null,tokenized:false};
const unsigned=tx.serialize({requireAllSignatures:false}).toString('base64');
assert.throws(()=>approveEconomySubmission(row,unsigned,issuer,policy));
tx.partialSign(wallet);
const raw=tx.serialize({requireAllSignatures:false}).toString('base64');
const result=approveEconomySubmission(row,raw,issuer,policy);
assert.equal(Transaction.from(Buffer.from(result.bytes,'base64')).verifySignatures(),true);
assert.equal(Transaction.from(Buffer.from(result.bytes,'base64')).serializeMessage().toString('base64'),row.message_bytes);
for(const change of [{state:'complete'},{state:'failed'},{amount:'101'},{amount:'9'},{wallet:issuer.publicKey.toBase58()},{linked_wallet:issuer.publicKey.toBase58()},{economy_lock:null},{owner_id:randomUUID()},{connected:true},{deleted_at:new Date()},{tokenized:true},{kind:'mint'},{id:'../escape'},{signature:'conflict'}])assert.throws(()=>approveEconomySubmission({...row,...change},raw,issuer,policy));
// Even matching wallet-signed DB bytes may not introduce an extra instruction.
const altered=Transaction.from(Buffer.from(raw,'base64'));altered.add(SystemProgram.transfer({fromPubkey:wallet.publicKey,toPubkey:issuer.publicKey,lamports:1}));altered.partialSign(wallet);
assert.throws(()=>approveEconomySubmission({...row,message_bytes:altered.serializeMessage().toString('base64')},altered.serialize({requireAllSignatures:false}).toString('base64'),issuer,policy));
assert.throws(()=>approveEconomySubmission(row,raw,issuer,{...policy,mint:Keypair.generate().publicKey.toBase58()}));
assert.throws(()=>approveEconomySubmission(row,raw,issuer,{...policy,maximumGold:NaN}));
// Reserved non-tokenized sales bind both the payment and seller identity.
const seller=Keypair.generate(),sale=randomUUID(),sellerAccount=randomUUID();
const purchase=createEconomyTransaction(wallet.publicKey,Keypair.generate().publicKey.toBase58()).add(SystemProgram.transfer({fromPubkey:wallet.publicKey,toPubkey:seller.publicKey,lamports:1000000}));
purchase.add(new TransactionInstruction({programId:new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),keys:[{pubkey:issuer.publicKey,isSigner:true,isWritable:false}],data:Buffer.from(`aoweb:devnet:purchase:${id}`)}));
purchase.partialSign(wallet);
const saleRow={...row,kind:'purchase',amount:'1000000',message_bytes:purchase.serializeMessage().toString('base64'),owner_id:sellerAccount,economy_lock:sale,listing_id:sale,item_listing_id:null,seller_id:sellerAccount,seller_wallet:seller.publicKey.toBase58(),listing_state:'reserved',listing_intent:id,buyer_id:account,price:'1000000',seller_linked_wallet:seller.publicKey.toBase58()};
const purchaseRaw=purchase.serialize({requireAllSignatures:false}).toString('base64');
assert.equal(Transaction.from(Buffer.from(approveEconomySubmission(saleRow,purchaseRaw,issuer,policy).bytes,'base64')).verifySignatures(),true);
for(const change of [{listing_state:'listed'},{price:'999999'},{seller_id:account},{owner_id:account},{listing_intent:randomUUID()},{seller_linked_wallet:wallet.publicKey.toBase58()},{buyer_id:sellerAccount}])assert.throws(()=>approveEconomySubmission({...saleRow,...change},purchaseRaw,issuer,policy));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aochain-signer-test-'));
try{
 const receipt={id,message:row.message_bytes,...result};assert.deepEqual(recordSignedReceipt(dir,receipt),receipt);assert.deepEqual(recordSignedReceipt(dir,receipt),receipt);
 assert.throws(()=>recordSignedReceipt(dir,{...receipt,bytes:'changed'}));
 const partial=randomUUID();fs.writeFileSync(path.join(dir,partial+'.json'),'{');assert.throws(()=>recordSignedReceipt(dir,{...receipt,id:partial}));
 assert.throws(()=>recordSignedReceipt(dir,{...receipt,id:'../escape'}));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
const env={NODE_ENV:'production',HOST:'127.0.0.1',PORT:'3104',AOWEB_SIGNER_ENABLED:'0',AOWEB_SIGNER_TOKEN:'t'.repeat(64),AOWEB_SIGNER_JOURNAL_DIR:dir,AOWEB_GOLD_AUTHORITY_FILE:path.join(dir,'fixture-only'),DATABASE_URL:'postgresql://aoweb_signer_reader:fixture@127.0.0.1:55432/aochain_fresh',AOWEB_GOLD_MINT:mint.toBase58(),AOWEB_SIGNER_MAX_GOLD:'100',AOWEB_SIGNER_MAX_LAMPORTS:'1000000'};
validateSignerEnvironment(env);
for(const databaseUrl of [
 'postgresql://aoweb_signer_reader:fixture@127.0.0.1:55433/aochain_fresh',
 'postgresql://aoweb_signer_reader:fixture@127.0.0.1:55432/other_realm',
 'postgresql://aoweb_signer_reader:fixture@127.0.0.1:55432/aochain_fresh?options=-c%20default_transaction_read_only=off',
 'postgresql://aoweb_signer_reader:fixture@127.0.0.1:55432/aochain_fresh#ignored',
 'postgresql://aoweb_signer_reader@127.0.0.1:55432/aochain_fresh'
])assert.throws(()=>validateSignerEnvironment({...env,DATABASE_URL:databaseUrl}));
const reader={rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false};
validateSignerDatabaseRole(reader);
for(const key of Object.keys(reader))assert.throws(()=>validateSignerDatabaseRole({...reader,[key]:true}));
assert.throws(()=>validateSignerDatabaseRole(undefined));
assert.throws(()=>validateSignerDatabaseRole({}));
for(const change of [{AOWEB_SIGNER_ENABLED:'1'},{HOST:'0.0.0.0'},{TOKEN_AUTH:'secret'},{GAME_SERVICE_TOKEN:'secret'},{AOWEB_DEVNET_ISSUER_FILE:'secret'},{DATABASE_URL:'postgresql://aoweb_runtime:fixture@127.0.0.1/db'},{AOWEB_SIGNER_TOKEN:'short'},{AOWEB_SIGNER_MAX_GOLD:'NaN'}])assert.throws(()=>validateSignerEnvironment({...env,...change}));
console.log('Signer policy, tampering, durable retry/conflict and disabled startup regressions passed (offline fixtures only).');
