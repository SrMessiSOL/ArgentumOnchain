"use client";

import { LocalizedText, LocalizedLabel } from '@/components/LocalizedText';
import {useI18n} from '@/components/I18nProvider';
import {uxEnglish,uxSpanish} from "@/lib/ux-copy";
import CraftingReference from './CraftingReference';
import NpcArtwork from './NpcArtwork';
import BrowseToolbar from "@/components/BrowseToolbar";
import {browseEnglish,browseSpanish} from "@/lib/browse-copy";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatNumber } from "@/lib/number-format";
import type { GraphicData } from "@/types/game";
import {
    getWikiSectionHref,
    WIKI_SECTION_LABELS,
    type WikiSection,
} from "@/lib/wiki-sections";
import type { PublicWikiResponse } from "@/lib/wiki";
import { getTexturePath, loadGraphicsDB } from "@/utils/gameLoader";

type WikiExplorerProps = {
    data: PublicWikiResponse;
    section: WikiSection;
};

function formatEquipmentStat(
    item: PublicWikiResponse["equipment"][number],
): string {
    if (item.category === "weapon" || item.category === "magic_weapon") {
        return item.maxHit > 0 ? `${item.minHit}-${item.maxHit}` : "-";
    }

    return item.maxDef > 0 ? `${item.minDef}-${item.maxDef}` : "-";
}

function getEquipmentStatLabel(
    category: PublicWikiResponse["equipment"][number]["category"],
): string {
    return category === "weapon" || category === "magic_weapon"
        ? "Daño"
        : "Defensa";
}

function getTierSortValue(tier: number): number {
    return tier > 0 ? tier : Number.POSITIVE_INFINITY;
}

function getNpcDropChanceByIndex(index: number): string | null {
    switch (index) {
        case 0:
            return "90%";
        case 1:
            return "10%";
        case 2:
            return "1%";
        case 3:
            return "0.1%";
        case 4:
            return "0.01%";
        default:
            return null;
    }
}

const TRAINING_MAP_GROUPS = [
    { label: "Dungeons Newbie", mapIds: [37, 168] },
    { label: "Isla Pirata", mapIds: [201] },
    { label: "Nueva Esperanza", mapIds: [111, 112, 113, 114] },
    { label: "Dungeon Marabel", mapIds: [115, 116] },
    {
        label: "Dungeon Veriil",
        mapIds: [140, 141, 142, 146, 143, 144, 145, 48],
    },
    { label: "Mausoleo", mapIds: [281] },
    { label: "Dungeon Inferno", mapIds: [184] },
    { label: "Ruinas de Earost", mapIds: [283, 284, 285] },
    { label: "Polo Norte", mapIds: [286, 287, 288] },
    { label: "Montaña", mapIds: [264, 265, 266, 267, 268, 269, 270, 271] },
    { label: "Dungeon Dragon", mapIds: [166] },
] as const;

const TRAINING_MAP_ID_SET = new Set<number>(
    TRAINING_MAP_GROUPS.flatMap((group) => group.mapIds),
);

