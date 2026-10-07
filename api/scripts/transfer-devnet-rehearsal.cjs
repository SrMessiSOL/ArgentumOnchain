// Transfers only the previously recorded test badge between dedicated generated keys.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createUmi}=require('@metaplex-foundation/umi-bundle-defaults');
const {keypairIdentity,createSignerFromKeypair,publicKey}=require('@metaplex-foundation/umi');
const {mplCore,transferV1,fetchAssetV1}=require('@metaplex-foundation/mpl-core');
const bs58=require('bs58').default;
async function main(){
 const [fixtureFile,ownerKeyFile,issuerFile,badgeFile,receiverFile,output]=process.argv.slice(2);
 assert.ok(output,'Pass fixture, owner key, issuer key, badge receipt, receiver fixture and output paths');
 const fixture=JSON.parse(fs.readFileSync(fixtureFile,'utf8')),badge=JSON.parse(fs.readFileSync(badgeFile,'utf8'));
 assert.ok(fixture.email.endsWith('@example.invalid'));assert.equal(badge.network,'devnet');assert.equal(badge.mintVerified,true);
 const umi=createUmi('https://api.devnet.solana.com',{commitment:'confirmed'}).use(mplCore());
 assert.equal(await umi.rpc.getGenesisHash(),'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
 const issuer=umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(issuerFile,'utf8'))));
 assert.equal(issuer.publicKey,badge.issuer);umi.use(keypairIdentity(issuer));
 const ownerDer=Buffer.from(JSON.parse(fs.readFileSync(ownerKeyFile,'utf8')).privateKeyDer,'base64');
 const owner=umi.eddsa.createKeypairFromSeed(ownerDer.subarray(-32));assert.equal(owner.publicKey,badge.owner);
 async function req(path,token,body,expected=200){const r=await fetch('http://127.0.0.1:3101'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});assert.equal(r.status,expected,`${path}: ${r.status}`);return r.json();}
 if(!fs.existsSync(receiverFile)){
  const receiverKey=umi.eddsa.generateKeypair();const suffix=crypto.randomBytes(8).toString('hex');
  fs.writeFileSync(receiverFile,JSON.stringify({email:`badge-receiver-${suffix}@example.invalid`,name:'Badge Receiver',password:crypto.randomBytes(24).toString('hex'),secretKey:Array.from(receiverKey.secretKey)}),{flag:'wx',mode:0o600});
 }
 const receiverData=JSON.parse(fs.readFileSync(receiverFile,'utf8'));
 assert.ok(receiverData.email.startsWith('badge-receiver-')&&receiverData.email.endsWith('@example.invalid'));
 const receiver=umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(receiverData.secretKey));
 if(!receiverData.registered){await req('/auth/register',null,{email:receiverData.email,name:receiverData.name,password:receiverData.password},201);receiverData.registered=true;fs.writeFileSync(receiverFile,JSON.stringify(receiverData));}
 const a=await req('/auth/login',null,{identifier:fixture.email,password:fixture.password});
 const b=await req('/auth/login',null,{identifier:receiverData.email,password:receiverData.password});
 const linked=await req('/auth/wallet',b.sessionToken);
 if(!linked.wallet){
  const challenge=await req('/auth/wallet/challenge',b.sessionToken,{address:receiver.publicKey});
  const lines=challenge.message.split('\n');assert.ok(lines.includes(`Wallet: ${receiver.publicKey}`));assert.ok(lines.includes(`Account: ${b.account._id}`));
  assert.ok(lines.includes(`Session: ${crypto.createHash('sha256').update(b.sessionToken).digest('hex')}`));
  assert.ok(lines.includes(`Origin: ${new URL(badge.metadataUrl).origin}`));
  const signature=await umi.eddsa.sign(Buffer.from(challenge.message),receiver);
  await req('/auth/wallet/verify',b.sessionToken,{signature:Buffer.from(signature).toString('base64')});
 }else assert.equal(linked.wallet.address,receiver.publicKey);
 let asset=await fetchAssetV1(umi,publicKey(badge.asset));assert.equal(asset.updateAuthority.address,issuer.publicKey);
 const report={network:'devnet',asset:badge.asset,originalOwner:owner.publicKey,recipient:receiver.publicKey,transfers:[],checks:[]};
 const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2));
 if(asset.owner===owner.publicKey){
  const tx=await transferV1(umi,{asset:asset.publicKey,authority:createSignerFromKeypair(umi,owner),newOwner:receiver.publicKey}).sendAndConfirm(umi,{confirm:{commitment:'confirmed'}});
  report.transfers.push({to:receiver.publicKey,signature:bs58.encode(tx.signature)});save();
 }else assert.equal(asset.owner,receiver.publicKey,'Unexpected owner; refusing transfer');
 asset=await fetchAssetV1(umi,publicKey(badge.asset));assert.equal(asset.owner,receiver.publicKey);
 assert.equal((await req('/auth/cosmetics',a.sessionToken)).equipped,false);
 await req('/auth/cosmetics/equip',a.sessionToken,{asset:badge.asset},403);
 assert.equal((await req('/auth/cosmetics/equip',b.sessionToken,{asset:badge.asset})).equipped,true);
 assert.equal((await req('/auth/cosmetics',b.sessionToken)).equipped,true);
 report.checks.push('recipient owns and equips; original owner loses equip and cannot re-equip');save();
 const back=await transferV1(umi,{asset:publicKey(badge.asset),authority:createSignerFromKeypair(umi,receiver),newOwner:owner.publicKey}).sendAndConfirm(umi,{confirm:{commitment:'confirmed'}});
 report.transfers.push({to:owner.publicKey,signature:bs58.encode(back.signature)});save();
 assert.equal((await fetchAssetV1(umi,publicKey(badge.asset))).owner,owner.publicKey);
 assert.equal((await req('/auth/cosmetics',b.sessionToken)).equipped,false);
 await req('/auth/cosmetics/equip',b.sessionToken,{asset:badge.asset},403);
 await req('/auth/cosmetics/equip',b.sessionToken,{asset:null});
 assert.equal((await req('/auth/cosmetics/equip',a.sessionToken,{asset:badge.asset})).equipped,true);
 report.checks.push('return transfer restores original owner; recipient loses equip and cannot re-equip');
 report.completedAt=new Date().toISOString();save();console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
