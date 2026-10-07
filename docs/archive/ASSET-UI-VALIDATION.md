# Asset presentation validation — 2026-10-06

- Wallet character cards render the real game body, head, equipped weapon, shield and helmet from the authenticated API. No stock portraits or invented equipment.
- Registered wallet character NFTs include the same appearance fields. Item receipts include their object ID for the existing sprite-atlas artwork renderer.
- Owned NFT cards select the asset and open its deposit controls. Already staked character cards cannot start a received-character deposit.
- Mint/create, stake, unstake and item export/import display animated preparation, wallet signing and chain confirmation. Completion is shown only for the server's completed operation state. No estimated percentages or simulated success.
- The operation ID survives navigation/reload in session storage; creation redirects to its operation. Terminal feedback is dismissible. Explorer links show the actual signature.
- All animations respect reduced motion, and status changes use an accessible live region.
- API type checking passed; wallet ownership/amount tests and equipped-appearance assertions passed; transaction signer compatibility tests passed; English regression suite passed.
- Browser QA: real equipped mage and warrior rendered on the live wallet page; 390 x 844 layout had no horizontal overflow. Opening and cancelling the wallet chooser restored the buttons and displayed cancellation without false completion. Existing Wolf pelt marketplace artwork uses the same renderer as wallet receipts.
- No real mint or funded transaction was signed during UI QA. Confirmation/success rendering is connected to real server states, but a human-wallet end-to-end mint remains to be exercised.

Live build: aochain-assets-ui-20261006-v37. Evidence: work/asset-ui-v37-desktop.png, work/asset-ui-v36-mobile.png and work/asset-ui-v37-wallet-handoff.png.


## Wallet polish pass — 2026-10-06

- Added a verified-wallet identity panel with accessible address copying and copy failure feedback.
- Added a real SPL gold balance card, NFT counts, and helpful empty wallet/inventory states. RPC failure remains distinct from zero balance.
- Character cards now explain online/locked availability. Ownership details can be expanded without crowding the main collection.
- Gold deposits use the same real-state transaction presentation as NFT operations, including signed receipt links and terminal dismissal. Max respects the game gold amount limit; unavailable, zero and invalid balances explain disabled actions.
- Added collection skeletons, retry after collection loading errors, and a portrait loader that remains visible until the sprite finishes rendering.
- Desktop and 390 x 844 mobile QA: no horizontal overflow; copy feedback and zero-gold disabled controls verified; English and Spanish labels checked. No wallet signing or funded transaction during this pass.
- Final production build: aochain-polish-20261006-v39. English suite and actual Wallet Standard transaction byte/signature regression test passed.
- Screenshot evidence: work/wallet-polish-v39.png.

## Player portal redesign — 2026-10-06

- Live production build: aochain-player-portal-20261006-v43. Shared navigation, player-facing copy, selected equipped hero, explicit Enter realm action and focused Characters / Items / Gold / Titles / Activity collection views.
- Added an English/Spanish getting-started guide with verified default controls and explicit spell selection -> Cast -> target flow. Default sign-in now leads to character selection; custom redirect destinations remain supported.
- Gold collection supports both existing deposit and withdrawal flows, with source-specific balances, Max validation and preserved pending-operation recovery. Added account-scoped gold activity and character gold to the read-only collection response.
- Production build, API type checking, seven character/item lifecycle tests, twelve gold economy tests, English regression suite and Wallet Standard transaction byte/signature compatibility tests passed.
- Live browser proof: selected Spelltester without entering automatically, then entered Ullathorpe using Enter realm. Console confirmed connection as Spelltester. Logged out using /logout; collection subsequently confirmed the character offline.
- Desktop and 390 x 844 character selection checked. No horizontal overflow; mobile Enter realm fits in the viewport and equipped sprite feet remain visible. Loaded Titles view correctly marks the equipped title; English and Spanish collection labels verified.
- Gold Deposit correctly disables submission for a zero wallet balance. Withdraw Max selects the character's eight gold. Historical completed gold receipts appear in Activity. No transfer was submitted during this review.
- Evidence: work/player-portal-v43-play.png and work/player-portal-v43-mobile.png.
- Limits: no new account registration, human-wallet mint/transfer or community load test performed during this pass. These checks establish portal behavior and presentation, not full production readiness.

## Marketplace and player profile — 2026-10-06

- Live build: aochain-market-profile-20261006-v46. Marketplace has Browse and Activity as its primary views, with Characters / Items filters inside Browse. Selling and cancellation controls live in the separate /profile holdings page.
- Character holdings combine game ownership and wallet-only characters without duplicating registered assets. Locked/online/transferable states appear on the main cards. Wallet-only characters activate directly from their card; the manual Receive a character form is removed.
- Character List / manage links open the profile sell controls with the selected character. Held inventory items use actual sprite artwork, show equipped state and link eligible items to listing controls.
- Marketplace activity reads only character/item sales records; gold deposits, withdrawals, minting and staking remain in profile activity. Sale timestamps use sold_at when available.
- Navigation is Play / Marketplace / Profile / Wiki. Community and Discord header/footer links removed. /guide redirects to /wiki. Wiki includes actual monster appearances and the existing world-map image.
- Production build and API/frontend type checks passed. Seven asset lifecycle and twelve economy integration tests passed in isolated databases.
- Live browser checks: marketplace browse and sales-only activity, character profile listing handoff, monster sprite rendering, world map rendering, inventory artwork and 390 x 844 profile layout without horizontal overflow.
- No real listing, cancellation, purchase or wallet transaction submitted during this UI review.

