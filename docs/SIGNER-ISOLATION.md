# Signer isolation preparation

Status: **preparation code only; custody gate remains open**. No signer service is installed or activated. No realm authority was created, no live transaction was signed, and nothing was broadcast. Hosted API guards still require settlement paused and refuse authority files.

The new `api/src/signer/` code starts a loopback-only, separately authenticated service in disabled mode. Its startup policy accepts only `AOWEB_SIGNER_ENABLED=0`, a dedicated `aoweb_signer_reader` role and positive limits. API/game credentials and cosmetic issuer configuration are refused. Startup rejects privileged role attributes, role memberships and writable public tables/columns. Health is authenticated; every other request returns 503. The signing core is deliberately not exposed by HTTP.

The gold policy reconstructs the entire Solana message from committed intent fields, issuer public key, configured mint and reserved sale state. It checks linked wallet, character ownership/lock, disconnected state, sale reservation/price, action and amount limits. It rejects tokenized character purchases. Existing exact-message/wallet-signature validation adds issuer approval only after these checks. Exclusive journal creation and fsync occur before return; retries must match all receipt fields. Incomplete/conflicting records fail closed. The core checks devnet through the existing bounded RPC transport and rejects expired validity heights. It has no broadcast operation.

`api/signer-reader-schema.sql` is an additive manual NOLOGIN role preparation for the fresh database. It grants only required tables/columns. It is not part of automatic migrations and has not been applied to the live database. Protected local provisioning must supply eventual credentials and service identity; never put credentials in chat or Git.

Validation: API TypeScript compilation and `node api/scripts/signer-policy.test.cjs` pass from the repository root with compiled API output. Tests use ephemeral offline fixture keys with no RPC/broadcast, covering valid approval, missing wallet proof, amount/wallet/lock/state tampering, extra instructions, receipt conflicts, partial journal files and forbidden startup configurations. PostgreSQL role/query integration is not yet tested.

Before activation:

- Implement character/item and cosmetic policies, deriving asset public identities inside the signer without returning secrets. Preserve existing addresses and exact messages.
- Test committed-state reads and concurrent/restart/reconciliation behavior. API submission holds a row lock; signer reads must not wait for that same transaction.
- Add a signer-owned durable issuance/supply budget. Per-operation ceilings do not prevent repeated issuance through a compromised API database writer. Reservation fields are consistency evidence, not an independent trust boundary.
- Add a bounded authenticated API client and narrowly defined HTTP routes, preserving API signed-byte persistence before broadcast. Never add a generic signing endpoint.
- Provision a separate Windows identity: authority/config read-only, own journals/logs writable, keys and signer journal inaccessible to API/game. Verify ACLs and recovery.
- Test reader privileges in disposable PostgreSQL and include receipts in encrypted backups with isolated restore verification.
- Complete authorized devnet wallet/lost-response/provider/restart tests and independent review before opening testing.

Do not relax disabled startup merely to pass a health check.
