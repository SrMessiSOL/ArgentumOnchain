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
