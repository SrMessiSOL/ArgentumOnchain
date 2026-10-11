const assert=require('node:assert/strict');
const {Keypair,Transaction,SystemProgram}=require('@solana/web3.js');
const bs58=require('bs58').default;
const {expiredMintAbsent}=require('../dist/expired-mint-proof');
const {DEVNET_GENESIS}=require('../dist/cosmetic-policy');
const payer=Keypair.generate(),asset=Keypair.generate();
const tx=new Transaction({feePayer:payer.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:asset.publicKey,lamports:1}));tx.sign(payer);
const op={kind:'mint',state:'signed',signature:bs58.encode(tx.signature),transaction_bytes:tx.serialize().toString('base64'),last_valid_height:100};
function connection(change={}){return {getGenesisHash:async()=>DEVNET_GENESIS,getBlockHeight:async()=>300,isBlockhashValid:async()=>({value:false}),getSignatureStatuses:async()=>({value:[null]}),getTransaction:async()=>null,getAccountInfo:async()=>null,getSignaturesForAddress:async()=>[],...change};}
(async()=>{
 assert.equal(await expiredMintAbsent(connection(),op,asset.publicKey.toBase58()),true);
 for(const change of [
 {getGenesisHash:async()=>'wrong'}, {getBlockHeight:async()=>250}, {isBlockhashValid:async()=>({value:true})},
 {getSignatureStatuses:async()=>({value:[{confirmationStatus:'processed'}]})}, {getTransaction:async()=>({})},
 {getAccountInfo:async()=>({})},{getSignaturesForAddress:async()=>[{}]}
 ])assert.equal(await expiredMintAbsent(connection(change),op,asset.publicKey.toBase58()),false);
 for(const change of [{kind:'item-import'},{kind:'item-export'},{state:'prepared'},{signature:null},{signature:bs58.encode(Keypair.generate().secretKey)},{last_valid_height:NaN}])assert.equal(await expiredMintAbsent(connection(),{...op,...change},asset.publicKey.toBase58()),false);
 let reads=0;assert.equal(await expiredMintAbsent(connection({getAccountInfo:async()=>++reads===1?null:{}}),op,asset.publicKey.toBase58()),false);
 await assert.rejects(expiredMintAbsent(connection({getTransaction:async()=>{throw Error('RPC unavailable')}}),op,asset.publicKey.toBase58()));
 console.log('Expired mint proof passed: absent expired mint, conflicting evidence, wrong chain, RPC outage, second-pass race and non-mint isolation.');
})().catch(e=>{console.error(e);process.exitCode=1});
