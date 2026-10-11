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
