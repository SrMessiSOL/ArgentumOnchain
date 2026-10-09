const fs=require('node:fs'),path=require('node:path');
const {Keypair,Connection,PublicKey,SystemProgram,Transaction}=require('@solana/web3.js');
const {MINT_SIZE,TOKEN_PROGRAM_ID,createInitializeMint2Instruction,getMint}=require('@solana/spl-token');
const bs58=require('bs58').default||require('bs58');
const GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const root='C:\\ProgramData\\AOCHAIN\\new-realm\\services\\signer';
function exclusive(file,value){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function key(file,create=false){if(fs.existsSync(file)){const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink())throw Error('custodyStorage');const bytes=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(bytes)||bytes.length!==64||!bytes.every(n=>Number.isInteger(n)&&n>=0&&n<=255))throw Error('custodyFormat');return Keypair.fromSecretKey(Uint8Array.from(bytes));}if(!create)throw Error('existingCustodyMissing');const pair=Keypair.generate();exclusive(file,Array.from(pair.secretKey));return pair;}
function mintTransaction(issuer,mint,rent,blockhash){return new Transaction({feePayer:issuer.publicKey,recentBlockhash:blockhash}).add(SystemProgram.createAccount({fromPubkey:issuer.publicKey,newAccountPubkey:mint.publicKey,space:MINT_SIZE,lamports:rent,programId:TOKEN_PROGRAM_ID}),createInitializeMint2Instruction(mint.publicKey,0,issuer.publicKey,null,TOKEN_PROGRAM_ID));}
function canRenewAttempt(status,lastValidBlockHeight,finalizedHeight,mintExists){
 if(!Number.isSafeInteger(lastValidBlockHeight)||lastValidBlockHeight<1||!Number.isSafeInteger(finalizedHeight)||finalizedHeight<1)throw Error('intentMismatch');
 return !mintExists&&finalizedHeight>lastValidBlockHeight&&(!status||Boolean(status.err));
}
async function run(mode){
 if(!['keys','prepare','broadcast','verify'].includes(mode))throw Error('mode');
 const keys=path.join(root,'keys'),setup=path.join(root,'provisioning');
 for(const dir of [keys,setup]){const st=fs.lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink())throw Error('custodyStorage');}
 if(fs.existsSync(path.join(setup,'public.json'))&&['issuer.json','mint.json'].some(name=>!fs.existsSync(path.join(keys,name))))throw Error('existingCustodyMissing');
 const issuer=key(path.join(keys,'issuer.json'),mode==='keys'),mint=key(path.join(keys,'mint.json'),mode==='keys');
 const publicFile=path.join(setup,'public.json');
 const publics={network:'devnet',genesis:GENESIS,issuer:issuer.publicKey.toBase58(),mint:mint.publicKey.toBase58()};
 if(fs.existsSync(publicFile)){if(JSON.stringify(JSON.parse(fs.readFileSync(publicFile)))!==JSON.stringify(publics))throw Error('existingAuthorityMismatch');}else exclusive(publicFile,publics);
 if(mode==='keys')return publics;
 const conn=new Connection('https://api.devnet.solana.com',{commitment:'finalized',disableRetryOnRateLimit:true,fetch:async(url,options)=>fetch(url,{...options,signal:AbortSignal.any([...(options?.signal?[options.signal]:[]),AbortSignal.timeout(10000)])})});
 if(await conn.getGenesisHash()!==GENESIS)throw Error('wrongNetwork');
 async function verify(){const state=await getMint(conn,mint.publicKey,'finalized',TOKEN_PROGRAM_ID);if(state.decimals!==0||state.freezeAuthority||!state.mintAuthority?.equals(issuer.publicKey))throw Error('mintMismatch');return {...publics,mintVerified:true,supply:state.supply.toString()};}
 if(mode==='verify')return verify();
 if(await conn.getAccountInfo(mint.publicKey,'finalized'))return verify();
 const attempts=fs.readdirSync(setup).filter(name=>/^mint-intent(?:-\d{4})?\.json$/.test(name)).sort((a,b)=>Number(a.match(/-(\d{4})/)?.[1]||0)-Number(b.match(/-(\d{4})/)?.[1]||0));
 if(attempts.length>16)throw Error('attemptLimit');
 let intentFile=path.join(setup,attempts.at(-1)||'mint-intent.json');
 if(mode==='prepare'){
  if(fs.existsSync(intentFile)){
   const previous=JSON.parse(fs.readFileSync(intentFile,'utf8'));
   if(previous.issuer!==publics.issuer||previous.mint!==publics.mint||previous.genesis!==GENESIS)throw Error('intentMismatch');
   const status=(await conn.getSignatureStatuses([previous.signature],{searchTransactionHistory:true})).value[0];
   const finalizedHeight=await conn.getBlockHeight('finalized');
   if(!canRenewAttempt(status,previous.lastValidBlockHeight,finalizedHeight,false))return {...publics,intentPreserved:true};
   // Finalized expiry/failed receipt plus an absent finalized mint permit a new
   // bootstrap attempt. Every previous signed record remains immutable.
   if(await conn.getAccountInfo(mint.publicKey,'finalized'))return verify();
   const index=Number(attempts.at(-1)?.match(/-(\d{4})/)?.[1]||0)+1;
   intentFile=path.join(setup,'mint-intent-'+String(index).padStart(4,'0')+'.json');
  }
  const rent=await conn.getMinimumBalanceForRentExemption(MINT_SIZE,'finalized');
  if(await conn.getBalance(issuer.publicKey,'finalized')<rent+1000000){
   const marker=path.join(setup,'airdrop-requested.json');
   if(!fs.existsSync(marker)){exclusive(marker,{requestedAt:new Date().toISOString(),lamports:1000000000});try{await conn.requestAirdrop(issuer.publicKey,1000000000);}catch{}}
   let funded=false;for(let attempt=0;attempt<6;attempt++){await new Promise(resolve=>setTimeout(resolve,5000));if(await conn.getBalance(issuer.publicKey,'finalized')>=rent+1000000){funded=true;break;}}
   if(!funded)throw Error('fundingPending');
  }
  const latest=await conn.getLatestBlockhash('finalized');const tx=mintTransaction(issuer,mint,rent,latest.blockhash);tx.sign(issuer,mint);
  exclusive(intentFile,{...publics,bytes:tx.serialize().toString('base64'),signature:bs58.encode(tx.signature),lastValidBlockHeight:latest.lastValidBlockHeight,rent});
  return {...publics,mintPrepared:true};
 }
 const intent=JSON.parse(fs.readFileSync(intentFile,'utf8'));
 if(intent.issuer!==publics.issuer||intent.mint!==publics.mint||intent.genesis!==GENESIS)throw Error('intentMismatch');
 const tx=Transaction.from(Buffer.from(intent.bytes,'base64'));
 const expected=mintTransaction(issuer,mint,intent.rent,tx.recentBlockhash);
 if(!tx.verifySignatures()||bs58.encode(tx.signature)!==intent.signature||!tx.serializeMessage().equals(expected.serializeMessage()))throw Error('intentMismatch');
 const status=(await conn.getSignatureStatuses([intent.signature],{searchTransactionHistory:true})).value[0];
 if(status?.err)throw Error('mintTransactionFailed');
 if(status?.confirmationStatus==='finalized')return verify();
 if(await conn.getBlockHeight('finalized')>intent.lastValidBlockHeight)throw Error('expiredIntentPreserved');
 const signature=await conn.sendRawTransaction(Buffer.from(intent.bytes,'base64'),{skipPreflight:false,maxRetries:0});
 if(signature!==intent.signature)throw Error('signatureMismatch');
 const final=await conn.confirmTransaction({signature,blockhash:tx.recentBlockhash,lastValidBlockHeight:intent.lastValidBlockHeight},'finalized');if(final.value.err)throw Error('mintTransactionFailed');
 return verify();
}
module.exports={mintTransaction,canRenewAttempt};
if(require.main===module)run(process.argv[2]).then(value=>{const file=path.join(root,'provisioning',process.argv[2]+'-receipt.json');fs.writeFileSync(file,JSON.stringify({...value,checkedAt:new Date().toISOString(),publicTestingApproved:false}));console.log('Devnet provisioning stage passed: '+process.argv[2]);}).catch(error=>{const category=['fundingPending','expiredIntentPreserved','wrongNetwork','mintMismatch'].includes(error.message)?error.message:'protectedProvisioningFailed';fs.writeFileSync(path.join(root,'provisioning',process.argv[2]+'-failure.json'),JSON.stringify({category,errorType:error.name,checkedAt:new Date().toISOString()}));console.log('Devnet provisioning stopped: '+category+'. Existing custody and intent preserved.');process.exitCode=1;});
