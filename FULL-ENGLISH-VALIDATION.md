# English game release — 2026-10-04

The English-first release is running at https://double-test-audience-examinations.trycloudflare.com on the existing shared PC-hosted realm. Build: `marketplace-polish-20261005-v9`, directory `.next-public-next` (left console layout update; English gate passed). Spanish remains selectable and persists through the existing account preference and locale cookie.

![Final English macro picker, item names and Save action](../aoweb-english-final.png)

![Final English console and command help](../aoweb-english-console-final.png)

## Completion audit

The follow-up audit closed the identified gaps rather than treating catalog counts as proof of every display path:

- Translated summoned-creature combat names, NPC console speech, assembled NPC/player inspection messages (health, summon owner, class, faction/rank, status effects and administrator diagnostics), ban durations and jail-message labels.
- Fixed the two remaining Spanish equipment-restriction abbreviations, the padded bank-vault gold message, multiple validation errors, prefixed API errors, harvesting notices, challenge confirmations and conditional administrative command responses.
- Translated the private-message channel prefix while preserving the actual message and character names. English welcome-message links remain clickable.
- Visually reviewed contact sheets for 2,384 graphics and 23 legacy interface images, with full-size inspection of text-bearing signs and plaques. English overlays now cover 72 graphic IDs: shops, houses, directions, warnings, welcome boards, classes, guilds and memorials. Long lettering scales to the sign face; gateway posts remain visible. Original textures are retained for Spanish. Blank signs, pictograms and proper-name-only signs need no translation. Unused legacy interface artwork remains archived in public assets but is not referenced by the current interface.
- Graphic 4986 uses map-aware English replacement copy: “NOTICE TO TRAVELERS — Welcome to Ullathorpe.” in map 1 and “Welcome to Nix.” in map 34. The earlier fixed Banderbill wording was incorrect and was removed in the 2026-10-05 location review. The original fine print is too degraded to transcribe reliably; this is explicitly an editorial localization, not a claimed verbatim translation. Decorative unreadable stone glyphs remain artwork. World-map overview labels are numeric map IDs.
- Translated the operational startup/save/connection logs, then 64 additional maintenance/export/diagnostic and browser-log strings. Combat-debug timing labels are English. Historical logs, internal identifiers and comments remain source material.
- Expanded the source regression check to follow conditional branches; added dedicated regression cases for assembled messages and player-text preservation.

The final display audit also fixed raw macro-picker item names and selected-item/spell fallbacks, inventory hover statistics, crafting categories, drag hints, marketplace selection, clan-request empty text, arena loading/change-class labels, hotkey-conflict errors, the challenge countdown (“GO!”), and ground-item inspection. The macro button says “Save”; banking retains “Deposit”. /spawnnpc accepts and advertises English persistence/movement options while retaining Spanish compatibility. Nested administrative errors translate “unknown error” without rewriting unknown free-form error text.

This closes the known player-facing gaps found in the source and artwork audit. It is not a claim that every possible quest, administrative operation and late-game encounter was manually played. Unrecognized future content still falls back to its source text; hiding it would conceal errors. Extend the catalogs and regression fixtures when adding content.

## Implemented

- Account screens, character creation/selection, HUD, inventory, spells, targeting instructions, settings and keyboard bindings.
- In-game console: connection, combat, progression, trading, crafting, faction, party, clan, challenge and administrative messages. Numeric values remain intact. Explicit game-data slots translate item/class/faction names; ordinary player chat and clan/character names are preserved.
- Item, NPC and spell names and descriptions, NPC dialogue, map names, equipment restrictions, faction guides and the public wiki.
- Merchant, bank, crafting, marketplace, party/clan, stats, challenge and NPC-inspection interfaces. English item search also works against the server's original Spanish item names.
- English player/admin command aliases, including `/challenges`, `/jail`, `/announce` and `/clearground`. Class arguments accept English for `/bot` and `/changeclass`; `/spawnnpc NPC_ID [save|fixed|persistent] [move|mobile]` accepts its advertised English options. Original Spanish commands remain compatible.
- Confirmation prompts accept the displayed `DELETE` as well as `BORRAR`.
- Changelog/roadmap, page metadata, default English date/number presentation, accessible labels and password-reset email templates. Email locale follows the account preference; no email was sent during testing.
- English lettering over 72 legacy sign graphics. Original raster assets remain intact and Spanish mode reveals the original sign. This is runtime UI lettering, not regenerated artwork.

