const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {randomUUID}=require('node:crypto');
const {Keypair,Transaction,SystemProgram}=require('@solana/web3.js');
const bs58=require('bs58').default;
const {checkAssetApproval}=require('../dist/signer/asset-policy');
const {checkCosmeticApproval,cosmeticIdentity}=require('../dist/signer/cosmetic-policy');
const {deriveAssetIdentity}=require('../dist/signer/asset-identity');
const {assetIdentity}=require('../dist/game-asset-chain');
const {reserveIssuance}=require('../dist/signer/budget');
const {isolatedSubmission,isolatedAssetIdentity}=require('../dist/signer-client');
const {COSMETIC_SEASON,HUNT_SEASON}=require('../dist/cosmetic-policy');
const issuer=Keypair.generate(),wallet=Keypair.generate(),id=randomUUID(),character=randomUUID(),account=randomUUID();
const derived=deriveAssetIdentity(issuer,character);
// A resident custody key must work without a private authority-file configuration.
const savedAuthorityFile=process.env.AOWEB_GOLD_AUTHORITY_FILE;
delete process.env.AOWEB_GOLD_AUTHORITY_FILE;
try{assert.equal(assetIdentity(character,issuer).address,derived.address);}
finally{if(savedAuthorityFile===undefined)delete process.env.AOWEB_GOLD_AUTHORITY_FILE;else process.env.AOWEB_GOLD_AUTHORITY_FILE=savedAuthorityFile;}
const asset={id,kind:'mint',state:'prepared',account_id:account,character_id:character,wallet:wallet.publicKey.toBase58(),linked_wallet:wallet.publicKey.toBase58(),owner_id:account,economy_lock:id,connected:false,deleted_at:null,chain_state:'offchain',chain_required:true,character_asset:null,name:'Fixture',snapshot_version:1,snapshot_hash:'a'.repeat(64),record:{id:character,kind:'character',character_id:character,asset_address:derived.address,issuer_address:derived.issuer,metadata_uri:'https://fixture.invalid/api/game-assets/metadata?id='+character,state:'reserved'}};
checkAssetApproval(asset,derived.issuer,'https://fixture.invalid');
assert.equal(deriveAssetIdentity(issuer,character).address,derived.address);
for(const change of [{connected:true},{state:'complete'},{economy_lock:null},{owner_id:randomUUID()},{snapshot_hash:'invalid'},{snapshot_version:null},{linked_wallet:issuer.publicKey.toBase58()},{chain_state:'staked'},{record:{...asset.record,metadata_uri:'https://other.invalid/asset'}},{record:{...asset.record,state:'active'}}])assert.throws(()=>checkAssetApproval({...asset,...change},derived.issuer,'https://fixture.invalid'));
const cosmetic={account_id:account,season:COSMETIC_SEASON,state:'prepared',asset_address:cosmeticIdentity(issuer,account,COSMETIC_SEASON).publicKey.toBase58(),wallet_address:wallet.publicKey.toBase58(),linked_wallet:wallet.publicKey.toBase58(),issuer_address:issuer.publicKey.toBase58(),metadata_uri:'https://fixture.invalid/cosmetic',eligible:true,hunt_eligible:false,supply_reserved:false,reserved_count:0};
checkCosmeticApproval(cosmetic,issuer,'https://fixture.invalid/cosmetic');
for(const change of [{eligible:false},{state:'confirmed'},{linked_wallet:issuer.publicKey.toBase58()},{asset_address:derived.address},{metadata_uri:'https://other.invalid/cosmetic'},{season:'mainnet'}])assert.throws(()=>checkCosmeticApproval({...cosmetic,...change},issuer,'https://fixture.invalid/cosmetic'));
const hunt={...cosmetic,season:HUNT_SEASON,asset_address:cosmeticIdentity(issuer,account,HUNT_SEASON).publicKey.toBase58(),metadata_uri:'https://fixture.invalid/cosmetic?kind=first-hunt',hunt_eligible:true,supply_reserved:true,reserved_count:100};
checkCosmeticApproval(hunt,issuer,'https://fixture.invalid/cosmetic');
for(const change of [{reserved_count:101},{reserved_count:0},{hunt_eligible:false},{supply_reserved:false}])assert.throws(()=>checkCosmeticApproval({...hunt,...change},issuer,'https://fixture.invalid/cosmetic'));
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'aochain-budget-fixture-'));
try{
 const budget={directory,maximumGold:10,maximumAssets:1,maximumCosmetics:1};
 reserveIssuance(budget,id,'fixture',{gold:10,assets:1,cosmetics:1});reserveIssuance(budget,id,'fixture',{gold:10,assets:1,cosmetics:1});
 assert.throws(()=>reserveIssuance({...budget,maximumGold:9},id,'fixture',{gold:10,assets:1,cosmetics:1}));
 assert.throws(()=>reserveIssuance(budget,randomUUID(),'other',{gold:1,assets:0,cosmetics:0}));
 assert.throws(()=>reserveIssuance(budget,id,'different',{gold:10,assets:1,cosmetics:1}));
 fs.writeFileSync(path.join(directory,'budget.lock'),'crash fixture');assert.throws(()=>reserveIssuance(budget,randomUUID(),'other',{gold:0,assets:0,cosmetics:0}));fs.unlinkSync(path.join(directory,'budget.lock'));
 const corruptId='ffffffff-ffff-ffff-ffff-ffffffffffff';
 fs.writeFileSync(path.join(directory,corruptId+'.json'),'{');assert.throws(()=>reserveIssuance(budget,randomUUID(),'other',{gold:0,assets:0,cosmetics:0}));
 // The matching reservation precedes the corrupt file: retries must still scan it.
 assert.throws(()=>reserveIssuance(budget,id,'fixture',{gold:10,assets:1,cosmetics:1}));
}finally{fs.rmSync(directory,{recursive:true,force:true});}
(async()=>{
 const tx=new Transaction({feePayer:wallet.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(SystemProgram.transfer({fromPubkey:wallet.publicKey,toPubkey:issuer.publicKey,lamports:1}));tx.sign(wallet);
 const receipt={id,message:tx.serializeMessage().toString('base64'),bytes:tx.serialize().toString('base64'),signature:bs58.encode(tx.signature)};
 let response=receipt;
 const server=http.createServer((req,res)=>{assert.equal(req.headers.authorization,'Bearer '+'f'.repeat(64));res.setHeader('content-type','application/json');res.end(JSON.stringify(response));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const saved={...process.env};process.env.AOWEB_SIGNER_URL='http://127.0.0.1:'+server.address().port;process.env.AOWEB_SIGNER_TOKEN='f'.repeat(64);process.env.AOWEB_GOLD_AUTHORITY_PUBLIC_KEY=issuer.publicKey.toBase58();
 try{
  assert.equal((await isolatedSubmission('economy',id,receipt.bytes,receipt.message,wallet.publicKey.toBase58())).signature,receipt.signature);
  response={...receipt,id:randomUUID()};await assert.rejects(()=>isolatedSubmission('economy',id,receipt.bytes,receipt.message,wallet.publicKey.toBase58()));
  response={...receipt,message:'changed'};await assert.rejects(()=>isolatedSubmission('asset',id,receipt.bytes,receipt.message,wallet.publicKey.toBase58()));
  response={address:derived.address,issuer:issuer.publicKey.toBase58()};assert.equal((await isolatedAssetIdentity(character)).address,derived.address);
  // Real SDK preparation succeeds with public signer identity and no authority file.
  delete process.env.AOWEB_GOLD_AUTHORITY_FILE;
  const chain=require('../dist/economy-chain'),assets=require('../dist/game-asset-chain');
  chain.economyConnection.getGenesisHash=async()=>require('../dist/cosmetic-policy').DEVNET_GENESIS;
  chain.economyConnection.getLatestBlockhash=async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100});
  chain.economyConnection.getAccountInfo=async()=>null;
  const prepared=await assets.prepareAssetTransaction('mint',id,asset.record,wallet.publicKey.toBase58(),'Fixture',{version:1,hash:'a'.repeat(64)});
  const nft=Transaction.from(Buffer.from(prepared.transaction_bytes,'base64'));assert.equal(nft.signatures.every(s=>s.signature===null),true);
  assert.equal(nft.signatures.some(s=>s.publicKey.equals(issuer.publicKey)),true);
  assert.equal(nft.signatures.some(s=>s.publicKey.toBase58()===derived.address),true);
  const payment=await chain.prepareTransaction('purchase',id,wallet.publicKey.toBase58(),1000000,issuer.publicKey.toBase58());
  assert.equal(Transaction.from(Buffer.from(payment.transaction_bytes,'base64')).signatures.every(s=>s.signature===null),true);
  response={...response,issuer:wallet.publicKey.toBase58()};await assert.rejects(()=>isolatedAssetIdentity(character));
  response={...receipt,extra:'x'.repeat(9000)};await assert.rejects(()=>isolatedSubmission('economy',id,receipt.bytes,receipt.message,wallet.publicKey.toBase58()));
  process.env.AOWEB_SIGNER_URL='https://example.invalid';await assert.rejects(()=>isolatedSubmission('economy',id,receipt.bytes,receipt.message,wallet.publicKey.toBase58()));
 }finally{process.env=saved;await new Promise(resolve=>server.close(resolve));}
 console.log('Asset/cosmetic policy, issuance ceilings and real loopback signer-client regressions passed; offline fixtures only.');
})().catch(error=>{console.error(error);process.exitCode=1;});
