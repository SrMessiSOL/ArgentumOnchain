# Intended Windows host preparation — 2026-10-07

Public testing remains blocked. This is a preparation receipt, not a deployment receipt.

## Verified here

- Fetched owner fork: `ebed12fe59f3376bb38b1ebb1fdd03b6f997cf96`; clean checkout before edits; no tracked AGENTS.md.
- CPU i5-11400, 12 logical processors; 31.90 GiB RAM; approximately 30.44 GiB available during staging.
- Windows 10 Pro for Workstations 22H2, build 19045.6466. ESU entitlement and latest installed security update are unverified. Require supported Windows or verified active ESU and current updates before exposure. Do not upgrade the OS without owner approval.
- System Node remains 16.14.2. Workspace Node 24.21.0 runs; official archive SHA-256 and executable Authenticode validated. Signed MSI staged, not installed.
- pnpm 11.19.0 runs from an integrity-verified registry archive. It requires Node >=22.13. Retained the prior validated major rather than introducing pnpm 12 during host migration.
- PostgreSQL 16.15 official EDB binary archive staged; postgres --version verified. No realm cluster initialized. postgres.exe is unsigned; no independent EDB archive digest verification was available here.
- API/server TypeScript no-emit checks completed; production asset-copy checks recorded separately. Security suites were attempted but blocked at esbuild child-process spawn with EPERM; do not count them as passing.

## Host execution restrictions

CIM/Defender/storage administrative queries returned access denied. The process has a medium-integrity, non-elevated token. The owner approved UAC, but RunAs failed with 0xc0000142. ACL changes to the disposable database directory were denied. Initialization stopped before generating credentials or creating a database. No service identities, secrets, service registrations, firewall changes, or public deployment were completed. A prepared administrator setup must be run from an ordinary elevated host terminal and its receipt reviewed.

## Containment required before activating a migrated realm

Use separate unprivileged identities for frontend, API, game, PostgreSQL, signing and backup. Grant code read/execute, logs/journals write only as required. API/game/frontend must not read signer private files or backups. The API currently reads authorities directly: complete an authenticated signer service with validated operation/message policy and durable signing receipts before claiming custody isolation. Merely changing ACLs would break current settlement paths rather than isolate them safely.

Use separate migration-owner and runtime database roles. Runtime cannot create databases/roles, alter schemas or migrate. Set AOWEB_RUN_MIGRATIONS=0; startup must invoke dist/server.js directly because the current API start script executes migrations. Review grants table by table; keep ledger constraints and receipt privileges intact.

All backend listeners remain 127.0.0.1. Frontend production start is now explicitly loopback. A TLS gateway may expose only reviewed player routes and WebSocket upgrades. No router forwarding for PostgreSQL, internal API or game. Configure services with fixed executable/cwd/environment paths, automatic delayed startup, bounded restart backoff, protected logs and health alerts; test restart without resetting connected flags or journals blindly.

Generate independent operations and game-service tokens only after protected ACLs work. API GAME_SERVICE_TOKEN equals game TOKEN_AUTH; API TOKEN_AUTH differs. Frontend receives neither. Do not put secrets in service command lines, transcripts, Git, public build settings or chat.

## Private migration procedure

On the original computer, pause new settlements, drain players, save the world, then stop writers and recovery workers. Preserve ambiguous operations. Take a quiescent custom-format database dump and restore it in isolation before transfer. Under the original Windows user, decrypt DPAPI runtime bundles locally; copying DPAPI blobs alone will not make them recoverable here.

The encrypted package must contain:

1. The complete existing realm database, including accounts/characters/assets, snapshots, reservations, signed transaction records, ledgers, operation receipts and supplemental schemas; never substitute database/aoweb.sql.
2. Role/grant definitions reviewed for the destination, schema/migration versions, PostgreSQL version/encoding, and checkpoint timestamp.
3. All four complete journal trees: vault-operations, character-operations, world-operations, market-operations, including pending entries and exact operation IDs.
4. API .env, game .env, frontend private configuration, runtime configuration and every referenced issuer/gold authority file. Inventory actual referenced paths; the legacy backup script includes only the dedicated cosmetic issuer and must not be assumed to include the gold authority.
5. Existing mint/issuer addresses, devnet genesis policy, metadata URL mapping and content, gateway/origin configuration, RPC configuration, private mail configuration if used, protected operational logs needed for unresolved operations, and backup receipts.
6. A manifest with file sizes and SHA-256 hashes, table counts, pending-operation IDs/counts, snapshot/ledger health and chain supply/stake baseline. Keep this manifest private because it may contain player/operation data.

Encrypt the entire package with an authenticated portable format such as age using a destination recovery recipient generated locally after ACL protection. Keep its decryption identity offline separately. Transfer ciphertext through a private channel/offline media; never passwords or keys in chat. Verify recipient/decryption and manifest before the source is retired. Do not delete source state.

Restore into a new explicitly named candidate database on loopback. Rewrite paths, preserve authorities and IDs, rotate service credentials, apply reviewed additive migrations only after a new backup. Verify all journal hashes, table counts, receipts, reservations, snapshots, ledger and finalized chain baseline. Never run both source and destination writers. Select the candidate as the realm only after restore checks and controlled restart/outage rehearsals pass.

## Backup, monitoring and hosting acceptance

Choose an existing private off-host destination and stable domain with the owner. No paid provider has been selected. Encrypt database, journals and runtime configuration as one checkpoint; verify off-host decryption/restore on this host, including pending operations. Monitor failed backups, disk headroom, journal age/count, database health, RPC capacity/429s, restart loops and measured reconciliation failures. Alerts require an authorized destination. Retention deletion needs separate review.

Provide a stable TLS origin and immutable durable metadata paths before wallet rehearsals. Rebuild the frontend for that origin and verify CORS/cookies/WebSocket origin policy; moving metadata does not rewrite already minted URLs.

## Gameplay and outage acceptance

Run staged 10/25/50/100-player workloads only against an isolated restored test realm with disposable player wallets; signing/broadcast requires owner authorization. Include movement and crowded combat, NPC AI/respawns, spells, pickup/drop, merchants, bank/vault/inventory, trades, autosaves, logout/reconnect and persistence. Record p50/p95/p99 latency, tick delay, CPU/RAM/disk, DB locks/connections and RPC queue/429 behavior. Run sustained sessions and soak rather than only admission/idle sockets.

Rehearse API/game restart, network loss, database unavailability, power/reboot recovery, full-disk/journal write failure, RPC deadlines/429s and lost settlement responses in controlled disposable environments. Compare state/operation manifests before and after; no duplicated items/gold, missing receipts or unlocked ambiguous operations. Establish the safe player limit from measured results. No 100-player capacity claim is justified yet.

Follow-up fetch preserved owner commit 55956e0 (portal navigation/accessibility). Standalone faction-claim regression passed. Installer PowerShell syntax parsed without errors. No security-suite pass is claimed.

