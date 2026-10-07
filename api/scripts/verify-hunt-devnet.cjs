const fs=require('node:fs'),assert=require('node:assert/strict');
const {createUmi}=require('@metaplex-foundation/umi-bundle-defaults');
const {publicKey}=require('@metaplex-foundation/umi');
const {mplCore,fetchAssetV1}=require('@metaplex-foundation/mpl-core');
async function main(){
 const [fixtureFile,badgeFile,output]=process.argv.slice(2);assert.ok(output);
 const f=JSON.parse(fs.readFileSync(fixtureFile,'utf8')),badge=JSON.parse(fs.readFileSync(badgeFile,'utf8'));assert.ok(f.email.endsWith('@example.invalid'));
 let token;
 async function req(path,body){const r=await fetch('http://127.0.0.1:3101'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});assert.ok(r.ok,`${path} HTTP ${r.status}`);return r.json();}
 token=(await req('/auth/login',{identifier:f.email,password:f.password})).sessionToken;
 const state=await req('/auth/cosmetics');assert.equal(state.hunt.claim.state,'confirmed');assert.equal(state.hunt.eligible,true);assert.equal(state.hunt.remaining,99);
 const metadataUrl=new URL(badge.metadataUrl);metadataUrl.searchParams.set('kind','first-hunt');
 const metadata=await (await fetch(metadataUrl)).json();assert.equal(metadata.name,'AOWeb First Hunt — Devnet');
 const umi=createUmi('https://api.devnet.solana.com',{commitment:'confirmed'}).use(mplCore());assert.equal(await umi.rpc.getGenesisHash(),'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
 const asset=await fetchAssetV1(umi,publicKey(state.hunt.claim.asset_address));
 assert.equal(asset.owner,badge.owner);assert.equal(asset.updateAuthority.address,badge.issuer);assert.equal(asset.uri,metadataUrl.toString());assert.equal(asset.name,metadata.name);
 const replay=await req('/auth/cosmetics/claim',{kind:'first-hunt'});assert.equal(replay.asset,asset.publicKey);
 const result={checkedAt:new Date().toISOString(),network:'devnet',asset:asset.publicKey,owner:asset.owner,issuer:badge.issuer,name:asset.name,metadataUrl:asset.uri,signature:replay.signature,level:state.level,npcKills:state.hunt.kills,remaining:state.hunt.remaining,serverLimit:state.hunt.limit,replaySameAsset:true,equipped:state.equippedAsset===asset.publicKey,verification:state.verification,limitation:'100-claim cap is enforced by the trusted game API and its durable database, not a custom on-chain supply program.',explorer:`https://explorer.solana.com/address/${asset.publicKey}?cluster=devnet`};
 fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
