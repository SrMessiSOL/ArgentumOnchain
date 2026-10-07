// Dedicated local test-account rehearsal. Never imports a browser/personal wallet.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const bs58 = require('bs58').default;

async function main() {
  const [fixtureFile, keyFile, expectedOrigin, receiptFile] = process.argv.slice(2);
  assert.ok(fixtureFile && keyFile && expectedOrigin && receiptFile,
    'Usage: node link-test-wallet.cjs fixture.json private-key.json expected-origin receipt.json');
  const fixture = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
  assert.ok(fixture.email.endsWith('@example.invalid'), 'Only disposable test accounts are allowed');
  const request = async (route, token, body) => {
    const response = await fetch('http://127.0.0.1:3101' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json();
    assert.ok(response.ok, `${route}: HTTP ${response.status}`);
    return data;
  };
  const auth = await request('/auth/login', null, { identifier: fixture.email, password: fixture.password });
  assert.equal(auth.account.email, fixture.email);
  const token = auth.sessionToken;
  assert.ok(token);
  const current = await request('/auth/wallet', token);
  if (!fs.existsSync(keyFile)) {
    assert.equal(current.wallet, null, 'An existing wallet must never be replaced by this rehearsal');
    const key = crypto.generateKeyPairSync('ed25519');
    fs.writeFileSync(keyFile, JSON.stringify({ privateKeyDer: key.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64') }), { flag: 'wx', mode: 0o600 });
  }
  const stored = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  const privateKey = crypto.createPrivateKey({ key: Buffer.from(stored.privateKeyDer, 'base64'), format: 'der', type: 'pkcs8' });
  const address = bs58.encode(crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32));
  if (current.wallet) assert.equal(current.wallet.address, address, 'Refusing to replace a different linked wallet');
  else {
    const challenge = await request('/auth/wallet/challenge', token, { address });
    const lines = challenge.message.split('\n');
    for (const line of [
      `Origin: ${new URL(expectedOrigin).origin}`, `Account: ${auth.account._id}`,
      `Wallet: ${address}`, `Session: ${crypto.createHash('sha256').update(token).digest('hex')}`,
    ]) assert.ok(lines.includes(line), 'Challenge binding mismatch');
    assert.ok(Date.parse(challenge.expiresAt) > Date.now(), 'Expired challenge');
    const signature = crypto.sign(null, Buffer.from(challenge.message), privateKey).toString('base64');
    await request('/auth/wallet/verify', token, { signature });
  }
  assert.equal((await request('/auth/wallet', token)).wallet.address, address);
  const cosmetics = await request('/auth/cosmetics', token);
  assert.equal(cosmetics.wallet, address);
  assert.equal(cosmetics.network, 'devnet');
  const receipt = { checkedAt: new Date().toISOString(), method: 'Local API signed Ed25519 challenge; not Phantom UI',
    wallet: address, level: cosmetics.level, eligible: cosmetics.eligible, issuanceEnabled: cosmetics.ready,
    claim: cosmetics.claim, equipped: cosmetics.equipped, verification: cosmetics.verification,
    keyStorage: 'Dedicated test key stored locally outside the repository; excluded from this receipt' };
  fs.writeFileSync(path.resolve(receiptFile), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
