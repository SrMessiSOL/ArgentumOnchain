import { LocalizedLabel } from '@/components/LocalizedText';
import React from "react";
import { formatNumber } from "../../../lib/number-format";
import type { GraphicData, NPCsDB } from "../../../types/game";
import { getTexturePath } from "../../../utils/gameLoader";
import type { PlayerHudState, SpellEntry } from "../../../lib/aowProtocol";
import type { Engine, Character } from "../engine/Engine";

const NPC_DROP_CHANCES = [90, 10, 1, 0.1, 0.01] as const;
const SERVER_EXP_MULTIPLIER = 5;
const SERVER_GOLD_MULTIPLIER = 3;
const MONEY_OBJECT_TYPE = 5;
const NON_HOSTILE_NPC_TYPES = new Set([1, 3, 4, 5, 7, 9, 10]);

export type InspectableNpcDrop = {
    itemId: number;
    quantity: number;
    chance: number;
    name: string;
    graphicData?: GraphicData;
};

export type InspectableNpc = {
    templateId: string | null;
    entityId: number;
    name: string;
    desc?: string;
    currentHp?: number;
    maxHp?: number;
    exp?: number;
    gold?: number;
    minHit?: number;
    maxHit?: number;
    def?: number;
    poderAtaque?: number;
    poderEvasion?: number;
    drops: InspectableNpcDrop[];
};

export type RevivableCharacter = {
    entityId: number;
    name: string;
};

export function isAdminInspector(
    engine: Engine | null,
    playerHud: PlayerHudState | null,
): boolean {
    return engine?.user?.privileges === 1 || playerHud?.privileges === 1;
}

export function formatNpcDropChance(chance: number): string {
    if (Number.isInteger(chance)) {
        return `${chance}%`;
    }

    return `${chance.toFixed(2).replace(/\.00$/, "").replace(/0$/, "")}%`;
}

export function formatNpcNumber(value: number): string {
    return formatNumber(value);
}

export function renderInspectableNpcItemGraphic(
    graphicData: GraphicData | undefined,
    name: string,
): React.ReactNode {
    if (!graphicData?.numFile) {
        return <div className="h-10 w-10 rounded-md bg-black/20" />;
    }

    const scale = Math.min(
        1,
        32 / Math.max(graphicData.width, graphicData.height, 1),
    );

    return (
        <div className="relative h-10 w-10 overflow-hidden rounded-md border border-cyan-200/15 bg-black/20">
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

export function findInspectableNpcAtTile(
    engine: Engine,
    tileX: number,
    tileY: number,
): Character | null {
    const visibleNpcs = Object.values(engine.personajes).filter(
        (character) =>
            character.isNpc &&
            character.map === engine.mapNumber &&
            !character.dead,
    );

    const exactMatch = visibleNpcs.find(
        (character) => character.pos.x === tileX && character.pos.y === tileY,
    );

    if (exactMatch) {
        return exactMatch;
    }

    let closestNpc: Character | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const character of visibleNpcs) {
        const distance = Math.max(
            Math.abs(character.pos.x - tileX),
            Math.abs(character.pos.y - tileY),
        );

        if (distance > 1 || distance >= closestDistance) {
            continue;
        }

        closestNpc = character;
        closestDistance = distance;
    }

    return closestNpc;
}

export function findVisibleEntityAtExactTile(
    engine: Engine,
    tileX: number,
    tileY: number,
): Character | null {
    const visibleEntities = Object.values(engine.personajes).filter(
        (character) => character.map === engine.mapNumber && !character.tthoney,
    );

    return (
        visibleEntities.find(
            (character) =>
                character.pos.x === tileX && character.pos.y === tileY,
        ) ?? null
    );
}

export function getSpellDataForTargeting(
    engine: Engine,
    spellSlot: number,
    spellEntries: SpellEntry[] | null | undefined,
) {
    const spellEntry = spellEntries?.find((entry) => entry.slot === spellSlot);

    if (!spellEntry || !engine.spellsDB) {
        return null;
    }

    return engine.spellsDB[spellEntry.idSpell.toString()] ?? null;
}

export function findRevivableCharacterAtTile(
    engine: Engine,
    tileX: number,
    tileY: number,
): Character | null {
    const visibleCharacters = Object.values(engine.personajes).filter(
        (character) =>
            !character.isNpc &&
            !character.tthoney &&
            character.map === engine.mapNumber &&
            character.dead,
    );

    return (
        visibleCharacters.find(
            (character) =>
                character.pos.x === tileX && character.pos.y === tileY,
        ) ?? null
    );
}

export function findNpcTemplate(
    engine: Engine,
    entity: Pick<Character, "idHead" | "idBody" | "nameCharacter">,
): [string, NPCsDB[string]] | null {
    if (!engine.npcsDB) {
        return null;
    }

    const exactMatch = Object.entries(engine.npcsDB).find(
        ([, npc]) =>
            npc.name === entity.nameCharacter &&
            npc.idBody === entity.idBody &&
            npc.idHead === entity.idHead,
    );

    if (exactMatch) {
        return exactMatch;
    }

    return (
        Object.entries(engine.npcsDB).find(
            ([, npc]) =>
                npc.name === entity.nameCharacter &&
                npc.idBody === entity.idBody,
        ) ?? null
    );
}

export function buildInspectableNpc(
    engine: Engine,
    entity: Character,
): InspectableNpc {
    const templateMatch = findNpcTemplate(engine, entity);
    const templateId = templateMatch?.[0] ?? null;
    const template = templateMatch?.[1];

    const drops = (template?.drop ?? []).map((drop, index) => {
        const objectData = engine.objectsDB?.[drop.item.toString()];
        const graphicId = objectData?.grhIndex;
        const graphicData = graphicId
            ? engine.graphicsDB?.[graphicId.toString()]
            : undefined;
        const quantity =
            objectData?.objType === MONEY_OBJECT_TYPE
                ? drop.cant * SERVER_GOLD_MULTIPLIER
                : drop.cant;

        return {
            itemId: drop.item,
            quantity,
            chance: NPC_DROP_CHANCES[index] ?? 0,
            name: objectData?.name ?? `Item ${drop.item}`,
            graphicData,
        };
    });

    return {
        templateId,
        entityId: entity.id,
        name:
            entity.nameCharacter?.trim() ||
            template?.name ||
            `NPC ${entity.id}`,
        desc: template?.desc,
        currentHp: entity.hp,
        maxHp: entity.maxHp ?? template?.maxHp,
        exp:
            typeof template?.exp === "number"
                ? template.exp * SERVER_EXP_MULTIPLIER
                : undefined,
        gold:
            typeof template?.gold === "number"
                ? template.gold * SERVER_GOLD_MULTIPLIER
                : undefined,
        minHit: template?.minHit,
        maxHit: template?.maxHit,
        def: template?.def,
        poderAtaque: template?.poderAtaque,
        poderEvasion: template?.poderEvasion,
        drops,
    };
}

export function canInspectNpc(
    engine: Engine,
    entity: Character,
    allowAdminInspect = false,
): boolean {
    if (allowAdminInspect) {
        return true;
    }

    const template = findNpcTemplate(engine, entity)?.[1];

    if (!template) {
        return false;
    }

    if (NON_HOSTILE_NPC_TYPES.has(Number(template.npcType ?? 0))) {
        return false;
    }

    const npcHp = Number(template.hp ?? entity.hp ?? 0);
    const npcMaxHp = Number(template.maxHp ?? entity.maxHp ?? 0);

    return npcHp > 0 || npcMaxHp > 0;
}
