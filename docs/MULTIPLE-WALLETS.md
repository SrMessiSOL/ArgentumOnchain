# Multiple linked wallets

An account can retain up to five verified Solana addresses. `account_wallets` remains its single active settlement address; `account_linked_wallets` records membership without changing character, asset, listing, staking or transaction ownership. One address cannot belong to two accounts.

Adding a different address requires a login less than ten minutes old and signatures by the new and currently active wallets over the exact same account/session/origin/nonce/expiry-bound message. Proofs expire in two minutes and are consumed transactionally. Account locks serialize membership changes and the limit; a unique address constraint arbitrates competing accounts.

Activation uses the existing replacement guard: both wallets sign; active gameplay, staking, pending signed/prepared operations and active listings block the change. Other sessions and game tickets are revoked. Previously linked addresses remain recorded. Membership alone never grants on-chain ownership or makes inactive-wallet assets usable by the active wallet. This version does not unlink wallets or support concurrent settlement from different wallets of one account.

Existing addresses are backfilled additively. Install the schema and runtime grants before deploying wallet routes, then deploy the frontend. Rollback may restore old routes while preserving the additional membership table. No asset operation or signed journal should be reset for this feature.

The wallet page provides separate add and activate actions. Approving an addition leaves the original active address unchanged. After activation, reconnect the newly active address before submitting asset transactions.
