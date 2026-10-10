const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { validateHostedEnvironment: validate, validateHostedFilesystem } = require('./start-hosted.cjs');
const valid = {
 NODE_ENV:'production', HOST:'127.0.0.1', AOWEB_RUN_MIGRATIONS:'0',
 TOKEN_AUTH:'o'.repeat(32), GAME_SERVICE_TOKEN:'g'.repeat(32),
 DATABASE_URL:'postgresql://runtime:fixture@127.0.0.1:55432/candidate',
 SITE_URL:'https://realm.example', CORS_ORIGIN:'https://realm.example',
 AOWEB_SETTLEMENT_PAUSED:'1'
};
assert.doesNotThrow(() => validate(valid));
const isolated={AOWEB_SIGNER_URL:'http://127.0.0.1:3104',AOWEB_SIGNER_TOKEN:'s'.repeat(64),AOWEB_GOLD_AUTHORITY_PUBLIC_KEY:'11111111111111111111111111111111'};
assert.doesNotThrow(()=>validate({...valid,...isolated}));
const rehearsal={...valid,...isolated,AOWEB_PRIVATE_WALLET_TEST:'1',AOWEB_SETTLEMENT_PAUSED:'0',AOWEB_GOLD_MINT:'11111111111111111111111111111111',AOWEB_DEVNET_METADATA_URL:'https://realm.example/api/cosmetics/metadata'};
assert.doesNotThrow(()=>validate(rehearsal));
const external={...rehearsal,AOWEB_PRIVATE_WALLET_TEST:'0',AOWEB_EXTERNAL_DEVNET_TEST:'1',AOWEB_DEVNET_RPC:'https://api.devnet.solana.com'};
assert.doesNotThrow(()=>validate(external));
for(const patch of [{AOWEB_DEVNET_RPC:'https://api.mainnet-beta.solana.com'},{AOWEB_PRIVATE_WALLET_TEST:'1'},{AOWEB_SIGNER_URL:undefined},{AOWEB_GOLD_MINT:undefined}])assert.throws(()=>validate({...external,...patch}));
for(const patch of [{AOWEB_SIGNER_URL:undefined},{AOWEB_GOLD_MINT:undefined},{AOWEB_DEVNET_METADATA_URL:undefined},{AOWEB_PRIVATE_WALLET_TEST:'0'},{AOWEB_GOLD_AUTHORITY_FILE:'fixture.json'}])assert.throws(()=>validate({...rehearsal,...patch}));
for(const patch of [{AOWEB_SIGNER_URL:'http://external.invalid:3104'},{AOWEB_SIGNER_URL:'http://secret:password@127.0.0.1:3104'},{AOWEB_SIGNER_TOKEN:undefined},{AOWEB_SIGNER_TOKEN:valid.TOKEN_AUTH},{AOWEB_GOLD_AUTHORITY_PUBLIC_KEY:undefined}])assert.throws(()=>validate({...valid,...isolated,...patch}));
for (const patch of [
 {NODE_ENV:'development'}, {HOST:'0.0.0.0'}, {HOST:undefined},
 {AOWEB_RUN_MIGRATIONS:undefined}, {AOWEB_RUN_MIGRATIONS:'1'},
 {TOKEN_AUTH:'short'}, {GAME_SERVICE_TOKEN:undefined},
 {GAME_SERVICE_TOKEN:valid.TOKEN_AUTH},
 {DATABASE_URL:'postgresql://runtime:fixture@public.example/realm'},
 {DATABASE_URL:'https://127.0.0.1/realm'}, {DATABASE_URL:'invalid'},
 {SITE_URL:'http://realm.example'}, {SITE_URL:'https://realm.example/path'},
 {SITE_URL:'https://user:password@realm.example'}, {SITE_URL:'invalid'},
 {CORS_ORIGIN:'*'}, {CORS_ORIGIN:'https://other.example'},
 {AOWEB_SETTLEMENT_PAUSED:'0'},
 {AOWEB_GOLD_AUTHORITY_FILE:'fixture.json'}, {AOWEB_DEVNET_ISSUER_FILE:'fixture.json'}
]) assert.throws(() => validate({...valid,...patch}));
const privateValue='DO_NOT_PRINT_THIS_PRIVATE_VALUE';
try {validate({...valid,DATABASE_URL:privateValue});} catch(error) {
 assert.ok(!error.message.includes(privateValue));
}
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'aochain-hosted-policy-'));
try {
 assert.doesNotThrow(() => validateHostedFilesystem(directory));
 fs.writeFileSync(path.join(directory,'.env'),'AOWEB_GOLD_AUTHORITY_FILE=nonsecret-fixture');
 assert.throws(() => validateHostedFilesystem(directory));
} finally {fs.rmSync(directory,{recursive:true,force:true});}
console.log('Hosted startup policy passed: 20 unsafe configurations and checkout .env injection rejected; valid preparation accepted, secrets redacted.');
