# Security

AOCHAIN currently targets Solana devnet. Test assets have no production-value guarantees.

Do not commit credentials, issuer keys, runtime journals, database backups or player records. Runtime secrets stay outside version control. Keep gameplay authoritative on the server and validate wallet authorization against the exact prepared transaction.

Security fixes must include relevant authorization, concurrency and failure-recovery tests. Never refund unknown blockchain outcomes or delete unresolved operation journals. Signed transactions without finalized proof stay pending for reconciliation.

The project is undergoing security hardening. Do not report sensitive exploit details in public issues; use a private channel with the repository owner. No dedicated security disclosure mailbox or independent audit is established yet.
