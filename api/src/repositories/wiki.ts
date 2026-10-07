import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";
import { getCurrentGameNpcVersion, listGameNpcChangesSince } from "./gameNpcs";
import {
    getCurrentGameObjectVersion,
    listGameObjectChangesSince,
} from "./gameObjects";
import {
    getCurrentGameCraftingRecipeVersion,
    listGameCraftingRecipeChangesSince,
} from "./gameCraftingRecipes";
import {
    getCurrentGameSmeltingRecipeVersion,
    listGameSmeltingRecipeChangesSince,
} from "./gameSmeltingRecipes";
import {
    loadAllMapNpcPlacements,
    type MapNpcPlacement,
} from "../lib/mapNpcStorage";

type WikiMapMetadata = {
    id: number;
    name: string;
    terreno: string;
    zona: string;
    restringir: string;
    minLevel: number;
    maxLevel: number;
    pk: boolean;
};

type WikiMapReference = {
    mapId: number;
    mapName: string;
    spawns: number;
};

type WikiItemReference = {
    itemId: number;
    itemName: string;
    quantity: number;
};

type WikiNpcReference = {
    npcId: number;
    npcName: string;
    quantity: number;
};

type WikiSpellSourceReference = {
    itemId: number;
    itemName: string;
    soldBy: WikiNpcReference[];
    droppedBy: WikiNpcReference[];
};

type WikiNpcEntry = {
    bodyId: number;
    headId: number;
    id: number;
    name: string;
    npcType: number;
    npcTypeLabel: string;
    description: string;
    maxHp: number;
    expReward: number;
    goldReward: number;
    minHit: number;
    maxHit: number;
    defense: number;
    expPerHp: number | null;
    isCombatNpc: boolean;
    maps: WikiMapReference[];
    sells: WikiItemReference[];
    drops: WikiItemReference[];
    totalSpawns: number;
    searchIndex: string;
};

type WikiEquipmentCategory =
    | "weapon"
    | "armor"
    | "shield"
    | "helmet"
    | "magic_weapon";

type WikiEquipmentEntry = {
    id: number;
    name: string;
    grhIndex: number;
    objType: number;
    objTypeLabel: string;
    category: WikiEquipmentCategory;
    categoryLabel: string;
    value: number;
    minHit: number;
    maxHit: number;
    minDef: number;
    maxDef: number;
    tier: number;
    newbie: boolean;
    blockedClasses: number[];
    soldBy: WikiNpcReference[];
    droppedBy: WikiNpcReference[];
    searchIndex: string;
};

type WikiSpellEntry = {
    id: number;
    name: string;
    description: string;
    type: number;
    typeLabel: string;
    minSkill: number;
    manaRequired: number;
    target: number;
    words: string;
    minPower: number;
    maxPower: number;
    sources: WikiSpellSourceReference[];
    searchIndex: string;
};

type WikiTrainingMapEntry = WikiMapMetadata & {
    totalNpcSpawns: number;
    totalCombatSpawns: number;
    uniqueCombatNpcs: number;
    topNpcs: Array<{
        npcId: number;
        npcName: string;
        spawns: number;
        expReward: number;
        maxHp: number;
    }>;
    searchIndex: string;
};

export type PublicWikiResponse = {
    generatedAt: string;
    stats: {
        npcCount: number;
        combatNpcCount: number;
        equipmentCount: number;
        spellCount: number;
        trainingMapCount: number;
    };
    npcs: WikiNpcEntry[];
    equipment: WikiEquipmentEntry[];
    spells: WikiSpellEntry[];
    trainingMaps: WikiTrainingMapEntry[];
};

const CURRENT_EXP_MULTIPLIER = 5;
const CURRENT_GOLD_MULTIPLIER = 3;
function resolveApiDataPath(): string {
    const candidates = [
        path.resolve(__dirname, ".."),
        path.resolve(__dirname, "..", "..", "src"),
    ];

    for (const candidate of candidates) {
        if (
            existsSync(path.join(candidate, "jsons", "spells.json")) &&
            existsSync(path.join(candidate, "mapas_source"))
        ) {
            return candidate;
        }
    }

    return candidates[0];
}

