// Local integration proof with disposable Ed25519 keys, never a user's wallet.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bs58 = require('bs58').default;
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://aoweb_local@127.0.0.1:55432/aoweb_local' });
const accounts = [];
const origin = 'http://127.0.0.1:3101';
const expectedSiteOrigin = new URL(process.env.WALLET_TEST_SITE_ORIGIN || 'http://127.0.0.1:3100').origin;
let count = 0;
async function request(path, token, body) {
    const response = await fetch(origin + path, { method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
}
function ok(label) { count++; console.log(`PASS ${label}`); }
async function account() {
    const suffix = Array.from(crypto.randomBytes(8), v => String.fromCharCode(97 + v % 26)).join('');
    const password = crypto.randomBytes(20).toString('hex');
    const created = await request('/auth/register', null, { name: `Wallet ${suffix}`, email: `${suffix}@example.invalid`, password });
    assert.equal(created.status, 201); accounts.push(created.data.account._id);
    return { ...created.data, password };
}
async function main() {
    assert.equal((await request('/auth/wallet')).status, 401); ok('authentication required');
    const a = await account(), b = await account();
    const key = crypto.generateKeyPairSync('ed25519');
    const address = bs58.encode(key.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
    const issue = () => request('/auth/wallet/challenge', a.sessionToken, { address });
    const prove = (message, token = a.sessionToken) => request('/auth/wallet/verify', token,
        { signature: crypto.sign(null, Buffer.from(message), key.privateKey).toString('base64') });
    assert.equal((await request('/auth/wallet/challenge', a.sessionToken, { address: 'not-a-wallet' })).status, 400); ok('invalid address rejected');
    let challenge = await issue(); assert.equal(challenge.status, 200);
    assert.ok(challenge.data.message.split('\n').includes(`Origin: ${expectedSiteOrigin}`));
    assert.ok(challenge.data.message.includes(a.account._id));
    assert.equal((await prove(challenge.data.message + 'tampered')).status, 400); ok('changed message rejected');
    assert.equal((await prove(challenge.data.message, b.sessionToken)).status, 400); ok('different account rejected');
    const secondSession = await request('/auth/login', null, { identifier: a.account.email, password: a.password });
    assert.equal((await prove(challenge.data.message, secondSession.data.sessionToken)).status, 400); ok('different session rejected');
    await pool.query("UPDATE wallet_link_challenges SET expires_at=NOW()-INTERVAL '1 second' WHERE account_id=$1", [a.account._id]);
    assert.equal((await prove(challenge.data.message)).status, 400); ok('expired challenge rejected');
    const stale = await issue(); challenge = await issue();
    assert.equal((await prove(stale.data.message)).status, 400); ok('superseded challenge rejected');
    const results = await Promise.all([prove(challenge.data.message), prove(challenge.data.message)]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 400]); ok('valid proof accepted exactly once under concurrent replay');
    assert.equal((await prove(challenge.data.message)).status, 400); ok('replay rejected');
    assert.equal((await request('/auth/wallet', a.sessionToken)).data.wallet.address, address);
    assert.equal((await pool.query('SELECT address FROM account_wallets WHERE account_id=$1', [a.account._id])).rows[0].address, address); ok('link persisted in PostgreSQL');
    const other = await request('/auth/wallet/challenge', b.sessionToken, { address });
    assert.equal((await prove(other.data.message, b.sessionToken)).status, 409); ok('wallet cannot belong to two accounts');
    assert.equal((await request('/auth/wallet', b.sessionToken)).data.wallet, null); ok('failed claim does not change the other account');
    console.log(`${count} wallet integration checks passed. No RPC calls or real wallet used.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    // Only the accounts created by this test, in the fixed local test database.
    for (const id of accounts) await pool.query('DELETE FROM accounts WHERE id=$1', [id]);
    await pool.end();
});
