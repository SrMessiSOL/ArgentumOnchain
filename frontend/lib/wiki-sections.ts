export const WIKI_SECTIONS = ["factions", "maps", "npcs", "equipment", "spells", "crafting"] as const;

export type WikiSection = (typeof WIKI_SECTIONS)[number];

export const WIKI_SECTION_LABELS: Record<WikiSection, string> = {
    crafting: "Crafting",
    factions: "Facciones",
    npcs: "NPCs",
    maps: "Mapas de entrenamiento",
    equipment: "Equipamiento",
    spells: "Hechizos",
};

export function getWikiSectionHref(section: WikiSection): string {
    return `/wiki/${section}`;
}
