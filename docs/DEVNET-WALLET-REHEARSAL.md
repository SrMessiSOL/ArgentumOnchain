# Real devnet wallet and external-player verification

Current state: public gameplay closed, settlement paused, installed signer disabled and reader NOLOGIN. The isolated cosmetic and tokenized-character purchase code is implemented and passes offline SDK/HTTP/recovery fixtures. Its additive SQL, production deployment, custody activation and real-chain lifecycle have not passed yet. Do not use fixture ownership bypasses in the live realm.

The owner authorized devnet signing and transactions. This does not authorize mainnet, replacement of existing authorities or paid funding. Existing addresses, signed bytes, journals and pending reservations must survive retries and restoration. Private keys, recovery keys, operation tokens and OAuth credentials never enter this document or chat.

## Prerequisites for wallet transactions

- Finish the grouped host verification and additive receipt/reader migration. Verify deployed code hashes, signer identity and read-only database permissions.
- Provision protected custody for the fresh realm without replacing any existing authority. Verify key/config ACLs, independent lifetime issuance budgets, durable signer receipts and their authenticated backup/restore.
- Check devnet genesis and the actual SPL mint authority/zero decimals/no freeze authority. Record public issuer/mint addresses only. Mainnet must remain rejected.
- Verify HTTPS metadata URLs from outside the host. Cosmetic metadata and dynamic character/item metadata must remain readable without exposing internal API routes or credentials.
- Obtain a current authenticated off-host archive and separate recovery-key availability. Verify external alert delivery and the physical snapshot while gameplay is active.
- Authorize a small controlled test window only after the required gate checks pass. A passed simulation is not permission to open gameplay.

## Transaction cases with two real wallets

Use two test wallets on devnet. Connect and sign through each wallet's own UI; never enter recovery phrases or secret keys into scripts or chat. Record account/character/operation IDs, public addresses, expected amounts, transaction signatures and finalized results in a local receipt.

1. Link wallet A with the exact server-issued message. Verify replay, another account and wallet replacement without both required proofs are rejected.
2. Mint and stake A's character. Verify the correct Core owner/delegates, finalized status, one off-chain character and playable ownership. Unstake, transfer to wallet B and verify A loses access while B can claim/stake the same NFT.
3. Export an item and import it once. Check the recorded quantity, matching Core receipt, single burn and exact inventory change. Repeating confirmation must not duplicate items.
4. Withdraw and deposit a small recorded amount of SPL gold. Check the exact wallet/ledger changes after finalized confirmation and retry confirmation without duplicate credit/debit.
5. Claim Explorer/First Hunt only for eligible linked accounts. Verify deterministic address, issuer/owner/URI, durable signed bytes before broadcast and one permanent supply/budget reservation. Eligibility and supply-limit rejection are already offline cases; do not issue hundreds of real transactions to repeat them.
6. Sell an unstaked character to wallet B. Verify seller payment and NFT delivery share one signature, the reserved seller/price cannot change, and ownership/off-chain settlement reconcile once after finalization. A frozen NFT or wrong delegate must be rejected.

## Outage and recovery acceptance

Use controlled failures in the test environment. Drop a signer/API/provider response after durable recording, restart the appropriate service and confirm the original signed bytes/signature remain unchanged. A finalized operation is reconciled rather than signed again. Expired or ambiguous operations retain reservations for review; there is no automatic reset/refund.

Restore an authenticated off-host copy in isolation with public access and broadcasting disabled. Verify database and signer journal/budget identities together, pending records, inventory/gold and independent recovery-key access. Reconcile against finalized devnet state before any resumed broadcast. Never point a restore fixture at the live database or regenerate authority keys to make it start.

## External gameplay acceptance

After gate approval, use the Vercel origin from two separate computers/wallets against the same authoritative server. Test simultaneous movement, NPC combat, inventory, save/reconnect, one interrupted client and provider throttling. Record connection counts, observed latency, disconnects and persistence results. Loopback eight-client soak evidence is separate from WAN results and does not certify 100-player capacity.
