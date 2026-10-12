# Ranked character integration and deployment handoff

## Implemented behavior

Profile → Ranked PvP opens `/ranked`. Players choose an owned, staked character; the API reuses `assertPlayableCharacter` to check actual Solana custody/stake and linked-account ownership, takes an exclusive `characters.economy_lock`, saves a fenced snapshot and invalidates unused realm login tickets. The existing game connection and asset/economy operations respect that lock. Account cookies remain in the portal; only a short-lived regional admission is sent to the exact configured arena iframe origin.

The regional server checks both sockets below 100 ms RTT to the same server, and transitions both reservations to playing through signed worker RPC before starting combat. It runs temporary level-50 stats, class-specific source newbie gear and duel-valid spells. Persistent level, gold, spells, inventory and personal bank do not change. No new character NFT or second gold ledger is created. Combat needs no RPC or wallet prompt.

`ranked_matches.id` is unique. Terminal receipt insertion, session completion and both matching lock releases occur in one SQL transaction. Replaying the same semantic receipt succeeds without another application; conflicting results fail. Receipt hashes canonicalize object keys so JSONB/recovery does not change identity. Old receipts cannot release newer reservations. Gold and rating rewards are disabled.

Queue cancellation/disconnection and expired queued admissions unlock safely. Active sessions cannot be cancelled through the portal or expired by the queue timer. A worker journal exists before start and a durable outbox precedes completion notifications. Unavailable delivery retries while preserving locks. Worker restart or runner interruption resolves an unfinished match as an interrupted draw; if start never committed, only queued locks are released. Lost/corrupted journal storage requires operator investigation. The worker must retain its work volume and run as one instance for that region; HMAC authorization trusts the operator rather than proving combat cryptographically.

## Deploy on the server computer

1. Back up the existing database/configuration and pull this repository plus the paired AOCHAIN commit. Install/build using the existing release process. `api/src/migrate.ts` applies the additive `api/ranked-schema.sql`; no existing character bundle is reset. Stage this against a database copy before restarting the live service.
2. Provision each AOCHAIN regional worker behind HTTPS/WSS. Use a distinct random secret of at least 32 characters per region. The worker has no mint/burn signing key. Keep `/app/arena/work` persistent, writable only by its service user, and backed up.
3. Set API `RANKED_REGIONS_JSON` to a server-only JSON object such as `{"eu":{"url":"https://arena-eu.example","secret":"INJECT_A_UNIQUE_REGIONAL_SECRET"}}`. Use actual provisioned origins, not the example. Set the same secret in worker `ASSET_ADMISSION_SECRET`, with matching `REGION_ID`, exact `PUBLIC_ORIGIN`, and `PORTAL_ORIGINS=https://argentum-onchain.vercel.app`. Configure all approved portal origins explicitly; no wildcard frames or sockets.
4. Prefer a private TLS connection from the worker to `/internal/ranked`. If using the existing public backend tunnel, enable **only** `rankedBridgeEnabled:true` in its protected gateway JSON and set worker `ASSET_SERVICE_URL=https://YOUR_BACKEND/region-api/ranked`. This opt-in bridge allows only start/renew/release/finish, strips player credentials, caps payloads at 64 KiB and limits concurrency. It also respects the gateway's enabled/testing window. API region HMAC, timestamp and persisted nonce validation remains mandatory. Do not expose general internal/admin routes or relax the Vercel proxy proof.
5. Deploy the portal changes on Vercel and API/gateway changes on the server computer. The profile entry is hidden until Vercel `NEXT_PUBLIC_RANKED_ENABLED=1` is set and the frontend rebuilt; enable it only after the API/regions are ready. Test two real linked wallets and owned staked characters. Verify they cannot simultaneously log into the realm, list, unstake, withdraw items or gold while reserved; confirm cancellation, Forfeit, normal defeat, duplicate delivery and worker restart. Watch the stored match UUID and both lock IDs rather than clearing locks manually.

Pulling or pushing source is not deployment of the API/gateway on the other computer. No live database migration, regional endpoint activation or real wallet transaction was performed in this implementation.

## Reproduce local validation

The paired repos should be siblings, with arena dependencies installed. From `api` on Windows:

```powershell
$env:AOCHAIN_ARENA_ROOT=(Resolve-Path ../../aochain).Path
pnpm exec vitest run src/tests/ranked-lifecycle.test.ts
pnpm exec tsc --noEmit
```

From this repository root: `node --test scripts/backend-gateway.test.cjs`. From AOCHAIN root: `node --test arena/regional/pvp-engine.test.mjs arena/regional/asset-client.test.mjs arena/regional/policy.test.mjs arena/regional/asset-admission.test.mjs`.

Five lifecycle tests pass, including actual worker/WebSocket execution and killed-worker restart; stake verification is injected/mocked and PGlite fixture connections are serialized. Seven gateway tests pass. All 25 exported spell handlers execute, and preset tests cover all supported class/race pairs. The API type check and fresh portal production build pass. The browser demo verified level-50 gear, spell selection without auto-cast, self-targeted invisibility and Forfeit/result modal.

The broad API suite is **not** a green release check here: integration suites require a running isolated API/PostgreSQL database absent on this computer, three vendor scripts are not Vitest suites, and the wallet-inventory mocks omit `fetchGameAssets` after existing API changes. Those unrelated files were not changed. Native PostgreSQL concurrency, real NFT/stake checks, original Argentum combat parity, regional WAN latency/jitter, reconnect/resume and 100-player load remain public-release gates. PvE, equipment progression and economic/rating rewards are deferred.
