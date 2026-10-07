# Community testing release gate

Status on 2026-10-07: **not approved for public testing yet**. Mainnet remains a later release. Passing local checks is evidence for those checks only.

| Area | Current evidence | Required before opening testing |
| --- | --- | --- |
| Settlement integrity | Exact-message wallet signatures, issuer approval before broadcast, durable signed bytes, finalized reconciliation, replay tests | Real-wallet mint/stake/withdraw/restake, item export/import, gold and sale lifecycle; lost-response/restart rehearsal |
| Authentication and sockets | Hashed credentials, absolute session lifetime, revocation/ban checks, bounded connections and validated packet shapes | Stolen-session/socket rehearsal; session revocation controls and account recovery policy |
| Internal permissions | Separate game and operations HTTP credentials; explicit game route/method list | Separate OS service identities and database roles; protected signer service and credential rotation on the deployment host |
| Chain capacity | Account request budgets, bounded shared RPC transport and batched wallet reads | Load test including provider throttling; monitoring/recovery behavior under sustained demand |
| State monitoring | Ledger/snapshot checks, stake checks, fail-on-error measured health report | Full escrow/supply baseline reconciliation, alerts and reviewed repair procedures |
| Backup and outage | World save plus quiescent backup successfully restored into isolated PostgreSQL | Encrypted off-host backup and restore on the deployment machine, including pending operations |
| Hosting | User reports Core i5-11400 and 32 GB RAM on the intended desktop | OS/access details, service installation, firewall/TLS/domain configuration, restart/power/network recovery, 100-player test |
| Dependencies and browser policy | Previous dependency scans and existing security headers | Resolve or document remaining advisories with verified mitigations; finalize script policy |
| Custody and review | API still reads dedicated test authority files | Authority isolation and independent security review before valuable mainnet assets |

Do not reset the realm or erase accounts to make a check pass. Keep ambiguous signed operations reserved; preserve journals, receipts and backup state. Use the emergency settlement pause during a settlement incident.

See [Security remediation](SECURITY-REMEDIATION.md) for implementation evidence and known limits, and [Operations](OPERATIONS.md) for recovery procedures. The intended desktop's capacity has not been measured.

## Intended host preparation receipt (2026-10-07)

See [host preparation](INTENDED-HOST-PREPARATION.md). Repository fetched at ebed12f; supported runtimes staged, system installation incomplete. Elevation/ACL and child-process restrictions blocked service setup and regression execution. ESU remains unverified. No realm migration or public deployment occurred. All existing release blockers remain open.

Preparation follow-up: hosted API startup policy tests passed, including checkout environment injection rejection; original server security tests passed through a test-only TypeScript compiler loader. A portable disposable-cluster regression runner is prepared. Host installation, standard full regressions, signer/database/service isolation and migration remain unverified; see the host receipt for exact limits.

## Fresh realm and Vercel preparation follow-up

The owner chose a new realm instead of migrating the old realm. The fresh database was provisioned on this Windows host with zero accounts/characters, PostgreSQL 16.15 on loopback and a dedicated virtual service identity, separate migration/runtime roles and protected credentials. System Node is 24.21.0. The disposable host regression receipt `host-regressions-20261007-194940` records all eleven checks passed and its test cluster stopped, including API/server security suites, English regressions and the complete frontend build. These supersede the earlier staging-only receipt above.

Latest other-computer changes were fetched at b34e1b7 before preparing Vercel hosting. The new backend gateway's local policy/integration tests pass for deny-by-default routing, identity-header stripping and origin/host checks. The frontend TypeScript check passes; the new local production build compiled, but its TypeScript worker was blocked by the Codex process sandbox (`spawn EPERM`), so the deployment build must supply complete verification. Vercel import still requires repository access. No API/game service activation, tunnel transfer, authorities, chain transactions or public gameplay occurred. See VERCEL-HOSTING.md.

Remaining: application service identities/recovery, authenticated remote client identity for budgets, signer isolation, verified Windows support/ESU, stable HTTPS/metadata, encrypted off-host restore, real-wallet lifecycle and actual gameplay load/outage tests. The old realm and its pending operations remain untouched.

## Installed host and closed deployment follow-up

This receipt supersedes the earlier service/deployment preparation statements: PostgreSQL, API, game and gateway are installed and running under separate virtual service identities. API/game local health checks pass. Startup/recovery is configured, but a controlled restart/power/network rehearsal remains outstanding. NPC cooldowns and per-map NPC overrides now live in protected writable runtime storage; game code remains read-only. Empty overrides retain tombstones so removed NPCs do not reappear from template fallback. The storage regression passes.

Vercel production deployed frontend commit `6ea74fa` successfully at `https://argentum-onchain.vercel.app`. Gameplay remains disabled. Production connects through a temporary HTTPS tunnel to this host's disabled gateway: direct gateway and frontend proxy checks return HTTP 503. The temporary tunnel is a foreground process, changes hostname on restart and does not satisfy stable hosting or metadata requirements. No router ports were forwarded.

The fresh realm is provisioned; the previous realm was not migrated. No blockchain authorities were created and no transactions were signed or broadcast. API signer custody remains unfinished: current chain modules still load authority secrets in the API process. A signer must enforce operation-specific policy and preserve exact-message verification, durable signed-byte recording and finalized reconciliation; an unrestricted remote signing endpoint would not close this gate.

Still required: verified ESU or supported OS, authenticated client identity forwarding, signer custody, encrypted off-host backup with isolated restore (including pending journals and NPC state), stable backend origin/metadata, wallet lifecycle and actual combat/NPC/inventory/persistence/reconnect/provider-throttling load and outage tests. No gameplay capacity is claimed. Installed services and a deployed frontend do not approve public testing.

The owner subsequently ran the private host check elevated: service, HTTP, loopback-listener and storage checks passed (21.6 GiB free). ESU and gameplay capacity remain unverified. Gold signer policy/journal preparation compiles and passes offline tampering/retry tests; its service rejects activation and has no signing HTTP route. It is not installed, connected to the API or custody-approved. See [signer isolation preparation](SIGNER-ISOLATION.md).

Further preparation adds public-key-only NFT construction, optional isolated API submission, asset/cosmetic policy checks and signer-owned lifetime issuance budgets. Their offline and real loopback-client regressions pass. None is activated on the live host; signer HTTP issuance, tokenized-sale/cosmetic integration and production custody verification remain open. Encrypted backup/isolated restore tools are prepared, the first attempt stopped safely, and the retry created an authenticated encrypted local backup with services recovered; no database restore or off-host copy is verified yet. The owner has no cloud backup account yet. See [private recovery](PRIVATE-REALM-RECOVERY.md). Do not enable testing from another computer on the basis of these preparation tests.