## Catalogs and verification

| Catalog | Entries |
|---|---:|
| Existing bilingual keyed catalog | 386 |
| Legacy UI/server/API fixed messages | 945 |
| Dynamic message templates | 235 |
| World-data translations | 1,061 |
| Map names, changelog, roadmap and additional messages | 282 |
| Additional UI labels | 175 |
| Sign graphics | 72 |

These counts are catalog entries, not a percentage of gameplay completed. Some source strings overlap across catalogs.

Automated validation passed:

- Production Next build, all 49 generated routes; frontend, API and game-server TypeScript checks.
- Source audit of 434 direct console/announcement branches and 448 expanded message combinations, including literal alternatives inside placeholders.
- Direct JSX literal and item/name/detail display guards. Player names and player-authored announcements are explicitly excluded.
- Read-only audit of current public game definitions and shipped data: 3,704 text occurrences, 3,406 translated, 298 deliberately preserved (proper names, existing English, incantations, identifiers/codes); zero unclassified values. This includes current database item/NPC definitions, spells, recipes, every map name, world-map metadata, changelog and roadmap.
- Static data regression gate checks 723 current text occurrences in addition to the world snapshot.
- Placeholder preservation for all 235 message templates; Spanish passthrough and player-chat preservation.
- World-text snapshot coverage: 1,186 distinct extracted strings from the current object/NPC/spell data. The reviewed exception fixture contains 125 proper names, already-English names, incantations, color codes and source metadata. Item and NPC snapshots covered 1,062 objects and 340 NPC definitions.
- Every shipped crafting recipe category has an English display translation.
- Gameplay regression checks for experience/level gains, spell damage, NPC names, item statistics and NPC-only dialogue translation.
- English/Spanish item search, accents and nonmatching queries; command aliases and English class arguments.
- Two email-template tests: English default, optional Spanish, HTML escaping and unchanged reset URL.

Live browser checks covered the public HTTPS game connection, character selection, inventory, spell names/details, settings, key bindings, `/stats`, `/challenges`, merchant UI, console notices, normal logout, English/Spanish switching during play, equipment wiki, factions and training maps. The test character retained its level, experience, gold, inventory and cosmetic. No purchase, clan creation/deletion or wallet transaction was made in this pass.

The final v8 pass verified macro item names, command-macro guidance (No command / Example: /meditate), the Save button, `/help`, English/Spanish switching, preserved character state, and normal logout. The browser reported no error entries. No macro was saved and no wallet transaction was made.

The earlier completion pass additionally verified the refreshed public build, English notice-board overlay, merchant item/price display, NPC inspection console output, English/Spanish switching, clickable English welcome links and normal logout. No browser error entries were reported in the final game check. The screenshot uses the existing small viewport, which clips the top of the game; it is not a full-map screenshot.

## Boundaries and maintenance

Translation is applied at presentation boundaries. Database IDs, combat rules, saved player names, protocol payloads and parsing remain in their original format. Internal source code identifiers, comments and original proper names have not been mechanically rewritten. Current operational log prose was translated separately.

The source catalogs and automated coverage checks are broad; live QA is representative, not an exhaustive playthrough of every quest, administrative action or late-game encounter. New server/data content must extend the catalogs and coverage fixtures. Unknown messages still show their source text rather than disappearing.

This changes localization, not the Solana economy. The existing optional devnet cosmetics are unchanged. No mainnet activity, new token, settlement contract or gameplay-on-chain behavior was introduced.

World saves and private database/runtime backups completed before restarting the empty realm. The public URL still requires this PC and its existing temporary tunnel to remain running.

## Reproduce checks

From `frontend`:

```powershell
npm run test:english
npm run audit:english-data
```