const API_DATA_PATH = resolveApiDataPath();
const MAPS_SOURCE_PATH = path.join(API_DATA_PATH, "mapas_source");
const SPELLS_PATH = path.join(API_DATA_PATH, "jsons", "spells.json");

const NPC_TYPE_LABELS: Record<number, string> = {
    0: "Comun",
    1: "Sacerdote",
    2: "Guardia",
    3: "Entrenador",
    4: "Banquero",
    5: "Noble",
    6: "Dragon",
    7: "Timbero",
    8: "Guardia del Caos",
    9: "Sacerdote Newbie",
    10: "Comerciante",
};

const OBJECT_TYPE_LABELS: Record<number, string> = {
    1: "Comida",
    2: "Armas",
    3: "Armaduras",
    4: "Arboles",
    5: "Dinero",
    6: "Puerta",
    7: "Contenedor",
    8: "Carteles",
    9: "Llaves",
    10: "Foros",
    11: "Pociones",
    12: "Libros",
    13: "Bebidas",
    14: "Lenia",
    15: "Fogata",
    16: "Escudos",
    17: "Cascos",
    18: "Anillos",
    19: "Teleport",
    20: "Muebles",
    21: "Joyas",
    22: "Yacimientos",
    23: "Metales",
    24: "Pergaminos",
    25: "Aura",
    26: "Instrumentos",
    27: "Yunque",
    28: "Fraguas",
    29: "Gemas",
    30: "Flores",
    31: "Barcos",
    32: "Flechas",
    33: "Botellas vacias",
    34: "Botellas llenas",
    35: "Manchas",
};

function getNpcTypeLabel(npcType: number): string {
    return NPC_TYPE_LABELS[npcType] ?? `Tipo ${npcType}`;
}

function getObjectTypeLabel(objType: number): string {
    return OBJECT_TYPE_LABELS[objType] ?? `Tipo ${objType}`;
}

function getEquipmentCategory(objType: number): {
    key: WikiEquipmentCategory;
    label: string;
} | null {
    switch (objType) {
        case 2:
            return { key: "weapon", label: "Armas" };
        case 3:
            return { key: "armor", label: "Armaduras" };
        case 16:
            return { key: "shield", label: "Escudos" };
        case 17:
            return { key: "helmet", label: "Cascos" };
        default:
            return null;
    }
}

function isMagicWeapon(
    data: Record<string, unknown>,
    objType: number,
): boolean {
    const normalizedName = normalizeSearchText(String(data.name ?? ""));

    return (
        objType === 26 ||
        normalizedName.includes("baston") ||
        normalizedName.includes("laud") ||
        normalizedName.includes("flauta")
    );
}

function getSpellTypeLabel(type: number): string {
    switch (type) {
        case 1:
            return "Activo";
        case 2:
            return "Utilidad";
        default:
            return `Tipo ${type}`;
    }
}

