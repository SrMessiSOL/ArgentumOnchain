# Player portal redesign

Current verdict: individual controls work, but the entry and asset pages read as a development dashboard, not a coherent game portal.

Observed sequence: home -> character selection -> tiny clickable roster -> game. The character page offers creation and achievements but no explicit Enter action; wallet management mixes all transfer types on one page.

Five priority defects:
1. Roster click immediately starts play without a visible primary action. Select first, then Enter realm.
2. Character identity is visually weak: small sprites, blue text on dark backgrounds, class/race/map codes. Show a large equipped hero with readable name, class and level.
3. Seven equal navigation items compete. Use player-facing labels and a clear Play action; community and guides remain discoverable.
4. Collection requires scrolling through unrelated controls. Separate Characters, Items, Gold, Titles and Activity; keep wallet identity in a compact sidebar.
5. Infrastructure vocabulary dominates the copy. Explain each player action briefly; keep staking/operator mechanics in expandable ownership details. Devnet and transaction approval remain explicit.

Returning-player first 30 seconds: select a familiar character -> see equipped appearance and class -> Enter realm -> move with WASD, explore and hunt -> receive combat/loot feedback. New players first create an account and approve character minting with their wallet; that longer journey is explained in the guide. Keep the established off-chain combat and game HUD unchanged. Progress is character level. Titles and ownership management are optional later visits.

Keep: realtime game, explicit play entry, roster, class/level, marketplace, wallet approvals, recovery and devnet identity.
Delay: mint/stake explanation, transfer mechanics, titles, listing forms until their relevant page or tab.
Remove from the play landing: map codes, competing achievements panel and implicit card-click launch.

Implemented scope: navigation, character entry layout, collection information architecture, getting-started guide, sign-in destination and marketplace heading/style consistency. Collection gold controls reuse the existing deposit and withdrawal operations. No gameplay, ownership rules, chain instruction or settlement policy changes; no destructive data changes.