The data audit connects read-only to the local game-definition database; `AOWEB_AUDIT_DATABASE_URL` can select another authorized read-only target. It never queries account/player tables.

From `server`:

```powershell
npx tsc --noEmit
./node_modules/.bin/tsx.cmd src/commandAliases.test.ts
./node_modules/.bin/tsx.cmd src/localization/itemSearch.test.ts
```

From `api`:

```powershell
npx tsc --noEmit
./node_modules/.bin/vitest.cmd run src/tests/email-locales.test.ts
```

`Build-Public.ps1` first runs the English release gate and then builds an inactive production directory and pins the public WebSocket path to `/game-socket`; it refuses to overwrite the active build. A local development build using the loopback WebSocket URL must not replace the public build.

## Final independent follow-up review — 2026-10-04

Found and fixed one additional generated-content gap: administrator-spawned bot names used Spanish class labels (`Bot Mago 25 #2`). New bots now use English labels (`Bot Mage 25 #2`). Real character names are unaffected. Regression tests cover all eight configured bot classes and unknown-name handling. This path was verified in code and tests; no bot was spawned into the shared world for QA.

Expanded the release gate to inspect the browser's bundled items, NPCs and spells, not only the database snapshot. It now checks 2,500 static/bundled string occurrences. The additional unmatched values were hexadecimal colors, which are explicitly recognized as technical data. The separate read-only current-data audit remains 3,704 checked, 3,406 translated, 298 preserved and zero unclassified values. These audit counts overlap and must not be added together.

All localization tests and server type checking passed. Live character selection, equipment wiki and spell descriptions were reviewed in English. No further untranslated game-owned text was found in this pass. Proper names, incantations, player-authored text and the optional Spanish locale remain intentional exceptions. The existing note about replacement copy on the unreadable legacy sign still applies.

The empty realm was saved and backed up before restarting to activate the server-only fix. Frontend production build remains `english-release-20261004-v8`; no frontend application change required another build. Evidence: [English spell wiki](../aoweb-english-review.png).

## Dynamic combat follow-up review — 2026-10-04

An additional review of the values inserted into console messages found gaps that the template coverage checks alone could not detect:

- NPC names in paralysis, immobilization, spell damage, basic melee, Dragonslayer Sword and persisted-NPC lookup messages now translate in English.
- Healing and backstab targets now translate when they are NPCs. Cast, damage, kill, hit, miss and death messages now preserve player names even when they exactly match a Spanish catalog entry, such as `Mago`.
- Nineteen NPC console paths now carry an optional NPC-name field. The client propagates this identity through packet decoding and the chat entry before localizing the entity name. Legacy packets remain readable; absent metadata conservatively preserves ambiguous names. Raw game messages and Spanish output are unchanged.
- Challenge team members use the language-neutral separator ` / `, and the authored `(abandono)` result suffix displays as `(forfeit)` in English. Participant names remain unchanged.

Validation passed: the full English release gate, frontend and server type checking, production build (49 routes), and the read-only current-data audit (3,704 checked, 3,406 translated, 298 preserved, zero unclassified). New regression tests check all 19 tagged NPC paths, NPC/player name collisions, Spanish preservation, old/new packet decoding with the server's binary writer, and propagation through the actual incoming UI handler. They cover the rare combat and challenge cases synthetically; this is not a claim that every one was triggered in a live playthrough.

The zero-player realm was saved and backed up before restart. Backup `aoweb-20261004-215045-965.dump` completed; runtime protection round-trip verified, full database restore not rehearsed in this pass. Both services restarted, the production frontend responds, and v9 is active on the existing preview. The preceding artwork/proper-name exceptions and limits still apply. No additional unresolved translation gap was identified in this pass; this is not an absolute proof of all possible runtime text.

## Final operational and live-screen review — 2026-10-04

This pass found two more display problems by inspecting the live browser:

- Character creation translated the Constitution abbreviation `Con` as the preposition `With`. Its unambiguous stat abbreviation is now `CON`, preserved in both locales.
- Ranking rows assembled raw class/race names into a string, bypassing localization even though the filters were translated. Each label is now localized separately (`Mage · Human`, `Warrior · Human`); character and clan names are untouched.

