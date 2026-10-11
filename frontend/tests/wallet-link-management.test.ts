import assert from 'node:assert/strict';
import {needsWalletManagement as manage} from '../lib/wallet-link-management.ts';
assert.equal(manage(null,'new-wallet'),false);
assert.equal(manage(undefined,'new-wallet'),false);
assert.equal(manage('active-wallet','active-wallet'),false);
assert.equal(manage('active-wallet','new-wallet'),true);
// Transaction paths continue to enforce the active wallet, rather than linking implicitly.
import fs from 'node:fs';
const transaction=fs.readFileSync(new URL('../lib/game-wallet.ts',import.meta.url),'utf8');
assert.match(transaction,/data.wallets\?\.some/);
assert.match(transaction,/data.wallet\?\.address.*economy.wrongWallet/);
const header=fs.readFileSync(new URL('../components/HeaderWallet.tsx',import.meta.url),'utf8');
assert.match(header,/account.wallets\?\.some.*router.push\("\/wallet"\);return;/);
console.log('Header routes new wallets to management; transaction wallet mismatch remains enforced');

import {linkAdditionalWallet} from '../lib/wallet-link-management.ts';
async function testAdditionalLink(){
const stages:string[]=[],calls:{path:string;body:any}[]=[];
const signer={address:'second-wallet',signMessage:async(message:Uint8Array)=>{assert.equal(new TextDecoder().decode(message),'bound account challenge');return new Uint8Array([1,2,3]);}};
assert.deepEqual(await linkAdditionalWallet(signer,async(path,body)=>{calls.push({path,body});return path.endsWith('challenge')?{message:'bound account challenge'}:{linkedWallet:{address:'second-wallet'},wallet:{address:'first-wallet'}};},stage=>stages.push(stage)),{address:'second-wallet'});
assert.deepEqual(stages,['approve','verify']);
assert.equal(calls[0].body.mode,'add');
assert.equal(calls[1].body.signature,'AQID');
await assert.rejects(linkAdditionalWallet(signer,async(path)=>path.endsWith('challenge')?{message:'bound account challenge'}:{linkedWallet:{address:'wrong-wallet'}},()=>{}),/wallet.invalidProof/);
await assert.rejects(linkAdditionalWallet(signer,async()=>({message:null}),()=>{}),/wallet.invalidProof/);
await assert.rejects(linkAdditionalWallet({...signer,signMessage:async()=>{throw Error('User rejected');}},async()=>({message:'bound account challenge'}),()=>{}),/User rejected/);
console.log('Additional-wallet flow confirms the signed address, preserves default wallet, exposes stages and rejects missing receipts or rejected signatures');

}
void testAdditionalLink().catch(error=>{console.error(error);process.exitCode=1;});
