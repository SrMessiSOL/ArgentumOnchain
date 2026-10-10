# NPC vendor policy

NPC purchases use an explicit catalog in `server/src/npcVendorPolicy.ts`.
Only reviewed provisions, drinks, travel tickets and basic
clothes may be sold by NPCs. Non-newbie potions and worker tools (including
the elven woodcutting axe and sewing kit) are exceptions to the acquisition-source rule.
Stock entries outside this policy are hidden and direct purchase requests are
rejected before balances or inventory change. The policy does not add stock.

Any crafting or smelting output, or item appearing in any NPC drop table, is
excluded from NPC commerce except potions and worker tools. This source check
also applies when players sell to NPCs. Items without those sources can still
be sold to NPCs, even when outside the NPC purchase catalog.

Banks, player trades, item NFT exports, existing inventory and drop/recipe
definitions are unaffected. House keys, spell books, advanced equipment and
unreviewed new items cannot be purchased from NPCs merely because their recipe
or drop data is absent. Adding a new non-potion item requires explicit catalog
review. Tests cover unknown stock, advanced equipment, starter gear, tools,
potions, drops, recipes, deleted recipes, smelting, travel tickets and gold.

Host deployment and the authenticated catalog report are separate from source
verification. Regenerate the report against the current realm before claiming
an installed catalog count; old reports describe the previous policy.

Newbie items are never bought or sold by NPCs, including newbie potions and worker tools. The newbie flag and known legacy newbie IDs take precedence over every catalog exception.
The canonical Costurero (sewing kit) is also a worker-tool exception. Its newbie flag still blocks both buying and selling. This policy permits existing stock; it does not create missing vendor stock.