Eight additional operational message paths were translated: disconnected-ID output, failed NPC placement, both teleport failure logs, an unknown-source fallback, both map-export progress messages, and an HTTP diagnostic error. The teleport logs now describe their actual respective behavior (fallback versus disconnect). Only wording changed.

The release gate now also scans 162 operational log calls for high-confidence Spanish fragments. This deliberately bounded heuristic caught the additional `origen desconocido` fallback; it is not a universal language detector. The broader source scan also reviewed untranslated template fragments, variable display paths, date formatting and conflicting catalog sources. The remaining duplicate city-name entry produces English in both cases. The current-data audit again classified all 3,704 values, with zero unclassified.

The first build failed on a corrupted generated `.next/dev/types/routes.d.ts`, not application code. The generated file was backed up outside the repository and removed with development processes stopped. Because its generated validator still imported it, Next's own type generator was then used to regenerate the matching development declarations and validator. No source file or game data was deleted.

Final verification: the English gate and server/API type checks passed; the corrected production build passed with 49 routes. Build-time ranking fetch warnings occurred while the API was stopped; after restart, the live ranking populated normally. The realm was saved and backed up (`aoweb-20261004-220152-168.dump`) with zero players online before restarting. Game and API health checks pass, and v10 is active. Live browser checks confirmed `Mage · Human` / `Warrior · Human` in ranking rows and `CON` on character creation. No character was created or modified during this review.

Evidence: [corrected character creation](../aoweb-creation-english-v10.png), [English ranking](../aoweb-ranking-english-v10.png). No further unresolved game-owned translation gaps were found within this pass's reviewed scope; previously documented artwork and exhaustive-runtime limits remain applicable.

## Display-helper and accessibility follow-up — 2026-10-04

Reviewed attribute wrappers (tooltips, image/accessibility names and placeholders), composed wiki references, and functions whose returned strings are inserted directly into JSX. This found three clan display helpers that bypassed localization: alignment, class, and member role. They now translate their authored labels at the helper boundary, covering the clan directory, member rows and applications while preserving character/clan names. The administrator overview's empty packet-type summary now displays `no sample` in English. The live training guide also exposed `1 NPCs`; its count now uses singular `NPC` for one spawn.

New regression checks execute the actual clan helper definitions extracted from the component, covering both locales, all eight playable classes, all roles and alignments, and unknown-class fallback. No clans, memberships or player data were changed to test these states. This provides code-level verification rather than a claim that every clan state was opened live. The complete English gate and read-only data audit passed again: 3,704 values classified, zero unclassified. Live equipment accessibility names, faction instructions/English command examples, and training-map/creature descriptions were reviewed.

The first build again encountered a stale, corrupt development route declaration. `Build-Public.ps1` now creates an ignored build-specific TypeScript configuration that retains application checking and the current release's generated types but excludes other `.next*` cache directories. Next's normal strict checking remains enabled. No game-server change or restart is required for these presentation fixes.

The corrected production build passed type checking and generated 49 routes. V11 is now active on the existing preview, with the game server remaining healthy and running throughout the frontend update. A fresh browser load verified the guide now shows `1 NPC` alongside plural counts. No further gap was identified in this review's scope; the documented limits on exhaustive runtime and artwork verification still apply.

## Marketplace and helper-return review — 2026-10-04

Found and fixed marketplace text that bypassed presentation localization: item names in grouped browsing, seller listings, personal sales, returned-item/gold claims and purchase confirmations; listing status labels; the expired-duration fallback; and the `oro` suffix in gold claims. Seller names, transaction IDs, amounts and raw server state remain unchanged. Item graphic accessibility labels already used the localized wrapper.

The direct-display audit now covers `itemName`, `npcName` and `mapName`, not only generic `name` fields. A new cross-component helper-return audit checks JSX calls to functions returning known Spanish literals (four such display boundaries currently), and marketplace regression cases execute the actual status/duration helpers with fixed times, all four listing statuses and both locales. This audit is deliberately bounded and does not claim whole-program data-flow analysis.