const FACTION_GUIDES = [
    {
        faction: "Armada",
        colorClass: "text-sky-300",
        npc: "Tancredo de Hauteville",
        npcLocation: "Mapa 60, pos 77,15",
        enlistCommand: "/enlistar",
        rewardCommand: "/recompensa",
        requirements: [
            "Ser ciudadano.",
            "Nivel 25 o más.",
            "100 puntos de facción o más.",
        ],
        scoreRules: [
            "Suma puntos al matar criminales o Caos.",
            "Cada kill válida da 10 puntos de facción.",
            "No cuenta si la víctima es newbie.",
        ],
        ranks: [
            "Soldado: nivel 25, 100 puntos de facción.",
            "Caballero: nivel 30, 500 puntos de facción.",
            "Capitán: nivel 35, 1000 puntos de facción.",
            "Protector del Reino: nivel 40, 2500 puntos de facción.",
            "Campeón de la Luz: nivel 43, 5000 puntos de facción.",
        ],
    },
    {
        faction: "Caos",
        colorClass: "text-rose-300",
        npc: "Demonio Legionario",
        npcLocation: "Mapa 151, pos 16,68",
        enlistCommand: "/enlistar",
        rewardCommand: "/recompensa",
        requirements: [
            "Ser criminal.",
            "Nivel 25 o más.",
            "350 puntos de facción o más.",
        ],
        scoreRules: [
            "Suma puntos al matar ciudadanos, Armada, criminales y Caos.",
            "Cada kill válida da 10 puntos de facción.",
            "No cuenta si la víctima es newbie.",
        ],
        ranks: [
            "Acólito: nivel 25, 350 puntos de facción.",
            "Emisario del Caos: nivel 30, 1000 puntos de facción.",
            "Sanguinario: nivel 35, 2500 puntos de facción.",
            "Caballero de la Oscuridad: nivel 40, 5000 puntos de facción.",
            "Devorador de Almas: nivel 43, 10000 puntos de facción.",
        ],
    },
] as const;

const FACTION_SCORE_RULES = [
    "Cada kill válida da 10 puntos de facción.",
    "No cuentan kills sobre newbies.",
    "No cuentan re-kills del mismo atacante sobre la misma víctima dentro de 5 minutos.",
    "Una kill suma si la víctima no es newbie y además la diferencia de niveles no supera 10, o la víctima es nivel 25 o más.",
] as const;

const FACTION_LOSS_RULES = [
    "Armada pierde la facción al intentar atacar a un ciudadano.",
    "Si no te alcanza para subir, /recompensa te dice cuánto nivel y cuántos puntos de facción faltan para el próximo rango.",
] as const;

function formatNpcDrops(
    drops: PublicWikiResponse["npcs"][number]["drops"],
): string {
    return (
        drops
            .slice(0, 5)
            .map((item, index) => {
                const chance = getNpcDropChanceByIndex(index);
                const quantity = item.quantity > 1 ? ` x${item.quantity}` : "";
                return chance
                    ? `${chance} ${item.itemName}${quantity}`
                    : `${item.itemName}${quantity}`;
            })
            .join(" | ") || "-"
    );
}

const PLAYABLE_CLASS_LABELS: Record<number, string> = {
    1: "Mago",
    2: "Clérigo",
    3: "Guerrero",
    4: "Asesino",
    6: "Bardo",
    7: "Druida",
    8: "Paladín",
    9: "Cazador",
};

const PLAYABLE_CLASS_IDS = Object.keys(PLAYABLE_CLASS_LABELS).map(Number);

function formatMapLevelRestriction(
    map: PublicWikiResponse["trainingMaps"][number],
): string {
    const hasMinLevel = map.minLevel > 0;
    const hasMaxLevel = map.maxLevel > 0;

    if (hasMinLevel && hasMaxLevel) {
        return `Niveles ${map.minLevel}-${map.maxLevel}`;
    }

    if (hasMinLevel) {
        return `Desde nivel ${map.minLevel}`;
    }

    if (hasMaxLevel) {
        return `Hasta nivel ${map.maxLevel}`;
    }

    return "Sin restriccion de nivel";
}

function getAllowedClassLabels(blockedClasses: number[], text: (source:string)=>string): string {
    const blockedSet = new Set(blockedClasses);
    const allowed = PLAYABLE_CLASS_IDS.filter(
        (classId) => !blockedSet.has(classId),
    );

    return allowed.length > 0
        ? allowed.map((classId) => text(PLAYABLE_CLASS_LABELS[classId])).join(", ")
        : text("Ninguna");
}

