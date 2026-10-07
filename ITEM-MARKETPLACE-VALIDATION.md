# Item exchange validation — 2026-10-05

Active website: https://double-test-audience-examinations.trycloudflare.com/character-market#items
Production build: `item-exchange-20261005-v11`, `.next-public-next`.

Implemented the Items tab with character-market styling, English and optional Spanish, test SOL prices, quantity selection, source/destination character selection, automatic receipt tracking and a Play action after delivery. Items remain game database assets; this does not mint item NFTs or make payment and game delivery one atomic on-chain operation.

Server checks reject newbie gear, money, NPC shop stock, equipped items and unavailable quantities. Listing removes the exact quantity into escrow; cancellation returns it to an offline owned character if inventory capacity permits. Purchases reserve the buyer character and its inventory until finalized payment delivers once. Failed or expired receipts release the buyer and relist escrow. Active item listings prevent sale or ordinary deletion of the seller character. Inventory capacity matches the game’s 21 slots and 10,000-unit stacks. Maximum 20 active listings per account.

Validation:

- API TypeScript and optimized frontend production build passed.
- 21 tests passed across real isolated PostgreSQL integration, transaction binding and RPC recovery suites. Includes simultaneous purchase attempts, eligibility, cancellation, locked character assets, full/unowned recipient rejection, failed payment recovery and idempotent item delivery.
- Full English release suite passed; Spanish item names and controls also checked in the live page.
- Desktop and 390px mobile layout checked, including seller controls. Screenshots: `../items-market-desktop.png` and `../items-market-mobile-spanish.png`.
- Live API listing/cancellation rehearsal used only the disposable Spelltester character and a temporary Imperial shield fixture. Escrow removed two units, cancellation returned them, and the original inventory was restored exactly. See `ITEM-ESCROW-REHEARSAL.json`. The screenshot records that temporary test listing; it was removed afterward.
- Database backup created before the additive migration. API and frontend activated; game server was not restarted.

Boundary: no new item payment was signed or sent on devnet during this task. Finalized item delivery was exercised against real database transactions with mocked chain receipts. The existing character payment/signature/recovery path is reused. Public devnet RPC limits can still delay confirmations. Existing in-game gold listings are separate from these website test SOL listings.

