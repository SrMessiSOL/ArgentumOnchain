# Content and skills host rollout

Prepared locally; not activated on the hosting computer. Do not restart an occupied realm.

## Vendors and keys

The combined stock planner uses live objects/NPCs and authoritative map placements. It adds Tier 1 stock, sewing kits (237) to tailors, and house keys to a vendor unique to their town, preferring property vendors. It refuses ambiguous shared NPC templates rather than distributing another town's keys. Bundled keys exist for Ullathorpe, Nix, Banderbill, Lindos and Arkhein. Towns without house-key definitions need house/door data first. Selling keys does not implement house ownership or door unlocking; that gameplay is a separate unfinished feature.

On the host, back up the database. Build API/server using the existing host procedure. From api:

```
node dist/scripts/stockTierOneVendors.js --maps-dir ../server/mapas_source
node dist/scripts/stockTierOneVendors.js --maps-dir ../server/mapas_source --apply --backup C:\AOCHAIN\backups\vendors-content-before.json
```

Review the dry-run before apply. If host NPC placements are overridden, construct a reviewed map directory containing canonical meta.json and CURRENT npcs.json for every map; use that directory instead. Never assume bundled placements reflect the running realm.

## Tailoring

Equip/use the sewing kit. Ten additional recipes use existing clothing assets: common clothes, both peasant outfits, beggar clothes, coarse red robe, small-race mage robe, apprentice toga, blue robe, red robe and monk robe. Costs/skill requirements are provisional balance choices recorded in api/src/jsons/tailoringExpansion.json. No new artwork is invented.

```
node dist/scripts/addTailoringRecipes.js
node dist/scripts/addTailoringRecipes.js --apply
```

The first command is read-only. Apply adds missing recipes only, with checksums/revisions and one transaction; existing custom recipes are preserved. Missing live output/material IDs block the update. Record IDs from the live recipe table before/after for rollback through the existing recipe administration path. Restart only on an empty server and verify craft consumption/output, inventory save and reconnect. Existing 17 unresolved bundled output references remain explicitly marked in the Wiki; repair against the host catalog before claiming full live coverage.

No botany/alchemy profession or potion recipes exist in the inspected implementation. Potions are currently acquired, not crafted. A potion profession needs an explicit tool, materials, recipes, training rules and balance pass.

## Natural and assigned skills: disabled by default

Apply api/schema.sql (idempotent nullable skill_state column), build both services, and retain AOWEB_NATURAL_SKILLS unset for the existing level-times-three behavior. Nullable skill state is excluded from old blockchain snapshot hashes; populated state travels with the character.

For a PRIVATE test realm only, set AOWEB_NATURAL_SKILLS=1. Natural skill and assigned points are separate per-character records, effective total capped at 100. Accepted server actions train gathering, fishing, crafting, smelting, combat, hiding and navigation, at most once per skill per five seconds. Ten plus twice current natural skill accepted events yield one natural point. New characters start with 20 assignable points, plus five per level gained. Existing characters inherit their previous level-times-three baseline. Arena templates retain legacy skills. These are provisional balance rules.

Use /skills and /assignskill <skill> <points>. Keys: tactics, defense, weapons, projectiles, wrestling, hiding, stabbing, magic, mining, woodcutting, fishing, carpentry, tailoring, blacksmith, smelting, navigation. Only the authenticated game-server save path persists this state. No public XP assignment endpoint was added.

AOWEB_NAVIGATION_SKILL_REQUIRED optionally sets the sailing requirement (0..100); default 0. It is enforced only with natural skills enabled, on boarding, allowing existing sailors to disembark. Set a nonzero value only after ensuring beginners can allocate navigation points. Smelting skill progresses but existing smelting eligibility is unchanged.

Before activation test: training/cooldown, point allocation and level grants, rejected actions, crafting material failure, reconnect/save and crash recovery, character withdraw/deposit/market transfer preserving skills, and navigation below/at threshold. Local unit/type checks are not host, crash-recovery or wallet proof. Wiki minimum levels currently describe the legacy level-times-three realm; update that presentation when enabling independent skills.

## Authoritative Wiki coverage

The web catalog includes every known bundled object, including ships and other game objects. Crafting includes every configured recipe, with unknown references and pending additions visibly marked; not every item is craftable.

After updating host content, export a fresh public snapshot:

```
node dist/scripts/exportPublicWiki.js --output C:\AOCHAIN\exports\wiki-current.json
```

Review and replace frontend/lib/wiki-snapshot.json with this public catalog export, regenerate crafting-wiki.json from the authoritative recipes and object names, run Wiki checks and deploy Vercel. It contains public game definitions, not player inventories. Vercel uses the bundled snapshot so a server-only change does not refresh the deployed Wiki automatically.
