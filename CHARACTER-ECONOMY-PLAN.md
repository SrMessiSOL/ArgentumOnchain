# Character economy implementation

Devnet only. Listings use test SOL. Gold uses a zero-decimal SPL mint at 1 token per game gold. Existing gold is test economy supply; no mainnet redemption.

The database remains authoritative. A sale changes the character's account owner: inventory, equipment, personal bank, spells, progression and achievements retain their character IDs. Shared account/clan vaults are excluded. Clan members, privileged and banned characters cannot be listed in v1.

Listings and pending gold operations lock gameplay and mutations. Ticket consumption obtains a connection lease. Database triggers guard inventories and snapshots. Buyers approve an exact persisted transaction paying the seller directly. Finalized proof settles ownership once; interrupted settlement is retryable. A purchase reservation cannot be cancelled until its transaction is known failed or expired.

Deposits burn SPL gold before crediting game gold. Withdrawals reserve game gold before minting SPL gold. Transaction bytes and signatures are persisted before submission; retries use the same transaction. Definitively failed or expired operations release reservations. This is a trusted game-operated mint/burn bridge, not trustless escrow.

Achievements belong to characters. Legacy wallet collectibles confer no achievement rights after migration. Titles follow a character sale and cannot be traded separately. No new achievement NFT is needed.

Isolated tests precede activation. Back up before additive migration. No mainnet, public token launch or transfer of player assets is included.
