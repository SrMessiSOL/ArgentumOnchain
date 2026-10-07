# Website item exchange

Extend the existing character exchange with an Items tab and the same devnet test SOL payment and receipt recovery. Items remain authoritative game database assets, not NFTs. Payment finalization and database delivery are separate stages; this is not an atomic on-chain game transfer.

Only owned, offline, available characters may list unequipped inventory items. Reject newbie objects, gold, missing objects and objects sold by merchant NPCs, matching the in-game market. Read inventory and eligibility from the database; never accept client inventory snapshots. Maximum 20 active listings per account, 10,000 units per listing.

Remove the listed quantity into a dedicated escrow row in the same database transaction. The seller may play afterward, but cannot sell the character with active item listings. Cancel returns the escrow to inventory only when the seller is offline and has capacity. A buyer selects an offline character; reserve its inventory by locking the character until a finalized receipt delivers the item exactly once. Check capacity before signing. Failed/expired payments release the buyer and relist the escrow. Existing game-gold listings remain separate.

Use additive schema changes, preserve existing records, test rejection, escrow, cancellation, capacity, concurrency and idempotent settlement against an isolated PostgreSQL database. Build and audit both locales, then activate the API and website without restarting the game server.
