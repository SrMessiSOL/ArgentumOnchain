# Character marketplace and SPL gold — devnet

Public page: https://double-test-audience-examinations.trycloudflare.com/character-market

Follow-up purchase fix: public devnet returned HTTP 429 during unsigned transaction preparation. The API now retries up to three times with bounded backoff and caches the verified devnet genesis for five minutes, sharing concurrent verification. Three focused RPC tests passed, along with two signing/policy tests and the production build. Live unsigned preparation using the observed buyer/seller public addresses succeeded without signing, broadcasting or reserving the listed character. The frontend reports devnet throttling explicitly. Active build is now `character-economy-20261005-v6`, `.next-public-next`.

Second follow-up: retries alone did not eliminate intermittent primary throttling. The API now falls back to Tatum's public devnet gateway only after exhausted HTTP 429 retries. Each fallback is genesis-verified before use, preserves exact signed transaction bytes and enforces the observed five-requests-per-minute free allowance, including verification calls. Eight focused tests passed (six transport and two signature/policy tests), and API TypeScript passed. [DEVNET-RPC-FALLBACK-VALIDATION.json](DEVNET-RPC-FALLBACK-VALIDATION.json) records real fallback genesis, blockhash and finalized historical purchase-receipt checks under simulated primary HTTP 429; no transaction was signed or sent. Both public providers may still rate-limit; this is a bounded improvement, not a dedicated RPC availability guarantee. Tatum endpoint reference: https://docs.tatum.io/reference/rpc-solana.

The PC and temporary tunnel must remain running. Final frontend build: `character-economy-20261005-v5`, `.next-public-en`; game socket uses the existing `/game-socket` gateway route.

## Implemented behavior

- Logged-out characters can be listed, cancelled and purchased with test SOL. Listing locks gameplay, deletion, inventory and bank mutations. Login leases and account checks prevent connection/transfer races.
- Sale changes the character's account owner while preserving character ID, inventory/equipment, personal bank, gold, progression, spells, settings, achievements and selected title. Shared account and clan vaults are excluded. Clan members, privileged/banned characters and characters with outstanding item-market obligations cannot be listed.
- Achievements are earned and selected per character. They cannot be transferred separately and follow the character on sale. The legacy NFT records remain preserved; they grant no character title rights in the enabled character-achievement mode.
- Gold remains off-chain during gameplay. Withdrawal reserves game gold before minting SPL; deposit burns SPL before crediting game gold. Conversion is 1:1 in whole units, with transaction fees paid in test SOL.
- Exact transaction messages and signed bytes are persisted before broadcast. Reconciliation settles once after finalized receipts; failures and expired transactions release reservations or refund withdrawals. Repeated submissions do not create another settlement.

Mint: `8ZRpbVW8oJCnZpqjEyQEbFky53CoHqoiPVj7HJy8eo5k` (Solana devnet, classic SPL Token, zero decimals, no freeze authority).

## Evidence

Nine API tests passed against an isolated PostgreSQL database: intact bundle/title transfer, mutation locks, eligibility, pending/expired purchases, withdrawal reservation, refund and deposit idempotency, ownership/overflow checks, real connection guards, exact-message signatures and amount boundaries. Production compilation and TypeScript checks passed; the complete English regression gate passed, including packet decoding and character-specific crest binding.

[DEVNET-ECONOMY-RECEIPT.json](DEVNET-ECONOMY-RECEIPT.json) records real finalized withdrawal of two tokens, burn deposit of two tokens, game gold restored from 8 to 8, and a test character sale/return. Dedicated disposable devnet wallets received 0.01 test SOL each; no personal wallet was signed by the agent.

[DEVNET-BUNDLE-RECEIPT.json](DEVNET-BUNDLE-RECEIPT.json) records another real sale/return with the identical SHA-256 hash of persisted character fields and child tables before sale, with the buyer and after return. This live character had nine inventory rows and empty bank/spell/achievement/title/settings tables; populated bank, spells and titles were additionally verified in the isolated database tests.

Browser checks covered English and Spanish labels, listing/cancellation, localized inventory previews, completed receipts, earned character titles and in-game console inspection. The returned Tunnelwalker reconnected successfully on the final v5 build with all nine inventory rows visible, then logged out normally. Phantom's interactive transaction approval was not exercised: live chain transactions used dedicated local test keys. A manual Phantom rehearsal remains necessary before calling that wallet UI validated.

## Boundaries

Phantom signing compatibility follow-up: purchases/deposits had neither existing signatures nor compute-budget instructions, making them eligible for Phantom's automatic fee additions. Those additions violate the intentionally exact saved-message check. Preparation now includes a 200,000-CU limit and 1,000 micro-lamports/CU price (200 lamports priority fee) before wallet approval. Existing issuer-signed withdrawals already prevented this automatic rewriting. Exact-message, payer and signature checks remain enforced; tests reject subsequent priority-fee changes as well as payment tampering. Nine focused transport/signature/policy tests and API TypeScript passed. The rejected unsigned purchase expired normally and the SrMessi listing returned to `listed`; a fresh user Phantom approval remains the end-to-end confirmation. Reference: https://docs.phantom.com/developer-powertools/solana-priority-fees.

This is a devnet, game-server-operated marketplace and trusted mint/burn bridge. Character ownership is settled in the game database; it is not an independently transferable character NFT or a trustless escrow program. Gameplay movement and combat stay off-chain. Mainnet, capacity testing and a security audit are outside this release.

Recovery currently relies on devnet RPC signature history plus finalized block-height expiry. Before production, add archival receipt verification/manual quarantine for old missing signatures, operator recovery tooling, mint-authority governance and reconciliation monitoring. Do not interpret a long outage with pruned history as production-safe automatic recovery.

Schema changes were additive and preceded by a realm save and local database backup. The character-achievement cutover is gated by `AOWEB_CHARACTER_ACHIEVEMENTS`; legacy handlers and records are preserved for rollback. The final test character was returned to its original account.
