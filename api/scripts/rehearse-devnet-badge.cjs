// Default is preflight only. --execute claims/equips for a disposable local account.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {createUmi} = require('@metaplex-foundation/umi-bundle-defaults');
const {publicKey} = require('@metaplex-foundation/umi');
const {mplCore, fetchAssetV1} = require('@metaplex-foundation/mpl-core');

async function main() {
  const [fixtureFile, walletReceiptFile, issuer, metadataUrl, outputFile, mode] = process.argv.slice(2);
  assert.ok(outputFile, 'Usage: node rehearse-devnet-badge.cjs fixture wallet-receipt issuer metadata-url output [--execute]');
  assert.ok(!mode || mode === '--execute', 'Unknown mode');
  assert.equal(new URL(metadataUrl).protocol, 'https:');
  const fixture = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
  assert.ok(fixture.email.endsWith('@example.invalid'), 'Disposable accounts only');
  const expectedWallet = JSON.parse(fs.readFileSync(walletReceiptFile, 'utf8')).wallet;
  const umi = createUmi('https://api.devnet.solana.com', {commitment:'confirmed'}).use(mplCore());
  assert.equal(await umi.rpc.getGenesisHash(), 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
  const balance = (await umi.rpc.getBalance(publicKey(issuer))).basisPoints;
  const metadataResponse = await fetch(metadataUrl, {signal:AbortSignal.timeout(15000)});
  assert.ok(metadataResponse.ok, 'Metadata unavailable');
  const metadata = await metadataResponse.json();
  assert.equal(metadata.name, 'AOWeb Explorer — Devnet');
  assert.ok(metadata.attributes.some(a => a.trait_type === 'Network' && a.value === 'Devnet'));
  let token;
  const request = async (route, body) => {
    const response = await fetch('http://127.0.0.1:3101' + route, {
      method:body === undefined ? 'GET' : 'POST',
      headers:{'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {})},
      ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(60000),
    });
    assert.ok(response.ok, `${route}: HTTP ${response.status}`);
    return response.json();
  };
  const auth = await request('/auth/login', {identifier:fixture.email,password:fixture.password});
  assert.equal(auth.account.email, fixture.email);
  token = auth.sessionToken;
  assert.ok(token);
  const state = await request('/auth/cosmetics');
  assert.equal(state.network, 'devnet');
  assert.equal(state.wallet, expectedWallet);
  assert.equal(state.eligible, true);
  const report = {checkedAt:new Date().toISOString(),network:'devnet',issuer,
    issuerLamports:balance.toString(),wallet:expectedWallet,level:state.level,
    metadataUrl,metadataVerified:true,issuanceEnabled:state.ready,
    mode:mode ? 'execute' : 'preflight',mintVerified:false,
    blockers:[...(balance < 10000000n ? ['Issuer needs test SOL'] : []), ...(!state.ready ? ['Server issuance disabled'] : [])]};
  const save = () => fs.writeFileSync(outputFile, JSON.stringify(report,null,2)+'\n');
  save();
  if (!mode) {console.log(JSON.stringify(report,null,2)); return;}
  assert.equal(report.blockers.length, 0, report.blockers.join('; '));
  const claim = await request('/auth/cosmetics/claim', {});
  assert.equal(claim.network, 'devnet');
  // Independently read Core ownership from the devnet RPC before equipping.
  const asset = await fetchAssetV1(umi,publicKey(claim.asset));
  assert.equal(asset.owner.toString(), expectedWallet);
  assert.equal(asset.updateAuthority.type, 'Address');
  assert.equal(asset.updateAuthority.address.toString(), issuer);
  assert.equal(asset.uri, metadataUrl);
  assert.equal(asset.name, metadata.name);
  const repeated = await request('/auth/cosmetics/claim', {});
  assert.equal(repeated.asset, claim.asset, 'Retry must not issue a second asset');
  assert.equal((await request('/auth/cosmetics/equip', {asset:claim.asset})).equipped, true);
  const equipped = await request('/auth/cosmetics');
  assert.equal(equipped.equipped, true);
  assert.equal(equipped.verification, 'verified');
  Object.assign(report,{mintVerified:true,asset:claim.asset,signature:claim.signature,
    owner:asset.owner.toString(),retrySameAsset:true,equipped:true,
    explorer:`https://explorer.solana.com/address/${claim.asset}?cluster=devnet`});
  save(); console.log(JSON.stringify(report,null,2));
}
main().catch(error => {console.error(error.message);process.exitCode=1;});
