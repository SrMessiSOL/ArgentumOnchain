const assert=require('node:assert/strict');
const path=require('node:path');
const {activationOptions}=require('../dist/signer/activation');
const env={AOWEB_SIGNER_BUDGET_DIR:path.resolve('fixture-budget'),AOWEB_SIGNER_METADATA_ORIGIN:'https://example.invalid',AOWEB_COSMETIC_METADATA_URL:'https://example.invalid/api/cosmetics/metadata',AOWEB_SIGNER_LIFETIME_GOLD:'100',AOWEB_SIGNER_LIFETIME_ASSETS:'20',AOWEB_SIGNER_LIFETIME_COSMETICS:'20'};
assert.equal(activationOptions(env).budget.maximumAssets,20);
for(const change of [{AOWEB_SIGNER_BUDGET_DIR:'relative'},{AOWEB_SIGNER_METADATA_ORIGIN:'http://example.invalid'},{AOWEB_SIGNER_METADATA_ORIGIN:'https://example.invalid/path'},{AOWEB_COSMETIC_METADATA_URL:'https://other.invalid/metadata'},{AOWEB_COSMETIC_METADATA_URL:'https://user:password@example.invalid/metadata'},{AOWEB_COSMETIC_METADATA_URL:'https://example.invalid/metadata#fragment'},{AOWEB_SIGNER_LIFETIME_GOLD:'0'},{AOWEB_SIGNER_LIFETIME_ASSETS:'Infinity'},{AOWEB_SIGNER_LIFETIME_COSMETICS:'1.5'}])assert.throws(()=>activationOptions({...env,...change}));
console.log('Activation configuration guards passed; no keys, RPC, signing or broadcast.');
