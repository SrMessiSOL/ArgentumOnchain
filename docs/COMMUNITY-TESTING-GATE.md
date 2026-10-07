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
