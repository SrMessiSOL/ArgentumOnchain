# Local AOWeb + Solana pivot

Decision (2026-10-03): run the existing dcatanzaro/aoweb game at f55f02635e008ed0e831742d28be5385f0583bd3. The separate LambdaClass/Canvas experiment remains preserved. Do not rebuild AO gameplay.

Implementation order:
1. Run the supplied API, game server, browser client and game data locally, using an isolated PostgreSQL cluster. Keep original maps, classes, combat, spells, inventory and progression.
2. Add optional account wallet linking outside the realtime loop, then one explicitly scoped collectible/cosmetic. Wallet linking alone is not on-chain ownership. No wallet transactions without user action.
3. Translate the existing experience incrementally: English-first entry/account UI, then catalogued game text, retaining Spanish. No claim of complete English support yet.

Local ports: browser 3100, API 3101, websocket 7766, PostgreSQL 55432. Bind services to loopback. Disable email. No public deployment, existing database modification or mainnet actions.

License boundary: the repository has no root license; server package metadata says ISC. Frontend, data and asset rights remain unresolved. This checkout is a local technical evaluation, not cleared for redistribution/commercial launch.

The PostgreSQL 18 dump will be imported into a separate PostgreSQL 16 cluster using a compatibility copy if necessary. Preserve the upstream dump. Do not import public account/session records; retain only game seed data if present.

Single-world decision: the user requires one shared server for everyone. Root now goes straight to character selection. Arena navigation is removed; arena URLs redirect and their APIs and existing arena tickets are rejected. Preserve original arena source/data dormant; no deletion or public deployment. Open-world PvP is unaffected.

