# Signer isolation preparation

Status: **isolated identity installed and audited, but disabled; custody activation remains open**. The live reader is NOLOGIN. No realm authority was created, no live transaction was signed, and nothing was broadcast. Hosted API guards still require settlement paused and refuse authority files.

The new `api/src/signer/` code starts a loopback-only, separately authenticated service in disabled mode. Its startup policy accepts only `AOWEB_SIGNER_ENABLED=0`, a dedicated `aoweb_signer_reader` role and positive limits. API/game credentials and cosmetic issuer configuration are refused. Startup rejects privileged role attributes, role memberships and writable public tables/columns. Health is authenticated; every other request returns 503. The signing core is deliberately not exposed by HTTP.

The gold policy reconstructs the entire Solana message from committed intent fields, issuer public key, configured mint and reserved sale state. It checks linked wallet, character ownership/lock, disconnected state, sale reservation/price, action and amount limits. Tokenized character purchases now use a separate committed-state policy that reconstructs payment and delegated NFT delivery together. Existing exact-message/wallet-signature validation adds issuer approval only after these checks. Exclusive journal creation and fsync occur before return; retries must match all receipt fields. Incomplete/conflicting records fail closed. The core checks devnet through the existing bounded RPC transport and rejects expired validity heights. It has no broadcast operation.

`api/signer-reader-schema.sql` is an additive manual NOLOGIN role preparation for the fresh database. It grants only required tables/columns. It is not part of automatic migrations. The original NOLOGIN grants were applied and audited; the new cosmetic grants remain pending. Protected local provisioning must supply eventual credentials and service identity; never put credentials in chat or Git.

Validation: API TypeScript compilation and `node api/scripts/signer-policy.test.cjs` pass from the repository root with compiled API output. Tests use ephemeral offline fixture keys with no RPC/broadcast, covering valid approval, missing wallet proof, amount/wallet/lock/state tampering, extra instructions, receipt conflicts, partial journal files and forbidden startup configurations. Disposable PostgreSQL signer-reader permission tests passed in the host regression receipt `host-regressions-20261008-000540`.

Before activation:

- Implement character/item and cosmetic policies, deriving asset public identities inside the signer without returning secrets. Preserve existing addresses and exact messages.
- Test committed-state reads and concurrent/restart/reconciliation behavior. API submission holds a row lock; signer reads must not wait for that same transaction.
- Add a signer-owned durable issuance/supply budget. Per-operation ceilings do not prevent repeated issuance through a compromised API database writer. Reservation fields are consistency evidence, not an independent trust boundary.
- Add a bounded authenticated API client and narrowly defined HTTP routes, preserving API signed-byte persistence before broadcast. Never add a generic signing endpoint.
- Provision a separate Windows identity: authority/config read-only, own journals/logs writable, keys and signer journal inaccessible to API/game. Verify ACLs and recovery.
- Test reader privileges in disposable PostgreSQL and include receipts in encrypted backups with isolated restore verification.
- Complete authorized devnet wallet/lost-response/provider/restart tests and independent review before opening testing.

Do not relax disabled startup merely to pass a health check.

## Asset and API preparation follow-up

Gold and asset routes now support an optional isolated signer client. NFT transaction preparation uses Umi no-op signers and public authority/asset identities; the API need not load an authority file in this mode. Local legacy paths remain for existing development fixtures. Hosted startup still refuses authority files and unpaused settlement, and validates separate signer credentials and loopback configuration. No isolated configuration has been activated on the host.

The client has four concurrent requests maximum, a five-second deadline, an 8 KiB response ceiling, no redirects and fixed route names. It checks returned operation ID, exact message, payer, all signatures and signature ID before the API's existing database transaction records bytes. Transport or validation failures preserve the reservation. The signing service still exposes no signing HTTP routes.

Asset approval preparation checks committed operation/asset/character/wallet state, metadata URI, snapshot references and chain ownership/delegates. It rebuilds the message at the wallet's original blockhash. Stake permits a transferred NFT's verified wallet owner rather than requiring the old off-chain account owner, and binds finalized on-chain snapshot attributes. Cosmetics now have isolated identity/signing routes, exact-message preparation, committed eligibility/supply checks and API signed-byte recording before broadcast. Tokenized character marketplace purchases now have a dedicated policy. These new paths have passed offline fixtures; their live deployment, additive SQL and real-wallet verification remain pending.

Signer-owned lifetime issuance reservations now limit gold withdrawals and asset/cosmetic counts independently of API-writable database records. They use an exclusive lock and durable per-operation record. No automatic refund/reset is allowed; an interrupted lock or malformed record fails closed. These budgets are wired into gold/asset signing cores, which remain unexposed. Operator provisioning, budget recovery/review, durable cosmetic signed bytes and replay/reconciliation integration are still required.

API compilation, gold policy/journal tests, asset/cosmetic/budget tests and a real loopback signer-client test pass using offline fixtures. A real Core SDK NFT preparation test succeeds with public keys only and no authority file. The expanded host runner passed all 15 checks, including signer-reader SQL permission tests and authenticated backup encryption. An encrypted local realm backup was restored into an isolated database with matching record counts. Off-host storage/retrieval remains unverified. The live services remain on their previous guarded build and public gameplay remains disabled.

## HTTP protocol preparation

`src/signer/http.ts` defines only asset identity, economy submission and asset submission routes with exact Bearer authentication, strict input schemas, a 4 KiB body limit and at most two concurrent handlers. It returns only public identity fields or explicit signed-receipt fields and suppresses private exception text. Loopback fixture tests cover authentication, disabled mode, unknown routes, malformed/oversized inputs and response field filtering. Production startup binds this handler with signing disabled and no hooks; enabling the environment is still rejected. These fixture routes are preparation, not an activated signer or evidence of live NFT transactions.
