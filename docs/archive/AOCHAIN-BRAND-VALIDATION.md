# AOCHAIN website validation — 2026-10-06

Website: https://double-test-audience-examinations.trycloudflare.com/

Release: `aochain-brand-20261006-v18`, production directory `.next-public-next`.

Delivered:

- AOCHAIN wordmark and custom SVG crest; Argentum Onchain full name.
- Cinematic illustrated landing page with clear entry and marketplace actions.
- Shared navigation, footer, page background, character selection backdrop and account-form theme.
- Marketplace item sprite images, actual equipped character previews and custom gold artwork.
- Branded browser icon, application manifest, metadata and rendered social previews.
- English-first copy with Spanish preserved; keyboard focus and reduced-motion support.

Evidence:

- API and frontend TypeScript checks passed. Final optimized production build passed.
- Full English release suite passed after the brand/locale changes. The final account-form change only adds scoped styling and a CSS class.
- 12 marketplace integration tests passed against a fresh isolated PostgreSQL database after the appearance/graphic query changes. Payment and escrow behavior was retained.
- Live item listing showed the real Wolf pelt sprite. No purchase action was taken on that listing.
- A reversible test-character listing showed Tunnelwalker's actual body 22, head 1 and helmet 1. It was cancelled after preview validation; no payment was signed or sent.
- Desktop, 850px tablet and 390px mobile layouts reviewed. Tablet header crowding and mobile sign-in wrapping were corrected. Spanish landing-page copy and mobile account entry were reviewed.
- `/opengraph-image` returned a valid rendered PNG (1,159,753 bytes), saved and visually inspected.
- The game server remained running. Only the frontend and the API exposing listing image data were reloaded.

Screenshot files in the parent outputs directory:

- `aochain-home-desktop.png`
- `aochain-home-mobile-spanish.png`
- `aochain-market-items.png`
- `aochain-market-character.png` (temporary preview listing, subsequently cancelled)
- `aochain-market-gold.png`
- `aochain-social-preview.png`

The landing art is a marketing illustration, not an upgraded gameplay renderer or a gameplay screenshot. Existing sprites, game mechanics, Solana mint, wallet binding, payment validation and recovery rules remain in use. Public devnet RPC limitations still apply.

## Account and reference screens — 2026-10-06, v21

Characters, wallet, ranking and wiki now share the AOCHAIN charcoal, antique-gold and serif styling. Character selection exposes its selected state through aria-pressed; wiki navigation exposes aria-current. Wallet uses the shared language selector and retains Phantom message verification. Replaced the remaining wallet AOWeb brand copy in English and Spanish.

Validation: optimized production build and TypeScript passed; full English release suite passed before the final wallet brand-only replacement and wiki table style correction. Browser inspection verified wallet signed-out state, equipment names/art and ranking sort behavior. No wallet connection or transaction was performed. Game server and database were not restarted or modified.

The previous quick tunnel expired (Tunnel not found / DNS failure). It was renewed using the existing gateway. New preview: https://confidentiality-secrets-swim-based.trycloudflare.com . Temporary tunnel links are not permanent hosting.

Mobile review at 390px verified the wallet in English and Spanish; separated the footer action links found touching during review. Final build v21 includes this correction.

## Professional UX pass — 2026-10-06, v23

Live preview: https://confidentiality-secrets-swim-based.trycloudflare.com

- Desktop/tablet auth scene pairs realm illustration with labeled login/register fields. Password visibility toggle, autocomplete hints, pending-field protection and announced errors retain the original encrypted authentication flow.
- Mobile menu exposes all destinations in a two-column panel, closes on route changes and Escape; current-page semantics and keyboard skip link added. Gameplay remains outside this website shell.
- Character creator shares the brand, explanatory copy, return link, actual sprite preview, labeled name/appearance controls and selected-option semantics.
- Password recovery/reset adopt the shared theme and announce success/error states. No recovery email or password change was submitted during review.
- Marketplace handles unauthenticated and load-failure states explicitly instead of leaving a spinner running. Mobile tabs wrap so all sections are discoverable. Signing and settlement behavior unchanged.
- Wiki adds a clear page heading and introductory context.

Validation: final production build/TypeScript and full English release suite passed; git diff --check passed. Browser reviewed desktop, 850px tablet and 390px mobile, English and Spanish, show/hide password, menu navigation, signed-out market and creator using existing disposable Tunnel Tester account. Selecting Warrior/Elf/next appearance updated preview and stats; no character created, sold or deleted; no wallet connected or transaction signed. Test account signed out at completion. Final frontend build: aochain-ux-20261006-v23 in .next-public-en; game server unchanged.