function toNumber(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeSearchText(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function isCombatNpc(data: Record<string, unknown>): boolean {
    const maxHp = toNumber(data.maxHp) || toNumber(data.hp);
    return (
        maxHp > 0 &&
        (toNumber(data.exp) > 0 ||
            toNumber(data.gold) > 0 ||
            toNumber(data.minHit) > 0 ||
            toNumber(data.maxHit) > 0 ||
            toNumber(data.poderAtaque) > 0)
    );
}

function isLocalMapName(name: string): boolean {
    return normalizeSearchText(name).includes("local");
}

function isTrainingMapCandidate(map: WikiMapMetadata): boolean {
    const normalizedName = normalizeSearchText(map.name);
    return (
        map.zona !== "CIUDAD" &&
        map.restringir !== "GM" &&
        !normalizedName.includes("local") &&
        !normalizedName.includes("gms")
    );
}

async function readMapNpcSpawns(): Promise<MapNpcPlacement[]> {
    return loadAllMapNpcPlacements(MAPS_SOURCE_PATH);
}

async function readMapMetadata(): Promise<Map<number, WikiMapMetadata>> {
    const metadata = new Map<number, WikiMapMetadata>();
    if (!existsSync(MAPS_SOURCE_PATH)) {
        return metadata;
    }

    const entries = await fs.readdir(MAPS_SOURCE_PATH, { withFileTypes: true });

    await Promise.all(
        entries
            .filter(
                (entry) => entry.isDirectory() && /^mapa_\d+$/.test(entry.name),
            )
            .map(async (entry) => {
                const match = entry.name.match(/^mapa_(\d+)$/);
                if (!match) {
                    return;
                }

                const mapId = Number(match[1]);
                const metaFilePath = path.join(
                    MAPS_SOURCE_PATH,
                    entry.name,
                    "meta.json",
                );
                if (!existsSync(metaFilePath)) {
                    return;
                }

                const rawFile = await fs.readFile(metaFilePath, "utf8");
                const parsed = JSON.parse(rawFile) as Record<string, unknown>;

                metadata.set(mapId, {
                    id: mapId,
                    name: String(parsed.name ?? `Mapa ${mapId}`),
                    terreno: String(parsed.terreno ?? "-"),
                    zona: String(parsed.zona ?? "-"),
                    restringir: String(parsed.restringir ?? "No"),
                    minLevel: Number(parsed.minLevel ?? 0),
                    maxLevel: Number(parsed.maxLevel ?? 0),
                    pk: Number(parsed.pk ?? 0) === 1,
                });
            }),
    );

    return metadata;
}

async function readSpells(): Promise<
    Array<{
        id: number;
        data: Record<string, unknown>;
    }>
> {
    const rawFile = await fs.readFile(SPELLS_PATH, "utf8");
    const parsed = JSON.parse(rawFile) as Record<
        string,
        Record<string, unknown>
    >;

    return Object.entries(parsed)
        .map(([id, data]) => ({ id: Number(id), data }))
        .filter((entry) => Number.isInteger(entry.id) && entry.id > 0);
}

function buildSearchIndex(parts: Array<string | number>): string {
    return normalizeSearchText(parts.join(" "));
}

type WikiCacheEntry = {
    signature: string;
    payload: PublicWikiResponse;
};

let wikiCache: WikiCacheEntry | null = null;

async function getWikiVersionSignature(): Promise<string> {
    const [npcVersion, objectVersion, craftingVersion, smeltingVersion] =
        await Promise.all([
            getCurrentGameNpcVersion(),
            getCurrentGameObjectVersion(),
            getCurrentGameCraftingRecipeVersion(),
            getCurrentGameSmeltingRecipeVersion(),
        ]);

    return [npcVersion, objectVersion, craftingVersion, smeltingVersion].join(
        ":",
    );
}

export async function getPublicWiki(): Promise<PublicWikiResponse> {
    const signature = await getWikiVersionSignature();

    if (wikiCache?.signature === signature) {
        return wikiCache.payload;
    }

    const [
        npcChanges,
        objectChanges,
        craftingChanges,
        smeltingChanges,
        mapMetadataById,
        spellsData,
    ] = await Promise.all([
        listGameNpcChangesSince(0),
        listGameObjectChangesSince(0),
        listGameCraftingRecipeChangesSince(0),
        listGameSmeltingRecipeChangesSince(0),
        readMapMetadata(),
        readSpells(),
    ]);

    const objectsById = new Map(
        objectChanges.changes.map((entry) => [entry.id, entry.data]),
    );
    const spawns = await readMapNpcSpawns();
    const npcMapCounts = new Map<number, Map<number, number>>();
    const mapNpcCounts = new Map<number, Map<number, number>>();
    const npcIdsInMaps = new Set<number>();

    for (const spawn of spawns) {
        const npcId = Number(spawn.npcIndex ?? 0);
        const mapId = Number(spawn.mapNum ?? 0);
        if (!npcId || !mapId) {
            continue;
        }

        const mapName = mapMetadataById.get(mapId)?.name;
        if (mapName && isLocalMapName(mapName)) {
            continue;
        }

        npcIdsInMaps.add(npcId);

        const npcMaps = npcMapCounts.get(npcId) ?? new Map<number, number>();
        npcMaps.set(mapId, (npcMaps.get(mapId) ?? 0) + 1);
        npcMapCounts.set(npcId, npcMaps);

        const mapNpcs = mapNpcCounts.get(mapId) ?? new Map<number, number>();
        mapNpcs.set(npcId, (mapNpcs.get(npcId) ?? 0) + 1);
        mapNpcCounts.set(mapId, mapNpcs);
    }

    const soldByObject = new Map<number, WikiNpcReference[]>();
    const droppedByObject = new Map<number, WikiNpcReference[]>();
    const craftResultObjectIds = new Set<number>();
    const craftMaterialObjectIds = new Set<number>();
    const smeltingOutputObjectIds = new Set<number>();
    const smeltingMaterialObjectIds = new Set<number>();

    for (const recipe of craftingChanges.changes) {
        craftResultObjectIds.add(Number(recipe.data.itemId ?? 0));

        for (const material of recipe.data.materials ?? []) {
            craftMaterialObjectIds.add(Number(material.itemId ?? 0));
        }
    }

    for (const recipe of smeltingChanges.changes) {
        smeltingMaterialObjectIds.add(Number(recipe.data.mineralItemId ?? 0));
        smeltingOutputObjectIds.add(Number(recipe.data.ingotItemId ?? 0));
    }

    const npcs: WikiNpcEntry[] = npcChanges.changes
        .filter((entry) => npcIdsInMaps.has(entry.id))
        .map((entry) => {
            const data = entry.data as Record<string, unknown>;
            const maxHp = toNumber(data.maxHp) || toNumber(data.hp);
            const expReward = Math.floor(
                toNumber(data.exp) * CURRENT_EXP_MULTIPLIER,
            );
            const goldReward = Math.floor(
                toNumber(data.gold) * CURRENT_GOLD_MULTIPLIER,
            );
            const npcMaps =
                npcMapCounts.get(entry.id) ?? new Map<number, number>();
            const maps = Array.from(npcMaps.entries())
                .map(([mapId, spawnsInMap]) => ({
                    mapId,
                    mapName:
                        mapMetadataById.get(mapId)?.name ?? `Mapa ${mapId}`,
                    spawns: spawnsInMap,
                }))
                .sort(
                    (left, right) =>
                        right.spawns - left.spawns || left.mapId - right.mapId,
                );

            const sells = Array.isArray(data.objs)
                ? data.objs
                      .map((item) => {
                          const trade = item as Record<string, unknown>;
                          const itemId = toNumber(trade.item);
                          return {
                              itemId,
                              itemName: String(
                                  objectsById.get(itemId)?.name ??
                                      `Objeto ${itemId}`,
                              ),
                              quantity: toNumber(trade.cant),
                          };
                      })
                      .filter((item) => item.itemId > 0)
                : [];

            const drops = Array.isArray(data.drop)
                ? data.drop
                      .map((item) => {
                          const trade = item as Record<string, unknown>;
                          const itemId = toNumber(trade.item);
                          return {
                              itemId,
                              itemName: String(
                                  objectsById.get(itemId)?.name ??
                                      `Objeto ${itemId}`,
                              ),
                              quantity: toNumber(trade.cant),
                          };
                      })
                      .filter((item) => item.itemId > 0)
                : [];

            for (const item of sells) {
                const references = soldByObject.get(item.itemId) ?? [];
                references.push({
                    npcId: entry.id,
                    npcName: String(data.name ?? `NPC ${entry.id}`),
                    quantity: item.quantity,
                });
                soldByObject.set(item.itemId, references);
            }

            for (const item of drops) {
                const references = droppedByObject.get(item.itemId) ?? [];
                references.push({
                    npcId: entry.id,
                    npcName: String(data.name ?? `NPC ${entry.id}`),
                    quantity: item.quantity,
                });
                droppedByObject.set(item.itemId, references);
            }

            const combatNpc = isCombatNpc(data);
            const totalSpawns = maps.reduce(
                (total, mapEntry) => total + mapEntry.spawns,
                0,
            );
            const npcType = toNumber(data.npcType);

            return {
                id: entry.id,
                name: String(data.name ?? `NPC ${entry.id}`),
                bodyId: toNumber(data.idBody),
                headId: toNumber(data.idHead),
                npcType,
                npcTypeLabel: getNpcTypeLabel(npcType),
                description: String(data.desc ?? ""),
                maxHp,
                expReward,
                goldReward,
                minHit: toNumber(data.minHit),
                maxHit: toNumber(data.maxHit),
                defense: toNumber(data.def),
                expPerHp:
                    maxHp > 0 && expReward > 0
                        ? Number((expReward / maxHp).toFixed(4))
                        : null,
                isCombatNpc: combatNpc,
                maps,
                sells,
                drops,
                totalSpawns,
                searchIndex: buildSearchIndex([
                    entry.id,
                    String(data.name ?? ""),
                    getNpcTypeLabel(npcType),
                    maps.map((mapEntry) => mapEntry.mapName).join(" "),
                    sells.map((item) => item.itemName).join(" "),
                    drops.map((item) => item.itemName).join(" "),
                ]),
            };
        })
        .sort((left, right) => left.id - right.id);

    const equipment: WikiEquipmentEntry[] = objectChanges.changes
        .map((entry) => {
            const data = entry.data as Record<string, unknown>;
            const objType = toNumber(data.objType);
            const defaultCategory = getEquipmentCategory(objType);
            const category = isMagicWeapon(data, objType)
                ? { key: "magic_weapon" as const, label: "Armas Mágicas" }
                : defaultCategory;
            const soldBy = (soldByObject.get(entry.id) ?? []).sort(
                (left, right) =>
                    right.quantity - left.quantity || left.npcId - right.npcId,
            );
            const droppedBy = (droppedByObject.get(entry.id) ?? []).sort(
                (left, right) =>
                    right.quantity - left.quantity || left.npcId - right.npcId,
            );

            if (!category) {
                return null;
            }

            return {
                id: entry.id,
                name: String(data.name ?? `Objeto ${entry.id}`),
                grhIndex: toNumber(data.grhIndex),
                objType,
                objTypeLabel: getObjectTypeLabel(objType),
                category: category.key,
                categoryLabel: category.label,
                value: toNumber(data.valor),
                minHit: toNumber(data.minHit),
                maxHit: toNumber(data.maxHit),
                minDef: toNumber(data.minDef),
                maxDef: toNumber(data.maxDef),
                tier: toNumber(data.tier),
                newbie: toNumber(data.newbie) === 1,
                blockedClasses: Array.isArray(data.clasesNoPermitidas)
                    ? data.clasesNoPermitidas.filter(
                          (value): value is number => typeof value === "number",
                      )
                    : [],
                soldBy,
                droppedBy,
                searchIndex: buildSearchIndex([
                    entry.id,
                    String(data.name ?? ""),
                    category.label,
                    getObjectTypeLabel(objType),
                    soldBy.map((npc) => npc.npcName).join(" "),
                    droppedBy.map((npc) => npc.npcName).join(" "),
                ]),
            };
        })
        .filter((entry): entry is WikiEquipmentEntry => Boolean(entry))
        .filter(
            (entry) => entry.soldBy.length > 0 || entry.droppedBy.length > 0,
        )
        .sort((left, right) => left.id - right.id);

    const spellSourcesBySpellId = new Map<number, WikiSpellSourceReference[]>();

    for (const entry of objectChanges.changes) {
        const data = entry.data as Record<string, unknown>;
        const spellId = toNumber(data.spellIndex);

        if (spellId <= 0) {
            continue;
        }

        const soldBy = (soldByObject.get(entry.id) ?? []).sort(
            (left, right) =>
                right.quantity - left.quantity || left.npcId - right.npcId,
        );
        const droppedBy = (droppedByObject.get(entry.id) ?? []).sort(
            (left, right) =>
                right.quantity - left.quantity || left.npcId - right.npcId,
        );

        if (soldBy.length === 0 && droppedBy.length === 0) {
            continue;
        }

        const currentSources = spellSourcesBySpellId.get(spellId) ?? [];
        currentSources.push({
            itemId: entry.id,
            itemName: String(data.name ?? `Objeto ${entry.id}`),
            soldBy,
            droppedBy,
        });
        spellSourcesBySpellId.set(spellId, currentSources);
    }

    const spells: WikiSpellEntry[] = spellsData
        .map((entry) => {
            const data = entry.data;
            const sources = (spellSourcesBySpellId.get(entry.id) ?? []).sort(
                (left, right) => left.itemId - right.itemId,
            );

            if (sources.length === 0) {
                return null;
            }

            const type = toNumber(data.type);

            return {
                id: entry.id,
                name: String(data.name ?? `Hechizo ${entry.id}`),
                description: String(data.desc ?? ""),
                type,
                typeLabel: getSpellTypeLabel(type),
                minSkill: toNumber(data.minSkill),
                manaRequired: toNumber(data.manaRequired),
                target: toNumber(data.target),
                words: String(data.palabrasMagicas ?? ""),
                minPower: toNumber(data.minHp),
                maxPower: toNumber(data.maxHp),
                sources,
                searchIndex: buildSearchIndex([
                    entry.id,
                    String(data.name ?? ""),
                    String(data.desc ?? ""),
                    getSpellTypeLabel(type),
                    sources.map((source) => source.itemName).join(" "),
                    sources
                        .flatMap((source) => [
                            source.soldBy.map((npc) => npc.npcName).join(" "),
                            source.droppedBy
                                .map((npc) => npc.npcName)
                                .join(" "),
                        ])
                        .join(" "),
                ]),
            };
        })
        .filter((entry): entry is WikiSpellEntry => Boolean(entry))
        .sort((left, right) => left.id - right.id);

    const npcById = new Map(npcs.map((npc) => [npc.id, npc]));

    const trainingMaps: WikiTrainingMapEntry[] = Array.from(
        mapNpcCounts.entries(),
    )
        .map(([mapId, npcCounts]) => {
            const metadata = mapMetadataById.get(mapId) ?? {
                id: mapId,
                name: `Mapa ${mapId}`,
                terreno: "-",
                zona: "-",
                restringir: "No",
                minLevel: 0,
                maxLevel: 0,
                pk: false,
            };

            const topNpcs = Array.from(npcCounts.entries())
                .map(([npcId, spawnsInMap]) => {
                    const npc = npcById.get(npcId);
                    return npc
                        ? {
                              npcId,
                              npcName: npc.name,
                              spawns: spawnsInMap,
                              expReward: npc.expReward,
                              maxHp: npc.maxHp,
                              isCombatNpc: npc.isCombatNpc,
                          }
                        : null;
                })
                .filter((entry): entry is NonNullable<typeof entry> =>
                    Boolean(entry),
                )
                .sort(
                    (left, right) =>
                        right.spawns - left.spawns ||
                        right.expReward - left.expReward,
                );

            const combatNpcs = topNpcs.filter((npc) => npc.isCombatNpc);

            return {
                ...metadata,
                totalNpcSpawns: topNpcs.reduce(
                    (total, npc) => total + npc.spawns,
                    0,
                ),
                totalCombatSpawns: combatNpcs.reduce(
                    (total, npc) => total + npc.spawns,
                    0,
                ),
                uniqueCombatNpcs: combatNpcs.length,
                topNpcs: combatNpcs
                    .slice(0, 8)
                    .map(({ isCombatNpc: _isCombatNpc, ...npc }) => npc),
                searchIndex: buildSearchIndex([
                    metadata.id,
                    metadata.name,
                    metadata.terreno,
                    metadata.zona,
                    combatNpcs.map((npc) => npc.npcName).join(" "),
                ]),
            };
        })
        .filter(
            (map) =>
                isTrainingMapCandidate(map) &&
                map.uniqueCombatNpcs > 0 &&
                map.totalCombatSpawns > 0,
        )
        .sort(
            (left, right) =>
                right.uniqueCombatNpcs - left.uniqueCombatNpcs ||
                right.totalCombatSpawns - left.totalCombatSpawns ||
                left.id - right.id,
        );

    const payload = {
        generatedAt: new Date().toISOString(),
        stats: {
            npcCount: npcs.length,
            combatNpcCount: npcs.filter((npc) => npc.isCombatNpc).length,
            equipmentCount: equipment.length,
            spellCount: spells.length,
            trainingMapCount: trainingMaps.length,
        },
        npcs,
        equipment,
        spells,
        trainingMaps,
    };

    wikiCache = {
        signature,
        payload,
    };

    return payload;
}
