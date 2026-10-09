# Fresh Windows devnet custody preparation

This is preparation for the authorized **new realm**, not migration or replacement of another realm. The Windows helper is deliberately fixed to the protected `C:\ProgramData\AOCHAIN\new-realm\services\signer` installation. Workspace operator scripts remain host-specific; they are not portable installers.

## Evidence and limits

The guarded API/game update passed, as did eight loopback players for ten minutes, combat/inventory/API-outage recovery and the existing database regression battery. Fresh devnet issuer and mint account keys have now been created locally. An authenticated physical PostgreSQL restore also verified both exact custody key files. The public cosmetic metadata and closed Vercel proxy diagnostic returned HTTP 200; the diagnostic reported `gatewayClosed: true`.

The mint account was absent at the last finalized RPC observation. Its original signed preparation remains preserved. The signer remains disabled until the protected activation script verifies its configuration and startup. New activation, mint preparation and local-only settlement guards passed offline tests; these are not evidence of live NFT/token settlement or Phantom/Solflare browser tests. Cloud freshness, separate recovery-key availability, external alerts, physical backup under actual gameplay and real external-player verification remain separate gates. Public testing is **not approved**.

## Signing ownership

Players sign their character and item transactions with their own wallets. The server independently approves the exact committed intent and adds the isolated authority signature; the API durably records the resulting bytes before broadcasting. Cosmetic issuance uses the issuer as fee payer after linked-wallet and eligibility checks. The realm's SPL mint is created once under protected custody; its address is public, its authority key is never mounted in the API or frontend. All operations are restricted to devnet; no real SOL or mainnet transaction is requested.

## Bootstrap transaction recovery

`api/scripts/provision-devnet.cjs` checks the devnet genesis, preserves existing keys and validates an existing mint's zero decimals, matching mint authority and absent freeze authority. The initial signed mint transaction is fsynced before sending. A small authenticated encrypted supplement is prepared immediately before broadcast; the full physical snapshot follows finalization so it does not consume the short blockhash validity window.

If an attempt has expired at finalized block height, no successful/pending signature is known, and the mint is still absent at finalized commitment, a new bootstrap attempt may be appended. All old signed attempt files remain immutable. Existing authorities are never regenerated. This policy is limited to the fresh mint bootstrap; it does not reset game operations, signer budgets, escrow or runtime journals. An ambiguous receipt preserves the attempt and blocks renewal.

## Activation boundary

The ordinary `dist/signer/service.js` entry remains disabled-only. The separate `dist/signer/activation.js` entry requires existing protected keys, journal and budget directories, HTTPS metadata configuration, positive lifetime issuance ceilings, exact loopback reader credentials and a finalized mint/genesis check. It binds only the reviewed committed-intent asset, economy and cosmetic handlers. It never broadcasts and cannot accept arbitrary signing requests. Startup failure closes the database pool.

Protected activation provisions a dedicated reader login while preserving read-only privileges; the service independently rejects memberships, schema/database creation and table/column write grants. Failed activation stops/disables the signer and attempts to revoke that reader login. Recovery must include the credentials, keys, signed attempts, journals and lifetime budget reservations together.

## Private browser rehearsal before external players

The prepared local client uses its own restricted service identity and loopback port 3200, a separate standalone Next build, local origin/cookies, and no operations, game, signer or Vercel proxy credential. It talks directly to the loopback API. The API's private-wallet mode permits local settlement but rejects new settlement requests bearing forwarded client identity; existing recovery checks remain available. The public gateway remains disabled.

An explicit metadata-only switch may expose only an exact UUID GET for public NFT metadata while gameplay stays closed. It strips all credentials, limits concurrency and request rate, bounds response size and timeout, and does not forward internal/auth routes. This switch has passed loopback tests but still requires protected deployment and external verification.

Real wallet and two-computer acceptance cases are in [DEVNET-WALLET-REHEARSAL.md](DEVNET-WALLET-REHEARSAL.md). Browser wallet signatures must be reviewed locally by the owner; recovery phrases and private keys never enter chat. Public deployment and testing remain separate from source implementation, installation, local health and simulations.