The complete English gate, read-only 3,704-value game-data audit and 49-route production build passed. The build-specific configuration avoided the stale-cache failure without restarting the realm. V12 is active. In-browser checks verified the existing test character's inventory, welcome console and clan empty state; populated marketplace sales, claims and confirmation states were verified in source/tests rather than a completed live market flow. No buying, selling, claiming, clan mutation or wallet operation was performed. The existing exhaustive-runtime and artwork caveats remain.

## Expanded display-path review — 2026-10-04 (v14)

Reviewed JSX identifiers, conditional expressions, helper outputs, and data properties beyond the previous literal-only checks. Fixed browser acceleration instructions and browser labels, party map positions, clan eligibility reasons, challenge participant classes, compound crafting statistics, compact-chat channel names, statistics visibility values, and singular wiki NPC/spawn labels. A live follow-up caught the statistics loading/empty fallback `Sin datos`; both display locations now use the locale adapter.

The final source pass found no additional actionable translation gaps among the candidates inspected. Remaining candidates were numeric values, key bindings, technical configuration paths, user-authored names/messages, intentional spell incantations, or values already localized upstream. Spanish source strings and the optional Spanish locale remain intact.

Validation: expanded English gate passes, including browser-help branches for five desktop browser categories and bilingual party/clan/crafting fixtures. The direct data-display guard now includes className and stats. Current database audit: 3,704 fields checked; 3,406 translated, 298 intentionally preserved, zero unclassified. These counts overlap other fixture coverage and must not be added together. Production build/type checking passed. No game-server restart or account/game-data mutation was needed.

Live review covers the online statistics page; rare clan, party, hardware-warning, and crafting branches are verified through source and regression fixtures rather than every possible populated live state. This is a clean reviewed pass, not proof that every possible runtime string has been exercised.

## Accessibility and metadata review — 2026-10-04 (v15)

Reviewed title/alt/placeholder/aria-label attributes, custom component label/description props, all 77 LocalizedLabel wrappers, canvas text entry points, exported social-image labels, page metadata and manifest. No new gameplay display gaps were identified in these paths. Custom stats, NPC and market labels translate inside their components; canvas NPC text translates at its existing boundary, preserving player-authored names and speech.

Fixed the raw Updates social-image alt export (`Updates de AOWeb` -> `AOWeb updates`) and localized/trimmed metadata keywords, including `top nivel` -> `highest level` and `MMORPG web` -> `Browser MMORPG`. The alt export was a latent gap: the current Updates page overrides it with the already-English page title. The public page therefore correctly serves `Updates, changelog and roadmap` as og:image:alt, not the image module's default alt.

Added regression checks for exported image alt strings and actual metadata-helper keyword/title/locale output. Full English gate and production build/type check passed. Follow-up attribute/source scan found no further actionable gaps in the inspected paths. Public HTML verification confirms English Updates/ranking image labels and ranking keywords; the game server remained running. No gameplay data, wallets, or accounts were changed.

## Default left console layout

Console starts visible. Wide desktop windows place channels, scrolling messages and Enter chat input in the left sidebar. The game, sidebar, inventory and macros scale together to fit short windows; narrower windows retain the compact layout. Verified live at 1280 x 720 with Spelltester: connection messages, character inspection and First Hunt title; Enter opens the sidebar input and Escape closes it while keeping the console visible. Test character logged out normally. English regression suite and production TypeScript/build passed. Shared game server was not restarted.

![Default console beside the game](../console-left-ingame.png)


## Persistent console and outgoing channels — 2026-10-05

The log now merges game, Global, Party, Clan and Private entries chronologically. Channel selection changes the outgoing message destination and opens input; it never filters the log or changes its Console heading. Removed the compact-view hide-console button. Existing commands and recipient routing remain in use. Live QA selected all four channels with Spelltester and retained connection messages, character inspection and cosmetic title. Private-selected screenshot below. No test messages were sent to other players. English gate, production build and a focused chronological-merge/visibility check passed. Test character logged out normally; shared server not restarted.

![Private selected with game console still visible](../console-persistent-ingame.png)