function ItemGraphic({
    graphicData,
    name,
}: {
    graphicData?: GraphicData;
    name: string;
}) {
    if (!graphicData?.numFile) {
        return <div className="h-10 w-10 rounded-md bg-black/20" />;
    }

    const scale = Math.min(
        1,
        32 / Math.max(graphicData.width, graphicData.height, 1),
    );

    return (
        <div className="relative h-10 w-10 overflow-hidden rounded-sm">
            <LocalizedLabel><div
                aria-label={name}
                className="absolute left-1/2 top-1/2 bg-no-repeat"
                style={{
                    width: graphicData.width,
                    height: graphicData.height,
                    backgroundImage: `url(${getTexturePath(graphicData)})`,
                    backgroundPosition: `-${graphicData.sX}px -${graphicData.sY}px`,
                    transform: `translate(-50%, -50%) scale(${scale})`,
                    transformOrigin: "center",
                }}
            /></LocalizedLabel>
        </div>
    );
}

export default function WikiExplorer({ data: sourceData, section }: WikiExplorerProps) {
    const {text,locale}=useI18n();
    const [query,setQuery]=useState('');
    const browse=locale==='es'?browseSpanish:browseEnglish;
    const matches=(entry:{id:number;name:string})=>!query.trim()||entry.name.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale))||String(entry.id)===query.trim();
    const data=useMemo(()=>{
        // This response contains only published world data, never player names or chat.
        const labels=new Set(['name','description','npcName','itemName','mapName','npcTypeLabel','objTypeLabel','categoryLabel']);
        const visit=(value:unknown,key=''):unknown=>typeof value==='string'?(labels.has(key)?text(value):value):Array.isArray(value)?value.map(v=>visit(v)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v,k)])):value;
        return visit(sourceData) as PublicWikiResponse;
    },[sourceData,text]);
    const [graphicsDB, setGraphicsDB] = useState<Record<string, GraphicData>>(
        {},
    );

    useEffect(() => {
        let cancelled = false;

        loadGraphicsDB()
            .then((data) => {
                if (!cancelled) {
                    setGraphicsDB(data);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setGraphicsDB({});
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const npcById = useMemo(
        () => new Map(data.npcs.map((npc) => [npc.id, npc])),
        [data.npcs],
    );

    const filteredMaps = useMemo(() => {
        return data.trainingMaps.filter((map) =>
            TRAINING_MAP_ID_SET.has(map.id) && matches(map),
        );
    }, [data.trainingMaps,query,locale]);

    const curatedTrainingMaps = useMemo(
        () =>
            TRAINING_MAP_GROUPS.map((group) => ({
                label: group.label,
                maps: group.mapIds
                    .map((mapId) =>
                        filteredMaps.find((map) => map.id === mapId),
                    )
                    .filter((map): map is (typeof filteredMaps)[number] =>
                        Boolean(map),
                    ),
            })).filter((group) => group.maps.length > 0),
        [filteredMaps],
    );

    const filteredNpcs = useMemo(() => {
        const groups=new Map<string,typeof data.npcs>();
        for(const npc of data.npcs){if(!npc.isCombatNpc||!(npc.expReward>0||npc.goldReward>0||npc.drops.length))continue;const key=npc.name.trim().toLocaleLowerCase(locale);groups.set(key,[...(groups.get(key)??[]),npc]);}
        return Array.from(groups.values()).filter(group=>group.some(matches)).map(entries=>({...entries[0],maps:Array.from(new Map(entries.flatMap(n=>n.maps).map(m=>[m.mapId,m])).values())}));
    }, [data.npcs,query,locale]);

    const filteredEquipment = useMemo(() => {
        return data.equipment.filter(matches);
    }, [data.equipment,query,locale]);

    const filteredSpells = useMemo(() => {
        return data.spells.filter(matches);
    }, [data.spells,query,locale]);

    const equipmentSections = useMemo(
        () => [
            {key:"boat",label:locale==='es'?"Barcos":"Boats & ships",items:filteredEquipment.filter(item=>item.category==="boat")},
            {
                key: "weapon",
                label: "Armas",
                items: filteredEquipment
                    .filter((item) => item.category === "weapon")
                    .sort(
                        (left, right) =>
                            getTierSortValue(left.tier) -
                                getTierSortValue(right.tier) ||
                            left.id - right.id,
                    ),
            },
            {
                key: "armor",
                label: "Armaduras",
                items: filteredEquipment
                    .filter((item) => item.category === "armor")
                    .sort(
                        (left, right) =>
                            getTierSortValue(left.tier) -
                                getTierSortValue(right.tier) ||
                            left.id - right.id,
                    ),
            },
            {
                key: "shield",
                label: "Escudos",
                items: filteredEquipment
                    .filter((item) => item.category === "shield")
                    .sort(
                        (left, right) =>
                            getTierSortValue(left.tier) -
                                getTierSortValue(right.tier) ||
                            left.id - right.id,
                    ),
            },
            {
                key: "helmet",
                label: "Cascos",
                items: filteredEquipment
                    .filter((item) => item.category === "helmet")
                    .sort(
                        (left, right) =>
                            getTierSortValue(left.tier) -
                                getTierSortValue(right.tier) ||
                            left.id - right.id,
                    ),
            },
            {
                key: "magic_weapon",
                label: "Armas Mágicas",
                items: filteredEquipment
                    .filter((item) => item.category === "magic_weapon")
                    .sort(
                        (left, right) =>
                            getTierSortValue(left.tier) -
                                getTierSortValue(right.tier) ||
                            left.id - right.id,
                    ),
            },
        ],
        [filteredEquipment,locale],
    );

    const formatNpcWithMap = (npcId: number, npcName: string): string => {
        const npc = npcById.get(npcId);
        const mapId = npc?.maps[0]?.mapId;
        return mapId ? `${npcName} (${text("Mapa")}: ${mapId})` : npcName;
    };

    const dedupeNpcReferences = (
        references: Array<{ npcId: number; npcName: string }>,
        withMap: boolean,
    ): string => {
        const unique = new Map<number, string>();

        for (const reference of references) {
            if (!unique.has(reference.npcId)) {
                unique.set(
                    reference.npcId,
                    withMap
                        ? formatNpcWithMap(reference.npcId, reference.npcName)
                        : reference.npcName,
                );
            }
        }

        return Array.from(unique.values()).join(", ") || "-";
    };

    const dedupeNpcNames = (
        references: Array<{ npcId: number; npcName: string }>,
    ): string => {
        const unique = new Map<number, string>();

        for (const reference of references) {
            if (!unique.has(reference.npcId)) {
                unique.set(reference.npcId, reference.npcName);
            }
        }

        return Array.from(unique.values()).join(" | ") || "-";
    };

    return (
        <div className="realm-wiki-explorer space-y-6">
            <header className="realm-reference-heading"><p className="realm-eyebrow">ARGENTUM ONCHAIN</p><h1>{locale === "es" ? uxSpanish.wiki : uxEnglish.wiki}</h1><p>{locale === "es" ? uxSpanish.wikiHelp : uxEnglish.wikiHelp}</p></header>
            <nav aria-label={locale==='es'?'Secciones de la Wiki':'Wiki sections'} className="wiki-section-navigation">
                <div className="flex flex-wrap gap-2">
                    {(
                        [
                            "factions",
                            "equipment",
                            "spells",
                            "npcs",
                            "maps",
                            "crafting",
                        ] as const
                    ).map((tab) => (
                        <Link
                            key={tab}
                            href={getWikiSectionHref(tab)}
                            aria-current={section === tab ? "page" : undefined}
                            className={`rounded-2xl px-4 py-2 text-sm transition ${
                                section === tab
                                    ? "bg-amber-300 text-stone-950"
                                    : "border border-white/10 bg-white/5 text-stone-300 hover:bg-white/10"
                            }`}
                        >
                            {tab==='crafting'?(locale==='es'?'Fabricación':'Crafting'):<LocalizedText source={WIKI_SECTION_LABELS[tab]} />}
                        </Link>
                    ))}
                </div>
            </nav>

            {section === 'crafting' && <CraftingReference/>}
            {section !== 'factions' && section !== 'crafting' && <><BrowseToolbar query={query} onQuery={setQuery} kind="guide" count={section==='equipment'?filteredEquipment.length:section==='spells'?filteredSpells.length:section==='npcs'?filteredNpcs.length:filteredMaps.length}/><p className="realm-table-hint">{browse.guideHelp}</p>{query && (section==='equipment'?filteredEquipment.length:section==='spells'?filteredSpells.length:section==='npcs'?filteredNpcs.length:filteredMaps.length)===0&&<div className="realm-no-results"><h2>{browse.noResults}</h2><p>{browse.noResultsHelp}</p><button onClick={()=>setQuery('')}>{browse.clear}</button></div>}</>}
            {section === "factions" ? (
                <section className="space-y-5">
                    <article className="rounded-[28px] border border-white/8 bg-[#08101a] p-5 shadow-xl">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <p className="text-[11px] uppercase tracking-[0.28em] text-amber-200/70"><LocalizedText source={"Sistema faccionario "} /></p>
                                <h2 className="mt-2 text-xl font-semibold text-white"><LocalizedText source={"Como funcionan Armada y Caos "} /></h2>
                            </div>
                            <div className="max-w-md text-sm leading-6 text-stone-300"><LocalizedText source={"Las facciones usan puntos de faccion para enlistar, ascender y consultar progreso. El ascenso se reclama manualmente con"} />{" "}
                                <code>{locale==='en'?'/reward':'/recompensa'}</code><LocalizedText source={" en el NPC de tu faccion. "} /></div>
                        </div>

                        <div className="mt-5 grid gap-4 lg:grid-cols-2">
                            {FACTION_GUIDES.map((guide) => (
                                <div
                                    key={guide.faction}
                                    className="rounded-2xl border border-white/8 bg-black/15 p-4"
                                >
                                    <h3
                                        className={`text-lg font-semibold ${guide.colorClass}`}
                                    >
                                        <LocalizedText source={guide.faction} />
                                    </h3>
                                    <div className="mt-3 space-y-2 text-sm text-stone-300">
                                        <p>
                                            <span className="font-medium text-white">
                                                NPC:
                                            </span>{" "}
                                            <LocalizedText source={guide.npc} /> (<LocalizedText source={guide.npcLocation} />)
                                        </p>
                                        <p>
                                            <span className="font-medium text-white"><LocalizedText source={"Comandos: "} /></span>{" "}
                                            <code>{locale==='en'?'/enlist':guide.enlistCommand}</code>{" "}<LocalizedText source={"para enlistarte y"} />{" "}
                                            <code>{locale==='en'?'/reward':guide.rewardCommand}</code>{" "}<LocalizedText source={"para ascender. "} /></p>
                                    </div>

                                    <div className="mt-4 space-y-3">
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.2em] text-stone-500"><LocalizedText source={"Requisitos para enlistar "} /></p>
                                            <ul className="mt-2 space-y-1 text-sm text-stone-300">
                                                {guide.requirements.map(
                                                    (item) => (
                                                        <li key={item}>
                                                            • <LocalizedText source={item} />
                                                        </li>
                                                    ),
                                                )}
                                            </ul>
                                        </div>

                                        <div>
                                            <p className="text-xs uppercase tracking-[0.2em] text-stone-500"><LocalizedText source={"Como suma puntos "} /></p>
                                            <ul className="mt-2 space-y-1 text-sm text-stone-300">
                                                {guide.scoreRules.map(
                                                    (item) => (
                                                        <li key={item}>
                                                            • <LocalizedText source={item} />
                                                        </li>
                                                    ),
                                                )}
                                            </ul>
                                        </div>

                                        <div>
                                            <p className="text-xs uppercase tracking-[0.2em] text-stone-500"><LocalizedText source={"Rangos "} /></p>
                                            <ul className="mt-2 space-y-1 text-sm text-stone-300">
                                                {guide.ranks.map((item) => (
                                                    <li key={item}>• <LocalizedText source={item} /></li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </article>

                    <article className="rounded-[28px] border border-white/8 bg-[#08101a] p-5 shadow-xl">
                        <h2 className="text-lg font-semibold text-white"><LocalizedText source={"Reglas de puntos de faccion "} /></h2>
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            <div className="rounded-2xl border border-white/8 bg-black/15 p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-stone-500"><LocalizedText source={"Cuando cuentan "} /></p>
                                <ul className="mt-3 space-y-2 text-sm text-stone-300">
                                    {FACTION_SCORE_RULES.map((item) => (
                                        <li key={item}>• <LocalizedText source={item} /></li>
                                    ))}
                                </ul>
                            </div>
                            <div className="rounded-2xl border border-white/8 bg-black/15 p-4">
                                <p className="text-xs uppercase tracking-[0.2em] text-stone-500"><LocalizedText source={"Ascensos y perdida de faccion "} /></p>
                                <ul className="mt-3 space-y-2 text-sm text-stone-300">
                                    {FACTION_LOSS_RULES.map((item) => (
                                        <li key={item}>• <LocalizedText source={item} /></li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </article>
                </section>
            ) : null}

            {section === "maps" && <figure className="wiki-world-map"><h2>{locale==='es'?'Mapa del mundo':'World map'}</h2><a href="/imgs/world-map-general.png" target="_blank" rel="noreferrer"><img src="/imgs/world-map-general.png" alt={locale==='es'?'Mapa del mundo de Argentum Online':'Argentum Online world map'}/></a></figure>}
            {section === "maps" ? (
                <section className="space-y-5">
                    {curatedTrainingMaps.map((group) => (
                        <article
                            key={group.label}
                            className="rounded-[28px] border border-white/8 bg-[#08101a] p-5 shadow-xl"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-200/70"><LocalizedText source={"Zona para entrenar "} /></p>
                                    <h2 className="mt-2 text-xl font-semibold text-white">
                                        <LocalizedText source={group.label} />
                                    </h2>
                                </div>
                                <div className="text-sm text-stone-400">
                                    {group.maps.map((map) => map.id).join(", ")}
                                </div>
                            </div>

                            <div className="mt-5 grid gap-4 lg:grid-cols-2">
                                {group.maps.map((map) => (
                                    <div
                                        key={map.id}
                                        className="rounded-2xl border border-white/8 bg-black/15 p-4"
                                    >
                                        <p className="text-sm font-semibold text-white">
                                            <LocalizedText source={map.name} /><LocalizedText source={" (Mapa: "} />{map.id})
                                        </p>
                                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-300">
                                            <span className="rounded-full border border-amber-300/20 px-3 py-1 text-amber-100">
                                                <LocalizedText source={formatMapLevelRestriction(map)} />
                                            </span>
                                            <span className="rounded-full border border-white/10 px-3 py-1">
                                                {formatNumber(
                                                    map.uniqueCombatNpcs,
                                                )}{" "}<LocalizedText source={map.uniqueCombatNpcs === 1 ? "tipo de NPC" : "tipos de NPC "} /></span>
                                            <span className="rounded-full border border-white/10 px-3 py-1">
                                                {formatNumber(
                                                    map.totalCombatSpawns,
                                                )}{" "}<LocalizedText source={map.totalCombatSpawns === 1 ? "spawn de combate" : "spawns de combate "} /></span>
                                        </div>
                                        <div className="mt-4 space-y-3">
                                            {map.topNpcs.map((npc) => (
                                                <div
                                                    key={`${map.id}-${npc.npcId}`}
                                                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-sm"
                                                >
                                                    <div>
                                                        <p className="font-medium text-white">
                                                            <LocalizedText source={npc.npcName} />
                                                        </p>
                                                        <p className="text-stone-400">
                                                            Exp{" "}
                                                            {formatNumber(
                                                                npc.expReward,
                                                            )}{" "}<LocalizedText source={"| Vida"} />{" "}
                                                            {formatNumber(
                                                                npc.maxHp,
                                                            )}
                                                        </p>
                                                    </div>
                                                    <span className="rounded-full border border-emerald-300/20 px-3 py-1 text-emerald-200">
                                                        {formatNumber(
                                                            npc.spawns,
                                                        )}{" "}
                                                        {npc.spawns === 1 ? "NPC" : "NPCs"}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </article>
                    ))}
                </section>
            ) : null}

            {section === "npcs" ? (
                <section className="space-y-4">
                    <div className="overflow-x-auto rounded-[28px] border border-white/8 bg-[#08101a] shadow-xl">
                        <div className="grid min-w-[950px] grid-cols-[1.8fr_110px_110px_110px_1.8fr_1.6fr] gap-3 border-b border-white/8 px-4 py-3 text-xs uppercase tracking-[0.18em] text-stone-500">
                            <span>NPC</span>
                            <span><LocalizedText source={"Vida"} /></span>
                            <span>Exp</span>
                            <span><LocalizedText source={"Oro"} /></span>
                            <span><LocalizedText source={"Mapas"} /></span>
                            <span>Drop</span>
                        </div>
                        {filteredNpcs.map((npc) => (
                            <div
                                key={npc.id}
                                className="grid min-w-[950px] grid-cols-[1.8fr_110px_110px_110px_1.8fr_1.6fr] gap-3 border-b border-white/6 px-4 py-3 text-sm text-stone-200 last:border-b-0"
                            >
                                <div>
                                    <p className="font-medium text-white">
                                        <NpcArtwork bodyId={npc.bodyId} headId={npc.headId} name={npc.name}/><LocalizedText source={npc.name} />
                                    </p>
                                </div>
                                <span>{formatNumber(npc.maxHp)}</span>
                                <span>{formatNumber(npc.expReward)}</span>
                                <span>{formatNumber(npc.goldReward)}</span>
                                <span className="text-xs leading-5 text-stone-400">
                                    {npc.maps
                                        .map((map) => map.mapId)
                                        .join(", ") || "-"}
                                </span>
                                <span className="text-xs leading-5 text-stone-400">
                                    {formatNpcDrops(npc.drops)}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {section === "equipment" ? (
                <section className="space-y-4">
                    {equipmentSections.filter(group=>group.items.length>0).map((group) => (
                        <div key={group.key} className="space-y-3">
                            <h2 className="text-lg font-semibold text-white">
                                <LocalizedText source={group.label} />
                            </h2>
                            <div className="overflow-x-auto rounded-[28px] border border-white/8 bg-[#08101a] shadow-xl">
                                <div className="grid min-w-[1120px] grid-cols-[90px_84px_1.7fr_140px_100px_120px_90px_1.8fr_220px] gap-3 border-b border-white/8 px-4 py-3 text-xs uppercase tracking-[0.18em] text-stone-500">
                                    <span>ID</span>
                                    <span>Img</span>
                                    <span>Item</span>
                                    <span><LocalizedText source={"Tipo"} /></span>
                                    <span><LocalizedText source={"Valor"} /></span>
                                    <span>
                                        <LocalizedText source={getEquipmentStatLabel(
                                            group.key as PublicWikiResponse["equipment"][number]["category"],
                                        )} />
                                    </span>
                                    <span>Tier</span>
                                    <span><LocalizedText source={"Dropean"} /></span>
                                    <span><LocalizedText source={"Clases permitidas"} /></span>
                                </div>
                                {group.items.map((item) => (
                                    <div
                                        key={item.id}
                                        className="grid min-w-[1120px] grid-cols-[90px_84px_1.7fr_140px_100px_120px_90px_1.8fr_220px] gap-3 border-b border-white/6 px-4 py-3 text-sm text-stone-200 last:border-b-0"
                                    >
                                        <span>{item.id}</span>
                                        <div className="flex items-center justify-center rounded-2xl border border-white/8 bg-black/20 p-2">
                                            <ItemGraphic
                                                graphicData={
                                                    graphicsDB[
                                                        item.grhIndex.toString()
                                                    ]
                                                }
                                                name={item.name}
                                            />
                                        </div>
                                        <div>
                                            <p className="font-medium text-white">
                                                <LocalizedText source={item.name} />
                                            </p>
                                            {item.newbie ? (
                                                <p className="mt-1 text-xs text-cyan-200">
                                                    Newbie
                                                </p>
                                            ) : null}
                                        </div>
                                        <span><LocalizedText source={item.objTypeLabel} /></span>
                                        <span>{item.category==='boat'?"—":formatNumber(item.value)}</span>
                                        <span>{formatEquipmentStat(item)}</span>
                                        <span>
                                            {item.tier > 0 ? item.tier : "-"}
                                        </span>
                                        <span className="text-xs leading-5 text-stone-400">
                                            {dedupeNpcNames(item.droppedBy)}
                                        </span>
                                        <span className="text-xs leading-5 text-stone-400">
                                            {getAllowedClassLabels(
                                                item.blockedClasses, text,
                                            )}
                                        </span>
                                    </div>
                                ))}
                                {group.items.length === 0 ? (
                                    <div className="px-4 py-6 text-sm text-stone-400"><LocalizedText source={"No hay resultados para"} />{" "}
                                        <LocalizedText source={group.label.toLowerCase()} /><LocalizedText source={" con el filtro actual. "} /></div>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </section>
            ) : null}

            {section === "spells" ? (
                <section className="space-y-4">
                    <div className="overflow-x-auto rounded-[28px] border border-white/8 bg-[#08101a] shadow-xl">
                        <div className="grid min-w-[1200px] grid-cols-[80px_1.5fr_100px_100px_120px_1.4fr_1.7fr_1.7fr] gap-3 border-b border-white/8 px-4 py-3 text-xs uppercase tracking-[0.18em] text-stone-500">
                            <span>ID</span>
                            <span><LocalizedText source={"Hechizo"} /></span>
                            <span>Skill</span>
                            <span>Mana</span>
                            <span><LocalizedText source={"Poder"} /></span>
                            <span><LocalizedText source={"Palabras"} /></span>
                            <span><LocalizedText source={"Vende"} /></span>
                            <span>Drop</span>
                        </div>
                        {filteredSpells.map((spell) => (
                            <div
                                key={spell.id}
                                className="grid min-w-[1200px] grid-cols-[80px_1.5fr_100px_100px_120px_1.4fr_1.7fr_1.7fr] gap-3 border-b border-white/6 px-4 py-3 text-sm text-stone-200 last:border-b-0"
                            >
                                <span>{spell.id}</span>
                                <div>
                                    <p className="font-medium text-white">
                                        <LocalizedText source={spell.name} />
                                    </p>
                                    {spell.description ? (
                                        <p className="mt-1 line-clamp-2 text-xs text-stone-400">
                                            <LocalizedText source={spell.description} />
                                        </p>
                                    ) : null}
                                </div>
                                <span>{formatNumber(spell.minSkill)}</span>
                                <span>{formatNumber(spell.manaRequired)}</span>
                                <span>
                                    {spell.maxPower > 0
                                        ? `${spell.minPower}-${spell.maxPower}`
                                        : "-"}
                                </span>
                                <span className="text-xs leading-5 text-stone-400">
                                    {spell.words || "-"}
                                </span>
                                <span className="text-xs leading-5 text-stone-400">
                                    {dedupeNpcReferences(
                                        spell.sources.flatMap(
                                            (source) => source.soldBy,
                                        ),
                                        true,
                                    )}
                                </span>
                                <span className="text-xs leading-5 text-stone-400">
                                    {dedupeNpcReferences(
                                        spell.sources.flatMap(
                                            (source) => source.droppedBy,
                                        ),
                                        false,
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}
        </div>
    );
}
