# In-game cosmetic visual check

Build: `cosmetic-visual-20261005-v1`, running on the existing public preview.

Added a compact pixel-art shield beside the local character's nameplate: violet flame for First Hunt and gold compass for Explorer. The inventory badge now sits on its own line. The crest follows the character's render container, respects world occlusion, and does not cover the sprite, equipment, or clan text.

Ownership comes from the existing API's devnet verification. Only a verified equipped asset enables the decoration. Failed verification clears it; cached visual permission expires after 35 seconds. The renderer refreshes verification every 15 seconds. No wallet transaction or mint is required to equip an already owned cosmetic.

Automated checks cover verified-only activation, missing/unknown assets, expiry, hidden/dead presentation policy, positioning, reuse across 100 updates, cosmetic switching, detached-child recovery, and cleanup. Full English regression suite and production type checking/build passed.

Live QA used the existing disposable Spelltester account and its already-owned devnet assets. First Hunt and Explorer rendered in the world; the character moved and changed direction, and equipped its existing robe and staff. No browser error logs were reported during this test. Screenshots show the actual game canvas.

Scope: local player presentation only. Remote-player visibility is not implemented by this change. Ownership transfer/revocation is covered by the existing API and display expiry policy; no new transfer transaction was performed. Death/invisibility suppression was checked in automated tests, not by killing the live test character. Visual appearance remains subject to user approval.

![First Hunt in the game](../../../cosmetic-first-hunt-ingame.png)

![Explorer in the game](../../../cosmetic-explorer-ingame.png)

Unequip was also verified live: both the nameplate crest and inventory badge disappeared. First Hunt was restored afterward. The test character was logged out normally.

![Unequipped comparison](../../../cosmetic-unequipped-ingame.png)

## Server-verified console title — 2026-10-05

Build `cosmetic-inspection-20261005-v1` is active in `.next-public-en`. Normal character inspection now requests the target character's equipped cosmetic through an authenticated internal API and appends a separate console line, for example `Spelltester — Title: First Hunt crest`. The allowlisted title is verified against the linked wallet's current chain ownership and issuer. No wallet address is shown. Ordinary inspection is immediate; the title follows asynchronously. Verification failure or unequipped/transferred assets produce no new title line. Previous console history is not rewritten.

Both regular and staff character-inspection branches use the same lookup. Viewer requests are throttled to one per 1.5 seconds; disconnected/replaced viewer sessions and map changes suppress delayed output. English and Spanish rendering preserve player names verbatim.

Validation: isolated API tests cover internal authentication, malformed IDs, both cosmetic kinds, changed ownership, wrong issuer, missing assets, RPC outage and no equipment. API/server type checks and full frontend regression/build passed. After the user logged out, the world was saved/backed up and API/game restarted. Live UI inspection of Spelltester displayed the correct First Hunt title with the existing real devnet collectible. A second-player session was not used for the live test. Test character logged out normally afterward.

![Verified cosmetic title in the console](../../../cosmetic-console-title.png)
