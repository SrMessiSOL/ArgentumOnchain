# English-first and Solana implementation

Base: the existing AOWeb fork and its shared authoritative world. Preserve Spanish, character IDs, gameplay balance, maps and saves. No destructive migrations.

1. Shared locale catalog, English default, Spanish selector, account preference and SSR cookie. Migrate player-facing entry screens and core HUD incrementally. Content and server messages require a separate coverage audit; partial coverage must never be called a complete translation.
2. Devnet-only Explorer badge: eligibility derives from server-persisted character progress, not client assertions. Optional linked wallet. One claim per account/season; deterministic asset address and resumable issuance. Verify network, asset identity and current ownership before allowing cosmetic use. No stat boost.
3. Test translation persistence/fallback and unauthorized/replayed/concurrent claims. Verify a real devnet mint separately from local tests; human wallet approval remains a final end-to-end check.

Realtime movement/combat remains off-chain. Currency, marketplace, mainnet and monetization are later milestones. Temporary public hosting continues on this PC.
