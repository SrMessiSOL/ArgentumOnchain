# AOCHAIN portal UX review — 6 October 2026

Build: aochain-portal-review-20261006-v59. Live test realm: https://annie-skills-considering-savings.trycloudflare.com.

## Verdict
The portal now provides a clearer path into the game and a consistent slate visual language. It is suitable for another community testing pass, but a signed-wallet first-player rehearsal is still required before claiming the complete journey is production-ready.

## Observed journey and five prioritized issues
1. Play initially displayed a large account checklist before the character roster. Removed that repeated checklist; selection and the equipped preview are now the main content.
2. An unstaked character displayed a disabled play action alongside setup actions. It now has one next action, Get this character ready, and a plain explanation. Ready characters retain Enter realm; readiness loading has an explicit state.
3. Modal content scrolled the heading out of view. Shared dialogs now use a fixed header and independent scrolling body, fit the viewport, retain focus trapping and Escape behavior, and restore body scroll only after the last dialog closes.
4. Restricted inventory actions appeared as operational failures. View restrictions now opens an informational modal with the actual item image, name and reason.
5. Recovered operation history could trigger feedback outside its originating action. Saved terminal asset operations are no longer restored automatically; explicit creation-operation redirects remain supported. Gold feedback opens on a new deposit or explicit status check, rather than merely loading saved state.

## First 30 seconds
Existing player: open Play, select character, choose Enter realm if ready or Get this character ready if setup is required. Profile contains character management. New player: sign in/create account, connect and verify wallet, create a character, approve mint/stake and enter. Wallet approval and Solana confirmation make the actual duration variable; the interface must display real transaction states rather than simulated completion.

## Structure: keep, delay, remove
- Play: keep roster, equipped preview, single contextual action and concise controls. Remove repeated onboarding checklist here. Keep the initial checklist on Home only.
- Profile: keep Characters, Items, Gold, Titles and account activity. Manage assets from their cards and dialogs; do not restore separate listing/receive-character panels.
- Marketplace: keep Browse and marketplace Activity, character/item categories, search/sort and detail review before signing. Selling starts from Profile. Keep account gate.
- Wallet: keep the normal top-right connection button and distinguish linked identity from an active connector. Delay technical chain details to relevant dialogs and receipts.
- Wiki: keep searchable game data, existing normalized monster entries and numeric map IDs. Use sideways table scrolling on phones rather than page-level overflow. Do not restore variants or community navigation.
- Transaction feedback: keep real preparation, wallet approval and confirmation states. Remove vague status-below language and automatic replay of completed purchases.

## Visual implementation
Shared final portal stylesheet unifies slate cards, boundaries, form surfaces, focus rings, selected character tiles, button radius, spacing, status contrast and mobile modal dimensions. Realtime /play HUD and game economics were not changed. Transaction copy distinguishes preparation, signing and confirmation.

## Verified
- Optimized Next production build and TypeScript completed successfully; all 57 static generation entries completed.
- Updated frontend running on existing test-realm service; only frontend restarted.
- Desktop Play: test account roster visible immediately, equipped preview present, unstaked character has one setup action and no enabled Enter realm.
- Play setup link reaches Profile and selects the corresponding character for inventory management.
- Profile item restrictions: actual Red potion (Newbie) explanatory dialog; no transaction initiated.
- Mobile 390 x 844 Marketplace: page width 375, no page-level horizontal overflow; listing and search/sort available.
- Mobile long Testero detail dialog: within viewport (approximately top 13, bottom 832); body client height 744 and content height 983 with overflow auto. Header is outside the scrolling body.
- Mobile Wiki: 99 normalized NPC results, numeric spawn-map IDs, page width 375 at viewport 390; zero broken HTML image resources in inspected page.
- Browser viewport override reset and desktop Play retained as preview.

## Evidence and limits
Screenshots: work/portal-play-v59.png and work/portal-modal-mobile-v59.png in the task workspace. No purchase, mint, stake, gold transfer or signature was submitted. The test account has no staked character, so entry into live gameplay was not exercised in this pass. Recovery logic compiled but a real pending-operation fixture and signed wallet journey were not replayed. Image-resource checks do not prove every atlas frame visually perfect. This is a portal review, not a full security or production-readiness audit.

## 2026-10-07 responsive portal refinement

Refined shared header, mobile navigation, profile spacing, card text wrapping, empty/loading states, focus indicators and modal presentation. The homepage Gold card now opens profile gold management. Mobile navigation closes on Escape and returns focus to its toggle. Modal headings label their dialog; focus trapping includes visible textarea controls and Escape does not propagate to a parent dialog.

Validation: English regression suite and production TypeScript/build passed (aochain-ui-20261007-v69). Browser inspection at 320x568, 390x844 and 1280x800 checked home, signed-in profile, expanded navigation, wallet modal and character-management modal. At 320x568 the character dialog measured y=12 to y=556 with internal scrolling and no horizontal page overflow. Keyboard focus stayed inside the wallet dialog and returned to Manage character after closing. No browser console errors were captured during these checks. Wallet signing and financial transactions were not exercised. Only the website service was restarted; gameplay was not restarted.

## 2026-10-07 item purchase review

Item listings now offer a review modal with game artwork, quantity, seller, selected receiving character and total SOL price before invoking the existing purchase flow. Reserved and own listings remain inspectable with purchase disabled. Recipient eligibility is explained above item browsing. English and Spanish copy retained. Dismissing an initial marketplace error no longer removes its retry state and returns to an endless spinner; successful refresh clears the loading error.

Validation: English regressions, production build and TypeScript passed (aochain-ui-20261007-v71). Real reserved Wolf pelt listing inspected on desktop and at 320x568; dialog bounds y=12..556, no horizontal overflow, reserved action disabled, Escape returned focus to Review purchase. No browser errors observed. No purchase was signed. Initial failure/retry behavior reviewed in code; a live network failure was not induced. Website service activated without restarting gameplay.

## 2026-10-07 gold management clarity

Replaced the native gold character dropdown with shared character cards. Added an explicit source-to-destination indicator for deposit and withdrawal, labeled wallet gold, and a full-width action with directional icon. Refined shared modal quantity fields and action spacing.

Validation: English regression suite and TypeScript/production build passed (aochain-ui-20261007-v72). Browser checked deposit and withdrawal directions on the live profile, selected Wayfarer, wallet-not-linked and zero-gold disabled actions, and 390x844 controls with no horizontal overflow. No browser errors captured; no transfer signed. Website-only activation preserved gameplay uptime.
