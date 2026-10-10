# Crafting Wiki coverage

All 76 configured crafting/smelting recipes are represented. Ten additional tailoring recipes are marked pending host activation. Seventeen original output references lack bundled object definitions and remain visible as Item #ID with a catalog-repair warning rather than being silently omitted. Every known bundled object appears in the Equipment catalog; additional categories include boats and other game items. Unknown supplemental prices/classes are shown as unavailable, not guessed.

This is bundled-data coverage, not proof that every live-host item is synchronized. Follow GAME-CONTENT-AND-SKILLS-ROLLOUT.md to export the authoritative catalog and activate content. Not all items have recipes: potions currently have no alchemy profession. Minimum crafting level reflects the currently active legacy level-times-three skills; independent skills remain gated off.

Validation: frontend/scripts/test-crafting-wiki.mjs compares all recipe IDs, materials, quantities, skill requirements, pending flags and unresolved references against source definitions. Server/API recipe files must match.
