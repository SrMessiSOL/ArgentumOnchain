# Cosmetic ownership-change validation — 2026-10-05

The ownership lifecycle passes the API, game-server and browser regression tests. The existing implementation did not need a runtime change for these cases. No NFT was transferred, no SOL was spent, and no live database records or player sessions were modified by this review.

## Verified behavior

- An issued crest belongs to Alice's linked wallet and can be equipped by Alice.
- After a simulated confirmed transfer to Bob, Alice's status and console-inspection title lose the cosmetic. Alice and an unrelated third account cannot equip it.
- Bob can equip the same issued asset through the received-asset path without a new claim or mint. Returning ownership to Alice revokes Bob's access.
- Wrong issuer, unknown asset, missing/burned asset and a replaced linked wallet fail closed.
- RPC outages remove verified presentation; recovery rechecks ownership. Unequipping remains possible during an outage.
- The game server replaces the old holder in its nearby snapshot after verification refresh. A new login session starts without inherited verification, then displays the crest after a successful check.
- The actual binary snapshot encoder and browser decoder/handler remove the old holder and display the new holder. Stale browser snapshots expire and wrong-map snapshots are ignored.

## Evidence and limits

Six API tests passed across cosmetic-ownership-lifecycle.test.ts and cosmetic-inspection.test.ts, using the real HTTP routes, isolated in-memory storage and mocked chain responses. Server replication tests passed transfer, reconnect, outage/recovery and transfer to an unlinked holder. Browser snapshot tests and the full English suite passed. API and game-server TypeScript checks passed.

This verifies application behavior under simulated ownership changes. It is not proof of a signed devnet transfer. The previously deployed remote crest was already verified visually from another account; no new deployment or restart was required for this test-only change.

Ownership changes use periodic verification: normally up to 15 seconds to recheck, plus the next two-second snapshot. A slow RPC or many online players can take longer. Server verification expires after 35 seconds and browser snapshots after six seconds. These crests grant no gameplay rights or economic rewards.

## Re-run

From api: npm run test:cosmetic-ownership

From the project workspace: run server/src/cosmeticReplication.test.ts with tsx.

From frontend: npm run test:english (includes remote-cosmetics.test.ts).
