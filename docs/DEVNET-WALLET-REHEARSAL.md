# Real devnet wallet and external-player verification

Current state: public gameplay closed; the devnet SPL mint is finalized, the restricted loopback signer is active, and the local wallet API/client have passed health checks. Real-wallet NFT/SPL lifecycle and external-player checks remain pending. Cosmetics have been removed from the active product and are excluded from this rehearsal. Historical database records and issuance journals must be preserved. Do not use fixture ownership bypasses in the live realm.

The owner authorized devnet signing and transactions. This does not authorize mainnet, replacement of existing authorities or paid funding. Existing addresses, signed bytes, journals and pending reservations must survive retries and restoration. Private keys, recovery keys, operation tokens and OAuth credentials never enter this document or chat.

## Prerequisites for wallet transactions

- Finish the grouped host verification and additive receipt/reader migration. Verify deployed code hashes, signer identity and read-only database permissions.
- Provision protected custody for the fresh realm without replacing any existing authority. Verify key/config ACLs, independent lifetime issuance budgets, durable signer receipts and their authenticated backup/restore.
- Check devnet genesis and the actual SPL mint authority/zero decimals/no freeze authority. Record public issuer/mint addresses only. Mainnet must remain rejected.
- Verify HTTPS dynamic character/item metadata URLs from outside the host without exposing internal API routes or credentials.
- Obtain a current authenticated off-host archive and separate recovery-key availability. Verify external alert delivery and the physical snapshot while gameplay is active.
- Authorize a small controlled test window only after the required gate checks pass. A passed simulation is not permission to open gameplay.

## Transaction cases with two real wallets

Use two test wallets on devnet. Connect and sign through each wallet's own UI; never enter recovery phrases or secret keys into scripts or chat. Record account/character/operation IDs, public addresses, expected amounts, transaction signatures and finalized results in a local receipt.

1. Link wallet A with the exact server-issued message. Verify replay, another account and wallet replacement without both required proofs are rejected.
2. Mint and stake A's character. Verify the correct Core owner/delegates, finalized status, one off-chain character and playable ownership. Unstake, transfer to wallet B and verify A loses access while B can claim/stake the same NFT.
3. Export an item and import it once. Check the recorded quantity, matching Core receipt, single burn and exact inventory change. Repeating confirmation must not duplicate items.
4. Withdraw and deposit a small recorded amount of SPL gold. Check the exact wallet/ledger changes after finalized confirmation and retry confirmation without duplicate credit/debit.
5. Sell an unstaked character to wallet B. Verify seller payment and NFT delivery share one signature, the reserved seller/price cannot change, and ownership/off-chain settlement reconcile once after finalization. A frozen NFT or wrong delegate must be rejected.

## Evidence from the first private wallet test

On 2026-10-09 the owner reported successful character mint and SPL withdrawal through the localhost client. Independent finalized devnet reads confirmed wallet `F2DJNRx97R1yBwUDgRGKv4NTyjD4uMVY5RUPiTudacji` owns Core asset `4uUZviXvmQXNqt9CYumkSWv2YK2mAPpoVwvY5u2T2ocH`, named `AOCHAIN · Testing`, with the existing realm issuer as update authority. The same wallet holds 1 unit, with zero decimals, of realm SPL mint `AUQHJMMBKst7aAyqSni1Hx7qwSjdP3jgjWLwJenc5tsy`. These checks verify ownership and token balance; they do not certify deposit, transfer, item export/import, marketplace settlement, outage recovery or external multiplayer.

Ordinary NPC shop items are eligible for NFT export and marketplace escrow. Newbie items and gold objects remain restricted. Equipped items must be unequipped, and authoritative inventory quantities, session ownership and operation reservations still apply.

## Outage and recovery acceptance

Use controlled failures in the test environment. Drop a signer/API/provider response after durable recording, restart the appropriate service and confirm the original signed bytes/signature remain unchanged. A finalized operation is reconciled rather than signed again. Expired or ambiguous operations retain reservations for review; there is no automatic reset/refund.

Restore an authenticated off-host copy in isolation with public access and broadcasting disabled. Verify database and signer journal/budget identities together, pending records, inventory/gold and independent recovery-key access. Reconcile against finalized devnet state before any resumed broadcast. Never point a restore fixture at the live database or regenerate authority keys to make it start.

## External gameplay acceptance

After gate approval, use the Vercel origin from two separate computers/wallets against the same authoritative server. Test simultaneous movement, NPC combat, inventory, save/reconnect, one interrupted client and provider throttling. Record connection counts, observed latency, disconnects and persistence results. Loopback eight-client soak evidence is separate from WAN results and does not certify 100-player capacity.
