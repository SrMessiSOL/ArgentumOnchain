# Remote cosmetic crest replication

Activated on the shared realm after user-confirmed logout, successful world save and backup. Frontend build: remote-crests-20261005-v1.

The game server asynchronously verifies equipped cosmetic ownership through the existing authenticated internal API. It caches verification per character session, with 15-second refresh and a 35-second hard expiry. Failed verification immediately clears the cached cosmetic. At most eight requests run simultaneously. No movement or combat waits on these requests.

Every two seconds the server sends a complete nearby cosmetic snapshot (packet 82: map, character runtime ID, fixed cosmetic kind only). It uses the existing area visibility range and excludes dead/hidden/invisible/offline characters. No wallet, account, NFT address, arbitrary metadata or RPC content is broadcast. Browser snapshots expire after six seconds without updates and replace the previous set, so unequip removes an existing crest. Map mismatches are ignored. Existing local-player cosmetics and console inspection remain in use.

Remote crests follow the same nameplate positioning and renderer as the local crest. No client request can choose another character's cosmetic. Ownership/equipment changes propagate after the next verification (normally within 17 seconds); this is not an instantaneous transfer event listener.

Validation: server type check; tests for multi-player snapshots, unequip, swapping, stale ownership, verification failure, session replacement, map filtering, hidden states and bounded concurrency; actual encoded server frame decoded by the frontend plus real incoming handler replacement and malformed-frame tests. Existing Pixi crest tests cover creation, movement anchoring, stable reuse, hide, swap and cleanup. Full English and frontend production build are required before activation. Live visual verification passed: Crestobserver (an independent account with no equipped cosmetic) saw the remote First Hunt crest beside SrMessi and the same title in console inspection.

Production frontend build remote-crests-20261005-v1 and all English/remote-cosmetic tests passed. Verification scheduling prioritizes sessions checked least recently. Activation completed.

The dedicated Spelltester fixture connected through a separate websocket. Unequipping its cosmetic removed one equipped entry from the nearby server snapshot; original equipment was restored through the existing verified equip endpoint. This was a reversible equipment change, not an on-chain transfer. Both agent test characters logged out normally; user sessions were left connected.

![Remote crest and console title from the observer account](../../../remote-crest-observer.png)

Ownership-change review completed on 2026-10-05: see COSMETIC-OWNERSHIP-VALIDATION.md for simulated transfer, receiver equipping, reconnect and outage evidence. No runtime change or restart was needed.
