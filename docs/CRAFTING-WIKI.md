# Crafting wiki

The public `/wiki/crafting` page covers carpentry, tailoring, blacksmithing and smelting with profession filters, localized item/material names, actual item graphics and a 1–9999 quantity calculator. It is a reference only and does not invoke gameplay or settlement operations.

The checked-in snapshot uses `server/jsons/craftingRecipes.json`, `server/jsons/smeltingRecipes.json` and `frontend/public/init/objs.json`. It contains 46 resolvable crafting recipes and three smelting recipes. Seventeen crafting outputs have no bundled object definition and are excluded rather than assigned invented names or images. Live database overrides can differ; the page says this explicitly.

Crafting currently uses `min(100, level * 3)` as skill. The wiki shows the corresponding minimum playable level. Carpentry uses a handsaw, tailoring a sewing kit, and blacksmithing an equipped blacksmith hammer plus an anvil within two tiles. Smelting uses ore and a forge; its configured skill rating is not enforced by the current smelting handler. The page distinguishes this rating from crafting eligibility.

Run `npm run test:wiki` from `frontend` to verify every snapshot recipe/name/material quantity against its bundled source. Update the snapshot when these source definitions change. English release regressions and the production build also validate the page. Browser QA checked profession/search filters, 10-ingot totals (130 iron, 250 silver, 500 gold ore), localized Spanish ingredient search, and a 390x844 layout without horizontal overflow.

A recent NPC-vendor error message was missing its English translation; this change adds it so the current English release tests pass. No live game-server restart or recipe/balance mutation is required for the wiki update.

## Crafting and use requirements

Crafting cards name the profession and required skill, and show the character level derived from the current server rule (level × 3, capped at 100). Boat (474): Carpentry 75, level 25. Galley (475) and Galleon (476): Carpentry 100, level 34. Equipment includes these three ships and shows recipe requirements separately from use requirements. The current equip and navigation handlers do not impose a minimum level or skill; class, race, faction and newbie restrictions remain applicable. No new gameplay requirements are introduced. Smelting recipe ratings remain informational because the current handler does not enforce them.
