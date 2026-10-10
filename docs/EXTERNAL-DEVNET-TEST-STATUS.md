# External devnet test status — 2026-10-10

The owner requested opening the fresh realm for external gameplay, NFTs and SPL testing. This supersedes the earlier closed-access deployment state; it does not mark the complete community release gate passed.

- Production frontend: https://argentum-onchain.vercel.app . Vercel deployment `EuBUTrdFZ2Yos6fYWBGSgDtBsojn` completed successfully from `87f047a`. `NEXT_PUBLIC_REALM_ENABLED=1` is a Production configuration value. `/play` no longer renders the preparation screen.
- The protected host gateway is enabled with a maximum of 100 simultaneous external connections and no automatic expiry, as requested. Admission tests accept 100 fixture sockets and reject socket 101. This does not establish capacity for 100 active players.
- External wallet operations use `AOWEB_EXTERNAL_DEVNET_TEST=1`, `AOWEB_PRIVATE_WALLET_TEST=0`, `AOWEB_SETTLEMENT_PAUSED=0` and the exact official devnet RPC URL. Hosted startup requires the isolated loopback signer, public mint and metadata configuration. API authority-file mounts remain forbidden; operations, game and signer credentials remain separate.
- Independent public probes confirmed authenticated proxy health with `gatewayClosed=false`. Unauthenticated requests to `/api/game-assets/prepare` and `/api/economy/prepare`, with the correct site origin, returned JSON HTTP 401. This verifies route access and session enforcement, not a successful wallet transaction.
- A real character mint and SPL withdrawal were previously reported by the owner and independently checked on devnet. External-player item export/import, staking/transfer, marketplace settlement and complete real-wallet recovery remain unverified.
- Online encrypted backup and isolated PostgreSQL WAL recovery previously passed. Latest off-host verification was blocked by Google `rateLimitExceeded` and preserved cooldown. A fresh successful cloud cycle, separately recoverable encryption key, independent restore and external alert delivery remain outstanding evidence.

Cosmetic frontend functionality has been removed. Historical accounts, assets, operations, keys and journals were preserved. The installed NPC vendor policy excludes newbie items and acquisition sources except the explicit worker-tool/potion policy.

## Operations

The intended Windows host uses restricted service identities and loopback PostgreSQL/API/game/signer listeners behind the HTTPS gateway. Keep the computer powered and connected. Do not forward internal ports through the router.

The local workspace's `outputs/Open-ExternalDevnetTest.ps1` performs the guarded activation with zero connected players, audited custody, protected configuration copies, dependency-aware service restart and rollback. `outputs/Close-ExternalDevnetTest.ps1` disables the gateway and restarts only it to disconnect existing external sockets. These are intended-host helpers dependent on the prepared workspace, not portable repository installers. They contain no replacement authority or database reset step.

Use wallets configured for Devnet. Measure latency, combat/NPC behavior, persistence, reconnects and provider throttling during the test. Do not describe this opening as a passed 100-player load benchmark or a mainnet release.
