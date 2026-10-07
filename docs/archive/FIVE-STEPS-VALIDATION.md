# Five-step completion plan

Work is confined to the existing PC-hosted shared AOWeb world and Solana devnet. No paid hosting, mainnet deployment, public repository publishing or personal-wallet transaction is required.

1. Finish the normal player journey using the existing disposable level-2 mage: successful shop buy/sell, inventory consumption and persistence; retain the previous live character creation/combat/level-up/death/resurrection evidence. Do not grant gold or levels to make the walkthrough pass.
2. Complete English text encountered on that journey, including command feedback, loading, status and shop flows. Preserve original Spanish, protocol values and player-authored chat.
3. Add dependable local start/stop, health checks, consistent database backups and an isolated restore rehearsal. Preserve devnet configuration on restart. The temporary tunnel and PC availability remain explicit hosting limits.
4. Measure increasing concurrent authenticated clients on an isolated copy of the database/server. Report actual latency/errors/resource use, distinguish idle from moving players, and do not claim 100-player production capacity without evidence.
5. Transfer the existing badge between dedicated test wallets on devnet, verify both owners' equip behavior, then add one bounded rare cosmetic with authoritative eligibility and issuance limits. Verify real chain receipts separately from mocked regression tests.

Each step will record results and limitations below. Database restore and load tests must never target the live database. Destructive test cleanup must be restricted to exact generated test artifacts or disposable test accounts.

## 1. Normal player journey — verified

Combined the earlier live character creation, explicit select/Cast/target combat, earned level 2, death and priest resurrection walkthrough with a new normal merchant journey. Spelltester began with the legitimately earned 12 gold. Bought three red apples for 3 gold, sold one for the game's 0-gold resale value, consumed one with U, bought a drink for 3 and sold it for 2. Ended with 8 gold and one purchased apple. No levels, inventory or gold were granted through database edits.

Normal logout saved the inventory, map 1 position (48,64), level 2 and 10/420 XP. After an API/game restart, the browser reconnected with those values and the purchased apple intact. The equipped First Hunt crest also appeared in the HUD. Evidence: `../journey-receipt.json`, `../english-shop-verified.png`; prior combat/death evidence: `../mage-priest-english.png`, `../mage-level-two-saved.png`.

## 2. English journey and Spanish option — verified

385 bilingual catalog entries. Added normal merchant consumable names, loading stages/details, visible map/position labels, logout text and online-record messages. Corrected map accessibility text, the Strength icon label and the rendered Safety indicator. Existing English command aliases remain active.

The live merchant showed English names, buy/sell totals and inventory, then Spanish, then English without reconnecting. Regression checks preserve original wire values, numeric parameters and player-authored chat. Frontend production build and TypeScript passed. This completes the tested journey's UI text; it is not a complete translation of every world NPC, advanced menu or embedded bitmap sign.

## 3. Local operations, saving and backups — verified

Added authenticated local save and game health endpoints; unauthorized save returns 401 and public gateway access returns 404. Autosave is capped at 60 seconds even when older database balance settings request 30 minutes. Save/backup/stop/start passed; a second launch reused the existing healthy services. Shutdown refusal with a connected character was verified without stopping any service. Devnet issuance and the linked account survived restart.

The maintenance service checks API/game availability every 30 seconds and saves/backs up every 30 minutes. Its forced-backup path passed. Database backup restored into a separate database with 4 accounts, 4 characters, 1,062 objects, 340 NPC templates and 2 cosmetic claims. The issuer/config bundle is protected with Windows DPAPI and passed a decrypt round trip. See `../backup-restore-receipt.json`, `../operations-receipt.json`, `../maintenance-recovery-receipt.json` and [OPERATIONS.md](../OPERATIONS.md). The PC and temporary tunnel remain development hosting, not a 24/7 release.

## 4. Multiplayer capacity — measured

Tested a separate API/game checkout against a restored database on loopback. Prepared 110 distinct accounts and characters through normal auth/creation APIs. Each tier ran 20 seconds of idle connections and 40 seconds of attempted walking, with one ping per second per client. The game server reported the expected player counts. Test processes were stopped afterward.

| Clients | Idle ping p95 | Walking ping p95 | Walking ping p99 | Position changes | Disconnects / decode errors |
| --- | --- | --- | --- | --- | --- |
| 25 | 14.0 ms | 24.0 ms | 41.2 ms | 2,647 | 0 / 0 |
| 60 | 10.9 ms | 37.2 ms | 50.4 ms | 5,680 | 0 / 0 |
| 110 | 12.7 ms | 65.8 ms | 86.0 ms | 9,501 | 0 / 0 |

Walking collisions/blocked tiles mean not every move attempt changes position. This measures actual server-authoritative movement, not only open sockets. Game peak working set over its process lifetime was 1,198.5 MiB on an AMD Ryzen 5 PRO 4650U (12 logical processors). CPU time includes startup and post-test idle; it is not a steady-state CPU percentage. Evidence: `../multiplayer-load-report.json`, `../multiplayer-resource-report.json`, reproducible harness `server/scripts/load-rehearsal.ts`.

This is a short local baseline. It does not establish WAN latency, browser rendering, long-duration stability or mass-combat capacity for 110 humans.

## 5. Solana transfer and rare cosmetic — verified on devnet

Transferred the Explorer badge from its dedicated test owner to a second generated test wallet. The old owner immediately lost equip eligibility; the recipient equipped it. Returned it and verified the reverse restrictions, restoring the original account. Both transactions are recorded in `../devnet-transfer-receipt.json`. No personal wallet or mainnet funds were used.

Added First Hunt, a cosmetic crest earned by one saved character reaching level 2 and defeating four NPCs. The API reserves at most 100 claims for this season. Reservations survive account deletion and ambiguous RPC results; concurrent final-slot claims and sold-out retries pass integration tests. Assets use distinct deterministic season addresses. The cap is a trusted application/database rule, not a custom Solana program supply constraint. Cosmetics do not change combat stats.

Claimed First Hunt through the public browser interface using the already-linked test wallet. Independently verified its actual devnet owner, issuer, name, metadata URI and idempotent claim. Equipped it in the browser and verified it in the game HUD. Asset: `5NV9Xy19jjQKVVW6Gq9nEmSQUsFXZ41vBxDhXmNb3kiY`; 99 claims remain. Evidence: `../devnet-first-hunt-receipt.json`, `../first-hunt-equipped.png`. The wallet screen also allows a recipient to enter a registered cosmetic address for ownership-checked equip.

Mocked-chain integration tests cover auth, eligibility, wallet/session boundaries, concurrent claims, ambiguous mint recovery, ownership changes and supply exhaustion. Actual devnet receipts are separate evidence. Metadata still uses the temporary tunnel and needs permanent hosting before a production launch.
