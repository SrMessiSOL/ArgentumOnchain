# Devnet security remediation - 2026-10-07

This release hardens the community test realm. It is not a completed independent audit or approval for mainnet assets.

## Implemented protections

- Durable, idempotent marketplace receipts and recovery journals, including exact claim IDs.
- Journal-before-send persistence with retries for disk failures while character operations remain locked.
- Hashed session and game-ticket credentials, 30-day absolute session expiry, and periodic active-session checks for game sockets.
- Recent authentication and pending-operation checks before changing an existing linked wallet.
- Explicit administrator account IDs, bounded authentication budgets, bcrypt cost 12 and UTF-8 password length validation.
- Socket admission limits, heartbeat checks, outbound buffer limits and fail-closed handling of malformed packets.
- Faction rewards committed with inventory and rank before memory or UI updates.
- Fair settlement recovery scans so unresolved older operations do not starve newer ones.
- Secure-cookie origin handling, browser security headers and slow-request URL redaction.
- Quiescent backups with isolated restore verification.
- Read-only operational health checks and an emergency pause for new settlement requests.

## Historical ledger correction

A read-only comparison found a historical SOL item-purchase entry in the gold ledger. That ledger must contain only token withdrawals and deposits. The migration preserves the original row in `gold_ledger_corrections` before removing it from gold accounting. It does not alter character gold, inventories, ownership or on-chain supply. A deferred database constraint validates future entries against completed gold operations. Runtime update/delete privileges on the ledger are removed. Back up before applying it.

## Dependency checks

Public dependency scans were explicitly authorized. Compatible updates include Next.js 16.3.8, axios 1.20.0, ws 8.22.0, Vitest 4.1.11 and pinned transitive patches in each pnpm-workspace.yaml. Commit lockfiles with those settings.

The final scan reports zero advisories for the game server; the API still reports three moderate and one high, and the frontend one low, three moderate and one high. These are advisory counts, not confirmed exploitable paths. The remaining stream-json upgrade changes APIs used by jayson and requires a compatibility migration. Recommended bigint-buffer 1.1.6, Babel 7.29.1 and braces 3.0.4 were not available in the registry when checked. No advisories were suppressed. Native bigint-buffer builds are disabled, but that is not a replacement for resolving the advisory.

## Validation

The isolated API regression suite passes 64 tests covering gold-ledger integrity, marketplace receipts, sessions, wallet changes, assets, gold settlement, character/vault receipts, recovery fairness, authentication budgets, finality and the emergency pause. It creates and drops only explicitly named temporary databases; never point integration tests at the live realm.

The server security suite passes journal failure/replay tests, connection-budget boundaries and staged faction rewards. API and server TypeScript checks pass. The frontend production build must pass before activation.

Run `security:health` in the API for a read-only database/journal report; add `--chain` for chain supply and stake checks. The report does not automatically repair or delete data and does not prove full escrow reconciliation.

## Incident procedure

1. Set `AOWEB_SETTLEMENT_PAUSED=1` for the API and restart it. This blocks new preparation, submission, listing and cosmetic claims; recovery/status and cancellation remain available. An already signed transaction may still be broadcast externally: a server pause cannot revoke it.
2. Capture the read-only health report, protected logs and operation IDs. Do not publish credentials or player data.
3. Stop the game and API after a world save, then create and verify a quiescent backup. Preserve all four journal directories and signer configuration securely.
4. Reconcile confirmed transactions against their original operation before any repair. Never delete a pending reservation or retry a mint blindly.
5. Restore into an isolated database first. Resume only after ledger, snapshot, ownership and receipt checks pass and the incident cause is fixed.

## Remaining work before broader release

- Isolate signer custody and service identities; replace broad shared internal authorization with narrower capabilities and rotate credentials during deployment.
- Discover externally broadcast transactions when a client never reports them; prove replay-safe recovery for those cases.
- Complete wallet-change recovery policy, verified email, administrator MFA and session management/revocation UI.
- Extend endpoint budgets, parser/business-logic fuzzing and durable handling of volatile PvP/reward state.
- Add audited repair procedures, storage quotas, journal archival, alerts, full asset/escrow reconciliation and off-host encrypted backups.
- Complete the browser script policy, stable domain/origin configuration and structured security event retention.
- Run 100-player load, outage/restore and real-wallet lifecycle rehearsals on the intended host; obtain an independent security review.

These items remain open. Passing the tests above does not establish 100-player capacity or production readiness.

## Follow-up: wallet replacement and ban revocation

Wallet replacement now requires valid signatures from both the currently linked wallet and the proposed replacement over the same account/session/origin-bound, expiring challenge. Recent authentication still applies. Staked characters, active gameplay, pending transfers and active listings block replacement. A successful replacement revokes other account sessions and all outstanding game tickets; the approving session remains active. Wallet challenge and verification requests each have an account-level budget of ten attempts per minute.

First-time linking and reverifying the same wallet retain their existing one-wallet flow. The website reconnects the original linked wallet; this change does not add an automatic lost-wallet recovery or a two-wallet replacement UI. Accounts without access to the original wallet cannot bypass this policy through a replacement proof from a new wallet alone. A reviewed recovery policy remains a release requirement.

The active game-session check now rejects new character bans, character IP bans and bans associated with the same stored IP. Existing game sockets use the periodic check (approximately 30 seconds); this is not immediate push revocation. Expired bans no longer block the check.

Validation: 70 isolated API security tests passed, including missing/wrong/stale previous-wallet signatures, replay, recent-auth expiry, protected staking state, other-session revocation, first/same-wallet linking, verification budgets, concurrent replacement retries, and ban/expired-ban cases. No live wallet signatures or asset transfers were performed. End-to-end stolen-socket rehearsal and full account recovery remain open.