## Discovery controls — 2026-10-06, v25

Added shared bilingual search/sort toolbar. Guide equipment, spells, combat NPCs and curated training maps filter by displayed localized name or exact ID. Character and equipment exchange filters by displayed name; price ascending/descending and character level descending preserve existing listing objects and transaction handlers. Result counts, clear controls and no-match states added. Guide mobile table scrolling explained explicitly; search controls fit 390px without page overflow.

Validation: production builds/TypeScript passed; full English release suite passed before final native-search-clear CSS and preview metadata update. Browser verified dagger (7), exact ID 15 (1), no match (0), Spanish daga (7), live character Testero match/no-match and Wolf pelt equipment search with price selector. Current exchange has one listing per category, so multi-listing ordering was not demonstrated live. No purchase, sale, cancellation or wallet action executed; disposable test account signed out.

Local services had stopped between sessions. Existing PostgreSQL cluster recovered normally on startup; API/game/web/gateway recovered using existing configs and port identity checks. Quick tunnel renewed, runtime/API origin updated, API health ok and game ready true. Preview: https://annie-skills-considering-savings.trycloudflare.com . Active build aochain-browse-20261006-v25 in .next-public-en.

## Responsive controls modal — 2026-10-06, v26

Controls introduction uses dynamic viewport height, responsive padding and an internally scrolling list. Heading, Close and Got it remain outside the scroll region. Added dialog labeling and keyboard-focusable scroll region; key values use existing localization (Space in English).

Validation: production build and TypeScript passed. Live browser at 936x579 showed modal top 24px / bottom 555px, with 304px list viewport and 521px content; End reached the list bottom. At 390x844 modal top 12px / bottom 832px, width 366px, with internal scrolling. Screenshots: ../aochain-controls-modal-v26.png and ../aochain-controls-modal-mobile-v26.png. Disposable test character disconnected by leaving play, account signed out, viewport override reset. Active frontend aochain-modal-20261006-v26 in .next-public-next; game server unchanged for this release.

## Sign face alignment — 2026-10-06, v27

Replaced size-only lettering placement with actual sign-face regions. Legacy Ullathorpe/Nix/Banderbill gates have 31px transparent right padding and a board beginning at y=5; overlays now occupy x=4..124, y=7..37. Newer Banderbill gate uses its wider face. Notice boards inset to x=16..112, y=6..49; shop signs keep lettering above posts. Original textures, world positions and Spanish visibility preserved.

Reviewed all 72 catalog graphics by shape; alpha inspection confirms legacy/new gateway regions and all 128x64 notice regions stay within opaque board pixels. Small sign textures have irregular edges and memorial artwork has internal transparent pinholes; no claim of pixel-perfect opacity for every catalog pixel. Regression tests cover gateway padding, notice inset and existing map-specific town names. Production build/TypeScript passed; sign tests passed. Live browser inspected Ullathorpe notice and Forum shop sign. Screenshot ../aochain-signs-live-v27.png. Entrance gateway validated against original texture dimensions, not visited in this live session. Active frontend aochain-signs-20261006-v27 in .next-public-en; game server unchanged.

## Leaderboard and website scrolling — 2026-10-06, v29

Leaderboard redesigned with realm leader cards, readable faction/name colors, level/kills controls, labeled class filter and name search above the podium. Filtered search retains the character's rank within the selected class/metric. Mobile rows show labeled level/XP/kills without horizontal scrolling. Loading keeps existing results; API failures return 503 and show a retry action rather than masquerading as an empty ranking. Initial server-load failure is passed explicitly. Progress date uses locale-aware formatting. Website body uses document scrolling, eliminating nested scrollbars; gameplay stays outside realm-frame.

Validation: final production build/TypeScript passed. English suite passed before final toolbar relocation and CSS scroll/accessibility changes. Browser verified 6 live characters, test search yields 2, no match yields 0, Clear filters restores, Warrior yields 2, level/kills controls and Spanish labels. Existing characters all have 0 kills, so ordering across distinct kill totals was not demonstrated. Failure state was not forced against live services. At 390x844 no horizontal overflow (document width 375), mobile stats visibly fit; desktop stats labels retained in accessibility tree. Single document scrollbar verified. Screenshots ../aochain-leaderboard-v29.png, ../aochain-leaderboard-mobile-v29.png, ../aochain-leaderboard-mobile-rows-v29.png. No account or wallet actions. Temporary viewport reset. Active build aochain-leaderboard-20261006-v29 in .next-public-en; game server unchanged. Activation initially blocked by automatic approval review usage-limit error, then succeeded on user-requested retry.
