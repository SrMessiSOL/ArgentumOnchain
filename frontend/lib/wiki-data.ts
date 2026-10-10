import { unstable_cache } from "next/cache";
import { getApiBaseUrlCandidates } from "@/lib/api-base-url";
import type { PublicWikiResponse } from "@/lib/wiki";
import objects from "../public/init/objs.json";
import wikiSnapshot from "./wiki-snapshot.json";

export const WIKI_REVALIDATE_SECONDS = 60 * 60 * 24 * 30;

function inferEquipmentCategory(
    objType: number,
    name?: string,
): {
    category: "weapon" | "armor" | "shield" | "helmet" | "magic_weapon" | "boat" | "other";
    categoryLabel: string;
} | null {
    const normalizedName = String(name ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    if (
        objType === 26 ||
        normalizedName.includes("baston") ||
        normalizedName.includes("laud") ||
        normalizedName.includes("flauta")
    ) {
        return { category: "magic_weapon", categoryLabel: "Armas Mágicas" };
    }

    switch (objType) {
        case 31:
            return {category: "boat", categoryLabel: "Boats & ships"};
        case 2:
            return { category: "weapon", categoryLabel: "Armas" };
        case 3:
            return { category: "armor", categoryLabel: "Armaduras" };
        case 16:
            return { category: "shield", categoryLabel: "Escudos" };
        case 17:
            return { category: "helmet", categoryLabel: "Cascos" };
        default:
            return {category:"other",categoryLabel:"Other game items"};
    }
}

function normalizeWikiResponse(payload: unknown): PublicWikiResponse {
    const raw = (payload ?? {}) as Record<string, unknown>;
    const rawEquipment = Array.isArray(raw.equipment) ? raw.equipment : [];
    const rawObjects = Array.isArray(raw.objects) ? raw.objects : [];
    const normalizedEquipment =
        rawEquipment.length > 0
            ? rawEquipment
            : rawObjects
                  .map((entry) => {
                      const item = entry as Record<string, unknown>;
                      const inferred = inferEquipmentCategory(
                          Number(item.objType ?? 0),
                          String(item.name ?? ""),
                      );

                      if (!inferred) {
                          return null;
                      }

                      return {
                          ...item,
                          grhIndex: Number(item.grhIndex ?? 0),
                          category: inferred.category,
                          categoryLabel: inferred.categoryLabel,
                      };
                  })
                  .filter(Boolean);

    const rawStats = (raw.stats ?? {}) as Record<string, unknown>;

    return {
        generatedAt: String(raw.generatedAt ?? new Date().toISOString()),
        stats: {
            npcCount: Number(rawStats.npcCount ?? 0),
            combatNpcCount: Number(rawStats.combatNpcCount ?? 0),
            equipmentCount: new Set([...normalizedEquipment.map(entry=>Number((entry as Record<string,unknown>).id)),...Object.keys(objects).map(Number)]).size,
            spellCount: Number(rawStats.spellCount ?? 0),
            trainingMapCount: Number(rawStats.trainingMapCount ?? 0),
        },
        npcs: Array.isArray(raw.npcs)
            ? (raw.npcs as PublicWikiResponse["npcs"])
            : [],
        equipment: [...normalizedEquipment, ...Object.entries(objects).filter(([id]) => !normalizedEquipment.some(entry => Number((entry as Record<string,unknown>).id)===Number(id))).map(([id,item]) => ({...item,id:Number(id),grhIndex:Number(item.grhIndex),...inferEquipmentCategory(item.objType,item.name),objTypeLabel:'',value:-1,tier:0,newbie:false,blockedClasses:[],soldBy:[],droppedBy:[],catalogOnly:true,searchIndex:`${id} ${item.name}`}))] as PublicWikiResponse["equipment"],
        spells: Array.isArray(raw.spells)
            ? (raw.spells as PublicWikiResponse["spells"])
            : [],
        trainingMaps: Array.isArray(raw.trainingMaps)
            ? (raw.trainingMaps as PublicWikiResponse["trainingMaps"])
            : [],
    };
}

function createEmptyWikiResponse(): PublicWikiResponse {
    return {
        generatedAt: new Date().toISOString(),
        stats: {
            npcCount: 0,
            combatNpcCount: 0,
            equipmentCount: 0,
            spellCount: 0,
            trainingMapCount: 0,
        },
        npcs: [],
        equipment: [],
        spells: [],
        trainingMaps: [],
    };
}

const getCachedWikiData = unstable_cache(
    async (): Promise<PublicWikiResponse> => {
        for (const apiBaseUrl of getApiBaseUrlCandidates()) {
            try {
                const response = await fetch(`${apiBaseUrl}/wiki`, {
                    cache: "no-store",
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                return normalizeWikiResponse(await response.json());
            } catch (error) {
                console.error(
                    `Could not load wiki from ${apiBaseUrl}:`,
                    error,
                );
            }
        }

        throw new Error("Wiki data is temporarily unavailable");
    },
    ["public-wiki-v3-appearance"],
    { revalidate: WIKI_REVALIDATE_SECONDS },
);

// A temporary API outage must not cache an empty wiki for a month.
export async function getWikiData(): Promise<PublicWikiResponse> {
    // The public reference manual remains available while realm access is closed.
    if (process.env.VERCEL) return normalizeWikiResponse(wikiSnapshot);
    try { return await getCachedWikiData(); }
    catch { return normalizeWikiResponse(wikiSnapshot); }
}