## Card-driven asset controls — 2026-10-06

- Character management, staking/withdrawal and listing now open in a modal from each character card. Removed the page-wide List on marketplace section and wallet sidebar. Changed character/card selections to a slate-blue palette.
- Profile inventory and wallet receipts are managed from their image cards. Removed inline withdrawal/deposit forms and listing links. Profile and marketplace item character selectors use equipped portraits with player names and stake/lock state.
- Added a top-right Wallet Standard connection button, connected address, disconnect menu and existing account-wallet signature verification. Cancellation returns quietly. No wallet connection or signature was completed during browser QA because this browser has no compatible extension.
- Asset, gold, market and title errors/progress now use accessible, viewport-constrained modals with keyboard focus containment, Escape/close behavior and scroll locking. No fabricated progress or success states.
- Mandatory staking now applies to legacy characters too: removed the unminted legacy exception in assertPlayableCharacter. The existing checks cover character selection, ticket creation/consumption and the database connection claim. The play page disables Enter realm for unstaked characters.
- Wiki groups duplicate monster names while retaining variant IDs, HP/XP and map references. Live review shows 99 unique entries. NPC body/head artwork is composed into a fitted pixel canvas to avoid cropping large or unusual sprites; dragon artwork checked visually.
- Production build and API/frontend type checks passed. Eight asset lifecycle tests (including legacy unminted entry rejection) and twelve economy tests passed in isolated databases. Legacy login expectations were updated for mandatory staking.
- Live browser checks: character management/listing modals, item restriction notification, disabled entry for unminted characters, marketplace portrait choices, wallet chooser/cancellation and 390 x 844 modal containment without horizontal overflow.
- No live mint, staking, withdrawal, listing or purchase was submitted during this review. On-chain lifecycle coverage uses the integration suite's mocked chain receipts.

### Monster entries correction — v50
Removed the Variants controls. Each monster name appears once, with all unique spawn maps combined. Production build passed; live Wiki confirmed 99 monster images and zero Variants controls.


### Account and wallet onboarding — v54
Added live account/wallet/character progress on Home, Play and Profile. Signed-out wallet actions explain account registration/sign-in first; authenticated wallet actions explain message verification and show the linked address. Connected and linked state are distinct. Profile redirects guests to sign-in, preserving the return path. Unified wallet chooser and auth errors with PortalModal; refreshed modal, form, button and onboarding styles with mobile layout and reduced-motion support. Mobile account actions live in the navigation menu; sign-out also disconnects the connector.
Validation: production build and TypeScript passed. Live disposable-account email/password sign-in returned to Profile; mobile sign-out worked. Wallet chooser no-extension state and cancellation checked; no wallet signature or blockchain transaction performed. At 390x844 the connection dialog remained within the viewport (top 152, bottom 692), with no horizontal overflow. Evidence: work/account-entry-v54.png and work/onboarding-mobile-v54.png.


### Marketplace polish — v56
Updated cards, portrait stages, segmented browsing controls, search/sort, activity rows and empty states. Character details moved from expanding inline cards to a review modal showing equipped appearance, level, gold, price, inventory, bank and achievements. Character Buy opens the review before the existing wallet purchase flow; no settlement logic changed. Item recipient portraits now have explicit delivery guidance.
Validation: production build and TypeScript passed. Live character details, search zero-results/clear, item tab and recipient guidance checked. At 390x844 character modal stays within top20/bottom824 with internal scrolling and no page horizontal overflow. No transaction submitted. Evidence: work/market-polish-v56.png.


### Re-staking after withdrawal correction
Reproduced saved failed stake in devnet simulation: ApprovePluginAuthority returned custom error27. Withdrawal retains issuer delegates. Stake now skips approval for plugins already delegated to the issuer, while retaining owner approval after a transfer resets delegates. Both Testing and OneMore corrected stake transactions simulated with null error; no broadcast. Real SDK tests5, isolated asset tests8 and economy tests12 passed; API TypeScript passed. Activated API correction without restarting the game.


### Modal lifecycle and profile cleanup — v57
Removed Profile AccountJourney and the misleading pending availability message for listing locks. Marketplace refresh updates only an operation started in the current visit; persisted history cannot reopen a completed purchase dialog. Closing clears the saved last-intent marker. Pending reservations still block conflicting actions and are polled. Creation progress and errors now use PortalModal.
Production build/TypeScript passed. Live Profile has no setup panel. Marketplace revisit and reload showed zero dialogs. Creation opened its progress dialog and wallet chooser; cancelling returned to error modal without creating a character or sending a transaction. Screenshot: work/profile-clean-v57.png.


### Item management clarity — v58
Separated Wallet items and Character inventory, with section descriptions, counts and selected-character label. Item cards show image, location badge, quantity and explicit Deposit to character / Manage item / View restrictions action. Auto-fill grid keeps a single wallet receipt compact. Deposit modal identifies the receiving character. Pattern reviewed against official Axie Game Portal guide.
Production build and TypeScript passed. Live inventory sections, images, actions and restriction modal checked; mobile390 viewport had page width375, no horizontal overflow. No asset transaction submitted. Wallet receipt deposit flow retains existing server guards; this test account had zero wallet receipts. Evidence: work/items-management-v58.png.

