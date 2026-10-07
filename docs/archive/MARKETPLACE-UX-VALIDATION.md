# Marketplace confirmation and visual polish

Live: https://double-test-audience-examinations.trycloudflare.com/character-market

Final build: `marketplace-polish-20261005-v9`, `.next-public-next`.

## Purchase experience

The transaction panel now shows preparation, Phantom approval, confirmation, completion or failure. It stays visible when the purchased listing disappears. Finalized completion offers **Play this character**, which selects the purchased character and opens the game. Gold operations use the same status flow and update the saved character balance.

The page checks authenticated saved operation state every 2.5 seconds while an operation is pending. These reads do not query Solana. The existing server recovery worker checks pending receipts every five seconds instead of fifteen; its overlap guard, finalized settlement and exact signed-byte validation remain intact. Signing is never repeated automatically. A prepared request without a saved signature stays reserved until expiry; reload recovery reports this state explicitly. The last operation ID is saved in tab session storage and restored only when it matches an operation returned by the authenticated account. Completion cannot regress to an older pending snapshot.

Payment remains one Solana transaction followed by game-database settlement. This change improves feedback and recovery latency; it does not make payment and database ownership one atomic on-chain transaction or shorten Solana finality.

## Visual changes

The page now separates Characters, Gold Bridge and Activity. Character cards show price, inventory/bank counts, expandable localized item previews and title achievements. The sell form is a separate panel. Gold controls show the selected character balance, conversion, fees and optional token details. Activity has distinct pending/completed/failed statuses and receipt links.

Desktop and 390px mobile layouts were inspected in the public browser. The mobile page had no document-level horizontal overflow; controls remained usable. English and Spanish were checked. Visible keyboard focus, disabled states, live status announcements and reduced-motion behavior are included. This pass covers the marketplace page; home, wallet, wiki and character-selection pages have not received this full visual redesign.

## Verification

- Production build and TypeScript passed.
- Sixteen API tests passed across settlement, signature binding and RPC transport using an isolated test database.
- Progress regression checks cover reload recovery, completion, stale snapshot protection, unsigned cancellation/expiry, failure and missing receipts; included in the full English regression gate, which passed.
- Real devnet transactions between existing disposable test accounts exercised the return purchase. The browser visibly updated from an unsigned reservation to confirmation and then **Character purchased**, without a manual reconcile or refresh after submission. Clicking Play opened Tunnelwalker with nine inventory rows; normal logout followed and the original account ownership was restored.
- Public RPC errors and two expired signed test requests were also observed. The page correctly displayed failure and the server relisted the character. The successful return included one direct rebroadcast of the identical already-persisted signed bytes to the primary RPC. This tests automatic settlement/UI confirmation, not guaranteed first-broadcast delivery. No personal character/wallet was transferred in the rehearsal; Phantom's interactive approval was not exercised by the agent.

Evidence: [DEVNET-AUTO-CONFIRMATION-RECEIPT.json](receipts/DEVNET-AUTO-CONFIRMATION-RECEIPT.json), [completion screenshot](../../../marketplace-purchase-complete.png), [mobile gold controls](../../../marketplace-mobile-gold.png).

Public providers still impose limits. Dedicated RPC configuration and broader website styling are separate follow-up work; no mainnet or trustless marketplace claim is made.
