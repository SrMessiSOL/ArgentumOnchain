# Tier 1 vendor rollout

Prepared here; not applied to the hosting database. The web-only Wiki and wallet changes deploy through Vercel. Vendor eligibility and stock require the hosting computer.

Tailoring uses the **sewing kit (Costurero)**. Equip and use it to open the tailoring menu. Carpentry uses a handsaw; blacksmithing uses a blacksmith hammer and nearby anvil.

The Tier 1 exception permits normal weapons, armor, shields, helmets, magical instruments and ships even when obtained through crafting or drops. Newbie items and gold remain excluded; higher tiers retain the existing rules. The database's current `tier` field is authoritative; frontend artwork data is not used to decide stock.

On the Windows host:

1. Pull the latest repository and make the normal database backup. Build the API and game server using the host's existing installation procedure.
2. From `api`, run `node dist/scripts/stockTierOneVendors.js` with the host's existing environment. Default mode only reports a plan.
3. Review the NPC names and added IDs. Clothing goes to tailors/robe shops, weapons to smiths/weapon shops, armor and shields/helmets to armor shops, magical gear to mages, and ships to ship vendors. A shop with a single existing equipment trade can be classified from that stock. Mixed and unknown shops are not guessed. Unsupported items or categories with no suitable shop block application and require explicit mapping.
4. Apply using `node dist/scripts/stockTierOneVendors.js --apply --backup C:\AOCHAIN\backups\tier-one-vendors-before.json`. Use a new backup filename; it refuses to overwrite one. The backup directory must already exist.
5. Activate the updated game-server vendor policy during a scheduled empty-server restart, then verify the shops in game. Database revisions use the existing synchronization mechanism. Do not claim stock is active merely because Vercel deployed.

The update uses the live catalog, preserves existing stock quantities, adds missing stock at 1,000 units, and restores zero-stock entries. It locks affected catalog tables and commits all NPC changes in one transaction with revision/checksum updates. Repeating it does not add duplicates. Backup contains NPC definitions only, no player data or keys. For rollback, restore the backup definitions using the existing game-data NPC importer and restore the previous policy commit if needed; verify the import plan before applying.

Independent skill training remains a separate server/database project. No skill progression or player inventories are changed by this rollout.

Validation here: vendor policy tests, stock planner tests and API type checks pass. A rehearsal using the bundled Wiki snapshot found 18 Tier 1 entries and 16 shops requiring additions, with no unresolved groups. This is sample data, not proof of the live catalog or installed stock. After inspecting the backup, rollback can use `node dist/scripts/importGameData.js npcs --npcs-path <backup file>`; the backup is keyed by NPC ID in the importer format.
