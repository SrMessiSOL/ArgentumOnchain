import {itemMatchesSearch} from './localization/itemSearch';
import { claimLoadedVault } from './vaultClaim';
import { bankOperations } from './bankOperationGuard';
import { vaultRecovery } from './vaultRecovery';
import { characterRecovery } from './characterRecovery';
import { worldRecovery } from './worldRecovery';
import { randomUUID } from 'node:crypto';
import { PendingGoldRewards } from './pendingGoldRewards';
import {
    getFactionColor,
    getFactionConfig,
    getFactionRewardItemIdsUpToRank,
    getMaxEligibleFactionRank as getMaxEligibleFactionRankByThreshold,
    getRequiredFactionForItem,
    type CharacterFaction,
} from "./factions";
import type {
    BankTab,
    ClanRuntimeStateDelta,
    ClanRuntimeMember,
    CombatResult,
    DataObject,
    EntityId,
    InventoryRecord,
    MapObjectInfo,
    NumericFlag,
    PartyRuntimeStateDelta,
    PartyRuntimeMember,
    PartyRuntimeState,
    Position,
    RespawnPosition,
    RuntimeCallback,
    RuntimeCharacter,
    RuntimeCharacters,
    RuntimeClient,
    RuntimeNpc,
    SerializedBankItem,
    SerializedInventoryItem,
    SerializedSpellSlot,
    SpellEffect,
    SpellRecord,
    UserSpellEffect,
    HitTracker,
    SpellTracker,
    UseItemTracker,
    WalkTracker,
    WorldSaveResult,
} from "./types/runtime";
import type { SocketApi } from "./socket";
import {
    getCharacterById as getRuntimeCharacterById,
    getClientById as getRuntimeClientById,
    getOnlineSessionById as getRuntimeOnlineSessionById,
    hasOpenClientById,
} from "./runtimeRegistry";
import * as safeZone from "./safeZone";

export {};
const funct = require("./functions");
const socket = require("./socket") as SocketApi;
const vars = require("./vars");
const handleProtocol = require("./handleProtocol");
const fishing = require("./fishing");
const harvesting = require("./harvesting");
const crafting = require("./crafting");
const smelting = require("./smelting");
const mapInstanceManager = require("./mapInstanceManager");
const balance = require("./balance");

const getPotionRecoveryAmount = (maxStat: number, percentage: number | undefined, fixedAmount: number): number => {
    const recoveryPercentage = Number(percentage ?? 0);

    if (recoveryPercentage > 0) {
        return Math.floor((maxStat * recoveryPercentage) / 100);
    }

    return fixedAmount;
};

const PARTY_MAX_MEMBERS = 4;
const PARTY_INVITATION_MS = 30000;
const NEWBIE_MAX_LEVEL = 12;
const DEAD_WORLD_DELAY_MS = 15000;
const FLOOR_ITEM_CLEANUP_SOURCE = "drop";
const DROP_RENDER_BATCH_SIZE = 4;
const TELEPORT_CLIENT_MOVEMENT_LOCK_MS = 75;
const PVP_MAP_CHANGE_BLOCK_MS = 5000;
const DRAGON_SLAYER_SWORD_ITEM_ID = 402;
const CLAN_RING_MAP_ID = 273;
const MERCHANT_NPC_TYPE = 10;

type TileExitDestination = {
    map: number;
    x: number;
    y: number;
};

type TileExitDefinition = TileExitDestination | TileExitDestination[] | { destinations?: TileExitDestination[] };

function normalizeTileExitDestinations(tileExit: TileExitDefinition | undefined): TileExitDestination[] {
    let rawDestinations: TileExitDestination[] = [];

    if (Array.isArray(tileExit)) {
        rawDestinations = tileExit as TileExitDestination[];
    } else if (
        tileExit &&
        typeof tileExit === "object" &&
        "destinations" in tileExit &&
        Array.isArray(tileExit.destinations)
    ) {
        rawDestinations = tileExit.destinations;
    } else if (tileExit && typeof tileExit === "object") {
        rawDestinations = [tileExit as TileExitDestination];
    }

    return rawDestinations.filter(
        (destination): destination is TileExitDestination =>
            Number.isFinite(destination?.map) && Number.isFinite(destination?.x) && Number.isFinite(destination?.y),
    );
}

function pickRandomDestination(destinations: TileExitDestination[]): TileExitDestination | undefined {
    if (destinations.length === 0) {
        return undefined;
    }

    return destinations[funct.randomIntFromInterval(0, destinations.length - 1)];
}

function isItemSoldByMerchantNpc(itemId: number): boolean {
    if (!Number.isInteger(itemId) || itemId <= 0) {
        return false;
    }

    for (const npc of Object.values(vars.npcs as Record<string, Record<string, unknown>>)) {
        if (Number(npc?.npcType ?? 0) !== MERCHANT_NPC_TYPE) {
            continue;
        }

        const merchantItems = Array.isArray(npc?.objs) ? npc.objs : [];

        if (merchantItems.some((entry) => Number(entry?.item ?? 0) === itemId)) {
            return true;
        }
    }

    return false;
}

type TravelTicketDestination = {
    map: number;
    x: number;
    y: number;
};

function getTravelTicketDestination(obj: DataObject | undefined): TravelTicketDestination | null {
    const rawDestination = obj?.travelTicketDestination as Record<string, unknown> | undefined;
    const map = Number(rawDestination?.map ?? 0);
    const x = Number(rawDestination?.x ?? 0);
    const y = Number(rawDestination?.y ?? 0);

    if (!Number.isInteger(map) || !Number.isInteger(x) || !Number.isInteger(y) || map <= 0 || x <= 0 || y <= 0) {
        return null;
    }

    return { map, x, y };
}

function findNearbyMerchantNpcSellingItem(user: Pick<GameCharacter, "map" | "pos">, itemId: number): GameNpc | null {
    for (const npc of Object.values(vars.npcs as Record<string, GameNpc>)) {
        if (npc.map !== user.map || npc.npcType !== MERCHANT_NPC_TYPE) {
            continue;
        }

        const merchantItems = Array.isArray(npc.objs) ? npc.objs : [];

        if (!merchantItems.some((entry) => Number(entry?.item ?? 0) === itemId)) {
            continue;
        }

        if (!isOriginalNpcInteractionOutOfRange(user, npc, 3)) {
            return npc;
        }
    }

    return null;
}

function waitForNextEventLoopTurn(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

const pendingFloorDrops = new Set<string>();

function getFloorItemRegistryKey(idMap: number, pos: Position): string {
    return `${idMap}:${pos.x}:${pos.y}`;
}

function isDroppedFloorItem(objInfo: MapObjectInfo | undefined): boolean {
    return objInfo?.cleanupSource === FLOOR_ITEM_CLEANUP_SOURCE;
}

const isOriginalNpcInteractionOutOfRange = (
    user: Pick<GameCharacter, "pos">,
    npc: Pick<GameNpc, "pos"> | undefined,
    maxDistance: number,
): boolean => {
    if (!npc) {
        return true;
    }

    return Math.round(Math.hypot(user.pos.x - npc.pos.x, user.pos.y - npc.pos.y)) > maxDistance;
};

function isMarketEnabled(): boolean {
    return vars.subastasHabilitadas !== false;
}

type AreaTarget = GameCharacter | GameNpc;
type DoorObject = DataObject & {
    llave?: boolean;
    indexAbierta: number;
    indexCerrada: number;
};
type StabResult = {
    stabbed: boolean;
    extraDamage: number;
    totalDamage: number;
};
type FloorItemRegistryEntry = {
    mapId: number;
    pos: Position;
};
type CharacterSnapshotPersistOptions = {
    connected?: boolean;
};
type ActivityCharacter = {
    id: EntityId;
    _id?: string;
    idAccount?: string | null;
    pvpChar?: boolean;
    nameCharacter: string;
};
type GameCharacter = RuntimeCharacter & {
    id: EntityId;
    _id?: string;
    nameCharacter: string;
    map: number;
    pos: Position;
    banned?: Date | number | null;
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
    gold: number;
    level: number;
    exp: number;
    expNextLevel: number;
    idClase: number;
    idRaza: number;
    idGenero: number;
    minHit: number;
    maxHit: number;
    attrFuerza: number;
    attrAgilidad: number;
    attrInteligencia: number;
    attrConstitucion: number;
    bkAttrFuerza: number;
    bkAttrAgilidad: number;
    privileges: number;
    dead: NumericFlag;
    criminal: NumericFlag;
    faction: CharacterFaction;
    factionScoreArmada: number;
    factionScoreCaos: number;
    factionRankArmada: number;
    factionRankCaos: number;
    factionRewardsArmada: number;
    factionRewardsCaos: number;
    meditar: boolean;
    navegando: NumericFlag;
    seguroActivado: boolean;
    seguroClanActivado: boolean;
    pvpChar?: boolean;
    connected?: boolean;
    posX?: number;
    posY?: number;
    color?: string;
    clan?: string;
    clanId?: string | null;
    clanName?: string | null;
    cooldownParalizado?: number;
    cooldownFuerza: number;
    cooldownAgilidad: number;
    nextDialogAt: number;
    nextMeleeAt: number;
    nextSpellAt: number;
    nextSpellAfterMeleeAt: number;
    nextMeleeAfterSpellAt: number;
    nextUseItemAt: number;
    nextUseItemAfterMeleeAt: number;
    paralizado?: NumericFlag;
    inmovilizado: NumericFlag;
    useObj: UseItemTracker;
    spell: SpellTracker;
    hit: HitTracker;
    walk: WalkTracker;
    inv: InventoryRecord;
    bank: InventoryRecord;
    spells: SpellRecord;
    items?: SerializedInventoryItem[];
    bankItems?: SerializedBankItem[];
    npcTrade?: EntityId;
    tradeMode?: "merchant" | "bank" | "market";
    tradeBankTab?: BankTab;
    tradeBankItems?: InventoryRecord;
    tradeBankGold?: number;
    tradeHasClanVault?: boolean;
    tradeClanName?: string | null;
    idHead: number;
    idBody: number;
    idWeapon: number;
    idShield: number;
    idHelmet: number;
    idLastHead: number;
    idLastBody: number;
    idLastHelmet: number;
    idLastWeapon: number;
    idLastShield: number;
    idItemWeapon: number | string;
    idItemBody: number | string;
    idItemShield: number | string;
    idItemHelmet: number | string;
    idItemArrow: number | string;
    idItemRing: number | string;
};
type GameNpc = RuntimeNpc & {
    id: EntityId;
    isNpc: true;
    nameCharacter: string;
    map: number;
    pos: Position;
    movement: number;
    hp: number;
    maxHp: number;
    minHp: number;
    def: number;
    defM?: number;
    magicResistance?: number;
    magicDef?: number;
    exp: number;
    npcType: number;
    poderEvasion: number;
    cooldownParalizado?: number;
    paralizado?: NumericFlag;
    inmovilizado?: NumericFlag;
    aguaValida?: boolean;
    tierraInvalida?: boolean;
    objs?: Record<number, { item: number; cant?: number }>;
    rute: unknown[];
    hitExpAwarded?: number;
};

const STABBING_CHANCE_BY_CLASS: Record<number, number> = {
    3: 0.08,
    9: 0.08,
    8: 0.15,
    4: 0.24,
    2: 0.15,
    6: 0.15,
    1: 0.08,
    7: 0.08,
    10: 0.08,
    5: 0.08,
    11: 0.08,
};

const STABBING_DAMAGE_MOD_BY_CLASS: Record<number, number> = {
    3: 1.4,
    9: 1.3,
    8: 1.4,
    4: 1.35,
    2: 1.25,
    6: 1.25,
    1: 0.1,
    7: 0.1,
    10: 1.1,
    5: 1.2,
    11: 1.2,
};

const STABBING_NPC_MIN_MOD_BY_CLASS: Record<number, number> = {
    3: 1.4,
    9: 1.3,
    8: 1.4,
    4: 1.6,
    2: 1.25,
    6: 1.25,
    1: 1.2,
    7: 1.2,
    10: 1.1,
    5: 1.2,
    11: 1.2,
};

const STABBING_NPC_MAX_MOD_BY_CLASS: Record<number, number> = {
    3: 1.4,
    9: 1.3,
    8: 1.4,
    4: 1.9,
    2: 1.25,
    6: 1.25,
    1: 1.2,
    7: 1.2,
    10: 1.1,
    5: 1.2,
    11: 1.2,
};

const COMBAT_HIT_FX_ID = 14;
const COMBAT_SHIELD_BLOCK_FX_ID = 88;
const COMBAT_STABBING_FX_ID = 89;
const COMBAT_MISS_FX_ID = 90;

function clampChance(value: number, min = 5, max = 95): number {
    return Math.max(min, Math.min(max, value));
}

function getSimulatedSkill(user: GameCharacter): number {
    return Math.min(100, user.level * 3);
}

function getInventoryItem(user: GameCharacter, slot: number | string | undefined) {
    if (!slot) {
        return null;
    }

    return user.inv[String(slot)] ?? null;
}

function getEquippedWeaponData(user: GameCharacter): DataObject | null {
    const item = getInventoryItem(user, user.idItemWeapon);
    if (!item) {
        return null;
    }

    return vars.datObj[item.idItem] ?? null;
}

function isDragonSlayerSword(itemId: number): boolean {
    return itemId === DRAGON_SLAYER_SWORD_ITEM_ID;
}

function syncUnequippedItemVisuals(user: GameCharacter, normalizedPos: string): void {
    let removedBody = false;
    let removedWeapon = false;
    let removedArrow = false;
    let removedShield = false;
    let removedHelmet = false;
    let removedRing = false;

    if (String(user.idItemBody) === normalizedPos) {
        const bodyNaked = game.bodyNaked(user.id);

        if (user.navegando) {
            user.idLastBody = bodyNaked;
        } else {
            user.idBody = bodyNaked;
        }

        user.idItemBody = 0;
        removedBody = true;
    }

    if (String(user.idItemWeapon) === normalizedPos) {
        if (user.navegando) {
            user.idLastWeapon = 0;
        } else {
            user.idWeapon = 0;
        }

        user.idItemWeapon = 0;
        removedWeapon = true;
    }

    if (String(user.idItemArrow) === normalizedPos) {
        user.idItemArrow = 0;
        removedArrow = true;
    }

    if (String(user.idItemShield) === normalizedPos) {
        if (user.navegando) {
            user.idLastShield = 0;
        } else {
            user.idShield = 0;
        }

        user.idItemShield = 0;
        removedShield = true;
    }

    if (String(user.idItemHelmet) === normalizedPos) {
        if (user.navegando) {
            user.idLastHelmet = 0;
        } else {
            user.idHelmet = 0;
        }

        user.idItemHelmet = 0;
        removedHelmet = true;
    }

    if (String(user.idItemRing) === normalizedPos) {
        user.idItemRing = 0;
        removedRing = true;
    }

    if (!removedBody && !removedWeapon && !removedArrow && !removedShield && !removedHelmet && !removedRing) {
        return;
    }

    game.loopAreaPos(user.map, user.pos, function (target: GameCharacter) {
        withUserClient(target.id, (targetClient) => {
            if (!canReceiveCharacterEvent(target.id, user.id)) {
                return;
            }

            if (removedBody) {
                handleProtocol.changeRopa(user.id, user.idBody, 0, targetClient);
            }

            if (removedWeapon) {
                handleProtocol.changeWeapon(user.id, user.idWeapon, 0, targetClient);
            }

            if (removedArrow) {
                handleProtocol.changeArrow(user.id, 0, targetClient);
            }

            if (removedShield) {
                handleProtocol.changeShield(user.id, user.idShield, 0, targetClient);
            }

            if (removedHelmet) {
                handleProtocol.changeHelmet(user.id, user.idHelmet, 0, targetClient);
            }
        });
    });
}

function rebuildEquippedInventoryState(user: GameCharacter): void {
    user.idItemBody = 0;
    user.idItemWeapon = 0;
    user.idItemShield = 0;
    user.idItemHelmet = 0;
    user.idItemArrow = 0;
    user.idItemRing = 0;
    user.idBody = game.bodyNaked(user.id);
    user.idWeapon = 0;
    user.idShield = 0;
    user.idHelmet = 0;

    for (const [idPos, item] of Object.entries(user.inv)) {
        if (!item.equipped) {
            continue;
        }

        const obj = vars.datObj[item.idItem];

        if (!obj) {
            continue;
        }

        if (obj.objType == vars.objType.armaduras) {
            if (!user.navegando) {
                user.idBody = obj.anim;
            }
            user.idItemBody = idPos;
        } else if (obj.objType == vars.objType.armas) {
            if (!user.navegando) {
                user.idWeapon = obj.anim;
            }
            user.idItemWeapon = idPos;
        } else if (obj.objType == vars.objType.anillos) {
            user.idItemRing = idPos;
        } else if (obj.objType == vars.objType.escudos) {
            if (!user.navegando) {
                user.idShield = obj.anim;
            }
            user.idItemShield = idPos;
        } else if (obj.objType == vars.objType.cascos) {
            if (!user.navegando) {
                user.idHelmet = obj.anim;
            }
            user.idItemHelmet = idPos;
        } else if (obj.objType == vars.objType.flechas) {
            user.idItemArrow = idPos;
        }
    }
}

function isArmorRaceRestricted(user: GameCharacter, obj: DataObject): boolean {
    if (obj.objType !== vars.objType.armaduras) {
        return false;
    }

    const isDwarfRace = user.idRaza === vars.razas.gnomo || user.idRaza === vars.razas.enano;

    if (obj.razaEnana && !isDwarfRace) {
        return true;
    }

    if (!obj.razaEnana && isDwarfRace) {
        return true;
    }

    return false;
}

function canAutoEquipInventoryItem(user: GameCharacter, obj: DataObject | undefined): boolean {
    if (!obj) {
        return false;
    }

    if (Array.isArray(obj.clasesNoPermitidas) && obj.clasesNoPermitidas.includes(user.idClase)) {
        return false;
    }

    if (isArmorRaceRestricted(user, obj)) {
        return false;
    }

    return true;
}

function restoreAutoEquippedInventoryState(user: GameCharacter): void {
    const equippedByType = new Set<number>();

    for (const item of Object.values(user.inv)) {
        item.equipped = 0;
    }

    for (const [idPos, item] of Object.entries(user.inv)) {
        const obj = vars.datObj[item.idItem] as DataObject | undefined;

        if (!canAutoEquipInventoryItem(user, obj)) {
            continue;
        }

        const objType = Number(obj?.objType ?? 0);

        if (
            objType !== vars.objType.armaduras &&
            objType !== vars.objType.armas &&
            objType !== vars.objType.escudos &&
            objType !== vars.objType.cascos &&
            objType !== vars.objType.flechas &&
            objType !== vars.objType.anillos
        ) {
            continue;
        }

        if (equippedByType.has(objType)) {
            continue;
        }

        user.inv[idPos].equipped = 1;
        equippedByType.add(objType);
    }

    rebuildEquippedInventoryState(user);
}

function enforceAdminSummonedBotMaxBuffs(user: GameCharacter, now: number): void {
    const maxStrength = Math.max(0, Number(user.bkAttrFuerza ?? 0) * 2);
    const maxAgility = Math.max(0, Number(user.bkAttrAgilidad ?? 0) * 2);

    user.attrFuerza = maxStrength;
    user.attrAgilidad = maxAgility;
    user.cooldownFuerza = now;
    user.cooldownAgilidad = now;
}

function getEquippedRingData(user: GameCharacter): DataObject | null {
    const item = getInventoryItem(user, user.idItemRing);
    if (!item) {
        return null;
    }

    return vars.datObj[item.idItem] ?? null;
}

function getEquippedHelmetData(user: GameCharacter): DataObject | null {
    const item = getInventoryItem(user, user.idItemHelmet);
    if (!item) {
        return null;
    }

    return vars.datObj[item.idItem] ?? null;
}

function getEquippedBodyData(user: GameCharacter): DataObject | null {
    const item = getInventoryItem(user, user.idItemBody);
    if (!item) {
        return null;
    }

    return vars.datObj[item.idItem] ?? null;
}

function getEquippedShieldData(user: GameCharacter): DataObject | null {
    const item = getInventoryItem(user, user.idItemShield);
    if (!item) {
        return null;
    }

    return vars.datObj[item.idItem] ?? null;
}

function getTargetMagicResistanceBonus(target: GameCharacter): number {
    const helmet = getEquippedHelmetData(target);
    const body = getEquippedBodyData(target);
    const shield = getEquippedShieldData(target);
    const ring = getEquippedRingData(target);

    let total = 0;

    for (const item of [helmet, body, shield, ring]) {
        total += Number(item?.resistenciaMagica ?? 0);
    }

    return total;
}

function getClassMagicResistanceBonus(classId: number): number {
    const modifier = Number(vars.modResistenciaMagica?.[classId] ?? 0);
    return Number.isFinite(modifier) ? modifier : 0;
}

function getMagicDamageModifier(classId: number): number {
    const modifier = Number(vars.modDmgMagia?.[classId] ?? 1);
    return Number.isFinite(modifier) ? modifier : 1;
}

function applyMagicBonuses(baseDamage: number, caster: GameCharacter) {
    let damage = baseDamage + Math.round((baseDamage * (3 * caster.level)) / 100);
    let magicPenetration = 0;
    const weapon = getEquippedWeaponData(caster);
    const ring = getEquippedRingData(caster);

    for (const item of [weapon, ring]) {
        if (!item) {
            continue;
        }

        damage += Math.round((damage * Number(item.magicDamageBonus ?? 0)) / 100);
        magicPenetration += Number(item.magicPenetration ?? 0);
    }

    damage = Math.floor(damage * getMagicDamageModifier(caster.idClase));

    return { damage, magicPenetration };
}

function applyMagicResistanceToNpc(
    damage: number,
    caster: GameCharacter,
    npc: GameNpc,
    magicPenetration: number,
): number {
    let nextDamage = damage;
    const casterMagicSkill = getSimulatedSkill(caster);
    const npcMagicResistance = Number(npc.magicResistance ?? 0);
    const npcMagicDef = Number(npc.magicDef ?? npc.defM ?? 0);

    if (npcMagicResistance > 0) {
        const diffSkill = npcMagicResistance - casterMagicSkill;
        const percentReduction = Math.max(0, npcMagicDef + (diffSkill > 0 ? diffSkill * 2 : 0) - magicPenetration);
        nextDamage -= Math.floor((nextDamage * percentReduction) / 100);
    }

    nextDamage -= Number(npc.defM ?? 0);
    return nextDamage;
}

function applyMagicResistanceToUser(
    damage: number,
    caster: GameCharacter,
    target: GameCharacter,
    magicPenetration: number,
): number {
    let nextDamage = damage;
    const casterMagicSkill = getSimulatedSkill(caster);
    const targetMagicResistance = getSimulatedSkill(target);
    const targetItemMagicResistance = getTargetMagicResistanceBonus(target);
    const targetClassMagicResistance = getClassMagicResistanceBonus(target.idClase);
    const diffSkill = targetMagicResistance - casterMagicSkill;
    const percentReduction = Math.max(
        0,
        targetItemMagicResistance + targetClassMagicResistance + (diffSkill > 0 ? diffSkill * 2 : 0) - magicPenetration,
    );

    nextDamage -= Math.floor((nextDamage * percentReduction) / 100);
    return nextDamage;
}

function getRandomBodyPart(): number {
    const roll = funct.randomIntFromInterval(1, 8);
    if (roll > vars.partesCuerpo.torso) {
        return funct.randomIntFromInterval(vars.partesCuerpo.piernaIzquierda, vars.partesCuerpo.torso);
    }

    return roll;
}

function refreshAgilityBuff(user: GameCharacter, minBoost: number, maxBoost: number, client: RuntimeClient) {
    const maxAttr = user.bkAttrAgilidad * 2;

    if (user.attrAgilidad < maxAttr) {
        user.attrAgilidad += funct.randomIntFromInterval(minBoost, maxBoost);

        if (user.attrAgilidad > maxAttr) {
            user.attrAgilidad = maxAttr;
        }
    }

    refreshFuerzaAgilidadBuffTimers(user, client, "agilidad");
}

function refreshStrengthBuff(user: GameCharacter, minBoost: number, maxBoost: number, client: RuntimeClient) {
    const maxAttr = user.bkAttrFuerza * 2;

    if (user.attrFuerza < maxAttr) {
        user.attrFuerza += funct.randomIntFromInterval(minBoost, maxBoost);

        if (user.attrFuerza > maxAttr) {
            user.attrFuerza = maxAttr;
        }
    }

    refreshFuerzaAgilidadBuffTimers(user, client, "fuerza");
}

function refreshFuerzaAgilidadBuffTimers(
    user: GameCharacter,
    client: RuntimeClient,
    refreshedStat: "agilidad" | "fuerza",
) {
    const now = Date.now();
    const buffSeconds = Math.ceil(vars.timing.statusDurations.fuerzaAgilidadBuffMs / 1000);
    const agilityActive =
        refreshedStat === "agilidad" || (user.cooldownAgilidad > 0 && user.attrAgilidad > user.bkAttrAgilidad);
    const strengthActive =
        refreshedStat === "fuerza" || (user.cooldownFuerza > 0 && user.attrFuerza > user.bkAttrFuerza);

    if (agilityActive) {
        user.cooldownAgilidad = now;
        handleProtocol.updateAgilidad(user.attrAgilidad, buffSeconds, client);
    }

    if (strengthActive) {
        user.cooldownFuerza = now;
        handleProtocol.updateFuerza(user.attrFuerza, buffSeconds, client);
    }
}

function resetFuerzaAgilidadBuffs(user: GameCharacter, client?: RuntimeClient) {
    user.attrFuerza = user.bkAttrFuerza;
    user.attrAgilidad = user.bkAttrAgilidad;
    user.cooldownFuerza = 0;
    user.cooldownAgilidad = 0;

    if (client) {
        handleProtocol.updateFuerza(user.attrFuerza, 0, client);
        handleProtocol.updateAgilidad(user.attrAgilidad, 0, client);
    }
}

function isArenaCombat(user: GameCharacter | undefined, userAttacked: GameCharacter | undefined): boolean {
    return Boolean(
        (user?.pvpChar && userAttacked?.pvpChar && user.arenaRoomId && user.arenaRoomId === userAttacked.arenaRoomId) ||
        (user?.challengeMatchId &&
            userAttacked?.challengeMatchId &&
            user.challengeMatchId === userAttacked.challengeMatchId &&
            user.challengeTeam &&
            userAttacked.challengeTeam &&
            user.challengeTeam !== userAttacked.challengeTeam),
    );
}

function getChallengeManager() {
    return require("./challengeManager") as {
        getCombatRelation: (
            left: GameCharacter | undefined,
            right: GameCharacter | undefined,
        ) => "ally" | "enemy" | null;
        isCharacterInActiveMatch: (user: GameCharacter | undefined) => boolean;
    };
}

function isUnsafeArenaTile(character: Pick<GameCharacter, "map" | "pos">): boolean {
    return safeZone.isUnsafeArenaPosition(character.map, character.pos);
}

function canCitizenSupportCriminal(user: GameCharacter, userAttacked: GameCharacter): boolean {
    return isUnsafeArenaTile(user) && isUnsafeArenaTile(userAttacked);
}

function isCitizenAlignedCharacter(character: Pick<GameCharacter, "criminal" | "faction">): boolean {
    const faction = normalizeFaction(character.faction);

    return faction === "armada" || (!character.criminal && faction === "none");
}

function isCitizenClanMember(
    character: Pick<GameCharacter, "clanId" | "clanAlignment" | "criminal" | "faction">,
): boolean {
    return Boolean(character.clanId && character.clanAlignment === "citizen" && isCitizenAlignedCharacter(character));
}

function isJailTile(character: Pick<GameCharacter, "map" | "pos">): boolean {
    return vars.mapa[character.map]?.[character.pos.y]?.[character.pos.x]?.trigger === 4;
}

function isBlockedBySafeZone(user: GameCharacter, userAttacked: GameCharacter): boolean {
    return !isUnsafeArenaTile(user) || !isUnsafeArenaTile(userAttacked);
}

function applyOpenWorldAttackRules(user: GameCharacter, userAttacked: GameCharacter, arenaCombat: boolean): boolean {
    if (arenaCombat || !isBlockedBySafeZone(user, userAttacked)) {
        return true;
    }

    if (isCitizenClanMember(user) && isCitizenAlignedCharacter(userAttacked)) {
        withUserClient(user.id, (userClient) => {
            handleProtocol.console(
                "No puedes atacar ciudadanos perteneciendo a un clan de ciudadanos.",
                "white",
                1,
                0,
                userClient,
            );
        });

        return false;
    }

    if (user.criminal || userAttacked.criminal) {
        return true;
    }

    if (user.seguroActivado) {
        withUserClient(user.id, (userClient) => {
            handleProtocol.console(
                "Debes desactivar el seguro para poder atacar a ciudadanos (K). ¡Te convertiras en un criminal!",
                "white",
                1,
                0,
                userClient,
            );
        });

        return false;
    }

    if (
        normalizeFaction(user.faction) === "armada" &&
        normalizeFaction(userAttacked.faction) === "none" &&
        !userAttacked.criminal
    ) {
        game.clearCharacterFaction(user.id);
        withUserClient(user.id, (userClient) => {
            handleProtocol.console(
                "Perdiste tu enlistamiento en la Armada por atacar a un ciudadano.",
                "white",
                1,
                0,
                userClient,
            );
        });
    }

    game.hacerCriminal(user.id);
    return true;
}

function resolveAreaTarget(map: number, x: number, y: number) {
    const tile = vars.mapData[map]?.[y]?.[x];
    const targetId = tile?.id;

    if (!targetId) {
        return;
    }

    const npc = vars.npcs[targetId] as GameNpc | undefined;

    if (npc) {
        return {
            id: targetId,
            target: npc,
            isNpc: true,
        };
    }

    const character = getCharacterById(targetId);

    if (character) {
        return {
            id: targetId,
            target: character,
            isNpc: false,
        };
    }

    tile.id = 0;

    return;
}

function isInvisibleAdmin(user: GameCharacter | undefined) {
    return Boolean(user?.privileges === 1 && user.invisibleAdmin);
}

function isSpellInvisible(user: GameCharacter | undefined) {
    return Boolean(user?.invisibleSpell);
}

function isVisibleToPartyViewer(viewerId: EntityId, character: GameCharacter | undefined) {
    const viewer = getCharacterById(viewerId);

    return Boolean(viewer && character && viewer.partyId && character.partyId && viewer.partyId === character.partyId);
}

function isVisibleToClanViewer(viewerId: EntityId, character: GameCharacter | undefined) {
    const viewer = getCharacterById(viewerId);

    return Boolean(
        viewer && character && viewer.clanId && character.clanId && String(viewer.clanId) === String(character.clanId),
    );
}

function isDeadWorldActive(user: Pick<GameCharacter, "deadWorldActive"> | undefined) {
    return Boolean(user?.deadWorldActive);
}

function isSameClan(leftId: EntityId, rightId: EntityId): boolean {
    if (isSameEntityId(leftId, rightId)) {
        return false;
    }

    const left = getCharacterById(leftId);
    const right = getCharacterById(rightId);

    return Boolean(left?.clanId && right?.clanId && String(left.clanId) === String(right.clanId));
}

function canRenderCharacter(viewerId: EntityId, character: GameCharacter | undefined) {
    if (!character) {
        return false;
    }

    const viewer = getCharacterById(viewerId);

    if (
        character.id === viewerId ||
        isVisibleToPartyViewer(viewerId, character) ||
        isVisibleToClanViewer(viewerId, character)
    ) {
        return true;
    }

    if (isDeadWorldActive(viewer)) {
        return Boolean(character.dead);
    }

    return !isInvisibleAdmin(character);
}

function canReceiveCharacterEvent(viewerId: EntityId, subjectId: EntityId | null | undefined) {
    const subject = getCharacterById(subjectId);

    if (!subject) {
        return true;
    }

    return canRenderCharacter(viewerId, subject);
}

function emitCharacterFxToUserArea(entityId: EntityId, fxId: number) {
    loopAreaByUserId(entityId, function (target: AreaTarget) {
        if (target.isNpc) {
            return;
        }

        const targetClient = getClientById(target.id);
        if (!targetClient) {
            return;
        }

        if (!canReceiveCharacterEvent(target.id, entityId)) {
            return;
        }

        handleProtocol.animFX(entityId, fxId, targetClient);
    });
}

function emitNpcFxToArea(npc: GameNpc, fxId: number) {
    game.loopAreaPos(npc.map, npc.pos, function (target: GameCharacter) {
        withUserClient(target.id, (targetClient) => {
            if (!canReceiveCharacterEvent(target.id, npc.id)) {
                return;
            }

            handleProtocol.animFX(npc.id, fxId, targetClient);
        });
    });
}

function canNpcDetectCharacter(user: GameCharacter | undefined) {
    return Boolean(
        user && !isInvisibleAdmin(user) && !isSpellInvisible(user) && (!user.dead || isDeadWorldActive(user)),
    );
}

function clearDeadWorldTransition(user: GameCharacter | undefined) {
    if (!user?.deadWorldTimeoutId) {
        return;
    }

    clearTimeout(user.deadWorldTimeoutId);
    user.deadWorldTimeoutId = null;
}

function syncVisibleCharactersForViewer(idUser: EntityId) {
    const user = getCharacterById(idUser);
    const ws = getClientById(idUser);

    if (!user || !ws) {
        return;
    }

    handleProtocol.sendMyCharacter(user);
    socket.send(ws);

    game.loopArea(ws, function (target: AreaTarget) {
        if (target.isNpc || target.id === idUser) {
            return;
        }

        const areaCharacter = target as GameCharacter;

        if (canRenderCharacter(idUser, areaCharacter)) {
            handleProtocol.sendCharacter(areaCharacter, idUser);
            socket.send(ws);
            return;
        }

        handleProtocol.deleteCharacter(target.id, ws);
    });
}

function syncCharacterVisibilityForOthers(idUser: EntityId) {
    const user = getCharacterById(idUser);
    const ws = getClientById(idUser);

    if (!user || !ws) {
        return;
    }

    game.loopArea(ws, function (target: AreaTarget) {
        if (target.isNpc || target.id === idUser) {
            return;
        }

        const targetClient = getClientById(target.id);

        if (!targetClient) {
            return;
        }

        if (canRenderCharacter(target.id, user)) {
            handleProtocol.sendCharacter(user, target.id);
            socket.send(targetClient);
        } else {
            handleProtocol.deleteCharacter(idUser, targetClient);
        }
    });
}

function setDeadWorldState(idUser: EntityId, enabled: boolean) {
    const user = getCharacterById(idUser);

    if (!user) {
        return;
    }

    clearDeadWorldTransition(user);
    user.deadWorldTransitionEndsAt = 0;

    if (Boolean(user.deadWorldActive) === enabled) {
        return;
    }

    user.deadWorldActive = enabled;
    syncVisibleCharactersForViewer(idUser);
    game.syncUserNpcVisibility(idUser);
}

function scheduleDeadWorldTransition(idUser: EntityId, delayMs = DEAD_WORLD_DELAY_MS) {
    const user = getCharacterById(idUser);

    if (!user) {
        return;
    }

    clearDeadWorldTransition(user);
    user.deadWorldActive = false;
    user.deadWorldTransitionEndsAt = Date.now() + delayMs;
    user.deadWorldTimeoutId = setTimeout(() => {
        const targetUser = getCharacterById(idUser);

        if (!targetUser?.dead) {
            return;
        }

        setDeadWorldState(idUser, true);
    }, delayMs);
}

function syncCharacterVisibility(idUser: EntityId) {
    const user = getCharacterById(idUser);
    const ws = getClientById(idUser);

    if (!user || !ws) {
        return;
    }

    syncVisibleCharactersForViewer(idUser);
    syncCharacterVisibilityForOthers(idUser);
}

function interruptPendingLogoutOnAttack(
    idUser: EntityId,
    reason = "[Servidor] La salida se canceló porque recibiste un ataque.",
) {
    const user = getCharacterById(idUser);

    if (!user || user.dead) {
        return;
    }

    const now = Date.now();
    const hadPendingLogout = Boolean(user.disconnectOnDeath || (user.logoutExpiresAt && user.logoutExpiresAt > now));

    if (!hadPendingLogout) {
        return;
    }

    user.logoutRequestedAt = 0;
    user.logoutExpiresAt = 0;
    user.disconnectOnDeath = true;

    const client = getClientById(idUser);

    if (client) {
        handleProtocol.console(reason, "#E69500", 0, 0, client);
    }
}

function setSpellInvisibility(idUser: EntityId, enabled: boolean) {
    const user = getCharacterById(idUser);

    if (!user) {
        return;
    }

    user.invisibleSpell = enabled;
    user.cooldownInvisibleSpell = enabled ? Date.now() : 0;

    syncCharacterVisibility(idUser);
    game.syncUserNpcVisibility(idUser);
}

function setHiddenSkillState(idUser: EntityId, enabled: boolean) {
    const user = getCharacterById(idUser);

    if (!user) {
        return;
    }

    user.hiddenSkill = enabled;

    syncCharacterVisibility(idUser);
    game.syncUserNpcVisibility(idUser);
}

function breakUserInvisibilityOnPvPDamageAttack(idUser: EntityId) {
    const user = getCharacterById(idUser);

    if (!user) {
        return;
    }

    let visibilityChanged = false;

    if (user.invisibleSpell) {
        user.invisibleSpell = false;
        user.cooldownInvisibleSpell = 0;
        visibilityChanged = true;
    }

    if (user.hiddenSkill) {
        user.hiddenSkill = false;
        user.hiddenSkillStartedAt = 0;
        user.hiddenSkillExpiresAt = 0;
        user.hiddenSkillCooldownUntil = 0;
        visibilityChanged = true;
    }

    if (!visibilityChanged) {
        return;
    }

    syncCharacterVisibility(idUser);
    game.syncUserNpcVisibility(idUser);
}

function markUsersInPvpCombat(
    attacker: GameCharacter | undefined,
    target: GameCharacter | undefined,
    now = Date.now(),
) {
    if (!attacker || !target || attacker.id === target.id) {
        return;
    }

    const blockedUntil = now + PVP_MAP_CHANGE_BLOCK_MS;
    attacker.pvpMapChangeBlockedUntil = Math.max(Number(attacker.pvpMapChangeBlockedUntil ?? 0), blockedUntil);
    target.pvpMapChangeBlockedUntil = Math.max(Number(target.pvpMapChangeBlockedUntil ?? 0), blockedUntil);
}

function getPvpMapChangeDeniedMessage(
    user: Pick<GameCharacter, "pvpMapChangeBlockedUntil"> | undefined,
    now = Date.now(),
) {
    const remainingMs = Number(user?.pvpMapChangeBlockedUntil ?? 0) - now;

    if (remainingMs <= 0) {
        return null;
    }

    return `No puedes cambiar de mapa hasta salir de combate (${Math.ceil(remainingMs / 1000)}s).`;
}

function dismountUser(user: GameCharacter) {
    if (!user.navegando) {
        return;
    }

    if (user.dead) {
        user.idBody = 8;
        user.idHead = 500;
    } else {
        user.idBody = user.idLastBody;
        user.idHead = user.idLastHead;
    }

    user.idWeapon = user.idLastWeapon;
    user.idHelmet = user.idLastHelmet;
    user.idShield = user.idLastShield;
    user.navegando = 0;
}

function resolveBoatBodyId(currentBodyId: number | undefined, dead: number | boolean) {
    if (dead) {
        return 87;
    }

    return currentBodyId === 85 || currentBodyId === 86 ? currentBodyId : 84;
}

function applyBoatVisualState(user: GameCharacter) {
    if (!user.navegando) {
        return;
    }

    user.idBody = resolveBoatBodyId(user.idBody, user.dead);
    user.idHead = 0;
    user.idWeapon = 0;
    user.idHelmet = 0;
    user.idShield = 0;
}

function findNearestLegalPosition(
    numMap: number,
    posX: number,
    posY: number,
    aguaValida: boolean,
): Position | undefined {
    const tmpPos = {
        x: posX,
        y: posY,
    };

    let count = 0;
    let level = 1;

    while (!game.legalPos(tmpPos.x, tmpPos.y, numMap, aguaValida) || hasTileExitAtPosition(numMap, tmpPos)) {
        if (count === 0) {
            tmpPos.x = posX - level;
            tmpPos.y = posY - level;
        } else {
            tmpPos.x++;
        }

        const filas = 3 * level - (level - 1);

        if (count % filas === 0 && count !== 0) {
            tmpPos.y++;
            tmpPos.x = posX - level;
        }

        count++;

        if (count == filas * filas) {
            count = 0;
            level++;
        }

        if ((tmpPos.x > 100 || tmpPos.x < 0) && (tmpPos.y > 100 || tmpPos.y < 0)) {
            tmpPos.x = 50;
            tmpPos.y = 50;
            numMap = 1;
        }

        if (count > 20000) {
            return;
        }
    }

    return tmpPos;
}

type DropPositionOptions = {
    ignoreOccupantId?: EntityId;
    maxRadius?: number;
    allowWater?: boolean;
    allowReplacingDroppedFloorItem?: boolean;
    excludedPositions?: Set<string>;
};

function canDropItemAtPosition(idMap: number, pos: Position, options?: DropPositionOptions): boolean {
    const ignoreOccupantId = options?.ignoreOccupantId;
    const allowWater = options?.allowWater ?? false;
    const canStandOnTile = allowWater
        ? game.legalPos(pos.x, pos.y, idMap, false, ignoreOccupantId) ||
          game.legalPos(pos.x, pos.y, idMap, true, ignoreOccupantId)
        : game.legalPos(pos.x, pos.y, idMap, false, ignoreOccupantId);

    if (!canStandOnTile) {
        return false;
    }

    const tile = vars.mapa[idMap]?.[pos.y]?.[pos.x];

    if (!tile) {
        return false;
    }

    if (pendingFloorDrops.has(getFloorItemRegistryKey(idMap, pos))) return false;
    if (options?.excludedPositions?.has(getFloorItemRegistryKey(idMap, pos))) {
        return false;
    }

    if (typeof tile.tileExit !== "undefined") {
        return false;
    }

    if (tile.objInfo?.objIndex) {
        return Boolean(options?.allowReplacingDroppedFloorItem) && isDroppedFloorItem(tile.objInfo);
    }

    return true;
}

function hasTileExitAtPosition(idMap: number, pos: Position): boolean {
    return typeof vars.mapa[idMap]?.[pos.y]?.[pos.x]?.tileExit !== "undefined";
}

function findNearestDropPosition(idMap: number, origin: Position, options?: DropPositionOptions): Position | undefined {
    const maxRadius = Math.max(0, options?.maxRadius ?? 100);

    for (let radius = 0; radius <= maxRadius; radius++) {
        const minX = origin.x - radius;
        const maxX = origin.x + radius;
        const minY = origin.y - radius;
        const maxY = origin.y + radius;

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const isInnerTile = radius > 0 && x > minX && x < maxX && y > minY && y < maxY;

                if (isInnerTile) {
                    continue;
                }

                const tmpPos = { x, y };

                if (canDropItemAtPosition(idMap, tmpPos, options)) {
                    return tmpPos;
                }
            }
        }
    }
}

function resolveTeleportPosition(
    numMap: number,
    posX: number,
    posY: number,
    aguaValida: boolean,
): Position | undefined {
    if (game.legalPos(posX, posY, numMap, aguaValida)) {
        return {
            x: posX,
            y: posY,
        };
    }

    if (aguaValida && game.legalPos(posX, posY, numMap, false)) {
        return {
            x: posX,
            y: posY,
        };
    }

    return findNearestLegalPosition(numMap, posX, posY, aguaValida);
}

function hasMapCell(idMap: number, posX: number, posY: number): boolean {
    if (posX < 1 || posY < 1 || posX > 100 || posY > 100) {
        return false;
    }

    return Boolean(vars.mapData[idMap]?.[posY]?.[posX] && vars.mapa[idMap]?.[posY]?.[posX]);
}

function resolveTeleportPositionForUser(
    user: GameCharacter,
    numMap: number,
    posX: number,
    posY: number,
    source?: string,
): Position | undefined {
    const waterPos = resolveTeleportPosition(numMap, posX, posY, Boolean(user.navegando));

    if (!user.navegando || waterPos) {
        return waterPos;
    }

    const landPos = resolveTeleportPosition(numMap, posX, posY, false);

    if (!landPos) {
        return;
    }

    console.log(
        `[teleport] Disembarking ${user.nameCharacter} before teleporting to ${numMap}@${posX},${posY} (${source ?? "unknown source"})`,
    );

    dismountUser(user);

    return landPos;
}

function isSameEntityId(left: EntityId | undefined, right: EntityId | undefined): boolean {
    if (typeof left === "undefined" || typeof right === "undefined") {
        return false;
    }

    return String(left) === String(right);
}

function getCharacterById(idUser: EntityId | null | undefined): GameCharacter | undefined {
    return getRuntimeCharacterById<GameCharacter>(idUser);
}

function getClientById(idUser: EntityId | null | undefined): RuntimeClient | undefined {
    return getRuntimeClientById<RuntimeClient>(idUser);
}

const onlinePartyMemberIdsByPartyId = new Map<string, Set<string>>();
const onlineClanMemberIdsByClanId = new Map<string, Set<string>>();
const partyStateCacheByViewerId = new Map<string, Map<string, PartyRuntimeMember>>();
const clanStateCacheByViewerId = new Map<string, Map<string, ClanRuntimeMember>>();

function isOnlineRelationshipMember(user: GameCharacter | undefined): user is GameCharacter {
    return Boolean(user?.connected && !user?.cerrado && getClientById(user.id));
}

function getGroupIndex(index: Map<string, Set<string>>, groupId?: string | null): Set<string> | undefined {
    if (!groupId) {
        return;
    }

    return index.get(String(groupId));
}

function addMemberToIndex(index: Map<string, Set<string>>, groupId: string, memberId: EntityId): void {
    const groupKey = String(groupId);
    const memberKey = String(memberId);
    let members = index.get(groupKey);

    if (!members) {
        members = new Set();
        index.set(groupKey, members);
    }

    members.add(memberKey);
}

function removeMemberFromIndex(index: Map<string, Set<string>>, groupId: string, memberId: EntityId): void {
    const members = index.get(String(groupId));

    if (!members) {
        return;
    }

    members.delete(String(memberId));

    if (members.size === 0) {
        index.delete(String(groupId));
    }
}

function updateIndexedMembership(
    index: Map<string, Set<string>>,
    user: GameCharacter | undefined,
    previousGroupId?: string | null,
    nextGroupId?: string | null,
): void {
    if (!user) {
        return;
    }

    if (previousGroupId) {
        removeMemberFromIndex(index, previousGroupId, user.id);
    }

    if (nextGroupId && isOnlineRelationshipMember(user)) {
        addMemberToIndex(index, nextGroupId, user.id);
    }
}

function updatePartyIndexForUser(user: GameCharacter | undefined, previousPartyId?: string | null): void {
    updateIndexedMembership(onlinePartyMemberIdsByPartyId, user, previousPartyId, user?.partyId);
}

function updateClanIndexForUser(user: GameCharacter | undefined, previousClanId?: string | null): void {
    updateIndexedMembership(onlineClanMemberIdsByClanId, user, previousClanId, user?.clanId);
}

function clearRelationshipStateCache(idUser: EntityId): void {
    const viewerKey = String(idUser);
    partyStateCacheByViewerId.delete(viewerKey);
    clanStateCacheByViewerId.delete(viewerKey);
}

function getOnlineSessionById(
    idUser: EntityId | null | undefined,
): { user: GameCharacter; client: RuntimeClient } | undefined {
    return getRuntimeOnlineSessionById<GameCharacter, RuntimeClient>(idUser);
}

function loopAreaByUserId(idUser: EntityId, callback: (target: AreaTarget) => void): boolean {
    const client = getClientById(idUser);

    if (!client) {
        return false;
    }

    game.loopArea(client, callback);
    return true;
}

function withUserClient(idUser: EntityId | null | undefined, callback: (client: RuntimeClient) => void): boolean {
    const client = getClientById(idUser);

    if (!client) {
        return false;
    }

    callback(client);
    return true;
}

function syncCharacterColor(user: GameCharacter): void {
    user.faction = normalizeFaction(user.faction);
    user.color = getDefaultCharacterColor(user);

    loopAreaByUserId(user.id, (target: AreaTarget) => {
        if (target.isNpc) {
            return;
        }

        const targetClient = getClientById(target.id);

        if (targetClient) {
            handleProtocol.actColorName(user.id, String(user.color), targetClient);
        }
    });

    withUserClient(user.id, (userClient) => {
        handleProtocol.sendMyCharacter(user);
        socket.send(userClient);
    });
}

function isOccupiedByAnotherEntity(idMap: number, pos: Position, entityId: EntityId): boolean {
    const occupantId = vars.mapData[idMap]?.[pos.y]?.[pos.x]?.id ?? 0;

    return Boolean(occupantId) && !isSameEntityId(occupantId, entityId);
}

const normalizeExperienceFields = (user: Pick<GameCharacter, "level" | "exp" | "expNextLevel">): void => {
    if (user.level >= balance.MAX_EXP_LEVEL) {
        user.exp = 0;
        user.expNextLevel = 0;
        return;
    }

    user.exp = Math.max(0, Math.floor(user.exp));
    user.expNextLevel = Math.max(1, Math.floor(user.expNextLevel));
};

function isNewbieCharacter(user: Pick<GameCharacter, "level"> | undefined | null): boolean {
    return Number(user?.level ?? 0) <= NEWBIE_MAX_LEVEL;
}

function hasDragonSlayerSwordInInventory(user: Pick<GameCharacter, "inv" | "privileges"> | undefined | null): boolean {
    if (Number(user?.privileges ?? 0) === 1) {
        return false;
    }

    return Object.values(user?.inv ?? {}).some((item) => Number(item?.idItem ?? 0) === DRAGON_SLAYER_SWORD_ITEM_ID);
}

function getMapEntryDeniedMessage(
    user: Pick<GameCharacter, "level" | "privileges" | "inv"> | undefined | null,
    mapId: number,
): string {
    if (Number(user?.privileges ?? 0) === 1) {
        return "";
    }

    if (mapId === CLAN_RING_MAP_ID) {
        if (hasDragonSlayerSwordInInventory(user)) {
            return `No puedes entrar a la arena con una Espada Mata Dragones en el inventario.`;
        }
    }

    const minLevel = Math.max(0, Number(vars.mapData[mapId]?.minLevel ?? 0));
    const maxLevel = Math.max(0, Number(vars.mapData[mapId]?.maxLevel ?? 0));
    const mapName = String(vars.mapData[mapId]?.name ?? "").trim() || "este lugar";
    const userLevel = Number(user?.level ?? 0);
    const hasMinLevel = minLevel > 0;
    const hasMaxLevel = maxLevel > 0;
    const hasLevelRange = hasMinLevel && hasMaxLevel;

    if (hasMinLevel && userLevel < minLevel) {
        if (hasLevelRange) {
            return `Solo los personajes desde nivel ${minLevel} hasta nivel ${maxLevel} pueden entrar a ${mapName}`;
        }

        return `Solo los personajes desde nivel ${minLevel} pueden entrar a ${mapName}`;
    }

    if (hasMaxLevel && userLevel > maxLevel) {
        if (hasLevelRange) {
            return `Solo los personajes desde nivel ${minLevel} hasta nivel ${maxLevel} pueden entrar a ${mapName}`;
        }

        return `Solo los personajes hasta nivel ${maxLevel} pueden entrar a ${mapName}`;
    }

    return "";
}

const FACTION_PORTAL_RESTRICTIONS: Array<{
    mapId: number;
    x: number;
    y: number;
    faction: Exclude<CharacterFaction, "none">;
}> = [
    { mapId: 151, x: 18, y: 65, faction: "caos" },
    { mapId: 60, x: 79, y: 24, faction: "armada" },
];

function getFactionPortalDeniedMessage(
    user: Pick<GameCharacter, "faction" | "privileges"> | undefined | null,
    mapId: number,
    posX: number,
    posY: number,
): string {
    if (Number(user?.privileges ?? 0) === 1) {
        return "";
    }

    const restriction = FACTION_PORTAL_RESTRICTIONS.find(
        (entry) => entry.mapId === mapId && entry.x === posX && entry.y === posY,
    );

    if (!restriction) {
        return "";
    }

    const userFaction = normalizeFaction(user?.faction);

    if (userFaction === restriction.faction) {
        return "";
    }

    return restriction.faction === "caos"
        ? "Solo los miembros del Caos pueden usar este portal."
        : "Solo los miembros de la Armada pueden usar este portal.";
}

const MAP_LEVEL_FALLBACK_MAP_ID = 1;
const MAP_LEVEL_FALLBACK_POS_X = 54;
const MAP_LEVEL_FALLBACK_POS_Y = 59;

function relocateUserIfCurrentMapLevelDenied(user: GameCharacter, client: RuntimeClient, source: string): boolean {
    const deniedMessage = getMapEntryDeniedMessage(user, user.map);

    if (!deniedMessage) {
        return false;
    }

    handleProtocol.console(deniedMessage, "white", 1, 0, client);
    game.telep(client, MAP_LEVEL_FALLBACK_MAP_ID, MAP_LEVEL_FALLBACK_POS_X, MAP_LEVEL_FALLBACK_POS_Y, source);
    return true;
}

function unequipRestrictedNewbieItems(user: GameCharacter, client: RuntimeClient): void {
    if (isNewbieCharacter(user)) {
        return;
    }

    const removedSlots = new Set<string>();
    const previousWeaponItemId =
        user.idItemWeapon && user.inv[user.idItemWeapon] ? Number(user.inv[user.idItemWeapon].idItem) : 0;

    const unequipSlot = (slot: number | string | undefined) => {
        if (!slot || String(slot) === "0") {
            return undefined;
        }

        const normalizedSlot = String(slot);
        const inventoryItem = user.inv[normalizedSlot];

        if (!inventoryItem?.equipped) {
            return undefined;
        }

        const datObj = vars.datObj[inventoryItem.idItem] as DataObject | undefined;

        if (!datObj?.newbie) {
            return undefined;
        }

        inventoryItem.equipped = 0;
        return { slot: normalizedSlot };
    };

    const bodySlot = unequipSlot(user.idItemBody);
    if (bodySlot) {
        const bodyNaked = game.bodyNaked(user.id);
        if (user.navegando) {
            user.idLastBody = bodyNaked;
        } else {
            user.idBody = bodyNaked;
        }
        user.idItemBody = 0;
    }

    const weaponSlot = unequipSlot(user.idItemWeapon);
    if (weaponSlot) {
        if (user.navegando) {
            user.idLastWeapon = 0;
        } else {
            user.idWeapon = 0;
        }
        user.idItemWeapon = 0;
    }

    const arrowSlot = unequipSlot(user.idItemArrow);
    if (arrowSlot) {
        user.idItemArrow = 0;
    }

    const shieldSlot = unequipSlot(user.idItemShield);
    if (shieldSlot) {
        if (user.navegando) {
            user.idLastShield = 0;
        } else {
            user.idShield = 0;
        }
        user.idItemShield = 0;
    }

    const helmetSlot = unequipSlot(user.idItemHelmet);
    if (helmetSlot) {
        if (user.navegando) {
            user.idLastHelmet = 0;
        } else {
            user.idHelmet = 0;
        }
        user.idItemHelmet = 0;
    }

    const ringSlot = unequipSlot(user.idItemRing);
    if (ringSlot) {
        user.idItemRing = 0;
    }

    if (!user.navegando) {
        game.loopArea(client, function (target: AreaTarget) {
            if (!target.isNpc) {
                withUserClient(target.id, (targetClient) => {
                    if (!canReceiveCharacterEvent(target.id, user.id)) {
                        return;
                    }

                    if (bodySlot) {
                        handleProtocol.changeRopa(user.id, user.idBody, 0, targetClient);
                    }

                    if (weaponSlot) {
                        handleProtocol.changeWeapon(user.id, user.idWeapon, 0, targetClient);
                    }

                    if (arrowSlot) {
                        handleProtocol.changeArrow(user.id, 0, targetClient);
                    }

                    if (shieldSlot) {
                        handleProtocol.changeShield(user.id, user.idShield, 0, targetClient);
                    }

                    if (helmetSlot) {
                        handleProtocol.changeHelmet(user.id, user.idHelmet, 0, targetClient);
                    }
                });
            }
        });
    }

    for (const [slot, inventoryItem] of Object.entries(user.inv)) {
        const datObj = vars.datObj[inventoryItem.idItem] as DataObject | undefined;

        if (!datObj?.newbie) {
            continue;
        }

        removedSlots.add(slot);
        game.quitarUserInvItem(user.id, slot, inventoryItem.cant);
    }

    if (removedSlots.size === 0) {
        return;
    }

    handleProtocol.console(
        "Al llegar a nivel 13 dejaste de ser newbie, se eliminaron tus objetos newbie del inventario.",
        "white",
        1,
        0,
        client,
    );

    if (weaponSlot && fishing.isFishingRod(previousWeaponItemId)) {
        fishing.cancelFishing(user.id, "La pesca se canceló porque dejaste de ser newbie.");
    }

    if (weaponSlot && harvesting.usesHarvestingTool(previousWeaponItemId)) {
        harvesting.cancelHarvesting(user.id, "La recolección se canceló porque dejaste de ser newbie.");
    }

    void persistCharacterItems(user).catch((error) => {
        funct.dumpError(error);
    });
}

function getPartyRecord(partyId?: string | null): PartyRuntimeState | undefined {
    if (!partyId) {
        return;
    }

    return vars.parties?.[partyId] as PartyRuntimeState | undefined;
}

function arePartyAlignmentsCompatible(left: GameCharacter | undefined, right: GameCharacter | undefined): boolean {
    return Boolean(left?.criminal) === Boolean(right?.criminal);
}

function isSupportSpell(datSpell: Record<string, unknown> | undefined): boolean {
    return Boolean(
        datSpell &&
        (Number(datSpell.subeHp ?? 0) === 1 ||
            Number(datSpell.revivir ?? 0) === 1 ||
            datSpell.removerParalisis ||
            datSpell.invisibilidad ||
            datSpell.subeAg ||
            datSpell.subeFz),
    );
}

function isPartyCompatibleWithUser(party: PartyRuntimeState | undefined, user: GameCharacter | undefined): boolean {
    if (!party || !user) {
        return true;
    }

    return party.memberIds.every((memberId) => {
        const member = getCharacterById(memberId);
        return !member || arePartyAlignmentsCompatible(member, user);
    });
}

function normalizePartyMembership(user: GameCharacter | undefined): PartyRuntimeState | undefined {
    if (!user?.partyId) {
        if (user) {
            user.partyId = null;
            user.partyLeaderId = null;
        }

        return;
    }

    const party = getPartyRecord(user.partyId);

    if (!party || !party.memberIds.some((memberId) => isSameEntityId(memberId, user.id))) {
        user.partyId = null;
        user.partyLeaderId = null;
        return;
    }

    if (party.memberIds.length <= 1) {
        disbandParty(party.id);
        return;
    }

    if (!isPartyCompatibleWithUser(party, user)) {
        disbandParty(party.id);
        return;
    }

    user.partyLeaderId = party.leaderId;
    return party;
}

function clearPartyInvitation(user: GameCharacter | undefined): void {
    if (!user) {
        return;
    }

    user.partyInvitationFrom = null;
    user.partyInvitationExpiresAt = 0;
}

function arePartyMembersEqual(left: PartyRuntimeMember | undefined, right: PartyRuntimeMember): boolean {
    return Boolean(
        left &&
        isSameEntityId(left.id, right.id) &&
        left.nameCharacter === right.nameCharacter &&
        left.map === right.map &&
        left.pos.x === right.pos.x &&
        left.pos.y === right.pos.y &&
        left.online === right.online &&
        left.isLeader === right.isLeader,
    );
}

function areClanMembersEqual(left: ClanRuntimeMember | undefined, right: ClanRuntimeMember): boolean {
    return Boolean(
        left &&
        isSameEntityId(left.id, right.id) &&
        left.nameCharacter === right.nameCharacter &&
        left.map === right.map &&
        left.pos.x === right.pos.x &&
        left.pos.y === right.pos.y &&
        left.online === right.online,
    );
}

function buildPartyMemberState(member: GameCharacter, party: PartyRuntimeState): PartyRuntimeMember {
    return {
        id: member.id,
        nameCharacter: member.nameCharacter,
        map: member.map,
        pos: { ...member.pos },
        online: true,
        isLeader: isSameEntityId(member.id, party.leaderId),
    };
}

function buildClanMemberState(member: GameCharacter): ClanRuntimeMember {
    return {
        id: member.id,
        nameCharacter: member.nameCharacter,
        map: member.map,
        pos: { ...member.pos },
        online: true,
    };
}

function diffRelationshipState<T extends { id: EntityId }>(
    previousState: Map<string, T>,
    currentState: Map<string, T>,
    areEqual: (left: T | undefined, right: T) => boolean,
): { upsert: T[]; remove: EntityId[] } {
    const upsert: T[] = [];
    const remove: EntityId[] = [];

    currentState.forEach((member, memberKey) => {
        if (!areEqual(previousState.get(memberKey), member)) {
            upsert.push(member);
        }
    });

    previousState.forEach((member, memberKey) => {
        if (!currentState.has(memberKey)) {
            remove.push(member.id);
        }
    });

    return { upsert, remove };
}

function getOrCreatePartyStateCache(idUser: EntityId): Map<string, PartyRuntimeMember> {
    const viewerKey = String(idUser);
    let cache = partyStateCacheByViewerId.get(viewerKey);

    if (!cache) {
        cache = new Map();
        partyStateCacheByViewerId.set(viewerKey, cache);
    }

    return cache;
}

function getOrCreateClanStateCache(idUser: EntityId): Map<string, ClanRuntimeMember> {
    const viewerKey = String(idUser);
    let cache = clanStateCacheByViewerId.get(viewerKey);

    if (!cache) {
        cache = new Map();
        clanStateCacheByViewerId.set(viewerKey, cache);
    }

    return cache;
}

function buildCurrentPartyStateForViewer(idUser: EntityId): Map<string, PartyRuntimeMember> {
    const user = getCharacterById(idUser);
    const party = normalizePartyMembership(user);
    const nextState = new Map<string, PartyRuntimeMember>();

    if (!party) {
        return nextState;
    }

    for (const memberId of party.memberIds) {
        const member = getCharacterById(memberId);

        if (!isOnlineRelationshipMember(member)) {
            continue;
        }

        nextState.set(String(member.id), buildPartyMemberState(member, party));
    }

    return nextState;
}

function buildCurrentClanStateForViewer(idUser: EntityId): Map<string, ClanRuntimeMember> {
    const user = getCharacterById(idUser);
    const nextState = new Map<string, ClanRuntimeMember>();
    const memberIds = getGroupIndex(onlineClanMemberIdsByClanId, user?.clanId);

    if (!user?.clanId || !memberIds) {
        return nextState;
    }

    memberIds.forEach((memberId) => {
        const member = getCharacterById(memberId);

        if (!isOnlineRelationshipMember(member)) {
            return;
        }

        nextState.set(String(member.id), buildClanMemberState(member));
    });

    return nextState;
}

function sendPartyStateToUser(idUser: EntityId): void {
    const client = getClientById(idUser);

    if (!client) {
        return;
    }

    const cache = getOrCreatePartyStateCache(idUser);
    const nextState = buildCurrentPartyStateForViewer(idUser);
    const delta: PartyRuntimeStateDelta = diffRelationshipState(cache, nextState, arePartyMembersEqual);

    if (!delta.upsert.length && !delta.remove.length) {
        return;
    }

    partyStateCacheByViewerId.set(String(idUser), new Map(nextState));
    handleProtocol.partyState(delta, client);

    if (isDeadWorldActive(getCharacterById(idUser))) {
        syncVisibleCharactersForViewer(idUser);
    }
}

function sendClanStateToUser(idUser: EntityId): void {
    const client = getClientById(idUser);

    if (!client) {
        return;
    }

    const cache = getOrCreateClanStateCache(idUser);
    const nextState = buildCurrentClanStateForViewer(idUser);
    const delta: ClanRuntimeStateDelta = diffRelationshipState(cache, nextState, areClanMembersEqual);

    if (!delta.upsert.length && !delta.remove.length) {
        return;
    }

    clanStateCacheByViewerId.set(String(idUser), new Map(nextState));
    handleProtocol.clanState(delta, client);

    if (isDeadWorldActive(getCharacterById(idUser))) {
        syncVisibleCharactersForViewer(idUser);
    }
}

function syncPartyState(partyId?: string | null): void {
    const memberIds = getGroupIndex(onlinePartyMemberIdsByPartyId, partyId);

    if (!memberIds) {
        return;
    }

    memberIds.forEach((memberId) => {
        sendPartyStateToUser(memberId);
    });
}

function syncClanState(clanId?: string | null): void {
    const memberIds = getGroupIndex(onlineClanMemberIdsByClanId, clanId);

    if (!memberIds) {
        return;
    }

    memberIds.forEach((memberId) => {
        sendClanStateToUser(memberId);
    });
}

function disbandParty(partyId?: string | null): void {
    const party = getPartyRecord(partyId);

    if (!party) {
        return;
    }

    const memberIds = [...party.memberIds];
    delete vars.parties[party.id];

    memberIds.forEach((memberId) => {
        const member = getCharacterById(memberId);

        if (!member) {
            return;
        }

        member.partyId = null;
        member.partyLeaderId = null;
        updatePartyIndexForUser(member, party.id);
        sendPartyStateToUser(memberId);
    });
}

function isSameParty(leftId: EntityId, rightId: EntityId): boolean {
    if (isSameEntityId(leftId, rightId)) {
        return false;
    }

    const left = getCharacterById(leftId);
    const right = getCharacterById(rightId);

    const leftParty = normalizePartyMembership(left);
    const rightParty = normalizePartyMembership(right);

    return Boolean(leftParty && rightParty && leftParty.id === rightParty.id);
}

function isWithinServerArea(origin: Position, target: Position): boolean {
    return Math.abs(origin.x - target.x) <= AREA_RANGE_X && Math.abs(origin.y - target.y) <= AREA_RANGE_Y;
}

const NPC_HIT_EXP_RATIO = 0.3;

function scaleNpcExpReward(rawExp: number): number {
    let exp = Math.floor(rawExp * vars.multiplicadorExp);

    if (!exp) {
        return 0;
    }

    if (vars.dobleExp) {
        exp *= 2;
    }

    return exp;
}

function distribuirExpNpcEscalada(idUser: EntityId, npc: GameNpc, exp: number) {
    if (!exp) {
        return;
    }

    const recipients = getPartyRewardRecipients(idUser, npc);
    const eligibleRecipients = recipients.filter((recipient) => recipient.level < balance.MAX_EXP_LEVEL);

    if (!eligibleRecipients.length) {
        return;
    }

    const hasSharedPartyReward = eligibleRecipients.length > 1;
    let share = Math.floor(exp / Math.max(1, eligibleRecipients.length));

    if (hasSharedPartyReward) {
        share = Math.floor(share * (1 + Number(vars.partyExpBonusPct ?? 0) / 100));
    }

    if (!share) {
        return;
    }

    eligibleRecipients.forEach((recipient) => {
        recipient.exp += share;
        withUserClient(recipient.id, (recipientClient) => {
            handleProtocol.console("¡Has ganado " + share + " puntos de experiencia!", "red", 1, 0, recipientClient);
        });
        game.checkUserLevel(recipient.id);
    });
}

function getPartyRewardRecipients(idUser: EntityId, npc: GameNpc): GameCharacter[] {
    const user = getCharacterById(idUser);

    if (!user) {
        return [];
    }

    const party = normalizePartyMembership(user);

    if (!party) {
        return [user];
    }

    return party.memberIds
        .map((memberId) => getCharacterById(memberId))
        .filter((member): member is GameCharacter => {
            if (!member || member.dead || !member.connected || !getClientById(member.id)) {
                return false;
            }

            if (member.map !== npc.map) {
                return false;
            }

            return isWithinServerArea(npc.pos, member.pos);
        });
}

export type GameApi = {
    legalPos: (x: number, y: number, idMapa: number, aguaValida: boolean, ignoreOccupantId?: EntityId) => boolean;
    legalPosNpc: (x: number, y: number, idMapa: number, aguaValida: boolean, tierraInvalida?: boolean) => boolean;
    validInitialNpcSpawn: (
        pos: Position,
        map: number,
        aguaValida: boolean,
        movement: number,
        tierraInvalida?: boolean,
    ) => boolean;
    findDropPosition: (
        idMap: number,
        origin: Position,
        ignoreOccupantId?: EntityId,
        options?: DropPositionOptions,
    ) => Position | undefined;
    hayAgua: (idMap: number, pos: Position) => boolean;
    isBlocked: (idMap: number, pos: Position) => boolean;
    getName: (id: EntityId) => string | undefined;
    useItem: (ws: RuntimeClient, idPos: number | string) => Promise<void>;
    agarrarItem: (ws: RuntimeClient) => Promise<void>;
    putItemToInv: (idUser: EntityId, idItem: number, cant: number) => void;
    spawnDroppedFloorItem: (map: number, pos: Position, itemId: number, amount: number) => Promise<void>;
    restoreDroppedFloorItems: () => Promise<void>;
    placeDroppedFloorItem: (idMap: number, pos: Position, idItem: number, amount: number, dropId?: string) => void;
    renderDroppedFloorItem: (idMap: number, pos: Position, idItem: number) => void;
    cleanupDroppedFloorItems: (batchSize?: number) => Promise<number>;
    cleanupDroppedFloorItemsInMap: (idMap: number, batchSize?: number) => Promise<number>;
    tirarItem: (ws: RuntimeClient, idPos: number | string, cant: number) => Promise<void>;
    reorderInventoryItem: (idUser: EntityId, sourceSlot: number, targetSlot: number) => Promise<void>;
    existPjOrClose: (ws: RuntimeClient) => boolean;
    worldSave: (callback: RuntimeCallback<WorldSaveResult>) => Promise<void>;
    processAdminSummonedBotTick: (now: number) => void;
    respawnNpc: (map: number, aguaValida: boolean, tierraInvalida?: boolean) => RespawnPosition;
    validPosRespawn: (pos: Position, map: number, aguaValida: boolean) => boolean;
    validPosRespawnNpc: (pos: Position, map: number, aguaValida: boolean, tierraInvalida?: boolean) => boolean;
    isTelep: (posX: number, posY: number) => boolean;
    setNewAreas: (ws: RuntimeClient) => void;
    loopArea: (ws: RuntimeClient | undefined, callback: RuntimeCallback<AreaTarget>) => void;
    loopAreaPos: (idMap: number, pos: Position, callback: RuntimeCallback<GameCharacter>) => void;
    getFactionPortalDeniedMessage: (
        user: Pick<GameCharacter, "faction" | "privileges"> | undefined | null,
        mapId: number,
        posX: number,
        posY: number,
    ) => string;
    resolveTileExitDestination: (
        ws: RuntimeClient,
        tileExit: TileExitDefinition | undefined,
        source?: string,
        origin?: {
            mapId: number;
            x: number;
            y: number;
        },
    ) => TileExitDestination | undefined;
    telep: (ws: RuntimeClient, numMap: number, posX: number, posY: number, source?: string) => void;
    getFreeSpace: (
        ws: RuntimeClient,
        numMap: number,
        posX: number,
        posY: number,
        source?: string,
    ) => Position | undefined;
    puedePegar: (posX: number, posY: number) => boolean;
    bodyNaked: (idUser: EntityId) => number;
    putBodyAndHeadDead: (idUser: EntityId) => void;
    revivirUsuario: (
        idUser: EntityId,
        options?: {
            hp?: number;
            mana?: number;
        },
    ) => void;
    resetFuerzaAgilidadBuffs: (idUser: EntityId) => void;
    interruptPendingLogoutOnAttack: (idUser: EntityId, reason?: string) => void;
    getPvpMapChangeDeniedMessage: (
        user: Pick<GameCharacter, "pvpMapChangeBlockedUntil"> | undefined,
        now?: number,
    ) => string | null;
    setSpellInvisibility: (idUser: EntityId, enabled: boolean) => void;
    syncUserNpcVisibility: (idUser: EntityId) => void;
    inviteToParty: (idUser: EntityId, targetId: EntityId) => { ok: boolean; message: string };
    acceptPartyInvitation: (idUser: EntityId) => { ok: boolean; message: string };
    leaveParty: (idUser: EntityId) => { ok: boolean; message: string };
    kickPartyMember: (idUser: EntityId, targetId: EntityId) => { ok: boolean; message: string };
    clearPartyInvitation: (idUser: EntityId) => void;
    syncPartyStateForMember: (idUser: EntityId) => void;
    syncClanState: (clanId?: string | null) => void;
    syncClanStateForMember: (idUser: EntityId) => void;
    refreshRelationshipIndexesForMember: (
        idUser: EntityId,
        previousPartyId?: string | null,
        previousClanId?: string | null,
    ) => void;
    clearRelationshipStateCache: (idUser: EntityId) => void;
    setSummonTargetNpc: (idUser: EntityId, idNpc: EntityId) => void;
    clearSummonTargetNpc: (idUser: EntityId) => void;
    checkUserLevel: (idUser: EntityId) => void;
    isNewbieCharacter: (user: Pick<GameCharacter, "level"> | undefined | null) => boolean;
    quitarUserInvItem: (idUser: EntityId, idPos: number | string, cant: number) => void;
    userSpellNpc: (idUser: EntityId, idNpc: EntityId, idSpell: number) => number | SpellEffect;
    userSpellUser: (idUser: EntityId, idUserAttacked: EntityId, idSpell: number) => number | UserSpellEffect;
    calcularDmg: (idUser: EntityId) => number;
    userDmgNpc: (idUser: EntityId, idNpc: EntityId) => CombatResult;
    userDmgUser: (idUser: EntityId, idUserAttacked: EntityId) => CombatResult;
    apuNpc: (idUser: EntityId, idNpc: EntityId, dmg: number) => StabResult;
    apuUser: (idUser: EntityId, idUserAttacked: EntityId, dmg: number) => StabResult;
    getSkillTacticasCombate: (idUser: EntityId) => number;
    getSkillDefensa: (idUser: EntityId) => number;
    getSkillArmas: (idUser: EntityId) => number;
    getSkillProyectiles: (idUser: EntityId) => number;
    getSkillWrestling: (idUser: EntityId) => number;
    getSkillOcultarse: (idUser: EntityId) => number;
    getSkillApu: (idUser: EntityId) => number;
    puedeApu: (idUser: EntityId) => boolean;
    poderEvasion: (idUser: EntityId) => number;
    poderEvasionEscudo: (idUser: EntityId) => number;
    poderAtaqueArma: (idUser: EntityId) => number;
    hayObj: (idMap: number, pos: Position) => boolean;
    objMap: (idMap: number, pos: Position) => MapObjectInfo;
    tirarItemsUser: (idUser: EntityId) => Promise<void>;
    blockMap: (idMap: number, pos: Position, block: number | boolean) => void;
    changeObjIndex: (idMap: number, pos: Position, objIndex: number) => void;
    openDoor: (idUser: EntityId, pos: Position, objMap: MapObjectInfo, obj: DoorObject) => void;
    buyItem: (idUser: EntityId, idPos: number | string, cant: number) => Promise<void>;
    sellItem: (idUser: EntityId, idPos: number | string, cant: number) => Promise<void>;
    reorderBankItem: (idUser: EntityId, sourceSlot: number, targetSlot: number) => Promise<void>;
    openBankTrade: (idUser: EntityId, idNpc: EntityId, tab?: BankTab) => Promise<boolean>;
    changeBankTab: (idUser: EntityId, tab: BankTab) => Promise<boolean>;
    closeTradeSession: (idUser: EntityId) => void;
    depositBankGold: (idUser: EntityId, amount: number) => Promise<void>;
    withdrawBankGold: (idUser: EntityId, amount: number) => Promise<void>;
    persistCharacterPatch: (user: RuntimeCharacter, patch: Record<string, unknown>) => Promise<void>;
    persistCharacterSnapshot: (user: RuntimeCharacter, options?: CharacterSnapshotPersistOptions) => Promise<void>;
    persistCharacterItemsById: (idUser: EntityId) => Promise<void>;
    persistCharacterEconomyById: (idUser: EntityId) => Promise<void>;
    waitForCharacterPersistence: (characterId?: string) => Promise<void>;
    openMarketTrade: (idUser: EntityId, idNpc: EntityId) => Promise<boolean>;
    getMarketState: (
        idUser: EntityId,
        npcName?: string,
        browseOptions?: MarketBrowseOptions,
    ) => Promise<MarketUiState | null>;
    listMarketListings: (options?: { limit?: number }) => Promise<MarketListingSummary[]>;
    listCharacterMarketListings: (characterId: string) => Promise<MarketListingSummary[]>;
    getMarketClaims: (characterId: string) => Promise<MarketClaimSummary[]>;
    createMarketListing: (
        idUser: EntityId,
        slot: number,
        quantity: number,
        price: number,
        durationHours?: number,
    ) => Promise<MarketCommandResult & { listingId?: string }>;
    buyMarketListing: (
        idUser: EntityId,
        listingId: string,
        expected?: { itemId?: number; quantity?: number; price?: number },
    ) => Promise<MarketCommandResult>;
    cancelMarketListing: (idUser: EntityId, listingId: string) => Promise<MarketCommandResult>;
    claimMarket: (idUser: EntityId) => Promise<MarketCommandResult & { claims?: MarketClaimSummary[] }>;
    logCharacterActivity: (
        user: ActivityCharacter,
        payload: {
            category: "combat" | "economy" | "progression" | "session";
            action:
                | "character_death"
                | "npc_kill"
                | "bail_paid"
                | "buy_item"
                | "sell_item"
                | "bank_deposit"
                | "bank_withdraw"
                | "bank_reorder"
                | "shared_vault_open"
                | "shared_vault_access_denied"
                | "market_listing_create"
                | "market_listing_cancel"
                | "market_listing_buy"
                | "market_claim"
                | "learn_spell"
                | "character_connect"
                | "character_disconnect";
            itemId?: number | null;
            itemName?: string | null;
            spellId?: number | null;
            spellName?: string | null;
            amount?: number | null;
            goldDelta?: number;
            details?: Record<string, unknown>;
        },
    ) => void;
    reorderSpell: (idUser: EntityId, sourceSlot: number, targetSlot: number) => Promise<void>;
    accionMeditar: (idUser: EntityId) => void;
    meditar: (idUser: EntityId) => void;
    setHiddenSkill: (idUser: EntityId, enabled: boolean) => void;
    closeForce: (idUser: EntityId) => Promise<void>;
    calcularExp: (idUser: EntityId, idNpc: EntityId, dmg: number) => void;
    distribuirExpRestanteNpc: (idUser: EntityId, idNpc: EntityId) => void;
    distribuirOroNpc: (idUser: EntityId, idNpc: EntityId, totalGold: number) => void;
    markNpcAggressor: (idNpc: EntityId, idAttacker: EntityId) => void;
    forceDismount: (idUser: EntityId) => void;
    navegar: (idUser: EntityId, idBarco?: number) => void;
    deleteUserToAllNpcs: (idUser: EntityId) => void;
    hacerCriminal: (idUser: EntityId) => void;
    setCharacterFaction: (idUser: EntityId, faction: CharacterFaction) => void;
    clearCharacterFaction: (idUser: EntityId) => void;
    getFactionScore: (idUser: EntityId, faction: CharacterFaction) => number;
    addFactionScore: (idUser: EntityId, faction: CharacterFaction, amount: number) => number;
    getMaxEligibleFactionRank: (idUser: EntityId, faction: CharacterFaction) => number;
    claimFactionRewards: (idUser: EntityId) => { ok: boolean; message: string; rank: number; grantedItems: number[] };
    canUseFactionItem: (idUser: EntityId, idItem: number) => boolean;
    isRazaEnana: (idRaza: number) => boolean;
};

const game = {} as GameApi;

Game.call(game);
const AREA_RANGE_X = vars.areaVisionRangeX;
const AREA_RANGE_Y = vars.areaVisionRangeY;
const MAX_INVENTORY_SLOTS = 21;
const MAX_BANK_SLOTS = 100;
const NPC_TARGET_LOCK_MS = vars.npcAi.targetLockMs as number;
const characterPersistenceQueue = new Map<string, Promise<void>>();
const sharedVaultPersistenceQueue = new Map<string, Promise<void>>();
const sharedVaultSessions = new Map<string, SharedVaultSession>();
const CITIZEN_COLOR = "#3333ff";
const CRIMINAL_COLOR = "red";
const STAFF_COLOR = "#419900";
const MARKET_DEFAULT_LISTING_HOURS = 24;
const MARKET_MAX_LISTING_HOURS = 72;
const MARKET_PUBLICATION_FEE_BPS = 200;

function broadcastNpcSnapshot(npc: RuntimeNpc | undefined): void {
    if (!npc) {
        return;
    }

    game.loopAreaPos(npc.map, npc.pos, function (target: GameCharacter) {
        withUserClient(target.id, (targetClient) => {
            handleProtocol.sendNpc(npc);
            socket.send(targetClient);
        });
    });
}

function broadcastNpcVitalsDelta(npc: RuntimeNpc | undefined): void {
    if (!npc) {
        return;
    }

    game.loopAreaPos(npc.map, npc.pos, function (target: GameCharacter) {
        withUserClient(target.id, (targetClient) => {
            handleProtocol.entityVitalsDelta(npc.id, npc.hp, npc.maxHp, 0, 0, targetClient);
        });
    });
}

function broadcastCharacterSnapshot(user: GameCharacter | undefined): void {
    if (!user) {
        return;
    }

    game.loopAreaPos(user.map, user.pos, function (target: GameCharacter) {
        if (target.id === user.id) {
            return;
        }

        withUserClient(target.id, (targetClient) => {
            handleProtocol.sendCharacter(user as any, target.id);
            socket.send(targetClient);
        });
    });
}

function isAdminSummonedBot(user: Pick<GameCharacter, "adminSummonedBot"> | undefined): boolean {
    return Boolean(user?.adminSummonedBot);
}

function broadcastCharacterVitalsDelta(user: GameCharacter | undefined): void {
    if (!user) {
        return;
    }

    game.loopAreaPos(user.map, user.pos, function (target: GameCharacter) {
        if (target.id === user.id) {
            return;
        }

        withUserClient(target.id, (targetClient) => {
            if (!canReceiveCharacterEvent(target.id, user.id)) {
                return;
            }

            handleProtocol.entityVitalsDelta(
                user.id,
                Number(user.hp ?? 0),
                Number(user.maxHp ?? 0),
                Number(user.mana ?? 0),
                Number(user.maxMana ?? 0),
                targetClient,
            );
        });
    });
}

function findFirstHealthPotionSlot(user: GameCharacter): string | null {
    for (const [slot, item] of Object.entries(user.inv)) {
        const obj = vars.datObj[item.idItem];

        if (
            obj?.objType === vars.objType.pociones &&
            obj.tipoPocion === vars.typePociones.vida &&
            Number(item.cant ?? 0) > 0
        ) {
            return slot;
        }
    }

    return null;
}

type SharedVaultScope = "account" | "clan";

type SharedVaultSession = {
    key: string;
    scope: SharedVaultScope;
    ownerId: string;
    holderCharacterId: EntityId;
    holderCharacterName: string;
    items: InventoryRecord;
    gold: number;
};

type MarketListingSummary = {
    id: string;
    sellerCharacterId: string;
    sellerName: string;
    buyerCharacterId: string | null;
    buyerName: string | null;
    itemId: number;
    quantity: number;
    price: number;
    publicationFee: number;
    status: "active" | "sold" | "expired" | "cancelled";
    expiresAt: string;
    soldAt: string | null;
    createdAt: string;
};

type MarketClaimSummary = {
    id: string;
    ownerCharacterId: string;
    claimType: "gold" | "item";
    goldAmount: number;
    itemId: number | null;
    itemQuantity: number | null;
    sourceListingId: string | null;
    createdAt: string;
};

type MarketCommandResult = {
    ok: boolean;
    message: string;
};

type MarketUiListing = {
    id: string;
    itemId: number;
    sellerName: string;
    itemName: string;
    itemGrhIndex: number;
    quantity: number;
    price: number;
    status: "active" | "sold" | "expired" | "cancelled";
    expiresAt: string;
    createdAt: string;
};

type MarketUiListingGroup = {
    itemId: number;
    itemName: string;
    itemGrhIndex: number;
    totalListings: number;
    totalQuantity: number;
    minUnitPrice: number;
    listings: MarketUiListing[];
};

type MarketUiClaim = {
    id: string;
    claimType: "gold" | "item";
    goldAmount: number;
    itemName: string | null;
    itemGrhIndex: number | null;
    itemQuantity: number | null;
    createdAt: string;
};

type MarketBrowseOptions = {
    listingLimit?: number;
    search?: string;
    objType?: number | null;
    sortPrice?: "recent" | "asc" | "desc";
};

type MarketUiState = {
    npcName: string;
    publicationFeeBps: number;
    defaultDurationHours: number;
    maxDurationHours: number;
    hasMoreListings: boolean;
    listingGroups: MarketUiListingGroup[];
    myListings: MarketUiListing[];
    claims: MarketUiClaim[];
};

function normalizeFaction(value: unknown): CharacterFaction {
    return value === "armada" || value === "caos" ? value : "none";
}

function getScoreFieldName(faction: CharacterFaction): "factionScoreArmada" | "factionScoreCaos" | null {
    if (faction === "armada") {
        return "factionScoreArmada";
    }

    if (faction === "caos") {
        return "factionScoreCaos";
    }

    return null;
}

function getRankFieldName(faction: CharacterFaction): "factionRankArmada" | "factionRankCaos" | null {
    if (faction === "armada") {
        return "factionRankArmada";
    }

    if (faction === "caos") {
        return "factionRankCaos";
    }

    return null;
}

function getRewardsFieldName(faction: CharacterFaction): "factionRewardsArmada" | "factionRewardsCaos" | null {
    if (faction === "armada") {
        return "factionRewardsArmada";
    }

    if (faction === "caos") {
        return "factionRewardsCaos";
    }

    return null;
}

function getDefaultCharacterColor(user: Pick<GameCharacter, "privileges" | "criminal" | "faction">): string {
    if (user.privileges === 1 || user.privileges === 2) {
        return STAFF_COLOR;
    }

    const factionColor = getFactionColor(normalizeFaction(user.faction));

    if (factionColor) {
        return factionColor;
    }

    return user.criminal ? CRIMINAL_COLOR : CITIZEN_COLOR;
}

function getFactionScoreValue(user: GameCharacter, faction: CharacterFaction): number {
    const fieldName = getScoreFieldName(faction);
    return fieldName ? Number(user[fieldName] ?? 0) : 0;
}

function setFactionScoreValue(user: GameCharacter, faction: CharacterFaction, score: number): void {
    const fieldName = getScoreFieldName(faction);

    if (!fieldName) {
        return;
    }

    user[fieldName] = Math.max(0, Math.floor(score));
}

function setFactionRankValue(user: GameCharacter, faction: CharacterFaction, rank: number): void {
    const fieldName = getRankFieldName(faction);

    if (!fieldName) {
        return;
    }

    user[fieldName] = Math.max(0, Math.floor(rank));
}

function getFactionRewardsValue(user: GameCharacter, faction: CharacterFaction): number {
    const fieldName = getRewardsFieldName(faction);
    return fieldName ? Number(user[fieldName] ?? 0) : 0;
}

function queueCharacterPersistence(characterId: string, operation: () => Promise<void>): Promise<void> {
    const previous = characterPersistenceQueue.get(characterId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    const tracked = next.finally(() => {
        if (characterPersistenceQueue.get(characterId) === tracked) {
            characterPersistenceQueue.delete(characterId);
        }
    });

    characterPersistenceQueue.set(characterId, tracked);
    return tracked;
}

function queueSharedVaultPersistence(vaultKey: string, operation: () => Promise<void>): Promise<void> {
    const previous = sharedVaultPersistenceQueue.get(vaultKey) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    const tracked = next.finally(() => {
        if (sharedVaultPersistenceQueue.get(vaultKey) === tracked) {
            sharedVaultPersistenceQueue.delete(vaultKey);
        }
    });

    sharedVaultPersistenceQueue.set(vaultKey, tracked);
    return tracked;
}

function cloneInventoryRecord(record: InventoryRecord | undefined): InventoryRecord {
    if (!record) {
        return {};
    }

    return Object.fromEntries(Object.entries(record).map(([slot, item]) => [slot, { ...item }]));
}

function replaceInventoryRecord(target: InventoryRecord, next: InventoryRecord): void {
    for (const key of Object.keys(target)) {
        delete target[key];
    }

    for (const [key, value] of Object.entries(next)) {
        target[key] = { ...value };
    }
}

function removeItemFromInventoryRecord(record: InventoryRecord, idPos: number | string, cant: number): void {
    const normalizedPos = String(idPos);
    const item = record[normalizedPos];

    if (!item) {
        return;
    }

    item.cant -= cant;

    if (item.cant <= 0) {
        item.equipped = 0;
        delete record[normalizedPos];
    }
}

function getSharedVaultKey(scope: SharedVaultScope, ownerId: string): string {
    return `${scope}:${ownerId}`;
}

function getSharedVaultTabScope(tab: BankTab): SharedVaultScope | null {
    if (tab === "account") {
        return "account";
    }

    if (tab === "clan") {
        return "clan";
    }

    return null;
}

function getBankTabOwnerId(user: GameCharacter, tab: BankTab): string | null {
    if (tab === "account") {
        return typeof user.idAccount === "string" ? user.idAccount : null;
    }

    if (tab === "clan") {
        return typeof user.clanId === "string" ? user.clanId : null;
    }

    return user._id ?? null;
}

function getCurrentSharedVaultSession(user: GameCharacter): SharedVaultSession | null {
    const scope = getSharedVaultTabScope(user.tradeBankTab ?? "character");
    const ownerId = getBankTabOwnerId(user, user.tradeBankTab ?? "character");

    if (!scope || !ownerId) {
        return null;
    }

    const session = sharedVaultSessions.get(getSharedVaultKey(scope, ownerId));
    return session?.holderCharacterId === user.id ? session : null;
}

function markNpcAggressor(idNpc: EntityId, idUser: EntityId) {
    const npc = vars.npcs[idNpc] as
        | {
              lastAggressorId?: EntityId;
              lastAggressedAt?: number;
              currentTargetId?: EntityId;
              currentTargetLockedUntil?: number;
          }
        | undefined;
    const attackerNpc = vars.npcs[idUser] as
        | {
              summonedByUserId?: EntityId;
          }
        | undefined;
    const attackerIsSummon = Boolean(attackerNpc?.summonedByUserId);

    if (!npc) {
        return;
    }

    const now = Date.now();

    if (
        !attackerIsSummon &&
        npc.lastAggressorId &&
        npc.lastAggressorId !== idUser &&
        now - (npc.lastAggressedAt ?? 0) <= (vars.npcAi.lastAggressorMemoryMs as number)
    ) {
        return;
    }

    npc.lastAggressorId = idUser;
    npc.lastAggressedAt = now;
    npc.currentTargetId = idUser;
    npc.currentTargetLockedUntil = now + NPC_TARGET_LOCK_MS;
}

function serializeInventory(record: InventoryRecord): SerializedInventoryItem[] {
    return Object.entries(record).map(([idPos, item]) => ({
        idPos,
        idItem: item.idItem,
        cant: item.cant,
        equipped: item.equipped ? 1 : 0,
    }));
}

function serializeBank(record: InventoryRecord): SerializedBankItem[] {
    return Object.entries(record).map(([idPos, item]) => ({
        idPos,
        idItem: item.idItem,
        cant: item.cant,
    }));
}

function hydrateBankRecord(items: Array<{ idPos: number | string; idItem: number; cant: number }>): InventoryRecord {
    return items.reduce<InventoryRecord>((record, item) => {
        record[String(item.idPos)] = {
            idItem: item.idItem,
            cant: item.cant,
            equipped: 0,
        };
        return record;
    }, {});
}

async function fetchSharedVaultState(
    scope: SharedVaultScope,
    ownerId: string,
): Promise<{
    gold: number;
    items: InventoryRecord;
}> {
    const path =
        scope === "account"
            ? `/internal/vaults/account/${encodeURIComponent(ownerId)}`
            : `/internal/vaults/clan/${encodeURIComponent(ownerId)}`;
    const result = (await funct.fetchUrl(path, {
        method: "GET",
        headers: {
            Authorization: vars.tokenAuth,
        },
    })) as {
        gold: number;
        items: Array<{ idPos: number | string; idItem: number; cant: number }>;
    };

    return {
        gold: balance.clampGold(Number(result.gold ?? 0)),
        items: hydrateBankRecord(result.items ?? []),
    };
}

async function persistSharedVaultAndCharacterState(
    user: GameCharacter,
    session: SharedVaultSession,
    options: {
        characterItems?: boolean;
        characterGold?: boolean;
        vaultItems?: boolean;
        vaultGold?: boolean;
    },
): Promise<void> {
    if (!user._id) {
        return;
    }

    const path =
        session.scope === "account"
            ? `/internal/vaults/account/${encodeURIComponent(session.ownerId)}`
            : `/internal/vaults/clan/${encodeURIComponent(session.ownerId)}`;

    // Capture the exact paired state now, not when a queued callback eventually runs.
    const operationId = randomUUID();
    const payload = (() => {
        const body: Record<string, unknown> = {
            operationId,
            characterId: user._id,
        };

        if (options.characterItems) {
            body.characterItems = serializeInventory(user.inv);
        }

        if (options.characterGold) {
            body.characterGold = balance.clampGold(user.gold);
        }

        if (options.vaultItems) {
            body.items = serializeBank(session.items);
        }

        if (options.vaultGold) {
            body.gold = balance.clampGold(session.gold);
        }

        return JSON.stringify({ ...body, operationId: randomUUID() });
    })();
    await queueSharedVaultPersistence(session.key, async () => {
        await queueCharacterPersistence(user._id!, () => vaultRecovery.persist({ operationId, endpoint: path, payload }));
    });
}

function applyTradeBankState(user: GameCharacter, tab: BankTab, bank: InventoryRecord, gold: number): void {
    user.tradeMode = "bank";
    user.tradeBankTab = tab;
    user.tradeBankItems = bank;
    user.tradeBankGold = balance.clampGold(gold);
    user.tradeHasClanVault = Boolean(user.clanId);
    user.tradeClanName = user.clanName ?? null;
}

function clearTradeBankState(user: GameCharacter): void {
    user.tradeMode = undefined;
    user.tradeBankTab = undefined;
    user.tradeBankItems = undefined;
    user.tradeBankGold = undefined;
    user.tradeHasClanVault = undefined;
    user.tradeClanName = undefined;
    user.npcTrade = 0;
}

function isSharedBankTab(tab: BankTab | undefined): tab is "account" | "clan" {
    return tab === "account" || tab === "clan";
}

function getActiveBankRecord(user: GameCharacter): InventoryRecord {
    return user.tradeBankItems ?? user.bank;
}

function syncActiveBankGold(user: GameCharacter): void {
    const session = getCurrentSharedVaultSession(user);
    user.tradeBankGold = session ? balance.clampGold(session.gold) : 0;
}

function buildBankActivityDetails(
    user: GameCharacter,
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    const tab = user.tradeBankTab ?? "character";
    const details: Record<string, unknown> = {
        bankTab: tab,
        ...overrides,
    };

    if (tab === "account") {
        details.vaultScope = "account";
        details.vaultOwnerId = user.idAccount ?? null;
    }

    if (tab === "clan") {
        details.vaultScope = "clan";
        details.vaultOwnerId = user.clanId ?? null;
        details.vaultClanName = user.clanName ?? user.clan ?? null;
    }

    return details;
}

function releaseSharedVaultSessionForUser(user: GameCharacter): void {
    const session = getCurrentSharedVaultSession(user);

    if (session) {
        sharedVaultSessions.delete(session.key);
    }
}

async function acquireSharedVaultSession(
    user: GameCharacter,
    tab: Extract<BankTab, "account" | "clan">,
): Promise<{ ok: true; session: SharedVaultSession } | { ok: false; message: string }> {
    const scope = getSharedVaultTabScope(tab);
    const ownerId = getBankTabOwnerId(user, tab);

    if (!scope || !ownerId) {
        return {
            ok: false,
            message: tab === "clan" ? "No perteneces a ningun clan." : "No se pudo identificar la cuenta compartida.",
        };
    }

    const key = getSharedVaultKey(scope, ownerId);
    const existing = sharedVaultSessions.get(key);

    if (existing && existing.holderCharacterId !== user.id) {
        logCharacterActivity(user, {
            category: "economy",
            action: "shared_vault_access_denied",
            details: buildBankActivityDetails(user, {
                requestedTab: tab,
                requestedScope: scope,
                requestedOwnerId: ownerId,
                holderCharacterId: existing.holderCharacterId,
                holderCharacterName: existing.holderCharacterName,
            }),
        });
        return {
            ok: false,
            message:
                scope === "clan"
                    ? `La boveda del clan la esta usando ${existing.holderCharacterName}. Debes esperar a que la cierre.`
                    : `La boveda compartida la esta usando ${existing.holderCharacterName}. Debes esperar a que la cierre.`,
        };
    }

    if (existing) {
        return { ok: true, session: existing };
    }

    const state = await fetchSharedVaultState(scope, ownerId);
    const session: SharedVaultSession = {
        key,
        scope,
        ownerId,
        holderCharacterId: user.id,
        holderCharacterName: user.nameCharacter,
        items: state.items,
        gold: state.gold,
    };
    const claimed = claimLoadedVault(sharedVaultSessions, key, session);
    if (claimed.holderCharacterId !== user.id) {
        return {
            ok: false,
            message: `The vault is being used by ${claimed.holderCharacterName}. Wait until they close it.`,
        };
    }
    return { ok: true, session: claimed };
}

async function setBankTabForUser(
    user: GameCharacter,
    tab: BankTab,
): Promise<{ ok: true; bank: InventoryRecord; gold: number } | { ok: false; message: string }> {
    if (tab === "character") {
        releaseSharedVaultSessionForUser(user);
        return { ok: true, bank: user.bank, gold: 0 };
    }

    const acquired = await acquireSharedVaultSession(user, tab);

    if (!acquired.ok) {
        return acquired;
    }

    const previousSession = getCurrentSharedVaultSession(user);

    if (previousSession && previousSession.key !== acquired.session.key) {
        sharedVaultSessions.delete(previousSession.key);
    }

    return {
        ok: true,
        bank: acquired.session.items,
        gold: acquired.session.gold,
    };
}

function serializeSpells(record: SpellRecord): SerializedSpellSlot[] {
    return Object.entries(record).map(([idPos, spell]) => ({
        idPos,
        idSpell: spell.idSpell,
    }));
}

function normalizeSpellRecord(spells: SpellRecord | SerializedSpellSlot[] | undefined): SpellRecord {
    if (!spells) {
        return {};
    }

    if (Array.isArray(spells)) {
        return spells.reduce<SpellRecord>((record, spell, index) => {
            const idPos = typeof spell?.idPos !== "undefined" ? String(spell.idPos) : String(index + 1);

            record[idPos] = {
                idSpell: spell.idSpell,
            };

            return record;
        }, {});
    }

    return spells;
}

async function persistCharacterStorage(user: GameCharacter): Promise<void> {
    await persistCharacterStoragePatch(user, { items: true, bankItems: true });
}

async function persistCharacterItems(user: GameCharacter): Promise<void> {
    await persistCharacterStoragePatch(user, { items: true });
}

async function persistCharacterGold(user: GameCharacter): Promise<void> {
    await persistCharacterStoragePatch(user, { gold: true });
}

async function persistCharacterEconomyState(user: GameCharacter): Promise<void> {
    await persistCharacterStoragePatch(user, { gold: true, items: true });
}

async function persistCharacterStoragePatch(
    user: GameCharacter,
    options: {
        gold?: boolean;
        items?: boolean;
        bankItems?: boolean;
    },
): Promise<void> {
    if (!user._id || user.pvpChar) {
        return;
    }

    const payload = (() => {
        const body: Record<string, unknown> = {};

        if (options.gold) {
            body.gold = balance.clampGold(user.gold);
        }

        if (options.items) {
            body.items = serializeInventory(user.inv);
        }

        if (options.bankItems) {
            body.bankItems = serializeBank(user.bank ?? {});
        }

        if (Object.keys(body).length === 0) {
            return null;
        }
        return JSON.stringify({ ...body, operationId: randomUUID() });
    })();
    if (payload === null) return;
    await queueCharacterPersistence(user._id, async () => {
        await characterRecovery.persist({ operationId: JSON.parse(payload).operationId, endpoint: `/character_save/${user._id}`, payload });
    });
}

function buildCharacterSnapshotPayload(
    user: GameCharacter,
    options?: CharacterSnapshotPersistOptions,
): Record<string, unknown> {
    normalizeExperienceFields(user);
    user.gold = balance.clampGold(user.gold);
    user.posX = user.pos.x;
    user.posY = user.pos.y;
    user.spells = normalizeSpellRecord(user.spells);

    const persistedAttrFuerza = user.cooldownFuerza > 0 ? user.bkAttrFuerza : user.attrFuerza;
    const persistedAttrAgilidad = user.cooldownAgilidad > 0 ? user.bkAttrAgilidad : user.attrAgilidad;
    const persistedMap = mapInstanceManager.isInstanceMap(user.map)
        ? (mapInstanceManager.getBaseMapId(user.map) ?? user.map)
        : user.map;
    const {
        connected,
        inv,
        bank,
        pendingMoveTimerId,
        deadWorldActive,
        deadWorldTransitionEndsAt,
        deadWorldTimeoutId,
        pendingReviveCast,
        ...persistableCharacter
    } = user;

    void connected;
    void inv;
    void bank;
    void pendingMoveTimerId;
    void deadWorldActive;
    void deadWorldTransitionEndsAt;
    void deadWorldTimeoutId;
    void pendingReviveCast;

    return {
        ...persistableCharacter,
        map: persistedMap,
        ...(Object.prototype.hasOwnProperty.call(options ?? {}, "connected") ? { connected: options?.connected } : {}),
        attrFuerza: persistedAttrFuerza,
        attrAgilidad: persistedAttrAgilidad,
        spells: serializeSpells(user.spells),
        items: serializeInventory(user.inv),
        bankItems: serializeBank(user.bank ?? {}),
        updatedAt: new Date(),
    };
}

async function persistCharacterSnapshot(
    user: RuntimeCharacter,
    options?: CharacterSnapshotPersistOptions,
): Promise<void> {
    const runtimeUser = user as GameCharacter;

    if (!runtimeUser._id || runtimeUser.pvpChar) {
        return;
    }

    const snapshotKey = options?.connected === false ? 'snapshot:disconnect' : options?.connected === true ? 'snapshot:connected' : 'snapshot:default';
    await bankOperations.runAfter(runtimeUser.id, snapshotKey, async () => {
      await queueCharacterPersistence(runtimeUser._id!, async () => {
        try {
          for (;;) {
            // Include queued rewards before capture, and resave rewards arriving during the write.
            // Otherwise a disconnect could remove the character immediately after crediting memory.
            bankOperations.flushSettledActions(runtimeUser.id);
            const operationId = randomUUID();
            await characterRecovery.persist({ operationId, endpoint: `/character_save/${runtimeUser._id}`,
                payload: JSON.stringify({ ...buildCharacterSnapshotPayload(runtimeUser, runtimeUser.cerrado ? { connected: false } : options), operationId }),
            });
            if (!bankOperations.hasSettledActions(runtimeUser.id)) break;
          }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            // Development seeding can delete/recreate a character while an old
            // runtime session is still finishing its disconnect path.
            if (message === "Character not found") {
                return;
            }

            throw error;
        }
      });
    });
}

async function waitForCharacterPersistence(characterId?: string): Promise<void> {
    if (!characterId) {
        return;
    }

    const pendingPersistence = characterPersistenceQueue.get(characterId);

    if (!pendingPersistence) {
        return;
    }

    await pendingPersistence;
}

async function fetchMarketListings(options?: {
    limit?: number;
    sellerCharacterId?: string;
    includeInactive?: boolean;
    sortPrice?: "recent" | "asc" | "desc";
}) {
    const params = new URLSearchParams();

    if (options?.limit) {
        params.set("limit", String(options.limit));
    }

    if (options?.sellerCharacterId) {
        params.set("sellerCharacterId", options.sellerCharacterId);
    }

    if (options?.includeInactive) {
        params.set("includeInactive", "true");
    }

    if (options?.sortPrice) {
        params.set("sortPrice", options.sortPrice);
    }

    const query = params.toString();
    const result = (await funct.fetchUrl(`/internal/market/listings${query ? `?${query}` : ""}`, {
        headers: {
            Authorization: vars.tokenAuth,
        },
    })) as { listings?: MarketListingSummary[] };

    return result.listings ?? [];
}

async function fetchMarketClaims(characterId: string) {
    const result = (await funct.fetchUrl(`/internal/market/claims/${encodeURIComponent(characterId)}`, {
        headers: {
            Authorization: vars.tokenAuth,
        },
    })) as { claims?: MarketClaimSummary[] };

    return result.claims ?? [];
}

function toMarketUiListing(listing: MarketListingSummary): MarketUiListing {
    const objectData = vars.datObj[listing.itemId] as DataObject | undefined;

    return {
        id: listing.id,
        itemId: listing.itemId,
        sellerName: listing.sellerName,
        itemName: objectData?.name ?? `Item ${listing.itemId}`,
        itemGrhIndex: Number(objectData?.grhIndex ?? 0),
        quantity: listing.quantity,
        price: listing.price,
        status: listing.status,
        expiresAt: listing.expiresAt,
        createdAt: listing.createdAt,
    };
}

function getMarketListingUnitPrice(listing: Pick<MarketListingSummary, "price" | "quantity">): number {
    if (listing.quantity <= 0) {
        return listing.price;
    }

    return listing.price / listing.quantity;
}

function compareMarketListings(left: MarketListingSummary, right: MarketListingSummary): number {
    const unitPriceDiff = getMarketListingUnitPrice(left) - getMarketListingUnitPrice(right);

    if (unitPriceDiff !== 0) {
        return unitPriceDiff;
    }

    const createdAtDiff = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();

    if (createdAtDiff !== 0) {
        return createdAtDiff;
    }

    return left.id.localeCompare(right.id);
}

function compareMarketListingGroups(
    left: MarketUiListingGroup,
    right: MarketUiListingGroup,
    sortPrice: MarketBrowseOptions["sortPrice"],
): number {
    if (sortPrice === "asc") {
        const unitPriceDiff = left.minUnitPrice - right.minUnitPrice;

        if (unitPriceDiff !== 0) {
            return unitPriceDiff;
        }
    }

    if (sortPrice === "desc") {
        const unitPriceDiff = right.minUnitPrice - left.minUnitPrice;

        if (unitPriceDiff !== 0) {
            return unitPriceDiff;
        }
    }

    const leftCreatedAt = left.listings[0]?.createdAt ?? "";
    const rightCreatedAt = right.listings[0]?.createdAt ?? "";
    const createdAtDiff = new Date(rightCreatedAt).getTime() - new Date(leftCreatedAt).getTime();

    if (createdAtDiff !== 0) {
        return createdAtDiff;
    }

    return left.itemName.localeCompare(right.itemName);
}

function groupMarketListings(
    listings: MarketListingSummary[],
    browseOptions: MarketBrowseOptions,
): MarketUiListingGroup[] {
    const groupedListings = new Map<number, MarketListingSummary[]>();

    for (const listing of listings) {
        const currentListings = groupedListings.get(listing.itemId);

        if (currentListings) {
            currentListings.push(listing);
            continue;
        }

        groupedListings.set(listing.itemId, [listing]);
    }

    const groups: MarketUiListingGroup[] = [];

    for (const [itemId, itemListings] of groupedListings.entries()) {
        const sortedListings = itemListings.slice().sort(compareMarketListings);
        const firstListing = sortedListings[0];

        if (!firstListing) {
            continue;
        }

        const objectData = vars.datObj[itemId] as DataObject | undefined;
        groups.push({
            itemId,
            itemName: objectData?.name ?? `Item ${itemId}`,
            itemGrhIndex: Number(objectData?.grhIndex ?? 0),
            totalListings: sortedListings.length,
            totalQuantity: sortedListings.reduce((total, listing) => total + listing.quantity, 0),
            minUnitPrice: getMarketListingUnitPrice(firstListing),
            listings: sortedListings.map(toMarketUiListing),
        });
    }

    return groups.sort((left, right) => compareMarketListingGroups(left, right, browseOptions.sortPrice));
}

function toMarketUiClaim(claim: MarketClaimSummary, listingFallback?: MarketListingSummary): MarketUiClaim {
    const resolvedItemId = claim.itemId ?? listingFallback?.itemId ?? null;
    const resolvedItemQuantity = claim.itemQuantity ?? listingFallback?.quantity ?? null;
    const objectData = resolvedItemId
        ? ((vars.datObj[resolvedItemId] as DataObject | undefined) ?? undefined)
        : undefined;

    return {
        id: claim.id,
        claimType: claim.claimType,
        goldAmount: claim.goldAmount,
        itemName: objectData?.name ?? null,
        itemGrhIndex: objectData ? Number(objectData.grhIndex ?? 0) : null,
        itemQuantity: resolvedItemQuantity,
        createdAt: claim.createdAt,
    };
}

function filterMarketListing(listing: MarketListingSummary, browseOptions: MarketBrowseOptions): boolean {
    const objectData = vars.datObj[listing.itemId] as DataObject | undefined;
    const rawSearch = browseOptions.search?.trim().toLowerCase() ?? "";
    const normalizedSearch = rawSearch.length >= 4 ? rawSearch : "";

    if (typeof browseOptions.objType === "number" && objectData?.objType !== browseOptions.objType) {
        return false;
    }

    if (!normalizedSearch) {
        return true;
    }

    const itemName = objectData?.name?.toLowerCase() ?? "";
    return itemMatchesSearch(objectData?.name ?? itemName, normalizedSearch);
}

async function removePersistedFloorItem(dropId: string): Promise<void> {
    for (;;) {
        try {
            const result = await funct.fetchUrl(`/internal/floor-items/${dropId}`, {method:"DELETE",headers:{Authorization:vars.tokenAuth}});
            if (result?.ok !== true) throw new Error('Missing ground cleanup acknowledgement');
            return;
        } catch {
            console.warn('[Security] Ground cleanup unresolved; retaining tile reservation and retrying.');
            await new Promise<void>(resolve => setTimeout(resolve,5000));
        }
    }
}

async function persistCharacterPatch(user: RuntimeCharacter, patch: Record<string, unknown>): Promise<void> {
    if (!user._id || user.pvpChar) return;
    const operationId = randomUUID();
    const payload = JSON.stringify({ ...patch, operationId });
    await queueCharacterPersistence(user._id, () => characterRecovery.persist({ operationId, endpoint: `/character_save/${user._id}`, payload }));
}

async function persistCharacterSpells(user: GameCharacter): Promise<void> {
    if (!user._id || user.pvpChar) {
        return;
    }

    await persistCharacterPatch(user, { spells: serializeSpells(user.spells) });
}

function logCharacterActivity(
    user: ActivityCharacter,
    payload: {
        category: "combat" | "economy" | "progression" | "session";
        action:
            | "character_death"
            | "npc_kill"
            | "bail_paid"
            | "buy_item"
            | "sell_item"
            | "bank_deposit"
            | "bank_withdraw"
            | "bank_reorder"
            | "shared_vault_open"
            | "shared_vault_access_denied"
            | "market_listing_create"
            | "market_listing_cancel"
            | "market_listing_buy"
            | "market_claim"
            | "learn_spell"
            | "character_connect"
            | "character_disconnect";
        itemId?: number | null;
        itemName?: string | null;
        spellId?: number | null;
        spellName?: string | null;
        amount?: number | null;
        goldDelta?: number;
        details?: Record<string, unknown>;
    },
): void {
    if (!user._id || user.pvpChar) {
        return;
    }

    const client = vars.clients[user.id] as RuntimeClient | undefined;

    funct.logCharacterActivity({
        observedAt: new Date().toISOString(),
        accountId: user.idAccount ?? null,
        characterId: user._id,
        characterName: user.nameCharacter,
        clientIp: client ? (socket.getIp(client) ?? null) : null,
        category: payload.category,
        action: payload.action,
        itemId: payload.itemId ?? null,
        itemName: payload.itemName ?? null,
        spellId: payload.spellId ?? null,
        spellName: payload.spellName ?? null,
        amount: payload.amount ?? null,
        goldDelta: payload.goldDelta ?? 0,
        details: payload.details ?? {},
    });
}

function remapEquippedInventorySlots(user: GameCharacter, sourceSlot: number, targetSlot: number): void {
    const slotFields: Array<
        "idItemWeapon" | "idItemBody" | "idItemShield" | "idItemHelmet" | "idItemArrow" | "idItemRing"
    > = ["idItemWeapon", "idItemBody", "idItemShield", "idItemHelmet", "idItemArrow", "idItemRing"];

    for (const field of slotFields) {
        if (Number(user[field]) === sourceSlot) {
            user[field] = targetSlot;
            continue;
        }

        if (Number(user[field]) === targetSlot) {
            user[field] = sourceSlot;
        }
    }
}

function findAvailableRecordSlot(record: Record<string, unknown>): number {
    let nextSlot = 1;
    const usedSlots = Object.keys(record)
        .map((value) => Number(value))
        .sort((left, right) => left - right);

    while (usedSlots[nextSlot - 1] === nextSlot) {
        nextSlot++;
    }

    return nextSlot;
}

function findAvailableSpellSlot(record: SpellRecord): number {
    const usedSlots = Object.keys(record)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
        .sort((left, right) => left - right);

    let nextSlot = usedSlots.length === 0 || usedSlots[0] === 0 ? 0 : 1;

    while (usedSlots.includes(nextSlot)) {
        nextSlot++;
    }

    return nextSlot;
}

function addItemToRecord(
    record: InventoryRecord,
    idItem: number,
    cant: number,
    options?: { maxSlots?: number; equipped?: number | boolean },
): number[] | null {
    if (!Number.isFinite(cant) || cant < 1) {
        return null;
    }

    const matchingSlots: Array<{ idPos: string; available: number }> = [];
    let existingCapacity = 0;

    for (const [idPos, item] of Object.entries(record)) {
        if (item.idItem !== idItem || item.cant >= 10000) {
            continue;
        }

        const available = 10000 - item.cant;
        matchingSlots.push({ idPos, available });
        existingCapacity += available;
    }

    const maxSlots = options?.maxSlots;
    const slotsNeeded = Math.ceil(Math.max(0, cant - existingCapacity) / 10000);

    if (typeof maxSlots === "number" && Object.keys(record).length + slotsNeeded > maxSlots) {
        return null;
    }

    const affectedSlots: number[] = [];
    let remaining = cant;

    for (const { idPos, available } of matchingSlots) {
        if (remaining <= 0) {
            break;
        }

        const amountToAdd = Math.min(remaining, available);

        if (amountToAdd <= 0) {
            continue;
        }

        record[idPos].cant += amountToAdd;
        affectedSlots.push(Number(idPos));
        remaining -= amountToAdd;
    }

    while (remaining > 0) {
        const idPos = findAvailableRecordSlot(record);
        const amountToAdd = Math.min(remaining, 10000);

        record[idPos] = {
            idItem,
            cant: amountToAdd,
            equipped: options?.equipped ?? 0,
        };
        affectedSlots.push(idPos);
        remaining -= amountToAdd;
    }

    return affectedSlots;
}

/**
 * [Game description]
 */
function Game(this: GameApi) {
    const getFloorItemsRegistry = (): Record<string, FloorItemRegistryEntry> => {
        if (!vars.floorItems || typeof vars.floorItems !== "object") {
            vars.floorItems = {};
        }

        return vars.floorItems as Record<string, FloorItemRegistryEntry>;
    };

    const unregisterDroppedFloorItem = (idMap: number, pos: Position) => {
        delete getFloorItemsRegistry()[getFloorItemRegistryKey(idMap, pos)];
    };

    const isPlayerWaterGraphic = (graphicLayer1: number) => {
        return (
            (graphicLayer1 >= 1505 && graphicLayer1 <= 1520) ||
            (graphicLayer1 >= 5665 && graphicLayer1 <= 5680) ||
            (graphicLayer1 >= 13547 && graphicLayer1 <= 13562)
        );
    };

    const hasLegalOccupancy = (
        x: number,
        y: number,
        idMapa: number,
        aguaValida: boolean,
        ignoreOccupantId?: EntityId,
    ) => {
        if (x < 1 || y < 1 || x > 100 || y > 100) {
            return false;
        }

        const occupantId = vars.mapData[idMapa]?.[y]?.[x]?.id ?? 0;
        const hasOccupant = Boolean(occupantId) && !isSameEntityId(occupantId, ignoreOccupantId);
        const tile = vars.mapa[idMapa]?.[y]?.[x];
        const graphicLayer1 = tile?.graphics?.[1] ?? 0;
        const graphicLayer2 = tile?.graphics?.[2] ?? 0;
        const isWaterTile = isPlayerWaterGraphic(graphicLayer1) && !graphicLayer2;

        if (aguaValida) {
            return isWaterTile && !tile?.blocked && !hasOccupant;
        }

        return !isWaterTile && !tile?.blocked && !hasOccupant;
    };

    const hasLegalNpcMovement = (x: number, y: number, idMapa: number, aguaValida: boolean, tierraInvalida = false) => {
        if (x < 1 || y < 1 || x > 100 || y > 100) {
            return false;
        }

        const hasOccupant = Boolean(vars.mapData[idMapa]?.[y]?.[x]?.id);
        const tile = vars.mapa[idMapa]?.[y]?.[x];
        const graphicLayer1 = tile?.graphics?.[1] ?? 0;
        const graphicLayer2 = tile?.graphics?.[2] ?? 0;
        const isWaterTile = isPlayerWaterGraphic(graphicLayer1) && !graphicLayer2;

        if (aguaValida && tierraInvalida) {
            return !hasOccupant && isWaterTile && !tile?.blocked;
        }

        if (aguaValida) {
            return !hasOccupant && (isWaterTile || !tile?.blocked);
        }

        return !isWaterTile && !tile?.blocked && !hasOccupant;
    };

    const hasLegalNpcRespawn = (x: number, y: number, idMapa: number, aguaValida: boolean, tierraInvalida = false) => {
        if (x < 1 || y < 1 || x > 100 || y > 100) {
            return false;
        }

        const hasOccupant = Boolean(vars.mapData[idMapa]?.[y]?.[x]?.id);
        const tile = vars.mapa[idMapa]?.[y]?.[x];
        const graphicLayer1 = tile?.graphics?.[1] ?? 0;
        const graphicLayer2 = tile?.graphics?.[2] ?? 0;
        const isWaterTile = isPlayerWaterGraphic(graphicLayer1) && !graphicLayer2;

        if (aguaValida && tierraInvalida) {
            return !hasOccupant && isWaterTile && !tile?.blocked;
        }

        if (aguaValida) {
            return !hasOccupant && (isWaterTile || !tile?.blocked);
        }

        return !isWaterTile && !tile?.blocked && !hasOccupant;
    };

    const hasLegalInitialNpcSpawn = (
        x: number,
        y: number,
        idMapa: number,
        aguaValida: boolean,
        movement: number,
        tierraInvalida = false,
    ) => {
        if (x < 1 || y < 1 || x > 100 || y > 100) {
            return false;
        }

        const hasOccupant = Boolean(vars.mapData[idMapa]?.[y]?.[x]?.id);
        const tile = vars.mapa[idMapa]?.[y]?.[x];
        const graphicLayer1 = tile?.graphics?.[1] ?? 0;
        const graphicLayer2 = tile?.graphics?.[2] ?? 0;
        const isWaterTile = isPlayerWaterGraphic(graphicLayer1) && !graphicLayer2;
        const allowBlockedTile = movement !== 3;

        if (aguaValida && tierraInvalida) {
            return !hasOccupant && isWaterTile && (allowBlockedTile || !tile?.blocked);
        }

        if (aguaValida) {
            return !hasOccupant && (isWaterTile || allowBlockedTile || !tile?.blocked);
        }

        return !isWaterTile && !hasOccupant && (allowBlockedTile || !tile?.blocked);
    };

    const findRespawnPosition = (
        map: number,
        aguaValida: boolean,
        useNpcRules = false,
        tierraInvalida = false,
    ): RespawnPosition | null => {
        for (let y = 1; y <= 100; y++) {
            for (let x = 1; x <= 100; x++) {
                const isValid = useNpcRules
                    ? game.validPosRespawnNpc({ x, y }, map, aguaValida, tierraInvalida)
                    : game.validPosRespawn({ x, y }, map, aguaValida);

                if (isValid) {
                    return {
                        posNewX: x,
                        posNewY: y,
                    };
                }
            }
        }

        return null;
    };

    /**
     * [legalPos Permite saber si hay bloqueos o agua en determinada posición]
     * @param  {number} x          [description]
     * @param  {number} y          [description]
     * @param  {number} idMapa     [description]
     * @param  {boolean} aguaValida [description]
     * @return {Boolean}            [description]
     */
    this.legalPos = function (
        x: number,
        y: number,
        idMapa: number,
        aguaValida: boolean,
        ignoreOccupantId?: EntityId,
    ): boolean {
        try {
            return hasLegalOccupancy(x, y, idMapa, aguaValida, ignoreOccupantId);
        } catch (err) {
            funct.dumpError(err);
            return false;
        }
    };

    this.legalPosNpc = function (
        x: number,
        y: number,
        idMapa: number,
        aguaValida: boolean,
        tierraInvalida = false,
    ): boolean {
        try {
            return hasLegalNpcMovement(x, y, idMapa, aguaValida, tierraInvalida);
        } catch (err) {
            funct.dumpError(err);
            return false;
        }
    };

    this.findDropPosition = function (
        idMap: number,
        origin: Position,
        ignoreOccupantId?: EntityId,
        options?: DropPositionOptions,
    ): Position | undefined {
        try {
            return findNearestDropPosition(idMap, origin, {
                ...options,
                ignoreOccupantId,
            });
        } catch (err) {
            funct.dumpError(err);
            return;
        }
    };

    /**
     * [hayAgua Permite saber si hay agua en determinada posición]
     * @param  {number} idMap [description]
     * @param  {object} pos   [description]
     * @return {Boolean}       [description]
     */
    this.hayAgua = function (idMap: number, pos: Position) {
        const graphicLayer1 = vars.mapa[idMap]?.[pos.y]?.[pos.x]?.graphics?.[1] ?? 0;
        const graphicLayer2 = vars.mapa[idMap]?.[pos.y]?.[pos.x]?.graphics?.[2] ?? 0;

        if (isPlayerWaterGraphic(graphicLayer1) && !graphicLayer2) {
            return true;
        } else {
            return false;
        }
    };

    /**
     * [isBlocked Permite saber si está bloqueada determinada posición]
     * @param  {number}  idMap [description]
     * @param  {object}  pos   [description]
     * @return {Boolean}       [description]
     */
    this.isBlocked = function (idMap: number, pos: Position): boolean {
        try {
            if (vars.mapa[idMap][pos.y][pos.x].blocked) {
                return true;
            } else {
                return false;
            }
        } catch (err) {
            funct.dumpError(err);
            return false;
        }
    };

    /**
     * [getName Devuelve el nombre del usuario o npc]
     * @param  {number} id [description]
     * @return {String}    [description]
     */
    this.getName = function (id: EntityId) {
        try {
            let pjSelected = vars.personajes[id];

            if (!pjSelected) {
                pjSelected = vars.npcs[id];
            }

            return pjSelected.nameCharacter;
        } catch (err) {
            funct.dumpError(err);
        }
    };

    /**
     * [useItem Acción de usar items]
     * @param  {object} ws    [description]
     * @param  {number} idPos [description]
     * @return {}       [description]
     */
    this.useItem = async (ws: RuntimeClient, idPos: number | string): Promise<void> => {
        try {
            const clientId = ws.id!;
            const user = vars.personajes[clientId] as GameCharacter;
            const now = Date.now();

            if (user.useObj.usos >= 20) {
                user.useObj.usos = 0;
                user.useObj.startTimer = +Date.now();
            }

            user.useObj.usos++;

            const nextUseItemAt = user.nextUseItemAt ?? 0;
            const nextUseItemAfterMeleeAt = user.nextUseItemAfterMeleeAt ?? 0;

            if (nextUseItemAt > now) {
                return;
            }

            if (nextUseItemAfterMeleeAt > now) {
                return;
            }

            user.nextUseItemAt = now + vars.timing.actionCooldowns.useItemMs;

            if (user.meditar) {
                handleProtocol.console("Debes dejar de meditar para realizar esta acción.", "white", 0, 0, ws);
                return;
            }

            const item = user.inv[idPos];

            if (!item) {
                return;
            }

            const idItem = item.idItem;

            const obj = vars.datObj[idItem];

            if (obj.newbie && !isNewbieCharacter(user)) {
                handleProtocol.console("Solo los personajes newbie pueden usar este item.", "white", 0, 0, ws);
                return;
            }

            if (user.dead && obj.objType !== vars.objType.barcos) {
                handleProtocol.console("Los muertos no pueden usar items.", "white", 0, 0, ws);
                return;
            }

            switch (obj.objType) {
                case vars.objType.pociones: {
                    //Pociones
                    let consumido = false;

                    if (obj.tipoPocion == vars.typePociones.vida) {
                        if (user.hp < user.maxHp) {
                            const recoveredHp = getPotionRecoveryAmount(
                                user.maxHp,
                                obj.porcentaje,
                                funct.randomIntFromInterval(obj.minModificador, obj.maxModificador),
                            );

                            user.hp += recoveredHp;

                            if (user.hp > user.maxHp) {
                                user.hp = user.maxHp;
                            }

                            handleProtocol.updateHP(user.hp, ws);
                        }

                        consumido = true;
                    } else if (obj.tipoPocion == vars.typePociones.mana) {
                        if (user.mana < user.maxMana) {
                            const recoveredMana = getPotionRecoveryAmount(
                                user.maxMana,
                                obj.porcentaje,
                                Math.floor(user.maxMana * 0.04 + user.level / 2 + 40 / user.level),
                            );

                            user.mana += recoveredMana;

                            if (user.mana > user.maxMana) {
                                user.mana = user.maxMana;
                            }

                            handleProtocol.updateMana(user.mana, ws);
                        }

                        consumido = true;
                    } else if (obj.tipoPocion == vars.typePociones.agilidad) {
                        refreshAgilityBuff(user, obj.minModificador, obj.maxModificador, ws);
                        consumido = true;
                    } else if (obj.tipoPocion == vars.typePociones.fuerza) {
                        refreshStrengthBuff(user, obj.minModificador, obj.maxModificador, ws);
                        consumido = true;
                    }

                    if (!consumido) {
                        handleProtocol.console("Este item todavía no tiene un efecto implementado.", "white", 0, 0, ws);
                        return;
                    }

                    game.quitarUserInvItem(clientId, idPos, 1);
                    await persistCharacterItems(user);

                    if (isAdminSummonedBot(user)) {
                        broadcastCharacterVitalsDelta(user);
                    }

                    game.loopArea(ws, function (client: AreaTarget) {
                        if (!client.isNpc) {
                            if (!canReceiveCharacterEvent(client.id, user.id)) {
                                return;
                            }

                            handleProtocol.playSound(user.id, vars.arSounds.SND_BEBER, vars.clients[client.id]);
                        }
                    });
                    break;
                }
                case vars.objType.comida:
                case vars.objType.bebidas:
                    game.quitarUserInvItem(clientId, idPos, 1);
                    await persistCharacterItems(user);

                    game.loopArea(ws, function (client: AreaTarget) {
                        if (!client.isNpc) {
                            if (!canReceiveCharacterEvent(client.id, user.id)) {
                                return;
                            }

                            handleProtocol.playSound(user.id, vars.arSounds.SND_BEBER, vars.clients[client.id]);
                        }
                    });
                    break;
                case vars.objType.pergaminos:
                    user.spells = normalizeSpellRecord(user.spells);

                    if (
                        user.idClase === vars.clases.guerrero ||
                        user.idClase === vars.clases.cazador ||
                        !user.maxMana
                    ) {
                        handleProtocol.console("Tu clase no puede aprender este hechizo.", "white", 0, 0, ws);
                        return;
                    }

                    let spellAprendido = false;

                    for (const spell of Object.values(user.spells)) {
                        if (spell.idSpell == obj.spellIndex) {
                            spellAprendido = true;
                        }
                    }

                    if (spellAprendido) {
                        handleProtocol.console("Este hechizo ya lo has aprendido.", "white", 0, 0, ws);
                    } else {
                        const idPosFinal = findAvailableSpellSlot(user.spells);

                        user.spells[idPosFinal] = {
                            idSpell: obj.spellIndex,
                        };

                        // Consume the scroll and persist both collections in one transaction.
                        game.quitarUserInvItem(clientId, idPos, 1);
                        await persistCharacterPatch(user, { spells: serializeSpells(user.spells), items: serializeInventory(user.inv) });

                        const learnedSpell = vars.datSpell[obj.spellIndex] as { name?: string } | undefined;
                        logCharacterActivity(user, {
                            category: "progression",
                            action: "learn_spell",
                            itemId: idItem,
                            itemName: obj.name,
                            spellId: obj.spellIndex,
                            spellName: learnedSpell?.name ?? null,
                            amount: 1,
                            details: {
                                inventorySlot: Number(idPos),
                                spellSlot: Number(idPosFinal),
                            },
                        });

                        handleProtocol.aprenderSpell(clientId, idPosFinal);
                    }

                    break;
                case vars.objType.barcos:
                    game.navegar(clientId, idItem);
                    break;
                case vars.objType.teleport: {
                    const mapChangeDeniedMessage = getPvpMapChangeDeniedMessage(user);

                    if (mapChangeDeniedMessage) {
                        handleProtocol.console(mapChangeDeniedMessage, "white", 0, 0, ws);
                        return;
                    }

                    const destination = getTravelTicketDestination(obj);

                    if (!destination) {
                        handleProtocol.console("Este item todavía no tiene un destino configurado.", "white", 0, 0, ws);
                        return;
                    }

                    const nearbyMerchant = findNearbyMerchantNpcSellingItem(user, idItem);

                    if (!nearbyMerchant) {
                        handleProtocol.console(
                            "Debes estar cerca del NPC del puerto que vende este pasaje para usarlo.",
                            "white",
                            0,
                            0,
                            ws,
                        );
                        return;
                    }

                    game.quitarUserInvItem(clientId, idPos, 1);
                    await persistCharacterItems(user);

                    if (isAdminSummonedBot(user)) {
                        broadcastCharacterVitalsDelta(user);
                    }

                    game.telep(ws, destination.map, destination.x, destination.y, `pasaje:${idItem}`);
                    break;
                }
                default:
                    if (fishing.handleRodUse(ws, idPos)) {
                        break;
                    }

                    if (harvesting.handleToolUse(ws, idPos)) {
                        break;
                    }

                    if (crafting.handleToolUse(ws, idPos)) {
                        break;
                    }

                    if (smelting.handleMineralUse(ws, idPos)) {
                        break;
                    }
            }
        } catch (err) {
            funct.dumpError(err);
        }
    };

    this.processAdminSummonedBotTick = function (now: number) {
        try {
            for (const entry of Object.values(vars.personajes as RuntimeCharacters)) {
                const adminBot = entry as GameCharacter | undefined;

                if (!adminBot || !isAdminSummonedBot(adminBot) || adminBot.cerrado || !adminBot.connected) {
                    continue;
                }

                if (!adminBot.dead) {
                    enforceAdminSummonedBotMaxBuffs(adminBot, now);
                }

                if (adminBot.dead || Number(adminBot.hp ?? 0) >= Number(adminBot.maxHp ?? 0)) {
                    continue;
                }

                if ((adminBot.nextUseItemAt ?? 0) > now || (adminBot.nextUseItemAfterMeleeAt ?? 0) > now) {
                    continue;
                }

                const potionSlot = findFirstHealthPotionSlot(adminBot);

                if (!potionSlot) {
                    continue;
                }

                const potionItem = getInventoryItem(adminBot, potionSlot);
                const potionData = potionItem ? vars.datObj[potionItem.idItem] : null;

                if (
                    !potionItem ||
                    !potionData ||
                    potionData.objType !== vars.objType.pociones ||
                    potionData.tipoPocion !== vars.typePociones.vida
                ) {
                    continue;
                }

                adminBot.nextUseItemAt = now + vars.timing.actionCooldowns.useItemMs;
                adminBot.hp = Math.min(
                    Number(adminBot.maxHp ?? 0),
                    Number(adminBot.hp ?? 0) +
                        getPotionRecoveryAmount(
                            Number(adminBot.maxHp ?? 0),
                            potionData.porcentaje,
                            funct.randomIntFromInterval(potionData.minModificador, potionData.maxModificador),
                        ),
                );

                game.quitarUserInvItem(adminBot.id, potionSlot, 1);

                withUserClient(adminBot.id, (targetClient) => {
                    handleProtocol.updateHP(adminBot.hp, targetClient);
                });

                broadcastCharacterVitalsDelta(adminBot);

                game.loopAreaPos(adminBot.map, adminBot.pos, function (target: GameCharacter) {
                    withUserClient(target.id, (targetClient) => {
                        if (!canReceiveCharacterEvent(target.id, adminBot.id)) {
                            return;
                        }

                        handleProtocol.playSound(adminBot.id, vars.arSounds.SND_BEBER, targetClient);
                    });
                });
            }
        } catch (err) {
            funct.dumpError(err);
        }
    };

    /**
     * [agarrarItem Acción de agarrar item]
     * @param  {object} ws [description]
     * @return {}    [description]
     */
    this.agarrarItem = async function (ws: RuntimeClient) {
        try {
            const clientId = ws.id!;
            const user = vars.personajes[clientId] as GameCharacter;

            if (!user) {
                return;
            }

            if (user.dead) {
                handleProtocol.console("Los muertos no pueden agarrar items.", "white", 0, 0, ws);
                return;
            }

            if (pendingFloorDrops.has(getFloorItemRegistryKey(user.map, user.pos))) return;
            if (game.hayObj(user.map, user.pos)) {
                const item = game.objMap(user.map, user.pos)!;
                const datObj = vars.datObj[item.objIndex];

                if (datObj.agarrable) {
                    return;
                }

                if (datObj.objType == vars.objType.dinero) {
                    user.gold = balance.clampGold(user.gold + item.amount);

                    handleProtocol.actGold(user.gold, ws);
                } else {
                    const slots = addItemToRecord(user.inv, item.objIndex, item.amount, {
                        maxSlots: 21,
                        equipped: 0,
                    });

                    if (slots == null) {
                        handleProtocol.console("Tienes el inventario lleno.", "white", 0, 0, ws);
                        return;
                    }

                    for (const slot of slots) {
                        handleProtocol.agregarUserInvItem(clientId, slot, ws);
                    }
                }

                unregisterDroppedFloorItem(user.map, user.pos);
                delete vars.mapa[user.map][user.pos.y][user.pos.x].objInfo;

                game.loopAreaPos(user.map, user.pos, function (target: GameCharacter) {
                    handleProtocol.deleteItem(user.map, user.pos, vars.clients[target.id]);
                });

                await persistCharacterPatch(user, {
                    ...(datObj.objType == vars.objType.dinero ? {gold:user.gold} : {items:serializeInventory(user.inv)}),
                    ...(item.dropId ? {floorChanges:[{action:"take",dropId:item.dropId}]} : {}),
                });
            }
        } catch (err) {
            funct.dumpError(err);
        }
    };

    /**
     * [putItemToInv Acción de meter item en inventario]
     * @param  {number} idUser [description]
     * @param  {number} idItem [description]
     * @param  {number} cant   [description]
     * @return {}        [description]
     */
    this.putItemToInv = function (idUser: EntityId, idItem: number, cant: number) {
        try {
            const user = getCharacterById(idUser);

            if (!user) {
                return;
            }

            if (!Number.isSafeInteger(cant) || cant < 1) {
                return;
            }

            const datObj = vars.datObj[idItem];

            if (datObj.objType == vars.objType.dinero) {
                user.gold = balance.clampGold(user.gold + cant);

                withUserClient(idUser, (userClient) => {
                    handleProtocol.actGold(user.gold, userClient);
                });
            } else {
                const slots = addItemToRecord(user.inv, idItem, cant, {
                    maxSlots: 21,
                    equipped: 0,
                });

                if (slots == null) {
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console("Tienes el inventario lleno.", "white", 0, 0, userClient);
                    });
                    return;
                }

                withUserClient(idUser, (userClient) => {
                    for (const slot of slots) {
                        handleProtocol.agregarUserInvItem(idUser, slot, userClient);
                    }
                });
            }
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    this.placeDroppedFloorItem = function (idMap: number, pos: Position, idItem: number, amount: number, dropId?: string) {
        const tile = vars.mapa[idMap]?.[pos.y]?.[pos.x];

        if (!tile) {
            return;
        }

        // Volatile world spawns must never overwrite a durable or pending transfer.
        if (!dropId && (tile.objInfo?.dropId || pendingFloorDrops.has(getFloorItemRegistryKey(idMap,pos)))) return;
        tile.objInfo = {
            objIndex: idItem,
            amount,
            ...(dropId ? { dropId } : {}),
            cleanupSource: FLOOR_ITEM_CLEANUP_SOURCE,
            cleanupRegisteredAt: Date.now(),
        };

        getFloorItemsRegistry()[getFloorItemRegistryKey(idMap, pos)] = {
            mapId: idMap,
            pos: {
                x: pos.x,
                y: pos.y,
            },
        };
    };

    this.spawnDroppedFloorItem = async function (map: number, pos: Position, itemId: number, amount: number) {
        if (!Number.isSafeInteger(amount) || amount < 1 || !vars.datObj[itemId]) return;
        const tile = vars.mapa[map]?.[pos.y]?.[pos.x];
        const key = getFloorItemRegistryKey(map,pos);
        if (!tile || tile.objInfo?.objIndex || pendingFloorDrops.has(key)) return;
        const location = {...pos};
        if (mapInstanceManager.isInstanceMap(map)) {
            game.placeDroppedFloorItem(map,location,itemId,amount);
            game.renderDroppedFloorItem(map,location,itemId);
            return;
        }
        pendingFloorDrops.add(key);
        const operationId = randomUUID();
        try {
            await worldRecovery.persist({operationId,endpoint:'/internal/floor-spawns',payload:JSON.stringify({operationId,map,x:location.x,y:location.y,itemId,amount})});
            game.placeDroppedFloorItem(map,location,itemId,amount,operationId);
            game.renderDroppedFloorItem(map,location,itemId);
        } finally { pendingFloorDrops.delete(key); }
    };

    this.restoreDroppedFloorItems = async function () {
        const result = await funct.fetchUrl('/internal/floor-items', {headers:{Authorization:vars.tokenAuth}}) as {items:Array<{dropId:string;map:number;x:number;y:number;itemId:number;amount:number}>};
        for (const item of result.items) {
            const tile = vars.mapa[item.map]?.[item.y]?.[item.x];
            if (!tile || !vars.datObj[item.itemId]) throw new Error('Persisted ground item cannot be restored safely');
            game.placeDroppedFloorItem(item.map,{x:item.x,y:item.y},item.itemId,item.amount,item.dropId);
        }
    };

    this.renderDroppedFloorItem = function (idMap: number, pos: Position, idItem: number) {
        game.loopAreaPos(idMap, pos, function (target: GameCharacter) {
            withUserClient(target.id, (targetClient) => {
                handleProtocol.renderItem(idItem, idMap, pos, targetClient);
            });
        });
    };

    this.cleanupDroppedFloorItems = async function (batchSize = 200) {
        const registry = getFloorItemsRegistry();
        const entries = Object.entries(registry) as Array<[string, FloorItemRegistryEntry]>;
        let removed = 0;

        for (let index = 0; index < entries.length; index++) {
            const [registryKey, entry] = entries[index];
            if (pendingFloorDrops.has(registryKey)) continue;
            const tile = vars.mapa[entry.mapId]?.[entry.pos.y]?.[entry.pos.x];

            if (!isDroppedFloorItem(tile?.objInfo)) {
                delete registry[registryKey];
                continue;
            }

            if (tile.objInfo?.dropId) {
                pendingFloorDrops.add(registryKey);
                await removePersistedFloorItem(tile.objInfo.dropId);
                pendingFloorDrops.delete(registryKey);
            }
            delete tile.objInfo;
            delete registry[registryKey];
            removed++;

            game.loopAreaPos(entry.mapId, entry.pos, function (target: GameCharacter) {
                withUserClient(target.id, (targetClient) => {
                    handleProtocol.deleteItem(entry.mapId, entry.pos, targetClient);
                });
            });

            if ((index + 1) % Math.max(1, batchSize) === 0) {
                await new Promise<void>((resolve) => {
                    setImmediate(resolve);
                });
            }
        }

        return removed;
    };

    this.cleanupDroppedFloorItemsInMap = async function (idMap: number, batchSize = 200) {
        const registry = getFloorItemsRegistry();
        const entries = Object.entries(registry) as Array<[string, FloorItemRegistryEntry]>;
        let removed = 0;

        for (let index = 0; index < entries.length; index++) {
            const [registryKey, entry] = entries[index];
            if (pendingFloorDrops.has(registryKey)) continue;

            if (entry.mapId !== idMap) {
                continue;
            }

            const tile = vars.mapa[entry.mapId]?.[entry.pos.y]?.[entry.pos.x];

            if (!isDroppedFloorItem(tile?.objInfo)) {
                delete registry[registryKey];
                continue;
            }

            if (tile.objInfo?.dropId) {
                pendingFloorDrops.add(registryKey);
                await removePersistedFloorItem(tile.objInfo.dropId);
                pendingFloorDrops.delete(registryKey);
            }
            delete tile.objInfo;
            delete registry[registryKey];
            removed++;

            game.loopAreaPos(entry.mapId, entry.pos, function (target: GameCharacter) {
                withUserClient(target.id, (targetClient) => {
                    handleProtocol.deleteItem(entry.mapId, entry.pos, targetClient);
                });
            });

            if (removed % Math.max(1, batchSize) === 0) {
                await new Promise<void>((resolve) => {
                    setImmediate(resolve);
                });
            }
        }

        return removed;
    };

    this.persistCharacterItemsById = async function (idUser: EntityId) {
        const user = vars.personajes[idUser] as GameCharacter | undefined;

        if (!user) {
            return;
        }

        await persistCharacterItems(user);
    };
    this.persistCharacterEconomyById = async function (idUser: EntityId) {
        const user = getCharacterById(idUser);
        if (user) await persistCharacterEconomyState(user);
    };

    /**
     * [tirarItem Acción de tirar item]
     * @param  {object} ws    [description]
     * @param  {number} idPos [description]
     * @param  {number} cant  [description]
     * @return {}       [description]
     */
    this.tirarItem = async function (ws: RuntimeClient, idPos: number | string, cant: number) {
        try {
            if (!ws || typeof ws.id === "undefined") {
                return;
            }

            const clientId = ws.id;
            const user = vars.personajes[clientId] as GameCharacter | undefined;

            if (!user) {
                return;
            }

            if (user.dead) {
                handleProtocol.console("Los muertos no pueden tirar items.", "white", 0, 0, ws);
                return;
            }

            const item = user.inv[idPos];

            if (!Number.isSafeInteger(cant) || cant < 1) {
                return;
            }

            if (!item) {
                return;
            }

            const idItem = item.idItem;

            if (item.equipped) {
                handleProtocol.console("Debes desequipar el item para poder tirarlo.", "white", 0, 0, ws);
                return;
            }

            if (user.navegando && vars.datObj[idItem].objType === vars.objType.barcos) {
                handleProtocol.console("No puedes tirar la barca mientras estas navegando.", "white", 0, 0, ws);
                return;
            }

            if (vars.datObj[idItem].newbie || user.pvpChar) {
                handleProtocol.console("No puedes tirar este item.", "white", 0, 0, ws);
                return;
            }

            if (isJailTile(user)) {
                handleProtocol.console("No puedes tirar items en la carcel.", "white", 0, 0, ws);
                return;
            }

            if (cant > item.cant) {
                cant = item.cant;
            }

            const tmpPos = game.findDropPosition(user.map, user.pos, clientId, {
                maxRadius: 0,
            });

            if (!tmpPos) {
                console.log("<<<>>> NO SPACE ON MAP FLOOR:" + user.map);
                handleProtocol.console("No hay lugar en el piso.", "white", 0, 0, ws);
                return;
            }

            const dropKey = getFloorItemRegistryKey(user.map, tmpPos);
            pendingFloorDrops.add(dropKey);
            game.quitarUserInvItem(clientId, idPos, cant);

            const dropId = !user.pvpChar && !mapInstanceManager.isInstanceMap(user.map) ? randomUUID() : undefined;
            game.placeDroppedFloorItem(user.map, tmpPos, idItem, cant, dropId);

            game.loopAreaPos(user.map, tmpPos, function (target: GameCharacter) {
                withUserClient(target.id, (targetClient) => {
                    handleProtocol.renderItem(idItem, user.map, tmpPos, targetClient);
                });
            });

            await persistCharacterPatch(user, { items: serializeInventory(user.inv), floorChanges: dropId ? [{action: "put",dropId,map:user.map,x:tmpPos.x,y:tmpPos.y,itemId:idItem,amount:cant}] : [] });
            pendingFloorDrops.delete(dropKey);
        } catch (err) {
            funct.dumpError(err);
        }
    };

    this.reorderInventoryItem = async function (
        idUser: EntityId,
        sourceSlot: number,
        targetSlot: number,
    ): Promise<void> {
        const user = getCharacterById(idUser);
        const client = getClientById(idUser);

        if (!user || !client) {
            return;
        }

        if (
            !Number.isInteger(sourceSlot) ||
            !Number.isInteger(targetSlot) ||
            sourceSlot < 1 ||
            targetSlot < 1 ||
            sourceSlot > MAX_INVENTORY_SLOTS ||
            targetSlot > MAX_INVENTORY_SLOTS ||
            sourceSlot === targetSlot
        ) {
            return;
        }

        const sourceKey = String(sourceSlot);
        const targetKey = String(targetSlot);
        const sourceItem = user.inv[sourceKey];
        const targetItem = user.inv[targetKey];

        if (!sourceItem) {
            return;
        }

        handleProtocol.quitarUserInvItem(idUser, sourceSlot, sourceItem.cant, client);

        if (targetItem) {
            handleProtocol.quitarUserInvItem(idUser, targetSlot, targetItem.cant, client);
            user.inv[sourceKey] = targetItem;
        } else {
            delete user.inv[sourceKey];
        }

        user.inv[targetKey] = sourceItem;
        remapEquippedInventorySlots(user, sourceSlot, targetSlot);

        if (user.inv[sourceKey]) {
            handleProtocol.agregarUserInvItem(idUser, sourceSlot, client);
        }

        handleProtocol.agregarUserInvItem(idUser, targetSlot, client);

        await persistCharacterItems(user);
    };

    this.reorderBankItem = async function (idUser: EntityId, sourceSlot: number, targetSlot: number): Promise<void> {
        const user = getCharacterById(idUser);
        const client = getClientById(idUser);

        if (!user || !client) {
            return;
        }

        if (
            !Number.isInteger(sourceSlot) ||
            !Number.isInteger(targetSlot) ||
            sourceSlot < 1 ||
            targetSlot < 1 ||
            sourceSlot > MAX_BANK_SLOTS ||
            targetSlot > MAX_BANK_SLOTS ||
            sourceSlot === targetSlot
        ) {
            return;
        }

        if (user.dead || user.tradeMode !== "bank" || !user.npcTrade) {
            return;
        }

        const npc = vars.npcs[user.npcTrade] as GameNpc | undefined;

        if (!npc || npc.npcType !== vars.npcType.banquero || isOriginalNpcInteractionOutOfRange(user, npc, 6)) {
            return;
        }

        const sourceKey = String(sourceSlot);
        const targetKey = String(targetSlot);
        const bankRecord = getActiveBankRecord(user);
        const sourceItem = bankRecord[sourceKey];
        const targetItem = bankRecord[targetKey];

        if (!sourceItem) {
            return;
        }

        const sharedSession = getCurrentSharedVaultSession(user);
        const bankSnapshot = cloneInventoryRecord(bankRecord);

        if (targetItem) {
            bankRecord[sourceKey] = targetItem;
        } else {
            delete bankRecord[sourceKey];
        }

        bankRecord[targetKey] = sourceItem;

        try {
            if (sharedSession) {
                await persistSharedVaultAndCharacterState(user, sharedSession, {
                    vaultItems: true,
                });
                syncActiveBankGold(user);
            } else {
                await persistCharacterStoragePatch(user, { bankItems: true });
            }
        } catch {
            replaceInventoryRecord(bankRecord, bankSnapshot);
            withUserClient(idUser, (userClient) => {
                handleProtocol.console(
                    "No se pudo actualizar la boveda. Intentalo otra vez.",
                    "white",
                    1,
                    0,
                    userClient,
                );
            });
            return;
        }

        logCharacterActivity(user, {
            category: "economy",
            action: "bank_reorder",
            itemId: sourceItem.idItem,
            itemName: vars.datObj[sourceItem.idItem]?.name ?? null,
            amount: sourceItem.cant,
            details: buildBankActivityDetails(user, {
                sourceSlot,
                targetSlot,
                swappedWithItemId: targetItem?.idItem ?? null,
            }),
        });
        handleProtocol.openTrade(idUser, user.npcTrade, client);
    };

    this.openBankTrade = async function (
        idUser: EntityId,
        idNpc: EntityId,
        tab: BankTab = "character",
    ): Promise<boolean> {
        const user = getCharacterById(idUser);
        const client = getClientById(idUser);
        const npc = vars.npcs[idNpc] as GameNpc | undefined;

        if (!user || !client || !npc || npc.npcType !== vars.npcType.banquero || user.dead) {
            return false;
        }

        if (isOriginalNpcInteractionOutOfRange(user, npc, 6)) {
            handleProtocol.console("Te encuentras muy lejos para operar con el banco.", "white", 1, 0, client);
            return false;
        }

        const resolved = await setBankTabForUser(user, tab);

        if (!resolved.ok) {
            handleProtocol.console(resolved.message, "white", 1, 0, client);
            return false;
        }

        user.npcTrade = idNpc;
        applyTradeBankState(user, tab, resolved.bank, resolved.gold);

        if (isSharedBankTab(tab)) {
            logCharacterActivity(user, {
                category: "economy",
                action: "shared_vault_open",
                details: buildBankActivityDetails(user, {
                    openedBy: "npc_interaction",
                    npcId: idNpc,
                }),
            });
        }

        handleProtocol.openTrade(idUser, idNpc, client);
        return true;
    };

    this.changeBankTab = async function (idUser: EntityId, tab: BankTab): Promise<boolean> {
        const user = getCharacterById(idUser);
        const client = getClientById(idUser);

        if (!user || !client || user.dead || user.tradeMode !== "bank" || !user.npcTrade) {
            return false;
        }

        const npc = vars.npcs[user.npcTrade] as GameNpc | undefined;

        if (!npc || npc.npcType !== vars.npcType.banquero || isOriginalNpcInteractionOutOfRange(user, npc, 6)) {
            return false;
        }

        const resolved = await setBankTabForUser(user, tab);

        if (!resolved.ok) {
            handleProtocol.console(resolved.message, "white", 1, 0, client);
            return false;
        }

        applyTradeBankState(user, tab, resolved.bank, resolved.gold);

        if (isSharedBankTab(tab)) {
            logCharacterActivity(user, {
                category: "economy",
                action: "shared_vault_open",
                details: buildBankActivityDetails(user, {
                    openedBy: "tab_change",
                    npcId: user.npcTrade,
                }),
            });
        }

        handleProtocol.openTrade(idUser, user.npcTrade, client);
        return true;
    };

    this.closeTradeSession = function (idUser: EntityId): void {
        const user = getCharacterById(idUser);

        if (!user) {
            return;
        }

        releaseSharedVaultSessionForUser(user);
        clearTradeBankState(user);
    };

    this.depositBankGold = async function (idUser: EntityId, amount: number): Promise<void> {
        const user = getCharacterById(idUser);
        const client = getClientById(idUser);
        const sharedSession = user ? getCurrentSharedVaultSession(user) : null;

        if (!user || !client || !sharedSession || !Number.isFinite(amount) || amount < 1) {
            return;
        }

        const safeAmount = Math.min(Math.floor(amount), user.gold);

        if (safeAmount < 1) {
            return;
        }

        const previousGold = user.gold;
        const previousVaultGold = sharedSession.gold;
        user.gold = balance.clampGold(user.gold - safeAmount);
        sharedSession.gold = balance.clampGold(sharedSession.gold + safeAmount);

        try {
            await persistSharedVaultAndCharacterState(user, sharedSession, {
                characterGold: true,
                vaultGold: true,
            });
        } catch {
            user.gold = previousGold;
            sharedSession.gold = previousVaultGold;
            handleProtocol.console("No se pudo mover el oro a la boveda. Intentalo otra vez.", "white", 1, 0, client);
            return;
        }

        syncActiveBankGold(user);
        handleProtocol.actGold(user.gold, client);
        logCharacterActivity(user, {
            category: "economy",
            action: "bank_deposit",
            goldDelta: -safeAmount,
            details: buildBankActivityDetails(user, {
                goldTransferred: safeAmount,
            }),
        });
        handleProtocol.openTrade(idUser, user.npcTrade, client);
    };

    this.withdrawBankGold = async function (idUser: EntityId, amount: number): Promise<void> {
        const user = getCharacterById(idUser);
        const client = getClientById(idUser);
        const sharedSession = user ? getCurrentSharedVaultSession(user) : null;

        if (!user || !client || !sharedSession || !Number.isFinite(amount) || amount < 1) {
            return;
        }

        const safeAmount = Math.min(Math.floor(amount), sharedSession.gold);

        if (safeAmount < 1) {
            return;
        }

        const nextUserGold = balance.clampGold(user.gold + safeAmount);
        const goldDeltaApplied = nextUserGold - user.gold;

        if (goldDeltaApplied < 1) {
            return;
        }

        const previousGold = user.gold;
        const previousVaultGold = sharedSession.gold;
        user.gold = nextUserGold;
        sharedSession.gold = balance.clampGold(sharedSession.gold - goldDeltaApplied);

        try {
            await persistSharedVaultAndCharacterState(user, sharedSession, {
                characterGold: true,
                vaultGold: true,
            });
        } catch {
            user.gold = previousGold;
            sharedSession.gold = previousVaultGold;
            handleProtocol.console(
                "No se pudo retirar el oro de la boveda. Intentalo otra vez.",
                "white",
                1,
                0,
                client,
            );
            return;
        }

        syncActiveBankGold(user);
        handleProtocol.actGold(user.gold, client);
        logCharacterActivity(user, {
            category: "economy",
            action: "bank_withdraw",
            goldDelta: goldDeltaApplied,
            details: buildBankActivityDetails(user, {
                goldTransferred: goldDeltaApplied,
            }),
        });
        handleProtocol.openTrade(idUser, user.npcTrade, client);
    };

    this.getMarketState = async function (
        idUser: EntityId,
        npcName = "Mercado Global",
        browseOptions?: MarketBrowseOptions,
    ): Promise<MarketUiState | null> {
        const user = getCharacterById(idUser);

        if (!user || !user._id || user.pvpChar) {
            return null;
        }

        const safeListingLimit = Math.max(1, Math.min(60, Math.floor(browseOptions?.listingLimit ?? 20)));
        const safeSortPrice =
            browseOptions?.sortPrice === "asc" || browseOptions?.sortPrice === "desc"
                ? browseOptions.sortPrice
                : "recent";
        const [listings, myListings, claims] = await Promise.all([
            fetchMarketListings({ limit: 200, sortPrice: safeSortPrice }),
            fetchMarketListings({ sellerCharacterId: user._id, includeInactive: true, limit: 20 }),
            fetchMarketClaims(user._id),
        ]);
        const filteredListings = listings.filter((listing) => filterMarketListing(listing, browseOptions ?? {}));
        const listingById = new Map<string, MarketListingSummary>();
        const listingGroups = groupMarketListings(filteredListings, browseOptions ?? {});
        const uiListingGroups = listingGroups.slice(0, safeListingLimit);
        const uiMyListings = myListings.map(toMarketUiListing);

        for (const listing of [...listings, ...myListings]) {
            listingById.set(listing.id, listing);
        }

        return {
            npcName,
            publicationFeeBps: MARKET_PUBLICATION_FEE_BPS,
            defaultDurationHours: MARKET_DEFAULT_LISTING_HOURS,
            maxDurationHours: MARKET_MAX_LISTING_HOURS,
            hasMoreListings: listingGroups.length > safeListingLimit,
            listingGroups: uiListingGroups,
            myListings: uiMyListings,
            claims: claims.map((claim) =>
                toMarketUiClaim(claim, claim.sourceListingId ? listingById.get(claim.sourceListingId) : undefined),
            ),
        };
    };

    this.openMarketTrade = async function (idUser: EntityId, idNpc: EntityId): Promise<boolean> {
        const user = getCharacterById(idUser);
        const client = getClientById(idUser);
        const npc = vars.npcs[idNpc] as GameNpc | undefined;

        if (!user || !client || !npc || user.dead) {
            return false;
        }

        if (!isMarketEnabled()) {
            handleProtocol.console("Las subastas se encuentran deshabilitadas.", "white", 1, 0, client);
            return false;
        }

        if (npc.npcType !== vars.npcType.subastador || isOriginalNpcInteractionOutOfRange(user, npc, 6)) {
            return false;
        }

        releaseSharedVaultSessionForUser(user);
        clearTradeBankState(user);
        user.npcTrade = idNpc;
        user.tradeMode = "market";

        try {
            const marketState = await this.getMarketState(idUser, npc.nameCharacter);

            if (!marketState) {
                handleProtocol.console("No se pudo abrir el mercado global.", "white", 1, 0, client);
                return false;
            }

            handleProtocol.openMarket(marketState, client);
            return true;
        } catch {
            handleProtocol.console("No se pudo abrir el mercado global.", "white", 1, 0, client);
            return false;
        }
    };

    this.listMarketListings = async function (options?: { limit?: number }): Promise<MarketListingSummary[]> {
        return fetchMarketListings({ limit: options?.limit ?? 20 });
    };

    this.listCharacterMarketListings = async function (characterId: string): Promise<MarketListingSummary[]> {
        return fetchMarketListings({ sellerCharacterId: characterId, includeInactive: true, limit: 20 });
    };

    this.getMarketClaims = async function (characterId: string): Promise<MarketClaimSummary[]> {
        return fetchMarketClaims(characterId);
    };

    this.createMarketListing = async function (
        idUser: EntityId,
        slot: number,
        quantity: number,
        price: number,
        durationHours = MARKET_DEFAULT_LISTING_HOURS,
    ): Promise<MarketCommandResult & { listingId?: string }> {
        const user = getCharacterById(idUser);
        const client = getClientById(idUser);

        if (!user || !client || !user._id || user.pvpChar) {
            return { ok: false, message: "El personaje no está listo para usar el mercado." };
        }

        if (
            !Number.isInteger(slot) ||
            !Number.isInteger(quantity) ||
            !Number.isInteger(price) ||
            quantity < 1 ||
            price < 1
        ) {
            return { ok: false, message: "Parámetros inválidos para publicar." };
        }

        const sourceItem = user.inv[String(slot)];

        if (!sourceItem) {
            return { ok: false, message: "No hay ningún item en ese slot." };
        }

        if (sourceItem.equipped) {
            return { ok: false, message: "Debes desequipar el item antes de publicarlo." };
        }

        if (quantity > sourceItem.cant) {
            return { ok: false, message: "No tienes esa cantidad disponible." };
        }

        const objectData = vars.datObj[sourceItem.idItem] as DataObject | undefined;

        if (!objectData || objectData.objType === vars.objType.dinero) {
            return { ok: false, message: "Ese item no se puede publicar en el mercado." };
        }

        if (objectData.newbie) {
            return { ok: false, message: "Los items newbie no se pueden publicar en el mercado." };
        }

        if (isItemSoldByMerchantNpc(Number(sourceItem.idItem))) {
            return { ok: false, message: "Ese item no se puede publicar porque está en venta en NPCs." };
        }

        const safeDurationHours = Math.max(1, Math.min(MARKET_MAX_LISTING_HOURS, Math.floor(durationHours)));
        const publicationFee = Math.max(1, Math.floor((price * MARKET_PUBLICATION_FEE_BPS) / 10000));

        if (user.gold < publicationFee) {
            return { ok: false, message: `No tienes oro suficiente para la publicación (${publicationFee}).` };
        }

        const nextInventory = cloneInventoryRecord(user.inv);
        removeItemFromInventoryRecord(nextInventory, slot, quantity);
        const nextGold = balance.clampGold(user.gold - publicationFee);

        try {
            const result = (await funct.fetchUrl("/internal/market/listings", {
                method: "POST",
                body: JSON.stringify({
                    sellerCharacterId: user._id,
                    sellerAccountId: user.idAccount,
                    sellerName: user.nameCharacter,
                    itemId: sourceItem.idItem,
                    quantity,
                    price,
                    publicationFee,
                    durationHours: safeDurationHours,
                    characterGold: nextGold,
                    characterItems: serializeInventory(nextInventory),
                }),
                headers: {
                    "Content-Type": "application/json",
                    Authorization: vars.tokenAuth,
                },
            })) as { listing: MarketListingSummary };

            replaceInventoryRecord(user.inv, nextInventory);
            syncUnequippedItemVisuals(user, String(slot));
            user.gold = nextGold;
            handleProtocol.quitarUserInvItem(idUser, slot, quantity, client);
            handleProtocol.actGold(user.gold, client);
            logCharacterActivity(user, {
                category: "economy",
                action: "market_listing_create",
                itemId: sourceItem.idItem,
                itemName: objectData.name ?? null,
                amount: quantity,
                goldDelta: -publicationFee,
                details: {
                    listingId: result.listing.id,
                    price,
                    durationHours: safeDurationHours,
                },
            });
            return { ok: true, message: "Publicación creada correctamente.", listingId: result.listing.id };
        } catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : "No se pudo crear la publicación." };
        }
    };

    this.buyMarketListing = async function (
        idUser: EntityId,
        listingId: string,
        expected?: { itemId?: number; quantity?: number; price?: number },
    ): Promise<MarketCommandResult> {
        const user = getCharacterById(idUser);
        const client = getClientById(idUser);

        if (!user || !client || !user._id || user.pvpChar) {
            return { ok: false, message: "El personaje no está listo para usar el mercado." };
        }

        const normalizedListingId = listingId.trim().toLowerCase();

        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalizedListingId)) {
            return { ok: false, message: "Selecciona una publicación válida para comprar." };
        }

        const listings = await fetchMarketListings({ limit: 200 });
        const listing = listings.find((entry) => entry.id.toLowerCase() === normalizedListingId);

        if (!listing) {
            return { ok: false, message: "No se encontró esa publicación activa." };
        }

        if (user.gold < listing.price) {
            return { ok: false, message: "No tienes oro suficiente." };
        }

        if (
            (expected?.itemId !== undefined && listing.itemId !== expected.itemId) ||
            (expected?.quantity !== undefined && listing.quantity !== expected.quantity) ||
            (expected?.price !== undefined && listing.price !== expected.price)
        ) {
            return { ok: false, message: "La publicación cambió. Actualiza el mercado antes de comprar." };
        }

        const nextGold = balance.clampGold(user.gold - listing.price);

        try {
            await funct.fetchUrl("/internal/market/buy", {
                method: "POST",
                body: JSON.stringify({
                    buyerCharacterId: user._id,
                    buyerName: user.nameCharacter,
                    listingId: normalizedListingId,
                    expectedItemId: expected?.itemId,
                    expectedQuantity: expected?.quantity,
                    expectedPrice: expected?.price,
                    characterGold: nextGold,
                    characterItems: serializeInventory(user.inv),
                }),
                headers: {
                    "Content-Type": "application/json",
                    Authorization: vars.tokenAuth,
                },
            });

            user.gold = nextGold;
            handleProtocol.actGold(user.gold, client);
            logCharacterActivity(user, {
                category: "economy",
                action: "market_listing_buy",
                itemId: listing.itemId,
                itemName: vars.datObj[listing.itemId]?.name ?? null,
                amount: listing.quantity,
                goldDelta: -listing.price,
                details: {
                    listingId: normalizedListingId,
                    sellerCharacterId: listing.sellerCharacterId,
                    sellerName: listing.sellerName,
                },
            });
            return { ok: true, message: "Compra realizada. Reclama el item dentro de Reclamos." };
        } catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : "No se pudo completar la compra." };
        }
    };

    this.cancelMarketListing = async function (idUser: EntityId, listingId: string): Promise<MarketCommandResult> {
        const user = getCharacterById(idUser);

        if (!user || !user._id || user.pvpChar) {
            return { ok: false, message: "El personaje no está listo para usar el mercado." };
        }

        const normalizedListingId = listingId.trim().toLowerCase();
        const ownListings = await fetchMarketListings({
            sellerCharacterId: user._id,
            includeInactive: true,
            limit: 20,
        });
        const resolvedListing =
            ownListings.find((entry) => entry.id.toLowerCase() === normalizedListingId) ??
            ownListings.find((entry) => entry.id.toLowerCase().startsWith(normalizedListingId));

        if (!resolvedListing) {
            return { ok: false, message: "No se encontró esa publicación tuya." };
        }

        try {
            await funct.fetchUrl(`/internal/market/listings/${encodeURIComponent(resolvedListing.id)}/cancel`, {
                method: "POST",
                body: JSON.stringify({
                    sellerCharacterId: user._id,
                }),
                headers: {
                    "Content-Type": "application/json",
                    Authorization: vars.tokenAuth,
                },
            });

            logCharacterActivity(user, {
                category: "economy",
                action: "market_listing_cancel",
                details: {
                    listingId: resolvedListing.id,
                },
            });
            return { ok: true, message: "Publicación cancelada. Reclama el item dentro de Reclamos." };
        } catch (error) {
            return {
                ok: false,
                message: error instanceof Error ? error.message : "No se pudo cancelar la publicación.",
            };
        }
    };

    this.claimMarket = async function (
        idUser: EntityId,
    ): Promise<MarketCommandResult & { claims?: MarketClaimSummary[] }> {
        const user = getCharacterById(idUser);
        const client = getClientById(idUser);

        if (!user || !client || !user._id || user.pvpChar) {
            return { ok: false, message: "El personaje no está listo para usar el mercado." };
        }

        const claims = await fetchMarketClaims(user._id);

        if (!claims.length) {
            return { ok: false, message: "No tienes reclamos pendientes." };
        }

        const previousGold = user.gold;
        const previousInventory = cloneInventoryRecord(user.inv);
        const nextInventory = cloneInventoryRecord(user.inv);
        let nextGold = user.gold;

        for (const claim of claims) {
            if (claim.claimType === "gold") {
                nextGold = balance.clampGold(nextGold + claim.goldAmount);
                continue;
            }

            if (!claim.itemId || !claim.itemQuantity) {
                return { ok: false, message: "Hay un reclamo de item inválido." };
            }

            const addedSlots = addItemToRecord(nextInventory, claim.itemId, claim.itemQuantity, {
                maxSlots: 21,
                equipped: 0,
            });

            if (addedSlots == null) {
                return { ok: false, message: "No tienes espacio suficiente para reclamar todos los items." };
            }
        }

        try {
            await funct.fetchUrl(`/internal/market/claims/${encodeURIComponent(user._id)}/claim`, {
                method: "POST",
                body: JSON.stringify({
                    characterGold: nextGold,
                    characterItems: serializeInventory(nextInventory),
                }),
                headers: {
                    "Content-Type": "application/json",
                    Authorization: vars.tokenAuth,
                },
            });

            replaceInventoryRecord(user.inv, nextInventory);
            user.gold = nextGold;

            const affectedSlots = new Set<string>([...Object.keys(previousInventory), ...Object.keys(nextInventory)]);

            for (const slotKey of affectedSlots) {
                const before = previousInventory[slotKey];
                const after = nextInventory[slotKey];

                if (!after && before) {
                    handleProtocol.quitarUserInvItem(idUser, slotKey, before.cant, client);
                    continue;
                }

                if (
                    after &&
                    (!before ||
                        before.idItem !== after.idItem ||
                        before.cant !== after.cant ||
                        before.equipped !== after.equipped)
                ) {
                    handleProtocol.agregarUserInvItem(idUser, slotKey, client);
                }
            }

            handleProtocol.actGold(user.gold, client);
            logCharacterActivity(user, {
                category: "economy",
                action: "market_claim",
                goldDelta: nextGold - previousGold,
                details: {
                    claimsCount: claims.length,
                },
            });
            return { ok: true, message: "Reclamos acreditados correctamente.", claims };
        } catch (error) {
            return {
                ok: false,
                message: error instanceof Error ? error.message : "No se pudieron reclamar los resultados.",
            };
        }
    };

    /**
     * [existPjOrClose Si el personaje no existe cierra la conexión]
     * @param  {object} ws [description]
     * @return {Boolean}    [description]
     */
    this.existPjOrClose = function (ws: RuntimeClient): boolean {
        try {
            if (ws.readyState == ws.OPEN) {
                if (ws.id) {
                    if (vars.personajes[ws.id]) {
                        return true;
                    } else {
                        console.log("Disconnected ID: " + ws.id);
                        socket.close(ws);
                        return false;
                    }
                } else {
                    console.log("WebSocket disconnected");
                    socket.close(ws);
                    return false;
                }
            } else {
                console.log("WebSocket disconnected due to a different state");
                socket.close(ws);
                return false;
            }
        } catch (err) {
            funct.dumpError(err);
            return false;
        }
    };

    /**
     * [worldSave Guardado del mundo]
     * @param  {Function} callback [description]
     * @return {}            [description]
     */
    this.worldSave = async (callback: RuntimeCallback<WorldSaveResult>): Promise<void> => {
        const startedAt = Date.now();
        let savedCharacters = 0;
        let failedCharacters = 0;

        for (let i in vars.personajes) {
            const user = vars.personajes[i];
            if (!user.pvpChar && !user.cerrado) {
                try {
                    await persistCharacterSnapshot(user, { connected: true });

                    savedCharacters++;
                } catch (err) {
                    failedCharacters++;
                    console.log(`[WORLDSAVE] Failed to save ${user.name ?? user._id}. Continuing with remaining characters.`);
                    funct.dumpError(err);
                }
            }
        }

        const durationMs = Date.now() - startedAt;

        if (failedCharacters > 0) {
            console.log(
                `[WORLDSAVE] Saved ${savedCharacters} characters in ${durationMs}ms with ${failedCharacters} failures.`,
            );
            callback({ ok: false, durationMs, savedCharacters });
            return;
        }

        console.log(`[WORLDSAVE] Saved ${savedCharacters} characters in ${durationMs}ms.`);
        callback({ ok: true, durationMs, savedCharacters });
    };

    /**
     * [respawnNpc Devuelve la posición de nacimiento del nuevo NPC]
     * @param  {number} map        [description]
     * @param  {boolean} aguaValida [description]
     * @return {Object}            [description]
     */
    this.respawnNpc = function (map: number, aguaValida: boolean, tierraInvalida = false): RespawnPosition {
        try {
            let posNewX = funct.randomIntFromInterval(1, 100);
            let posNewY = funct.randomIntFromInterval(1, 100);

            let count = 0;

            while (
                !game.validPosRespawnNpc(
                    {
                        x: posNewX,
                        y: posNewY,
                    },
                    map,
                    aguaValida,
                    tierraInvalida,
                )
            ) {
                posNewX = funct.randomIntFromInterval(1, 100);
                posNewY = funct.randomIntFromInterval(1, 100);

                count++;

                if (count > 10000) {
                    const exactMatch = findRespawnPosition(map, aguaValida, true, tierraInvalida);

                    if (exactMatch) {
                        return exactMatch;
                    }

                    const fallbackMatch = tierraInvalida ? null : findRespawnPosition(map, !aguaValida, true);

                    if (fallbackMatch) {
                        console.log(`<<<>>> NPC respawn fallback on map ${map}: validWater=${aguaValida ? 1 : 0}`);

                        return fallbackMatch;
                    }

                    console.log("[NPC] Could not place NPC on map " + map);

                    return {
                        posNewX: 50,
                        posNewY: 50,
                    };
                }
            }

            return {
                posNewX: posNewX,
                posNewY: posNewY,
            };
        } catch (err) {
            funct.dumpError(err);
            return {
                posNewX: 50,
                posNewY: 50,
            };
        }
    };

    /**
     * [validPosRespawn description]
     * @param  {[type]} pos        [description]
     * @param  {[type]} map        [description]
     * @param  {[type]} aguaValida [description]
     * @return {[type]}            [description]
     */
    this.validPosRespawn = function (pos: Position, map: number, aguaValida: boolean): boolean {
        try {
            if (game.legalPos(pos.x, pos.y, map, aguaValida) && !game.isTelep(pos.x, pos.y)) {
                return true;
            } else {
                return false;
            }
        } catch (err) {
            funct.dumpError(err);
            return false;
        }
    };

    this.validPosRespawnNpc = function (
        pos: Position,
        map: number,
        aguaValida: boolean,
        tierraInvalida = false,
    ): boolean {
        try {
            if (hasLegalNpcRespawn(pos.x, pos.y, map, aguaValida, tierraInvalida) && !game.isTelep(pos.x, pos.y)) {
                return true;
            } else {
                return false;
            }
        } catch (err) {
            funct.dumpError(err);
            return false;
        }
    };

    this.validInitialNpcSpawn = function (
        pos: Position,
        map: number,
        aguaValida: boolean,
        movement: number,
        tierraInvalida = false,
    ): boolean {
        try {
            if (
                hasLegalInitialNpcSpawn(pos.x, pos.y, map, aguaValida, movement, tierraInvalida) &&
                !game.isTelep(pos.x, pos.y)
            ) {
                return true;
            } else {
                return false;
            }
        } catch (err) {
            funct.dumpError(err);
            return false;
        }
    };

    /**
     * [isTelep description]
     * @param  {[type]}  posX [description]
     * @param  {[type]}  posY [description]
     * @return {Boolean}      [description]
     */
    this.isTelep = function (posX: number, posY: number): boolean {
        try {
            if (posX >= 52 && posX <= 55 && posY >= 48 && posY <= 51) {
                return true;
            } else {
                return false;
            }
        } catch (err) {
            funct.dumpError(err);
            return false;
        }
    };

    /**
     * [setNewAreas description]
     * @param {[type]} ws [description]
     */
    this.setNewAreas = function (ws: RuntimeClient) {
        try {
            const clientId = ws.id!;
            const user = vars.personajes[clientId] as GameCharacter;
            const visibleCharactersForUser: RuntimeCharacter[] = [];
            const visibleNpcsForUser: RuntimeNpc[] = [];
            const visibleItemsForUser: Array<{ idItem: number; map: number; pos: Position }> = [];
            const blockedTilesForUser: Array<{ pos: Position; blocked: number }> = [];

            socket.withFlushGroup(ws, () => {
                const mapName = vars.mapData[user.map].name;

                const posXStart = user.pos.x - AREA_RANGE_X;
                const posYStart = user.pos.y - AREA_RANGE_Y;

                const posXEnd = user.pos.x + AREA_RANGE_X;
                const posYEnd = user.pos.y + AREA_RANGE_Y;

                for (let y = posYStart; y <= posYEnd; y++) {
                    for (let x = posXStart; x <= posXEnd; x++) {
                        if (x >= 1 && y >= 1 && x <= 100 && y <= 100) {
                            const mapData = vars.mapData[user.map][y][x];

                            if (mapData.id) {
                                const areaTarget = resolveAreaTarget(user.map, x, y);

                                if (!areaTarget) {
                                    continue;
                                }

                                if (!areaTarget.isNpc) {
                                    if (areaTarget.id != clientId) {
                                        if (canRenderCharacter(areaTarget.id, user)) {
                                            handleProtocol.sendCharacter(user, areaTarget.id);
                                            withUserClient(areaTarget.id, (targetClient) => {
                                                socket.send(targetClient);
                                            });
                                        }

                                        const areaCharacter = areaTarget.target as GameCharacter;

                                        if (canRenderCharacter(clientId, areaCharacter)) {
                                            visibleCharactersForUser.push(areaCharacter);
                                        }
                                    }
                                } else {
                                    const npcArea = Array.isArray(vars.areaNpc[areaTarget.id])
                                        ? vars.areaNpc[areaTarget.id]
                                        : [];

                                    if (vars.areaNpc[areaTarget.id] !== npcArea) {
                                        vars.areaNpc[areaTarget.id] = npcArea;
                                    }

                                    if (
                                        areaTarget.target.movement == 3 &&
                                        canNpcDetectCharacter(user) &&
                                        npcArea.indexOf(clientId) < 0
                                    ) {
                                        npcArea.push(clientId);
                                    }

                                    visibleNpcsForUser.push(areaTarget.target as RuntimeNpc);
                                }
                            }

                            const pos = {
                                x: x,
                                y: y,
                            };

                            if (game.hayObj(user.map, pos)) {
                                const item = game.objMap(user.map, pos)!;
                                const obj = vars.datObj[item.objIndex];

                                if (obj.objType == vars.objType.puerta) {
                                    if (item.objIndex == obj.indexAbierta) {
                                        blockedTilesForUser.push(
                                            {
                                                pos,
                                                blocked: 0,
                                            },
                                            {
                                                pos: {
                                                    x: pos.x - 1,
                                                    y: pos.y,
                                                },
                                                blocked: 0,
                                            },
                                        );
                                    }
                                }

                                visibleItemsForUser.push({
                                    idItem: item.objIndex,
                                    map: user.map,
                                    pos,
                                });
                            }
                        }
                    }
                }

                handleProtocol.areaMetaSnapshot(
                    {
                        map: user.map,
                        name: mapName,
                        blockedTiles: blockedTilesForUser,
                    },
                    ws,
                );
                handleProtocol.areaCharactersSnapshot(visibleCharactersForUser, clientId, ws);
                handleProtocol.areaNpcsSnapshot(visibleNpcsForUser, ws);
                handleProtocol.areaItemsSnapshot(visibleItemsForUser, ws);

                game.refreshRelationshipIndexesForMember(clientId);
                game.syncPartyStateForMember(clientId);
                game.syncClanStateForMember(clientId);
            });
        } catch (err) {
            funct.dumpError(err);
            return "¡Fallas!";
        }
    };

    /**
     * [loopArea description]
     * @param  {[type]}   ws       [description]
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */
    this.loopArea = function (ws: RuntimeClient | undefined, callback: RuntimeCallback<AreaTarget>) {
        try {
            if (!ws) {
                return;
            }

            const user = vars.personajes[ws.id!] as GameCharacter;

            if (!hasMapCell(user.map, user.pos.x, user.pos.y)) {
                return;
            }

            const posXStart = user.pos.x - AREA_RANGE_X;
            const posYStart = user.pos.y - AREA_RANGE_Y;

            const posXEnd = user.pos.x + AREA_RANGE_X;
            const posYEnd = user.pos.y + AREA_RANGE_Y;

            for (let y = posYStart; y <= posYEnd; y++) {
                for (let x = posXStart; x <= posXEnd; x++) {
                    if (x >= 1 && y >= 1 && x <= 100 && y <= 100) {
                        const mapData = vars.mapData[user.map]?.[y]?.[x];

                        if (mapData?.id) {
                            const areaTarget = resolveAreaTarget(user.map, x, y);

                            if (areaTarget) {
                                callback(areaTarget.target);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            funct.dumpError(err);
        }
    };

    /**
     * [loopAreaPos description]
     * @param  {[type]}   idMap    [description]
     * @param  {[type]}   pos      [description]
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */
    this.loopAreaPos = function (idMap: number, pos: Position, callback: RuntimeCallback<GameCharacter>) {
        try {
            if (!hasMapCell(idMap, pos.x, pos.y)) {
                return;
            }

            const posXStart = pos.x - AREA_RANGE_X;
            const posYStart = pos.y - AREA_RANGE_Y;

            const posXEnd = pos.x + AREA_RANGE_X;
            const posYEnd = pos.y + AREA_RANGE_Y;

            for (let y = posYStart; y <= posYEnd; y++) {
                for (let x = posXStart; x <= posXEnd; x++) {
                    if (x >= 1 && x <= 100 && y >= 1 && y <= 100) {
                        const mapData = vars.mapData[idMap]?.[y]?.[x];

                        if (mapData?.id) {
                            const target = vars.personajes[mapData.id];

                            if (target) {
                                callback(target);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            funct.dumpError(err);
        }
    };

    this.resolveTileExitDestination = function (
        ws: RuntimeClient,
        tileExit: TileExitDefinition | undefined,
        source = "tileExit",
        origin,
    ): TileExitDestination | undefined {
        const clientId = ws.id;
        const user = clientId ? (vars.personajes[clientId] as GameCharacter | undefined) : undefined;

        if (origin) {
            const deniedMessage = getFactionPortalDeniedMessage(user, origin.mapId, origin.x, origin.y);

            if (deniedMessage) {
                handleProtocol.console(deniedMessage, "white", 0, 0, ws);
                return undefined;
            }
        }

        const destinations = normalizeTileExitDestinations(tileExit);

        if (destinations.length === 0) {
            return undefined;
        }

        const exactDestinations = destinations.filter(
            (destination) =>
                hasMapCell(destination.map, destination.x, destination.y) &&
                user &&
                game.legalPos(destination.x, destination.y, destination.map, Boolean(user.navegando), clientId),
        );

        const exactDestination = pickRandomDestination(exactDestinations);
        if (exactDestination) {
            return exactDestination;
        }

        const fallbackDestinations = destinations.filter((destination) =>
            hasMapCell(destination.map, destination.x, destination.y),
        );

        const fallbackDestination = pickRandomDestination(fallbackDestinations);
        if (fallbackDestination) {
            return fallbackDestination;
        }

        console.log(`[tileExit] No valid destination for ${source}.`);
        return undefined;
    };

    this.getFactionPortalDeniedMessage = getFactionPortalDeniedMessage;
    this.getPvpMapChangeDeniedMessage = getPvpMapChangeDeniedMessage;

    /**
     * [telep description]
     * @param  {[type]} ws     [description]
     * @param  {[type]} numMap [description]
     * @param  {[type]} posX   [description]
     * @param  {[type]} posY   [description]
     * @return {[type]}        [description]
     */
    this.telep = function (ws: RuntimeClient, numMap: number, posX: number, posY: number, source = "telep") {
        try {
            const clientId = ws.id!;
            const user = vars.personajes[clientId] as GameCharacter;
            const hasCurrentCell = hasMapCell(user.map, user.pos.x, user.pos.y);

            if (!hasCurrentCell) {
                console.log(
                    `[teleport] User ${user.nameCharacter} has invalid position ${user.map}@${user.pos.x},${user.pos.y} before ${source}`,
                );
            }

            if (!hasMapCell(numMap, posX, posY)) {
                console.log(
                    `[teleport] Invalid destination ${numMap}@${posX},${posY} (${source}) for ${user.nameCharacter}`,
                );
                return;
            }

            const deniedPortalMessage = getFactionPortalDeniedMessage(user, numMap, posX, posY);

            if (deniedPortalMessage) {
                handleProtocol.console(deniedPortalMessage, "white", 0, 0, ws);
                handleProtocol.actPositionServer(
                    user.map,
                    user.pos,
                    user.heading,
                    Number(user.lastProcessedMoveId ?? 0),
                    Number(user.stateVersion ?? 0),
                    ws,
                );
                return;
            }

            if (user.map !== numMap) {
                const deniedMessage = getMapEntryDeniedMessage(user, numMap);

                if (deniedMessage) {
                    handleProtocol.console(deniedMessage, "white", 0, 0, ws);
                    handleProtocol.actPositionServer(
                        user.map,
                        user.pos,
                        user.heading,
                        Number(user.lastProcessedMoveId ?? 0),
                        Number(user.stateVersion ?? 0),
                        ws,
                    );
                    return;
                }
            }

            if (user.map !== numMap) {
                const npcApi = require("./npcs") as {
                    removeOwnerSummons: (idUser: EntityId) => void;
                };

                npcApi.removeOwnerSummons(clientId);
                user.summonTargetNpcId = 0;
            }

            fishing.cancelFishing(clientId);
            harvesting.cancelHarvesting(clientId);
            smelting.cancelSmelting(clientId);
            crafting.cancelPendingTarget(clientId);
            user.pendingMoveQueue = [];
            if (user.pendingMoveTimerId) {
                clearTimeout(user.pendingMoveTimerId);
                user.pendingMoveTimerId = null;
            }
            user.ignoreMovementUntil = Date.now() + vars.timing.walkStepMs;
            user.nextWalkAt = user.ignoreMovementUntil;

            if (hasCurrentCell) {
                vars.mapData[user.map][user.pos.y][user.pos.x].id = 0;
            }

            game.loopArea(ws, function (target: AreaTarget) {
                if (!target.isNpc && target.id != clientId) {
                    handleProtocol.deleteCharacter(target.id, ws);
                    withUserClient(target.id, (targetClient) => {
                        handleProtocol.deleteCharacter(clientId, targetClient);
                    });
                } else if (target.isNpc && vars.npcs[target.id].movement == 3) {
                    const index = vars.areaNpc[target.id].indexOf(clientId);

                    if (index > -1) {
                        vars.areaNpc[target.id].splice(index, 1);
                    }
                }

                if (target.isNpc) {
                    handleProtocol.deleteCharacter(target.id, ws);
                }
            });

            const tileExit = vars.mapa[numMap]?.[posY]?.[posX]?.tileExit;
            const tileExitDestination = game.resolveTileExitDestination(
                ws,
                tileExit,
                `${source} -> tileExit ${numMap}@${posX},${posY}`,
                { mapId: numMap, x: posX, y: posY },
            );

            if (tileExitDestination) {
                game.deleteUserToAllNpcs(clientId);
                game.telep(
                    ws,
                    tileExitDestination.map,
                    tileExitDestination.x,
                    tileExitDestination.y,
                    `${source} -> tileExit ${numMap}@${posX},${posY}`,
                );
                return;
            }

            const requestedPos = { x: posX, y: posY };
            const canUseRequestedPosDirectly =
                user.privileges === 1 && !user.navegando && !isOccupiedByAnotherEntity(numMap, requestedPos, clientId);

            let tmpPos: Position | undefined = requestedPos;

            if (!canUseRequestedPosDirectly) {
                tmpPos = resolveTeleportPositionForUser(user, numMap, posX, posY, source);
            }

            if (tmpPos && isOccupiedByAnotherEntity(numMap, tmpPos, clientId)) {
                tmpPos = resolveTeleportPositionForUser(user, numMap, posX, posY, `${source} -> occupied fallback`);
            }

            if (!tmpPos) {
                console.log(
                    "[teleport] No free destination for user " +
                        user.nameCharacter +
                        " on map " +
                        numMap +
                        " destination " +
                        posX +
                        "," +
                        posY +
                        " source " +
                        source +
                        " sailing " +
                        user.navegando,
                );

                tmpPos = { x: 50, y: 50 };
                numMap = 1;

                user.map = numMap;
                user.pos.x = tmpPos.x;
                user.pos.y = tmpPos.y;

                vars.mapData[user.map][user.pos.y][user.pos.x].id = clientId;

                game.closeForce(clientId);

                return;
            }

            user.map = numMap;
            user.pos.x = tmpPos.x;
            user.pos.y = tmpPos.y;
            user.stateVersion = Number(user.stateVersion ?? 0) + 1;
            user.zonaSegura = safeZone.getSafeZoneFlag(user.map, user.pos);

            vars.mapData[user.map][user.pos.y][user.pos.x].id = clientId;

            socket.withFlushGroup(ws, () => {
                handleProtocol.telepMe(
                    clientId,
                    user.map,
                    user.pos,
                    user.heading,
                    Number(user.stateVersion ?? 0),
                    Number(user.lastProcessedMoveId ?? 0),
                    Math.min(vars.timing.walkStepMs, TELEPORT_CLIENT_MOVEMENT_LOCK_MS),
                    ws,
                );
                handleProtocol.selfFlagsDelta(
                    {
                        zonaSegura: Number(user.zonaSegura ?? 0),
                        seguroActivado: Boolean(user.seguroActivado),
                        seguroClanActivado: Boolean(user.seguroClanActivado),
                    },
                    ws,
                );
                handleProtocol.inmo(clientId, user.paralizado ? 2 : user.inmovilizado ? 1 : 0, ws);
                handleProtocol.selfMapMetaDelta(
                    {
                        navegando: Number(user.navegando ?? 0),
                    },
                    ws,
                );
                handleProtocol.changeBody(clientId, ws);

                game.setNewAreas(ws);
            });
            const protocolApi = require("./protocol") as {
                syncPendingReviveCastVisibilityForUser?: (movedUserId: EntityId) => void;
            };
            protocolApi.syncPendingReviveCastVisibilityForUser?.(clientId);
            game.refreshRelationshipIndexesForMember(clientId);
            game.syncPartyStateForMember(clientId);
            game.syncClanStateForMember(clientId);
        } catch (err) {
            funct.dumpError(err);
            return undefined;
        }
    };

    /**
     * [getFreeSpace description]
     * @param  {[type]} ws     [description]
     * @param  {[type]} numMap [description]
     * @param  {[type]} posX   [description]
     * @param  {[type]} posY   [description]
     * @return {[type]}        [description]
     */
    this.getFreeSpace = function (
        ws: RuntimeClient,
        numMap: number,
        posX: number,
        posY: number,
        source = "getFreeSpace",
    ): Position | undefined {
        try {
            const clientId = ws.id!;
            const user = vars.personajes[clientId] as GameCharacter;
            const tmpPos = resolveTeleportPositionForUser(user, numMap, posX, posY, source);

            if (!tmpPos) {
                console.log(
                    "[teleport] Disconnecting user " +
                        user.nameCharacter +
                        ": no free destination on map " +
                        numMap +
                        " destination " +
                        posX +
                        "," +
                        posY +
                        " source " +
                        source +
                        " sailing " +
                        user.navegando,
                );

                game.closeForce(clientId);

                return;
            }

            return tmpPos;
        } catch (err) {
            funct.dumpError(err);
            return undefined;
        }
    };

    /**
     * [puedePegar description]
     * @param  {[type]} posX [description]
     * @param  {[type]} posY [description]
     * @return {[type]}      [description]
     */
    this.puedePegar = function (): boolean {
        try {
            return true;
        } catch (err) {
            funct.dumpError(err);
            return true;
        }

        return true;
    };

    /**
     * [bodyNaked description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.bodyNaked = function (idUser: EntityId): number {
        try {
            const user = vars.personajes[idUser];
            let $idBody = 0;

            if (user.idGenero == vars.genero.hombre) {
                switch (user.idRaza) {
                    case vars.razas.humano:
                        $idBody = 21;
                        break;

                    case vars.razas.elfo:
                        $idBody = 210;
                        break;

                    case vars.razas.elfoDrow:
                        $idBody = 32;
                        break;

                    case vars.razas.enano:
                        $idBody = 53;
                        break;

                    case vars.razas.gnomo:
                        $idBody = 222;
                        break;
                }
            }

            if (user.idGenero == vars.genero.mujer) {
                switch (user.idRaza) {
                    case vars.razas.humano:
                        $idBody = 39;
                        break;

                    case vars.razas.elfo:
                        $idBody = 259;
                        break;

                    case vars.razas.elfoDrow:
                        $idBody = 40;
                        break;

                    case vars.razas.enano:
                        $idBody = 60;
                        break;

                    case vars.razas.gnomo:
                        $idBody = 260;
                        break;
                }
            }

            return $idBody;
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    /**
     * [putBodyAndHeadDead description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.putBodyAndHeadDead = function (idUser: EntityId) {
        try {
            const user = vars.personajes[idUser];
            const userClient = getClientById(idUser);
            const shouldSyncVisibilityState = Boolean(user.invisibleSpell || user.hiddenSkill);
            const hadMovementRestriction = Boolean(user.inmovilizado || user.paralizado);
            fishing.cancelFishing(idUser);
            harvesting.cancelHarvesting(idUser);
            smelting.cancelSmelting(idUser);
            crafting.cancelPendingTarget(idUser);

            if (!user.navegando) {
                user.idLastHead = JSON.parse(user.idHead);
                user.idBody = 8;
                user.idHead = 500;
            } else {
                user.idBody = 87;
            }

            user.idWeapon = 0;
            user.idHelmet = 0;
            user.idShield = 0;
            resetFuerzaAgilidadBuffs(user, userClient ?? undefined);
            user.dead = 1;
            user.deadWorldActive = false;
            user.invisibleSpell = false;
            user.hiddenSkill = false;
            user.hiddenSkillStartedAt = 0;
            user.hiddenSkillExpiresAt = 0;
            user.hiddenSkillCooldownUntil = 0;
            user.cooldownInvisibleSpell = 0;
            user.inmovilizado = 0;
            user.paralizado = 0;
            user.cooldownParalizado = 0;

            user.idLastHelmet = 0;
            user.idLastWeapon = 0;
            user.idLastShield = 0;

            user.idItemBody = 0;
            user.idItemWeapon = 0;
            user.idItemArrow = 0;
            user.idItemShield = 0;
            user.idItemHelmet = 0;
            user.idItemRing = 0;

            for (let idSlot in user.inv) {
                user.inv[idSlot].equipped = 0;
            }

            if (hadMovementRestriction && userClient) {
                handleProtocol.inmo(idUser, 0, userClient);
            }

            if (userClient) {
                scheduleDeadWorldTransition(idUser);
                handleProtocol.sendMyCharacter(user);
                socket.send(userClient);
            } else {
                user.deadWorldTransitionEndsAt = Date.now() + DEAD_WORLD_DELAY_MS;
            }

            loopAreaByUserId(idUser, function (target: AreaTarget) {
                if (!target.isNpc) {
                    const targetClient = getClientById(target.id);

                    if (targetClient) {
                        handleProtocol.putBodyAndHeadDead(idUser, targetClient);
                    }
                }
            });

            if (shouldSyncVisibilityState) {
                syncCharacterVisibilityForOthers(idUser);
            }
        } catch (err) {
            funct.dumpError(err);
            return false;
        }
    };

    this.setSpellInvisibility = function (idUser: EntityId, enabled: boolean) {
        setSpellInvisibility(idUser, enabled);
    };

    this.clearPartyInvitation = function (idUser: EntityId) {
        clearPartyInvitation(getCharacterById(idUser));
    };

    this.syncPartyStateForMember = function (idUser: EntityId) {
        const user = getCharacterById(idUser);

        if (!user) {
            return;
        }

        const party = normalizePartyMembership(user);

        if (party) {
            syncPartyState(party.id);
            return;
        }

        sendPartyStateToUser(idUser);
    };

    this.syncClanStateForMember = function (idUser: EntityId) {
        const user = getCharacterById(idUser);

        if (!user?.clanId) {
            sendClanStateToUser(idUser);
            return;
        }

        syncClanState(user.clanId);
    };

    this.syncClanState = function (clanId?: string | null) {
        syncClanState(clanId);
    };

    this.refreshRelationshipIndexesForMember = function (
        idUser: EntityId,
        previousPartyId?: string | null,
        previousClanId?: string | null,
    ) {
        const user = getCharacterById(idUser);

        updatePartyIndexForUser(user, previousPartyId ?? user?.partyId);
        updateClanIndexForUser(user, previousClanId ?? user?.clanId);
    };

    this.clearRelationshipStateCache = function (idUser: EntityId) {
        clearRelationshipStateCache(idUser);
    };

    this.inviteToParty = function (idUser: EntityId, targetId: EntityId) {
        const user = getCharacterById(idUser);
        const target = getCharacterById(targetId);

        if (!user || !target) {
            return { ok: false, message: "El usuario no está disponible." };
        }

        if (!user.connected || user.cerrado || !hasOpenClientById(user.id)) {
            return { ok: false, message: "Tu personaje no tiene una conexión válida en este momento." };
        }

        if (!target.connected || target.cerrado || !hasOpenClientById(target.id)) {
            return { ok: false, message: `${target.nameCharacter} no está online.` };
        }

        if (isSameEntityId(idUser, targetId)) {
            return { ok: false, message: "No puedes invitarte a ti mismo." };
        }

        normalizePartyMembership(user);
        normalizePartyMembership(target);

        if (target.partyId) {
            return { ok: false, message: `${target.nameCharacter} ya está en una party.` };
        }

        const party = normalizePartyMembership(user);

        if (party) {
            if (!isSameEntityId(party.leaderId, idUser)) {
                return { ok: false, message: "Solo el líder de la party puede invitar jugadores." };
            }

            if (party.memberIds.length >= PARTY_MAX_MEMBERS) {
                return { ok: false, message: "La party ya alcanzó el máximo de 4 miembros." };
            }
        }

        if (!arePartyAlignmentsCompatible(user, target)) {
            return {
                ok: false,
                message: "Solo puedes hacer party con personas de tu misma facción.",
            };
        }

        target.partyInvitationFrom = idUser;
        target.partyInvitationExpiresAt = Date.now() + PARTY_INVITATION_MS;

        return { ok: true, message: `${target.nameCharacter} recibió la invitación a tu party.` };
    };

    this.acceptPartyInvitation = function (idUser: EntityId) {
        const user = getCharacterById(idUser);

        if (!user) {
            return { ok: false, message: "No se pudo procesar la invitación." };
        }

        normalizePartyMembership(user);

        if (user.partyId) {
            clearPartyInvitation(user);
            return { ok: false, message: "Ya estás en una party." };
        }

        if (
            !user.partyInvitationFrom ||
            !user.partyInvitationExpiresAt ||
            user.partyInvitationExpiresAt <= Date.now()
        ) {
            clearPartyInvitation(user);
            return { ok: false, message: "No tienes ninguna invitación de party pendiente." };
        }

        const inviter = getCharacterById(user.partyInvitationFrom);

        if (!inviter || !inviter.connected || inviter.cerrado || !hasOpenClientById(inviter.id)) {
            clearPartyInvitation(user);
            return { ok: false, message: "La invitación ya no es válida." };
        }

        let party = normalizePartyMembership(inviter);

        if (!party) {
            const partyId = `party-${Date.now()}-${inviter.id}`;
            party = {
                id: partyId,
                leaderId: inviter.id,
                memberIds: [inviter.id],
            };
            vars.parties[partyId] = party;
            const previousInviterPartyId = inviter.partyId;
            inviter.partyId = partyId;
            inviter.partyLeaderId = inviter.id;
            updatePartyIndexForUser(inviter, previousInviterPartyId);
        }

        if (!isSameEntityId(party.leaderId, inviter.id)) {
            clearPartyInvitation(user);
            return { ok: false, message: "Solo el líder original puede sumar nuevos miembros." };
        }

        if (party.memberIds.length >= PARTY_MAX_MEMBERS) {
            clearPartyInvitation(user);
            return { ok: false, message: "La party ya alcanzó el máximo de 4 miembros." };
        }

        if (!isPartyCompatibleWithUser(party, user)) {
            clearPartyInvitation(user);
            return {
                ok: false,
                message: "Solo puedes hacer party con personas de tu misma facción.",
            };
        }

        if (!party.memberIds.some((memberId) => isSameEntityId(memberId, user.id))) {
            party.memberIds.push(user.id);
        }

        const previousUserPartyId = user.partyId;
        user.partyId = party.id;
        user.partyLeaderId = party.leaderId;
        clearPartyInvitation(user);
        updatePartyIndexForUser(user, previousUserPartyId);

        party.memberIds.forEach((memberId) => {
            const member = getCharacterById(memberId);

            if (member) {
                const previousMemberPartyId = member.partyId;
                member.partyId = party!.id;
                member.partyLeaderId = party!.leaderId;
                updatePartyIndexForUser(member, previousMemberPartyId);
            }
        });

        syncPartyState(party.id);
        return { ok: true, message: `Te uniste a la party de ${inviter.nameCharacter}.` };
    };

    this.leaveParty = function (idUser: EntityId) {
        const user = getCharacterById(idUser);
        const party = normalizePartyMembership(user);

        if (!user || !party) {
            if (user) {
                user.partyId = null;
                user.partyLeaderId = null;
            }

            return { ok: false, message: "No estás en una party." };
        }

        const previousPartyId = user.partyId;
        party.memberIds = party.memberIds.filter((memberId) => !isSameEntityId(memberId, idUser));
        user.partyId = null;
        user.partyLeaderId = null;
        updatePartyIndexForUser(user, previousPartyId);

        if (isSameEntityId(party.leaderId, idUser)) {
            disbandParty(party.id);
            sendPartyStateToUser(idUser);
            return { ok: true, message: "Disolviste la party." };
        }

        if (party.memberIds.length <= 1) {
            disbandParty(party.id);
            sendPartyStateToUser(idUser);
            return { ok: true, message: "Saliste de la party." };
        }

        party.memberIds.forEach((memberId) => {
            const member = getCharacterById(memberId);

            if (member) {
                member.partyLeaderId = party.leaderId;
            }
        });

        sendPartyStateToUser(idUser);
        syncPartyState(party.id);
        return { ok: true, message: "Saliste de la party." };
    };

    this.kickPartyMember = function (idUser: EntityId, targetId: EntityId) {
        const user = getCharacterById(idUser);
        const target = getCharacterById(targetId);
        const party = normalizePartyMembership(user);

        if (!user || !target || !party) {
            return { ok: false, message: "No se pudo procesar la party." };
        }

        if (!isSameEntityId(party.leaderId, idUser)) {
            return { ok: false, message: "Solo el líder de la party puede echar miembros." };
        }

        if (isSameEntityId(idUser, targetId)) {
            return { ok: false, message: "No puedes echarte a ti mismo. Usa /salirparty para cerrar la party." };
        }

        if (!isSameParty(idUser, targetId)) {
            return { ok: false, message: `${target.nameCharacter} no está en tu party.` };
        }

        const previousTargetPartyId = target.partyId;
        party.memberIds = party.memberIds.filter((memberId) => !isSameEntityId(memberId, targetId));
        target.partyId = null;
        target.partyLeaderId = null;
        updatePartyIndexForUser(target, previousTargetPartyId);
        sendPartyStateToUser(targetId);

        if (party.memberIds.length <= 1) {
            disbandParty(party.id);
            syncPartyState(party.id);
            return { ok: true, message: `${target.nameCharacter} fue expulsado de la party.` };
        }

        syncPartyState(party.id);
        return { ok: true, message: `${target.nameCharacter} fue expulsado de la party.` };
    };

    this.interruptPendingLogoutOnAttack = function (idUser: EntityId, reason?: string) {
        interruptPendingLogoutOnAttack(idUser, reason);
    };

    /**
     * [revivirUsuario description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.revivirUsuario = function (
        idUser: EntityId,
        options?: {
            hp?: number;
            mana?: number;
        },
    ) {
        try {
            const session = getOnlineSessionById(idUser);

            if (!session) {
                return 0;
            }

            const { user, client } = session;
            const reviveOnWater = game.hayAgua(user.map, user.pos);

            resetFuerzaAgilidadBuffs(user, client);

            if (user.navegando && !reviveOnWater) {
                console.log(
                    `[revive] Clearing sailing state for ${user.nameCharacter} at ${user.map}@${user.pos.x},${user.pos.y}`,
                );
                user.navegando = 0;
            }

            user.hp = Math.max(0, Math.min(Number(options?.hp ?? user.maxHp), user.maxHp));
            user.mana = Math.max(0, Math.min(Number(options?.mana ?? user.mana), user.maxMana));
            user.dead = 0;
            clearDeadWorldTransition(user);
            user.deadWorldActive = false;
            user.deadWorldTransitionEndsAt = 0;

            if (user.navegando && reviveOnWater) {
                applyBoatVisualState(user);
            } else {
                user.idBody = game.bodyNaked(idUser);
                user.idHead = user.idLastHead;
            }

            if (isAdminSummonedBot(user)) {
                restoreAutoEquippedInventoryState(user);
                enforceAdminSummonedBotMaxBuffs(user, Date.now());
                user.nextUseItemAt = 0;
                user.nextUseItemAfterMeleeAt = 0;
            }

            handleProtocol.selfVitalsDelta(
                {
                    hp: user.hp,
                    maxHp: user.maxHp,
                    mana: user.mana,
                    maxMana: user.maxMana,
                },
                client,
            );
            handleProtocol.selfMapMetaDelta(
                {
                    navegando: Number(user.navegando ?? 0),
                },
                client,
            );
            handleProtocol.changeBody(idUser, client);
            syncVisibleCharactersForViewer(idUser);
            game.syncUserNpcVisibility(idUser);

            if (isAdminSummonedBot(user)) {
                broadcastCharacterVitalsDelta(user);
                broadcastCharacterSnapshot(user);
            }

            game.loopArea(client, function (target: AreaTarget) {
                if (!target.isNpc) {
                    const targetClient = getClientById(target.id);

                    if (!targetClient) {
                        return;
                    }

                    handleProtocol.revivirUsuario(idUser, targetClient);
                    handleProtocol.changeBody(idUser, targetClient);
                    handleProtocol.sendCharacter(user as any, target.id);
                    socket.send(targetClient);
                }
            });
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    this.resetFuerzaAgilidadBuffs = function (idUser: EntityId) {
        const session = getOnlineSessionById(idUser);

        if (!session) {
            return;
        }

        resetFuerzaAgilidadBuffs(session.user, session.client);
    };

    /**
     * [checkUserLevel description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.checkUserLevel = function (idUser: EntityId) {
        try {
            const session = getOnlineSessionById(idUser);
            let leveledUp = false;

            if (!session) {
                return;
            }

            const { user, client } = session;

            normalizeExperienceFields(user);

            if (user.exp < user.expNextLevel) {
                handleProtocol.actExp(user.exp, client);
                return;
            }

            while (user.exp >= user.expNextLevel) {
                if (user.level >= balance.MAX_EXP_LEVEL) {
                    break;
                }

                user.level++;
                leveledUp = true;
                user.exp -= user.expNextLevel;

                user.expNextLevel = balance.getLegacyExpNextLevelForLevel(user.level);

                const newMaxHp = balance.getMaxHpForLevel(user.idClase, user.attrConstitucion, user.level);
                const newMaxMana = balance.getMaxManaForLevel(user.idClase, user.attrInteligencia, user.level);
                const newMinHit = balance.getMinHitForLevel(user.idClase, user.level);
                const newMaxHit = balance.getMaxHitForLevel(user.idClase, user.level);

                const aumentoHP = newMaxHp - user.maxHp;
                const aumentoMana = newMaxMana - user.maxMana;
                const aumentoHIT = newMaxHit - user.maxHit;

                user.maxHp = newMaxHp;
                user.hp = user.maxHp;
                user.maxMana = newMaxMana;
                user.mana = user.maxMana;

                user.minHit = newMinHit;
                user.maxHit = newMaxHit;

                handleProtocol.console("¡Has subido a nivel " + user.level + "!", "red", 1, 0, client);

                handleProtocol.console("¡Has ganado " + aumentoHP + " puntos de vida!", "red", 1, 0, client);

                if (aumentoMana) {
                    handleProtocol.console("¡Has ganado " + aumentoMana + " puntos de maná!", "red", 1, 0, client);
                }

                handleProtocol.console("¡Tu golpe máximo aumento en " + aumentoHIT + " puntos!", "red", 1, 0, client);
                handleProtocol.console("¡Tu golpe mínimo aumento en " + aumentoHIT + " puntos!", "red", 1, 0, client);

                handleProtocol.actMyLevel(idUser, client);
                unequipRestrictedNewbieItems(user, client);
            }

            if (leveledUp) {
                relocateUserIfCurrentMapLevelDenied(user, client, `checkUserLevel ${user.level}`);
            }
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    this.setSummonTargetNpc = function (idUser: EntityId, idNpc: EntityId) {
        try {
            const user = vars.personajes[idUser] as GameCharacter | undefined;
            const npc = vars.npcs[idNpc] as GameNpc | undefined;

            if (!user) {
                return;
            }

            if (!npc || npc.map !== user.map || npc.hp <= 0 || npc.summonedByUserId) {
                user.summonTargetNpcId = 0;
                return;
            }

            user.summonTargetNpcId = idNpc;
        } catch (err) {
            funct.dumpError(err);
        }
    };

    this.clearSummonTargetNpc = function (idUser: EntityId) {
        try {
            const user = vars.personajes[idUser] as GameCharacter | undefined;

            if (!user) {
                return;
            }

            user.summonTargetNpcId = 0;
        } catch (err) {
            funct.dumpError(err);
        }
    };

    /**
     * [quitarUserInvItem description]
     * @param  {[type]} idUser [description]
     * @param  {[type]} idPos  [description]
     * @param  {[type]} cant   [description]
     * @return {[type]}        [description]
     */
    this.quitarUserInvItem = function (idUser: EntityId, idPos: number | string, cant: number) {
        try {
            const user = getCharacterById(idUser);

            if (!user) {
                return 0;
            }

            const normalizedPos = String(idPos);
            const item = user.inv[normalizedPos];

            if (user.pvpChar) return;

            if (!item) {
                syncUnequippedItemVisuals(user, normalizedPos);

                return 0;
            }

            item.cant -= cant;

            const client = getClientById(idUser);

            if (client) {
                handleProtocol.quitarUserInvItem(idUser, normalizedPos, cant, client);
            }

            if (item.cant <= 0) {
                item.equipped = 0;
                syncUnequippedItemVisuals(user, normalizedPos);

                delete user.inv[normalizedPos];
            }
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    this.reorderSpell = async function (idUser: EntityId, sourceSlot: number, targetSlot: number): Promise<void> {
        const user = vars.personajes[idUser] as GameCharacter | undefined;

        if (!user) {
            return;
        }

        user.spells = normalizeSpellRecord(user.spells);

        const sourceKey = String(sourceSlot);
        const targetKey = String(targetSlot);
        const sourceSpell = user.spells[sourceKey];
        const targetSpell = user.spells[targetKey];

        if (!sourceSpell || !targetSpell) {
            return;
        }

        user.spells[sourceKey] = targetSpell;
        user.spells[targetKey] = sourceSpell;

        await persistCharacterSpells(user);
    };

    /**
     * [userSpellNpc description]
     * @param  {[type]} idUser  [description]
     * @param  {[type]} idNpc   [description]
     * @param  {[type]} idSpell [description]
     * @return {[type]}         [description]
     */
    this.userSpellNpc = function (idUser: EntityId, idNpc: EntityId, idSpell: number): number | SpellEffect {
        try {
            const user = getCharacterById(idUser);
            const npc = vars.npcs[idNpc];

            if (!user || !npc) {
                return 0;
            }

            const datSpell = vars.datSpell[idSpell];
            const isHostileSpell = Boolean(datSpell.paraliza || datSpell.inmoviliza || datSpell.subeHp == 2);

            if (Number(datSpell?.subeHp ?? 0) === 1) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console(
                        "No puedes lanzar hechizos de curación sobre NPCs.",
                        "white",
                        0,
                        0,
                        userClient,
                    );
                });
                return 0;
            }

            let dmg = 0;
            let spellEffect: "Paraliza" | "Inmoviliza" | null = null;

            if (isHostileSpell) {
                markNpcAggressor(idNpc, idUser);
            }

            if (datSpell.paraliza) {
                if (npc.npcType == 6) {
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console(
                            "Este hechizo no funciona sobre esta criatura.",
                            "white",
                            1,
                            0,
                            userClient,
                        );
                    });
                    return 0;
                } else {
                    npc.paralizado = 1;
                    npc.cooldownParalizado = +Date.now();
                    broadcastNpcSnapshot(npc);

                    spellEffect = "Paraliza";
                }
            } else if (datSpell.inmoviliza) {
                if (npc.npcType == 6) {
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console(
                            "Este hechizo no funciona sobre esta criatura.",
                            "white",
                            1,
                            0,
                            userClient,
                        );
                    });
                    return 0;
                } else {
                    npc.inmovilizado = 1;
                    npc.cooldownParalizado = +Date.now();
                    broadcastNpcSnapshot(npc);

                    spellEffect = "Inmoviliza";
                }
            } else {
                if (datSpell.subeHp === 1) {
                    //Cura HP
                    let curo = funct.randomIntFromInterval(datSpell.minHp, datSpell.maxHp);

                    curo += Math.round((curo * (3 * user.level)) / 100);

                    if (curo < 1) {
                        curo = 1;
                    }

                    if (npc.hp + curo > npc.maxHp) {
                        curo = npc.maxHp - npc.hp;
                    }

                    npc.hp += curo;

                    dmg = -curo;
                } else if (datSpell.subeHp == 2) {
                    //Resta HP
                    const magicCalc = applyMagicBonuses(
                        funct.randomIntFromInterval(datSpell.minHp, datSpell.maxHp),
                        user,
                    );
                    dmg = applyMagicResistanceToNpc(magicCalc.damage, user, npc, magicCalc.magicPenetration);

                    if (dmg < 1) {
                        dmg = 1;
                    }

                    npc.hp -= dmg;
                }
            }

            withUserClient(idUser, (userClient) => {
                handleProtocol.console(
                    "Has lanzado " + datSpell.name + " sobre " + npc.nameCharacter,
                    "red",
                    1,
                    0,
                    userClient, undefined, undefined, npc.nameCharacter,
                );
            });

            if (dmg > 0) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console(
                        "Le has quitado " + dmg + " puntos de vida a " + npc.nameCharacter,
                        "red",
                        1,
                        0,
                        userClient, undefined, undefined, npc.nameCharacter,
                    );
                });

                game.loopAreaPos(npc.map, npc.pos, function (target: GameCharacter) {
                    withUserClient(target.id, (targetClient) => {
                        handleProtocol.playSound(
                            idNpc,
                            npc.snd2 > 0 ? npc.snd2 : vars.arSounds.SND_IMPACTO2,
                            targetClient,
                        );
                    });
                });

                game.calcularExp(idUser, idNpc, dmg);
            } else if (dmg < 0) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console(
                        "Le has curado " + Math.abs(dmg) + " puntos de vida a " + npc.nameCharacter,
                        "red",
                        1,
                        0,
                        userClient, undefined, undefined, npc.nameCharacter,
                    );
                });
            }

            if (dmg !== 0) {
                broadcastNpcVitalsDelta(npc);
            }

            return spellEffect ?? dmg;
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    /**
     * [userSpellUser description]
     * @param  {[type]} idUser         [description]
     * @param  {[type]} idUserAttacked [description]
     * @param  {[type]} idSpell        [description]
     * @return {[type]}                [description]
     */
    this.userSpellUser = function (
        idUser: EntityId,
        idUserAttacked: EntityId,
        idSpell: number,
    ): number | UserSpellEffect {
        try {
            const user = getCharacterById(idUser);
            const userAttacked = getCharacterById(idUserAttacked);

            if (!user || !userAttacked) {
                return 0;
            }

            if (idUser !== idUserAttacked && (isJailTile(user) || isJailTile(userAttacked))) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console(
                        "No puedes lanzar hechizos sobre otros usuarios en la carcel.",
                        "white",
                        0,
                        0,
                        userClient,
                    );
                });
                return 0;
            }

            const arenaCombat = isArenaCombat(user, userAttacked);
            const challengeCombatRelation = getChallengeManager().getCombatRelation(user, userAttacked);

            if (
                vars.mapData[user.map].pk &&
                !user.isNpc &&
                idUser != idUserAttacked &&
                isBlockedBySafeZone(user, userAttacked)
            ) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console(
                        "No puedes atacar a otro usuario estando en una zona segura.",
                        "white",
                        0,
                        0,
                        userClient,
                    );
                });
                return 0;
            }

            const datSpell = vars.datSpell[idSpell];
            const removesInvisibility = String(datSpell.name ?? "").toLowerCase() === "remover invisibilidad";
            const isOffensiveSpell = Boolean(
                idUser !== idUserAttacked &&
                (datSpell.paraliza || datSpell.inmoviliza || datSpell.subeHp == 2 || removesInvisibility),
            );

            if (datSpell.invisibilidad && getChallengeManager().isCharacterInActiveMatch(user)) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console(
                        "[Retos] No puedes usar invisibilidad dentro de la arena.",
                        "white",
                        0,
                        0,
                        userClient,
                    );
                });
                return 0;
            }

            if (challengeCombatRelation === "ally" && isOffensiveSpell) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console(
                        "[Retos] No puedes atacar a tu compañero de equipo.",
                        "white",
                        0,
                        0,
                        userClient,
                    );
                });
                return 0;
            }

            if (
                challengeCombatRelation !== "enemy" &&
                isSameParty(idUser, idUserAttacked) &&
                idUser !== idUserAttacked &&
                isOffensiveSpell
            ) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console("No puedes atacar a un miembro de tu party.", "white", 0, 0, userClient);
                });
                return 0;
            }

            if (
                challengeCombatRelation !== "enemy" &&
                user.seguroClanActivado &&
                isSameClan(idUser, idUserAttacked) &&
                idUser !== idUserAttacked &&
                isOffensiveSpell &&
                isBlockedBySafeZone(user, userAttacked)
            ) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console("No puedes atacar a un miembro de tu clan.", "white", 0, 0, userClient);
                });
                return 0;
            }

            if (
                idUser !== idUserAttacked &&
                !user.criminal &&
                userAttacked.criminal &&
                isSupportSpell(datSpell) &&
                !canCitizenSupportCriminal(user, userAttacked)
            ) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console(
                        "Los ciudadanos no pueden lanzar hechizos de soporte sobre criminales.",
                        "white",
                        0,
                        0,
                        userClient,
                    );
                });
                return 0;
            }

            if (isOffensiveSpell) {
                interruptPendingLogoutOnAttack(idUserAttacked);
            }

            let dmg = 0;
            let spellEffect:
                | "Paraliza"
                | "Inmoviliza"
                | "Remueve"
                | "Agilidad"
                | "Fuerza"
                | "Invisibilidad"
                | "RemueveInvisibilidad"
                | null = null;

            if (datSpell.paraliza) {
                if (idUser == idUserAttacked) {
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console("¡No puedes atacarte a ti mismo!", "white", 1, 0, userClient);
                    });
                    return 0;
                }

                if (userAttacked.paralizado || userAttacked.inmovilizado) {
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console("El objetivo ya está paralizado", "white", 1, 0, userClient);
                    });
                    return 0;
                }

                if (!applyOpenWorldAttackRules(user, userAttacked, arenaCombat)) {
                    return 0;
                }

                markUsersInPvpCombat(user, userAttacked);

                const controlAppliedAt = Date.now();
                userAttacked.paralizado = 1;
                userAttacked.cooldownParalizado = controlAppliedAt;

                withUserClient(idUserAttacked, (targetClient) => {
                    handleProtocol.inmo(idUserAttacked, 2, targetClient);
                });
                broadcastCharacterSnapshot(userAttacked);

                spellEffect = "Paraliza";
            } else if (datSpell.inmoviliza) {
                if (idUser == idUserAttacked) {
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console("¡No puedes atacarte a ti mismo!", "white", 1, 0, userClient);
                    });
                    return 0;
                }

                if (userAttacked.paralizado || userAttacked.inmovilizado) {
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console("El objetivo ya está inmobilizado", "white", 1, 0, userClient);
                    });
                    return 0;
                }

                if (!applyOpenWorldAttackRules(user, userAttacked, arenaCombat)) {
                    return 0;
                }

                markUsersInPvpCombat(user, userAttacked);

                const controlAppliedAt = Date.now();
                userAttacked.inmovilizado = 1;
                userAttacked.cooldownParalizado = controlAppliedAt;

                withUserClient(idUserAttacked, (targetClient) => {
                    handleProtocol.inmo(idUserAttacked, 1, targetClient);
                });
                broadcastCharacterSnapshot(userAttacked);

                spellEffect = "Inmoviliza";
            } else if (datSpell.removerParalisis) {
                if (!userAttacked.inmovilizado && !userAttacked.paralizado) {
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console("El objetivo no está paralizado", "white", 1, 0, userClient);
                    });
                    return 0;
                }

                if (Number(userAttacked.challengeLockedUntil ?? 0) > Date.now()) {
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console(
                            "[Retos] Ese personaje sigue inmovilizado por la cuenta regresiva.",
                            "white",
                            1,
                            0,
                            userClient,
                        );
                    });
                    return 0;
                }

                userAttacked.inmovilizado = 0;
                userAttacked.paralizado = 0;
                userAttacked.cooldownParalizado = 0;

                withUserClient(idUserAttacked, (targetClient) => {
                    handleProtocol.inmo(idUserAttacked, 0, targetClient);
                });
                broadcastCharacterSnapshot(userAttacked);

                spellEffect = "Remueve";
            } else if (datSpell.invisibilidad) {
                setSpellInvisibility(idUserAttacked, true);
                spellEffect = "Invisibilidad";
            } else if (removesInvisibility) {
                setSpellInvisibility(idUserAttacked, false);
                spellEffect = "RemueveInvisibilidad";
            } else {
                if (datSpell.subeHp === 1) {
                    //Cura HP
                    let curo = funct.randomIntFromInterval(datSpell.minHp, datSpell.maxHp);

                    curo += Math.round((curo * (3 * user.level)) / 100);

                    if (curo < 1) {
                        curo = 1;
                    }

                    if (userAttacked.hp + curo > userAttacked.maxHp) {
                        curo = userAttacked.maxHp - userAttacked.hp;
                    }

                    userAttacked.hp += curo;

                    dmg = -curo;
                } else if (datSpell.subeHp == 2) {
                    //Resta HP
                    if (idUser == idUserAttacked) {
                        withUserClient(idUser, (userClient) => {
                            handleProtocol.console("¡No puedes atacarte a ti mismo!", "white", 1, 0, userClient);
                        });
                        return 0;
                    }

                    if (!applyOpenWorldAttackRules(user, userAttacked, arenaCombat)) {
                        return 0;
                    }

                    markUsersInPvpCombat(user, userAttacked);

                    breakUserInvisibilityOnPvPDamageAttack(idUser);

                    const magicCalc = applyMagicBonuses(
                        funct.randomIntFromInterval(datSpell.minHp, datSpell.maxHp),
                        user,
                    );
                    dmg = applyMagicResistanceToUser(magicCalc.damage, user, userAttacked, magicCalc.magicPenetration);

                    if (dmg < 1) {
                        dmg = 1;
                    }

                    userAttacked.hp -= dmg;
                } else if (datSpell.subeAg === 1) {
                    withUserClient(idUserAttacked, (targetClient) => {
                        refreshAgilityBuff(userAttacked, datSpell.minAg, datSpell.maxAg, targetClient);
                    });
                    spellEffect = "Agilidad";
                } else if (datSpell.subeFz === 1) {
                    withUserClient(idUserAttacked, (targetClient) => {
                        refreshStrengthBuff(userAttacked, datSpell.minFz, datSpell.maxFz, targetClient);
                    });
                    spellEffect = "Fuerza";
                }
            }

            if (idUser == idUserAttacked) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console("Has lanzado " + datSpell.name + " sobre ti.", "red", 1, 0, userClient);
                });
            } else {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console(
                        "Has lanzado " + datSpell.name + " sobre " + userAttacked.nameCharacter,
                        "red",
                        1,
                        0,
                        userClient,
                    );
                });
                withUserClient(idUserAttacked, (targetClient) => {
                    handleProtocol.console(
                        user.nameCharacter + " ha lanzado " + datSpell.name + " sobre ti",
                        "red",
                        1,
                        0,
                        targetClient,
                    );
                });
            }

            if (dmg > 0) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console(
                        "Le has quitado " + dmg + " puntos de vida a " + userAttacked.nameCharacter,
                        "red",
                        1,
                        0,
                        userClient,
                    );
                });
                withUserClient(idUserAttacked, (targetClient) => {
                    handleProtocol.console(
                        user.nameCharacter + " te ha quitado " + dmg + " puntos de vida",
                        "red",
                        1,
                        0,
                        targetClient,
                    );
                });
            } else if (dmg < 0) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console(
                        "Le has curado " + Math.abs(dmg) + " puntos de vida a " + userAttacked.nameCharacter,
                        "red",
                        1,
                        0,
                        userClient,
                    );
                });
                withUserClient(idUserAttacked, (targetClient) => {
                    handleProtocol.console(
                        user.nameCharacter + " te ha curado " + Math.abs(dmg) + " puntos de vida",
                        "red",
                        1,
                        0,
                        targetClient,
                    );
                });
            }

            if (dmg !== 0) {
                withUserClient(idUserAttacked, (targetClient) => {
                    handleProtocol.updateHP(userAttacked.hp, targetClient);
                });

                if (isAdminSummonedBot(userAttacked)) {
                    broadcastCharacterVitalsDelta(userAttacked);
                }
            }

            return spellEffect ?? dmg;
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    /**
     * [calcularDmg description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.calcularDmg = function (idUser: EntityId): number {
        try {
            const user = getCharacterById(idUser);

            if (!user) {
                return 0;
            }

            let dmgArma = 0;
            let dmgMaxArma = 0;
            let modClase = 0;

            if (user.idItemWeapon) {
                const itemInventary = getInventoryItem(user, user.idItemWeapon);

                if (!itemInventary) {
                    return 0;
                }

                const idItem = itemInventary.idItem;
                const itemWeapon = vars.datObj[idItem];

                dmgArma = funct.randomIntFromInterval(itemWeapon.minHit, itemWeapon.maxHit);

                if (itemWeapon.proyectil) {
                    const itemInventaryArrow = getInventoryItem(user, user.idItemArrow);

                    if (!itemInventaryArrow) {
                        return 0;
                    }

                    const idItemArrow = itemInventaryArrow.idItem;
                    const itemArrow = vars.datObj[idItemArrow];

                    dmgArma += funct.randomIntFromInterval(itemArrow.minHit, itemArrow.maxHit);

                    modClase = vars.modDmgProyectiles[user.idClase];
                } else {
                    modClase = vars.modDmgArmas[user.idClase];
                }

                dmgMaxArma = itemWeapon.maxHit;
            } else {
                dmgArma = funct.randomIntFromInterval(4, 9);
                modClase = vars.modDmgWrestling[user.idClase];

                dmgMaxArma = 9;
            }

            const dmgUser = funct.randomIntFromInterval(user.minHit, user.maxHit);

            const dmg = Math.floor(
                (3 * dmgArma + (dmgMaxArma / 5) * Math.max(0, user.attrFuerza - 15) + dmgUser) * modClase,
            );

            return dmg;
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    /**
     * [userDmgNpc description]
     * @param  {[type]} idUser [description]
     * @param  {[type]} idNpc  [description]
     * @return {[type]}        [description]
     */
    this.userDmgNpc = function (idUser: EntityId, idNpc: EntityId): CombatResult {
        try {
            const user = getCharacterById(idUser);
            const npc = vars.npcs[idNpc];

            if (!user || !npc) {
                return 0;
            }

            markNpcAggressor(idNpc, idUser);

            const poderAtaque = game.poderAtaqueArma(idUser);

            let probExito = clampChance(50 + (poderAtaque - npc.poderEvasion) * 0.4);

            const userImpacto = funct.randomIntFromInterval(1, 100) <= probExito;

            if (userImpacto) {
                const weaponItem = getInventoryItem(user, user.idItemWeapon);
                const weaponItemId = Number(weaponItem?.idItem ?? 0);
                const isDragonSlayerHit =
                    isDragonSlayerSword(weaponItemId) && Number(npc.npcType ?? 0) === Number(vars.npcType.dragon);
                let dmg = game.calcularDmg(idUser);

                if (isDragonSlayerHit) {
                    dmg = Math.max(1, npc.hp);
                    npc.hp = 0;

                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console(
                            `La Espada Mata Dragones atraviesa a ${npc.nameCharacter} de un golpe y se consume.`,
                            "red",
                            1,
                            0,
                            userClient, undefined, undefined, npc.nameCharacter,
                        );
                    });

                    if (user.idItemWeapon) {
                        game.quitarUserInvItem(idUser, user.idItemWeapon, 1);
                    }
                } else {
                    dmg -= npc.def;

                    if (dmg < 1) {
                        dmg = 1;
                    }

                    npc.hp -= dmg;
                }

                let stabResult: StabResult = {
                    stabbed: false,
                    extraDamage: 0,
                    totalDamage: dmg,
                };

                if (!isDragonSlayerHit && npc.hp > 0 && game.puedeApu(idUser)) {
                    stabResult = game.apuNpc(idUser, idNpc, dmg);
                }

                if (stabResult.stabbed) {
                    emitNpcFxToArea(npc, COMBAT_STABBING_FX_ID);
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console(
                            "¡Has apuñalado a " + npc.nameCharacter + " por " + stabResult.totalDamage + "!",
                            "red",
                            1,
                            0,
                            userClient, undefined, undefined, npc.nameCharacter,
                        );
                    });
                } else {
                    emitNpcFxToArea(npc, COMBAT_HIT_FX_ID);
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console(
                            "Le has pegado a " + npc.nameCharacter + " por " + dmg,
                            "red",
                            1,
                            0,
                            userClient, undefined, undefined, npc.nameCharacter,
                        );
                    });
                }

                game.loopAreaPos(npc.map, npc.pos, function (target: GameCharacter) {
                    withUserClient(target.id, (targetClient) => {
                        handleProtocol.playSound(idUser, vars.arSounds.SND_IMPACTO, targetClient);
                        handleProtocol.playSound(
                            idNpc,
                            npc.snd2 > 0 ? npc.snd2 : vars.arSounds.SND_IMPACTO2,
                            targetClient,
                        );
                    });
                });

                game.calcularExp(idUser, idNpc, dmg);
                broadcastNpcVitalsDelta(npc);

                return stabResult.stabbed ? `¡${stabResult.totalDamage}!` : dmg;
            } else {
                emitNpcFxToArea(npc, COMBAT_MISS_FX_ID);
                game.loopAreaPos(user.map, user.pos, function (target: GameCharacter) {
                    withUserClient(target.id, (targetClient) => {
                        if (!canReceiveCharacterEvent(target.id, idUser)) {
                            return;
                        }

                        handleProtocol.playSound(idUser, vars.arSounds.SND_SWING, targetClient);
                    });
                });

                return "¡Fallas!";
            }
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    /**
     * [userDmgUser description]
     * @param  {[type]} idUser         [description]
     * @param  {[type]} idUserAttacked [description]
     * @return {[type]}                [description]
     */
    this.userDmgUser = function (idUser: EntityId, idUserAttacked: EntityId): CombatResult {
        try {
            const user = getCharacterById(idUser);
            const userAttacked = getCharacterById(idUserAttacked);

            if (!user || !userAttacked) {
                return 0;
            }

            if (idUser !== idUserAttacked && (isJailTile(user) || isJailTile(userAttacked))) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console(
                        "No puedes atacar a otros usuarios en la carcel.",
                        "white",
                        0,
                        0,
                        userClient,
                    );
                });
                return 0;
            }

            const arenaCombat = isArenaCombat(user, userAttacked);
            const challengeCombatRelation = getChallengeManager().getCombatRelation(user, userAttacked);

            if (idUser == idUserAttacked) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console("¡No puedes atacarte a ti mismo!", "white", 0, 0, userClient);
                });
                return 0;
            }

            if (challengeCombatRelation === "ally") {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console(
                        "[Retos] No puedes atacar a tu compañero de equipo.",
                        "white",
                        0,
                        0,
                        userClient,
                    );
                });
                return 0;
            }

            if (challengeCombatRelation !== "enemy" && isSameParty(idUser, idUserAttacked)) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console("No puedes atacar a un miembro de tu party.", "white", 0, 0, userClient);
                });
                return 0;
            }

            if (
                challengeCombatRelation !== "enemy" &&
                user.seguroClanActivado &&
                isSameClan(idUser, idUserAttacked) &&
                isBlockedBySafeZone(user, userAttacked)
            ) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console("No puedes atacar a un miembro de tu clan.", "white", 0, 0, userClient);
                });
                return 0;
            }

            if (
                vars.mapData[user.map].pk &&
                !userAttacked.isNpc &&
                idUser != idUserAttacked &&
                isBlockedBySafeZone(user, userAttacked)
            ) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console(
                        "No puedes atacar a otro usuario estando en una zona segura.",
                        "white",
                        0,
                        0,
                        userClient,
                    );
                });
                return 0;
            }

            const poderAtaque = game.poderAtaqueArma(idUser);
            let userAttackedEvasion = game.poderEvasion(idUserAttacked),
                userAttackedPoderEvasionEscudo = game.poderEvasionEscudo(idUserAttacked);

            if (userAttacked.idItemShield) {
                userAttackedEvasion += userAttackedPoderEvasionEscudo;
            }

            let probExito = clampChance(50 + (poderAtaque - userAttackedEvasion) * 0.4);
            const hitRoll = funct.randomIntFromInterval(1, 100);
            const userImpacto = hitRoll <= probExito;

            let dmg = 0;
            let attackMissed = false;
            let stabResult: StabResult = {
                stabbed: false,
                extraDamage: 0,
                totalDamage: 0,
            };

            if (!applyOpenWorldAttackRules(user, userAttacked, arenaCombat)) {
                return 0;
            }

            markUsersInPvpCombat(user, userAttacked);

            interruptPendingLogoutOnAttack(idUserAttacked);

            if (userImpacto) {
                breakUserInvisibilityOnPvPDamageAttack(idUser);

                dmg = game.calcularDmg(idUser);

                const lugarCuerpo = getRandomBodyPart();

                let absorbeDmg = 0;

                switch (lugarCuerpo) {
                    case vars.partesCuerpo.cabeza:
                        if (userAttacked.idItemHelmet) {
                            const itemInventaryHelmet = getInventoryItem(userAttacked, userAttacked.idItemHelmet);

                            if (!itemInventaryHelmet) {
                                break;
                            }

                            const idItemHelmet = itemInventaryHelmet.idItem;
                            const itemHelmet = vars.datObj[idItemHelmet];

                            absorbeDmg = funct.randomIntFromInterval(itemHelmet.minDef, itemHelmet.maxDef);
                        }

                        break;
                    default:
                        let minDef = 0,
                            maxDef = 0;

                        if (userAttacked.idItemBody) {
                            const itemInventaryBody = getInventoryItem(userAttacked, userAttacked.idItemBody);

                            if (itemInventaryBody) {
                                const idItemBody = itemInventaryBody.idItem;
                                const itemBody = vars.datObj[idItemBody];

                                minDef = itemBody.minDef;
                                maxDef = itemBody.maxDef;
                            }
                        }

                        if (userAttacked.idItemShield) {
                            const itemInventaryShield = getInventoryItem(userAttacked, userAttacked.idItemShield);

                            if (itemInventaryShield) {
                                const idItemShield = itemInventaryShield.idItem;
                                const itemShield = vars.datObj[idItemShield];

                                minDef += itemShield.minDef;
                                maxDef += itemShield.maxDef;
                            }
                        }

                        if (maxDef > 0) {
                            absorbeDmg = funct.randomIntFromInterval(minDef, maxDef);
                        }
                        break;
                }

                dmg -= absorbeDmg;

                if (dmg < 1) {
                    dmg = 1;
                }

                userAttacked.hp -= dmg;

                stabResult = {
                    stabbed: false,
                    extraDamage: 0,
                    totalDamage: dmg,
                };

                if (userAttacked.hp > 0 && game.puedeApu(idUser)) {
                    stabResult = game.apuUser(idUser, idUserAttacked, dmg);
                }

                withUserClient(idUserAttacked, (targetClient) => {
                    handleProtocol.updateHP(userAttacked.hp, targetClient);
                });

                if (isAdminSummonedBot(userAttacked)) {
                    broadcastCharacterVitalsDelta(userAttacked);
                }

                if (stabResult.stabbed) {
                    emitCharacterFxToUserArea(idUserAttacked, COMBAT_STABBING_FX_ID);
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console(
                            "¡Has apuñalado a " + userAttacked.nameCharacter + " por " + stabResult.totalDamage + "!",
                            "red",
                            1,
                            0,
                            userClient,
                        );
                    });
                    withUserClient(idUserAttacked, (targetClient) => {
                        handleProtocol.console(
                            user.nameCharacter + " te ha apuñalado por " + stabResult.totalDamage + "!",
                            "red",
                            1,
                            0,
                            targetClient,
                        );
                    });
                } else {
                    emitCharacterFxToUserArea(idUserAttacked, COMBAT_HIT_FX_ID);
                    switch (lugarCuerpo) {
                        case vars.partesCuerpo.cabeza:
                            withUserClient(idUserAttacked, (targetClient) => {
                                handleProtocol.console(
                                    user.nameCharacter + " te ha pegado en la cabeza por " + dmg,
                                    "red",
                                    1,
                                    0,
                                    targetClient,
                                );
                            });
                            withUserClient(idUser, (userClient) => {
                                handleProtocol.console(
                                    "Le has pegado a " + userAttacked.nameCharacter + " en la cabeza por " + dmg,
                                    "red",
                                    1,
                                    0,
                                    userClient,
                                );
                            });
                            break;
                        case vars.partesCuerpo.piernaIzquierda:
                            withUserClient(idUserAttacked, (targetClient) => {
                                handleProtocol.console(
                                    user.nameCharacter + " te ha pegado en la pierna izquierda por " + dmg,
                                    "red",
                                    1,
                                    0,
                                    targetClient,
                                );
                            });
                            withUserClient(idUser, (userClient) => {
                                handleProtocol.console(
                                    "Le has pegado a " +
                                        userAttacked.nameCharacter +
                                        " en la pierna izquierda por " +
                                        dmg,
                                    "red",
                                    1,
                                    0,
                                    userClient,
                                );
                            });
                            break;
                        case vars.partesCuerpo.piernaDerecha:
                            withUserClient(idUserAttacked, (targetClient) => {
                                handleProtocol.console(
                                    user.nameCharacter + " te ha pegado en la pierna derecha por " + dmg,
                                    "red",
                                    1,
                                    0,
                                    targetClient,
                                );
                            });
                            withUserClient(idUser, (userClient) => {
                                handleProtocol.console(
                                    "Le has pegado a " +
                                        userAttacked.nameCharacter +
                                        " en la pierna derecha por " +
                                        dmg,
                                    "red",
                                    1,
                                    0,
                                    userClient,
                                );
                            });
                            break;
                        case vars.partesCuerpo.brazoDerecho:
                            withUserClient(idUserAttacked, (targetClient) => {
                                handleProtocol.console(
                                    user.nameCharacter + " te ha pegado en el brazo derecho por " + dmg,
                                    "red",
                                    1,
                                    0,
                                    targetClient,
                                );
                            });
                            withUserClient(idUser, (userClient) => {
                                handleProtocol.console(
                                    "Le has pegado a " + userAttacked.nameCharacter + " en el brazo derecho por " + dmg,
                                    "red",
                                    1,
                                    0,
                                    userClient,
                                );
                            });
                            break;
                        case vars.partesCuerpo.brazoIzquierdo:
                            withUserClient(idUserAttacked, (targetClient) => {
                                handleProtocol.console(
                                    user.nameCharacter + " te ha pegado en el brazo izquierdo por " + dmg,
                                    "red",
                                    1,
                                    0,
                                    targetClient,
                                );
                            });
                            withUserClient(idUser, (userClient) => {
                                handleProtocol.console(
                                    "Le has pegado a " +
                                        userAttacked.nameCharacter +
                                        " en el brazo izquierdo por " +
                                        dmg,
                                    "red",
                                    1,
                                    0,
                                    userClient,
                                );
                            });
                            break;
                        case vars.partesCuerpo.torso:
                            withUserClient(idUserAttacked, (targetClient) => {
                                handleProtocol.console(
                                    user.nameCharacter + " te ha pegado en el torso por " + dmg,
                                    "red",
                                    1,
                                    0,
                                    targetClient,
                                );
                            });
                            withUserClient(idUser, (userClient) => {
                                handleProtocol.console(
                                    "Le has pegado a " + userAttacked.nameCharacter + " en el torso por " + dmg,
                                    "red",
                                    1,
                                    0,
                                    userClient,
                                );
                            });
                            break;
                    }
                }

                loopAreaByUserId(idUser, function (target: AreaTarget) {
                    if (!target.isNpc) {
                        const targetClient = getClientById(target.id);

                        if (targetClient) {
                            if (!canReceiveCharacterEvent(target.id, user.id)) {
                                return;
                            }

                            handleProtocol.playSound(user.id, vars.arSounds.SND_IMPACTO, targetClient);
                        }
                    }
                });
            } else {
                let rechazo = false;

                if (userAttacked.idItemShield) {
                    const skillDefensa = game.getSkillDefensa(idUserAttacked);
                    const skillTacticasCombate = game.getSkillTacticasCombate(idUserAttacked);
                    const shield = getEquippedShieldData(userAttacked);
                    const shieldChancePercentage = Math.max(0, Number(shield?.porcentaje ?? 0));

                    if (shieldChancePercentage > 0) {
                        const probRechazo =
                            skillDefensa > 0
                                ? clampChance(
                                      shieldChancePercentage *
                                          (skillDefensa / Math.max(skillDefensa + skillTacticasCombate, 1)) *
                                          0.7,
                                      5,
                                      75,
                                  )
                                : 10;

                        rechazo = funct.randomIntFromInterval(1, 100) <= probRechazo;
                    }
                }

                attackMissed = true;

                if (rechazo) {
                    emitCharacterFxToUserArea(idUserAttacked, COMBAT_SHIELD_BLOCK_FX_ID);
                    withUserClient(idUserAttacked, (targetClient) => {
                        handleProtocol.console(
                            "¡Has bloqueado el golpe con el escudo a " + user.nameCharacter + "!",
                            "red",
                            1,
                            0,
                            targetClient,
                        );
                    });
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console(
                            userAttacked.nameCharacter + " te ha bloqueado el ataque con el escudo.",
                            "red",
                            1,
                            0,
                            userClient,
                        );
                    });

                    loopAreaByUserId(idUser, function (target: AreaTarget) {
                        if (!target.isNpc) {
                            const targetClient = getClientById(target.id);

                            if (targetClient) {
                                if (!canReceiveCharacterEvent(target.id, user.id)) {
                                    return;
                                }

                                handleProtocol.playSound(user.id, vars.arSounds.SND_ESCUDO, targetClient);
                            }
                        }
                    });
                } else {
                    emitCharacterFxToUserArea(idUserAttacked, COMBAT_MISS_FX_ID);
                    withUserClient(idUserAttacked, (targetClient) => {
                        handleProtocol.console(user.nameCharacter + " ha fallado un golpe.", "red", 1, 0, targetClient);
                    });
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console(
                            "Le has fallado un golpe a  " + userAttacked.nameCharacter,
                            "red",
                            1,
                            0,
                            userClient,
                        );
                    });

                    loopAreaByUserId(idUser, function (target: AreaTarget) {
                        if (!target.isNpc) {
                            const targetClient = getClientById(target.id);

                            if (targetClient) {
                                if (!canReceiveCharacterEvent(target.id, user.id)) {
                                    return;
                                }

                                handleProtocol.playSound(user.id, vars.arSounds.SND_SWING, targetClient);
                            }
                        }
                    });
                }
            }

            if (userAttacked.meditar) {
                userAttacked.meditar = false;

                withUserClient(idUserAttacked, (targetClient) => {
                    handleProtocol.console("Terminas de meditar.", "white", 0, 0, targetClient);
                });

                loopAreaByUserId(idUserAttacked, function (client: AreaTarget) {
                    if (!client.isNpc) {
                        const targetClient = getClientById(client.id);

                        if (targetClient) {
                            if (!canReceiveCharacterEvent(client.id, idUserAttacked)) {
                                return;
                            }

                            handleProtocol.animFX(idUserAttacked, 0, targetClient);
                        }
                    }
                });
            }

            return attackMissed ? "¡Fallas!" : stabResult.stabbed ? `¡${stabResult.totalDamage}!` : dmg;
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    /**
     * [apuNpc description]
     * @param  {[type]} idUser [description]
     * @param  {[type]} idNpc  [description]
     * @param  {[type]} dmg    [description]
     * @return {[type]}        [description]
     */
    this.apuNpc = function (idUser: EntityId, idNpc: EntityId, dmg: number): StabResult {
        try {
            const user = getCharacterById(idUser);
            const npc = vars.npcs[idNpc];

            if (!user || !npc) {
                return {
                    stabbed: false,
                    extraDamage: 0,
                    totalDamage: dmg,
                };
            }

            const skillApu = game.getSkillApu(idUser);
            const baseChance = skillApu * (STABBING_CHANCE_BY_CLASS[user.idClase] ?? STABBING_CHANCE_BY_CLASS[3]);
            const probExito = clampChance(baseChance);

            const chance = funct.randomIntFromInterval(1, 100);

            if (chance <= probExito) {
                const minMod = STABBING_NPC_MIN_MOD_BY_CLASS[user.idClase] ?? 1;
                const maxMod = STABBING_NPC_MAX_MOD_BY_CLASS[user.idClase] ?? minMod;
                const extraDamage = Math.floor(dmg * (Math.random() * (maxMod - minMod) + minMod));
                npc.hp -= extraDamage;

                game.calcularExp(idUser, idNpc, extraDamage);

                return {
                    stabbed: true,
                    extraDamage,
                    totalDamage: dmg + extraDamage,
                };
            }

            return {
                stabbed: false,
                extraDamage: 0,
                totalDamage: dmg,
            };
        } catch (err) {
            funct.dumpError(err);
            return {
                stabbed: false,
                extraDamage: 0,
                totalDamage: dmg,
            };
        }
    };

    /**
     * [apuUser description]
     * @param  {[type]} idUser         [description]
     * @param  {[type]} idUserAttacked [description]
     * @param  {[type]} dmg            [description]
     * @return {[type]}                [description]
     */
    this.apuUser = function (idUser: EntityId, idUserAttacked: EntityId, dmg: number): StabResult {
        try {
            const user = getCharacterById(idUser);
            const userAttacked = getCharacterById(idUserAttacked);

            if (!user || !userAttacked) {
                return {
                    stabbed: false,
                    extraDamage: 0,
                    totalDamage: dmg,
                };
            }

            const skillApu = game.getSkillApu(idUser);
            const baseChance = skillApu * (STABBING_CHANCE_BY_CLASS[user.idClase] ?? STABBING_CHANCE_BY_CLASS[3]);
            const probExito = clampChance(baseChance);

            if (funct.randomIntFromInterval(1, 100) <= probExito) {
                const tmpDmg = Math.floor(dmg * (STABBING_DAMAGE_MOD_BY_CLASS[user.idClase] ?? 1));
                userAttacked.hp -= tmpDmg;

                return {
                    stabbed: true,
                    extraDamage: tmpDmg,
                    totalDamage: dmg + tmpDmg,
                };
            }

            return {
                stabbed: false,
                extraDamage: 0,
                totalDamage: dmg,
            };
        } catch (err) {
            funct.dumpError(err);
            return {
                stabbed: false,
                extraDamage: 0,
                totalDamage: dmg,
            };
        }
    };

    /**
     * [getSkillTacticasCombate description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.getSkillTacticasCombate = function (idUser: EntityId): number {
        try {
            const user = getCharacterById(idUser);
            if (!user) {
                return 0;
            }
            return getSimulatedSkill(user);
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    /**
     * [getSkillDefensa description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.getSkillDefensa = function (idUser: EntityId): number {
        try {
            const user = getCharacterById(idUser);
            if (!user) {
                return 0;
            }
            return getSimulatedSkill(user);
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    /**
     * [getSkillArmas description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.getSkillArmas = function (idUser: EntityId): number {
        try {
            const user = getCharacterById(idUser);
            if (!user) {
                return 0;
            }
            return getSimulatedSkill(user);
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    this.getSkillProyectiles = function (idUser: EntityId): number {
        try {
            const user = getCharacterById(idUser);
            if (!user) {
                return 0;
            }
            return getSimulatedSkill(user);
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    this.getSkillWrestling = function (idUser: EntityId): number {
        try {
            const user = getCharacterById(idUser);
            if (!user) {
                return 0;
            }
            return getSimulatedSkill(user);
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    this.getSkillOcultarse = function (idUser: EntityId): number {
        try {
            const user = getCharacterById(idUser);
            if (!user) {
                return 0;
            }
            return getSimulatedSkill(user);
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    /**
     * [getSkillApu description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.getSkillApu = function (idUser: EntityId): number {
        try {
            const user = getCharacterById(idUser);
            if (!user) {
                return 0;
            }
            return getSimulatedSkill(user);
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    /**
     * [puedeApu description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.puedeApu = function (idUser: EntityId): boolean {
        try {
            const user = getCharacterById(idUser);

            if (!user) {
                return false;
            }

            if (!user.idItemWeapon) {
                return false;
            }

            const itemInventary = getInventoryItem(user, user.idItemWeapon);

            if (!itemInventary) {
                return false;
            }

            const idItem = itemInventary.idItem;
            const itemWeapon = vars.datObj[idItem];

            if (!itemWeapon.apu) {
                return false;
            }

            let skillApu = game.getSkillApu(idUser);

            if (skillApu < 10 && user.idClase != vars.clases.asesino) {
                return false;
            } else {
                return true;
            }
        } catch (err) {
            funct.dumpError(err);
            return false;
        }
    };

    /**
     * [poderEvasion description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.poderEvasion = function (idUser: EntityId): number {
        try {
            const user = getCharacterById(idUser);

            if (!user) {
                return 0;
            }

            let skillTacticasCombate = game.getSkillTacticasCombate(idUser);

            const tmpCalc =
                (skillTacticasCombate + (skillTacticasCombate / 33) * user.attrAgilidad) *
                vars.modEvasion[user.idClase];

            return tmpCalc + 2.5 * Math.max(user.level - 12, 0);
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    /**
     * [poderEvasionEscudo description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.poderEvasionEscudo = function (idUser: EntityId): number {
        try {
            const user = vars.personajes[idUser];

            const shield = getEquippedShieldData(user);

            if (!shield) {
                return 0;
            }

            const itemModifier = Number(shield.porcentaje ?? 0) / 100;

            if (itemModifier <= 0) {
                return 0;
            }

            const skillDefensa = game.getSkillDefensa(idUser);

            return ((skillDefensa * vars.modEscudo[user.idClase]) / 4) * itemModifier;
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    /**
     * [poderAtaqueArma description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.poderAtaqueArma = function (idUser: EntityId): number {
        try {
            const user = vars.personajes[idUser];

            let skill = game.getSkillWrestling(idUser);
            let modifier = vars.modAtaqueWrestling[user.idClase];
            const itemWeapon = getEquippedWeaponData(user);

            if (itemWeapon) {
                if (itemWeapon.proyectil) {
                    skill = game.getSkillProyectiles(idUser);
                    modifier = vars.modAtaqueProyectiles[user.idClase];
                } else if (itemWeapon.apu) {
                    skill = game.getSkillApu(idUser);
                    modifier = vars.modAtaqueArmas[user.idClase];
                } else {
                    skill = game.getSkillArmas(idUser);
                    modifier = vars.modAtaqueArmas[user.idClase];
                }
            }

            let poderAtaqueArmaTmp = (skill + 3 * user.attrAgilidad) * modifier;

            return poderAtaqueArmaTmp + 2.5 * Math.max(user.level - 12, 0);
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    /**
     * [hayObj description]
     * @param  {[type]} idMap [description]
     * @param  {[type]} pos   [description]
     * @return {[type]}       [description]
     */
    this.hayObj = function (idMap: number, pos: Position): boolean {
        try {
            const tile = vars.mapa[idMap]?.[pos.y]?.[pos.x];

            if (tile && tile.objInfo && tile.objInfo.objIndex > 0 && tile.objInfo.amount > 0) {
                return true;
            } else {
                return false;
            }
        } catch (err) {
            funct.dumpError(err);
            return false;
        }

        return false;
    };

    /**
     * [objMap description]
     * @param  {[type]} idMap [description]
     * @param  {[type]} pos   [description]
     * @return {[type]}       [description]
     */
    this.objMap = function (idMap: number, pos: Position) {
        try {
            return vars.mapa[idMap]?.[pos.y]?.[pos.x]?.objInfo || false;
        } catch (err) {
            funct.dumpError(err);
            return false;
        }

        return false;
    };

    /**
     * [tirarItemsUser description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.tirarItemsUser = async function (idUser: EntityId, dropOrigin?: { map: number; pos: Position }) {
        try {
            const user = vars.personajes[idUser] as GameCharacter | undefined;
            const reservedDropPositions = new Set<string>();
            const initialDropRadius = 3;
            const maxExpandedDropRadius = 5;
            let droppedItemsCount = 0;
            const floorChanges: Record<string,unknown>[] = [];

            if (!user) {
                return;
            }

            const dropMap = dropOrigin?.map ?? user.map;
            const dropPos = dropOrigin?.pos ?? { ...user.pos };
            for (let idPos in user.inv) {
                const item = user.inv[idPos];

                if (!item) {
                    continue;
                }

                const idItem = item.idItem;
                const datObj = vars.datObj[idItem];

                if (!datObj) {
                    continue;
                }

                if (!datObj.newbie && !datObj.noSeCae) {
                    const cant = item.cant;
                    let tmpPos: Position | undefined;

                    for (let radius = initialDropRadius; !tmpPos && radius <= maxExpandedDropRadius; radius++) {
                        tmpPos = game.findDropPosition(dropMap, dropPos, idUser, {
                            maxRadius: radius,
                            excludedPositions: reservedDropPositions,
                        });

                        if (!tmpPos) {
                            tmpPos = game.findDropPosition(dropMap, dropPos, idUser, {
                                maxRadius: radius,
                                allowWater: true,
                                excludedPositions: reservedDropPositions,
                            });
                        }

                        if (!tmpPos) {
                            tmpPos = game.findDropPosition(dropMap, dropPos, idUser, {
                                maxRadius: radius,
                                allowReplacingDroppedFloorItem: true,
                                excludedPositions: reservedDropPositions,
                            });
                        }

                        if (!tmpPos) {
                            tmpPos = game.findDropPosition(dropMap, dropPos, idUser, {
                                maxRadius: radius,
                                allowWater: true,
                                allowReplacingDroppedFloorItem: true,
                                excludedPositions: reservedDropPositions,
                            });
                        }
                    }

                    if (!tmpPos) {
                        console.log("<<<>>> NO SPACE ON MAP FLOOR:" + dropMap);
                        break;
                    }

                    reservedDropPositions.add(getFloorItemRegistryKey(dropMap, tmpPos));
                    pendingFloorDrops.add(getFloorItemRegistryKey(dropMap, tmpPos));

                    game.quitarUserInvItem(idUser, idPos, cant);

                    const dropId = !user.pvpChar && !mapInstanceManager.isInstanceMap(dropMap) ? randomUUID() : undefined;
                    game.placeDroppedFloorItem(dropMap, tmpPos, idItem, cant, dropId);
                    if (dropId) floorChanges.push({action:"put",dropId,map:dropMap,x:tmpPos.x,y:tmpPos.y,itemId:idItem,amount:cant});
                    game.renderDroppedFloorItem(dropMap, tmpPos, idItem);
                    droppedItemsCount++;

                    if (droppedItemsCount % DROP_RENDER_BATCH_SIZE === 0) {
                        await waitForNextEventLoopTurn();
                    }
                }
            }

            await persistCharacterPatch(user, { items: serializeInventory(user.inv), floorChanges });
            for (const key of reservedDropPositions) pendingFloorDrops.delete(key);
        } catch (err) {
            funct.dumpError(err);
            return;
        }
    };

    /**
     * [blockMap description]
     * @param  {[type]} idMap [description]
     * @param  {[type]} pos   [description]
     * @param  {[type]} block [description]
     * @return {[type]}       [description]
     */
    this.blockMap = function (idMap: number, pos: Position, block: number | boolean) {
        try {
            vars.mapa[idMap][pos.y][pos.x].blocked = block;

            game.loopAreaPos(idMap, pos, function (target: GameCharacter) {
                handleProtocol.blockMap(idMap, pos, block, vars.clients[target.id]);
            });
        } catch (err) {
            funct.dumpError(err);
            return false;
        }
    };

    /**
     * [changeObjIndex description]
     * @param  {[type]} idMap    [description]
     * @param  {[type]} pos      [description]
     * @param  {[type]} objIndex [description]
     * @return {[type]}          [description]
     */
    this.changeObjIndex = function (idMap: number, pos: Position, objIndex: number) {
        try {
            vars.mapa[idMap][pos.y][pos.x].objInfo.objIndex = objIndex;

            game.loopAreaPos(idMap, pos, function (target: GameCharacter) {
                handleProtocol.renderItem(objIndex, idMap, pos, vars.clients[target.id]);
            });
        } catch (err) {
            funct.dumpError(err);
            return false;
        }
    };

    /**
     * [openDoor description]
     * @param  {[type]} idUser [description]
     * @param  {[type]} pos    [description]
     * @param  {[type]} objMap [description]
     * @param  {[type]} obj    [description]
     * @return {[type]}        [description]
     */
    this.openDoor = function (idUser: EntityId, pos: Position, objMap: MapObjectInfo, obj: DoorObject) {
        try {
            const user = getCharacterById(idUser);
            const client = getClientById(idUser);
            const now = Date.now();

            if (!user) {
                return false;
            }

            if (client && Number(client.nextDoorToggleAt ?? 0) > now) {
                return;
            }

            if (client) {
                client.nextDoorToggleAt = now + vars.timing.actionCooldowns.doorToggleMs;
            }

            if (Math.abs(user.pos.x - pos.x) > 2 || Math.abs(user.pos.y - pos.y) > 2) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console("Te encuentras muy lejos para abrir la puerta.", "white", 1, 0, userClient);
                });
                return;
            }

            if (obj.llave) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console("La puerta está cerrada con llave.", "white", 1, 0, userClient);
                });
                return;
            }

            if (objMap.objIndex == obj.indexCerrada) {
                vars.mapa[user.map][pos.y][pos.x].objInfo.objIndex = obj.indexAbierta;

                game.blockMap(user.map, pos, 0);
                game.blockMap(
                    user.map,
                    {
                        x: pos.x - 1,
                        y: pos.y,
                    },
                    0,
                );
            } else {
                vars.mapa[user.map][pos.y][pos.x].objInfo.objIndex = obj.indexCerrada;

                game.blockMap(user.map, pos, 1);
                game.blockMap(
                    user.map,
                    {
                        x: pos.x - 1,
                        y: pos.y,
                    },
                    1,
                );
            }

            game.changeObjIndex(user.map, pos, vars.mapa[user.map][pos.y][pos.x].objInfo.objIndex);

            game.loopAreaPos(user.map, pos, function (target: GameCharacter) {
                withUserClient(target.id, (targetClient) => {
                    handleProtocol.playSound(idUser, vars.arSounds.SND_PUERTA, targetClient);
                });
            });
        } catch (err) {
            funct.dumpError(err);
            return false;
        }
    };

    /**
     * [buyItem description]
     * @param  {[type]} idUser [description]
     * @param  {[type]} idPos  [description]
     * @param  {[type]} cant   [description]
     * @return {[type]}        [description]
     */
    this.buyItem = async function (idUser: EntityId, idPos: number | string, cant: number) {
        try {
            const user = getCharacterById(idUser);

            if (!user) {
                return;
            }

            if (!Number.isFinite(cant) || cant < 1) {
                return;
            }

            if (user.dead) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console(
                        user.tradeMode === "bank"
                            ? "Los muertos no pueden retirar items del banco."
                            : "Los muertos no pueden comprar items.",
                        "white",
                        0,
                        0,
                        userClient,
                    );
                });
                return;
            }

            if (user.npcTrade) {
                const npc = vars.npcs[user.npcTrade] as GameNpc;

                if (
                    (user.tradeMode === "merchant" && isOriginalNpcInteractionOutOfRange(user, npc, 3)) ||
                    (user.tradeMode === "bank" && isOriginalNpcInteractionOutOfRange(user, npc, 6))
                ) {
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console(
                            user.tradeMode === "bank"
                                ? "Te encuentras muy lejos para operar con el banco."
                                : "Te encuentras muy lejos para comerciar.",
                            "white",
                            1,
                            0,
                            userClient,
                        );
                    });
                    return;
                }

                if (user.tradeMode === "bank" || npc.npcType === vars.npcType.banquero) {
                    const bankRecord = getActiveBankRecord(user);
                    const sharedSession = getCurrentSharedVaultSession(user);
                    const inventorySnapshot = sharedSession ? cloneInventoryRecord(user.inv) : null;
                    const bankSnapshot = sharedSession ? cloneInventoryRecord(bankRecord) : null;
                    const bankItem = bankRecord[String(idPos)];

                    if (!bankItem) {
                        return;
                    }

                    const cantWithdraw = Math.min(cant, bankItem.cant);
                    const slots = addItemToRecord(user.inv, bankItem.idItem, cantWithdraw, {
                        maxSlots: 21,
                        equipped: 0,
                    });

                    if (slots == null) {
                        withUserClient(idUser, (userClient) => {
                            handleProtocol.console("No tienes espacio en el inventario.", "white", 0, 0, userClient);
                        });
                        return;
                    }

                    bankItem.cant -= cantWithdraw;

                    if (bankItem.cant <= 0) {
                        delete bankRecord[String(idPos)];
                    }

                    try {
                        if (sharedSession) {
                            await persistSharedVaultAndCharacterState(user, sharedSession, {
                                characterItems: true,
                                vaultItems: true,
                            });
                            syncActiveBankGold(user);
                        } else {
                            await persistCharacterStorage(user);
                        }
                    } catch {
                        if (inventorySnapshot && bankSnapshot) {
                            replaceInventoryRecord(user.inv, inventorySnapshot);
                            replaceInventoryRecord(bankRecord, bankSnapshot);
                            rebuildEquippedInventoryState(user);
                        }
                        withUserClient(idUser, (userClient) => {
                            handleProtocol.console(
                                "No se pudo retirar el item del banco. Intentalo otra vez.",
                                "white",
                                1,
                                0,
                                userClient,
                            );
                        });
                        return;
                    }

                    withUserClient(idUser, (userClient) => {
                        for (const slot of slots) {
                            handleProtocol.agregarUserInvItem(idUser, slot, userClient);
                        }
                    });
                    logCharacterActivity(user, {
                        category: "economy",
                        action: "bank_withdraw",
                        itemId: bankItem.idItem,
                        itemName: vars.datObj[bankItem.idItem]?.name ?? null,
                        amount: cantWithdraw,
                        details: buildBankActivityDetails(user, {
                            bankSlot: Number(idPos),
                            inventorySlot: slots[0] ?? null,
                        }),
                    });
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.openTrade(idUser, user.npcTrade, userClient);
                    });
                    return;
                }

                const itemNpc = npc.objs?.[idPos];

                if (!itemNpc) {
                    return;
                }

                const cantBuy = cant;

                const objItem = vars.datObj[itemNpc.item];

                if (objItem.objType === vars.objType.dinero) {
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console(
                            "No se puede comerciar oro como si fuera un item.",
                            "white",
                            1,
                            0,
                            userClient,
                        );
                    });
                    return;
                }

                if (Math.floor((objItem.valor * cantBuy) / 2) > user.gold) {
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console("No tienes oro suficiente.", "white", 1, 0, userClient);
                    });
                    return;
                }
                //Comercio 100 en skils es dividido 2

                const slots = addItemToRecord(user.inv, itemNpc.item, cantBuy, {
                    maxSlots: 21,
                    equipped: 0,
                });

                if (slots == null) {
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console("Tienes el inventario lleno.", "white", 0, 0, userClient);
                    });
                    return;
                }

                user.gold = balance.clampGold(user.gold - Math.floor((objItem.valor * cantBuy) / 2));

                withUserClient(idUser, (userClient) => {
                    for (const slot of slots) {
                        handleProtocol.agregarUserInvItem(idUser, slot, userClient);
                    }
                });

                withUserClient(idUser, (userClient) => {
                    handleProtocol.actGold(user.gold, userClient);
                });
                logCharacterActivity(user, {
                    category: "economy",
                    action: "buy_item",
                    itemId: itemNpc.item,
                    itemName: objItem.name ?? null,
                    amount: cantBuy,
                    goldDelta: -Math.floor((objItem.valor * cantBuy) / 2),
                    details: {
                        npcId: Number(user.npcTrade ?? 0),
                        tradeSlot: Number(idPos),
                        unitPrice: Math.floor(objItem.valor / 2),
                    },
                });
                await persistCharacterEconomyState(user);
            }
        } catch (err) {
            funct.dumpError(err);
        }
    };

    /**
     * [sellItem description]
     * @param  {[type]} idUser [description]
     * @param  {[type]} idPos  [description]
     * @param  {[type]} cant   [description]
     * @return {[type]}        [description]
     */
    this.sellItem = async function (idUser: EntityId, idPos: number | string, cant: number) {
        try {
            const user = getCharacterById(idUser);

            if (!user) {
                return;
            }

            if (!Number.isSafeInteger(cant) || cant < 1) {
                return;
            }

            if (user.dead) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console(
                        user.tradeMode === "bank"
                            ? "Los muertos no pueden guardar items en el banco."
                            : "Los muertos no pueden vender items.",
                        "white",
                        0,
                        0,
                        userClient,
                    );
                });
                return;
            }

            if (user.npcTrade) {
                const npc = vars.npcs[user.npcTrade] as GameNpc;

                if (
                    (user.tradeMode === "merchant" && isOriginalNpcInteractionOutOfRange(user, npc, 3)) ||
                    (user.tradeMode === "bank" && isOriginalNpcInteractionOutOfRange(user, npc, 6))
                ) {
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console(
                            user.tradeMode === "bank"
                                ? "Te encuentras muy lejos para operar con el banco."
                                : "Te encuentras muy lejos para comerciar.",
                            "white",
                            1,
                            0,
                            userClient,
                        );
                    });
                    return;
                }

                const itemUser = user.inv[idPos];

                if (!itemUser) {
                    return;
                }

                if (itemUser.equipped) {
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console(
                            "Debes desequipar el item para poder venderlo.",
                            "white",
                            0,
                            0,
                            userClient,
                        );
                    });
                    return;
                }

                if (user.navegando && vars.datObj[itemUser.idItem].objType === vars.objType.barcos) {
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console(
                            "No puedes guardar la barca en el banco mientras estas navegando.",
                            "white",
                            0,
                            0,
                            userClient,
                        );
                    });
                    return;
                }

                let cantSell = cant;

                if (cantSell > itemUser.cant) {
                    cantSell = itemUser.cant;
                }

                if (user.tradeMode === "bank" || npc.npcType === vars.npcType.banquero) {
                    const bankRecord = getActiveBankRecord(user);
                    const sharedSession = getCurrentSharedVaultSession(user);
                    const inventorySnapshot = sharedSession ? cloneInventoryRecord(user.inv) : null;
                    const bankSnapshot = sharedSession ? cloneInventoryRecord(bankRecord) : null;
                    const bankSlot = addItemToRecord(bankRecord, itemUser.idItem, cantSell, {
                        maxSlots: MAX_BANK_SLOTS,
                        equipped: 0,
                    });

                    if (bankSlot == null) {
                        withUserClient(idUser, (userClient) => {
                            handleProtocol.console("No tienes mas espacio en el banco.", "white", 0, 0, userClient);
                        });
                        return;
                    }

                    if (sharedSession) {
                        removeItemFromInventoryRecord(user.inv, idPos, cantSell);
                        syncUnequippedItemVisuals(user, String(idPos));

                        try {
                            await persistSharedVaultAndCharacterState(user, sharedSession, {
                                characterItems: true,
                                vaultItems: true,
                            });
                            syncActiveBankGold(user);
                        } catch {
                            if (inventorySnapshot && bankSnapshot) {
                                replaceInventoryRecord(user.inv, inventorySnapshot);
                                replaceInventoryRecord(bankRecord, bankSnapshot);
                                rebuildEquippedInventoryState(user);
                            }
                            withUserClient(idUser, (userClient) => {
                                handleProtocol.console(
                                    "No se pudo guardar el item en la boveda. Intentalo otra vez.",
                                    "white",
                                    1,
                                    0,
                                    userClient,
                                );
                            });
                            return;
                        }

                        withUserClient(idUser, (userClient) => {
                            handleProtocol.quitarUserInvItem(idUser, String(idPos), cantSell, userClient);
                        });
                    } else {
                        game.quitarUserInvItem(idUser, idPos, cantSell);
                        await persistCharacterStorage(user);
                    }

                    logCharacterActivity(user, {
                        category: "economy",
                        action: "bank_deposit",
                        itemId: itemUser.idItem,
                        itemName: vars.datObj[itemUser.idItem]?.name ?? null,
                        amount: cantSell,
                        details: buildBankActivityDetails(user, {
                            inventorySlot: Number(idPos),
                            bankSlot: bankSlot[0] ?? null,
                        }),
                    });
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.openTrade(idUser, user.npcTrade, userClient);
                    });
                    return;
                }

                const objItem = vars.datObj[itemUser.idItem];

                if (objItem.objType === vars.objType.dinero) {
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console(
                            "No se puede comerciar oro como si fuera un item.",
                            "white",
                            1,
                            0,
                            userClient,
                        );
                    });
                    return;
                }

                /*if (objItem.newbie) {
                    handleProtocol.console('No se puede vender este item.', 'white', 1, 0, vars.clients[idUser]);
                    return;
                }*/

                user.gold = balance.clampGold(user.gold + Math.floor((objItem.valor * cantSell) / 3));

                game.quitarUserInvItem(idUser, idPos, cantSell);

                withUserClient(idUser, (userClient) => {
                    handleProtocol.actGold(user.gold, userClient);
                });
                logCharacterActivity(user, {
                    category: "economy",
                    action: "sell_item",
                    itemId: itemUser.idItem,
                    itemName: objItem.name ?? null,
                    amount: cantSell,
                    goldDelta: Math.floor((objItem.valor * cantSell) / 3),
                    details: {
                        npcId: Number(user.npcTrade ?? 0),
                        inventorySlot: Number(idPos),
                        unitPrice: Math.floor(objItem.valor / 3),
                    },
                });
                await persistCharacterEconomyState(user);
            }
        } catch (err) {
            funct.dumpError(err);
        }
    };

    /**
     * [accionMeditar description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.accionMeditar = function (idUser: EntityId) {
        try {
            const user = getCharacterById(idUser);

            if (!user) {
                return;
            }

            if (user.meditar) {
                user.meditar = false;

                withUserClient(idUser, (userClient) => {
                    handleProtocol.console("Terminas de meditar.", "white", 0, 0, userClient);
                });

                loopAreaByUserId(idUser, function (client: AreaTarget) {
                    if (!client.isNpc) {
                        const targetClient = getClientById(client.id);

                        if (targetClient) {
                            if (!canReceiveCharacterEvent(client.id, idUser)) {
                                return;
                            }

                            handleProtocol.animFX(idUser, 0, targetClient);
                        }
                    }
                });

                return;
            }

            if (user.dead) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console("Los muertos no pueden meditar.", "white", 0, 0, userClient);
                });
                return;
            }

            if (!user.maxMana) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console("Solo las clases mágicas pueden meditar.", "white", 0, 0, userClient);
                });
                return;
            }

            if (user.mana == user.maxMana) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console("Tienes la maná al máximo.", "white", 0, 0, userClient);
                });
                return;
            }

            let fxMeditar = 0;

            if (user.level < 13) {
                fxMeditar = vars.meditacion.chica;
            } else if (user.level < 25) {
                fxMeditar = vars.meditacion.mediana;
            } else if (user.level < 35) {
                fxMeditar = vars.meditacion.grande;
            } else if (user.level < 42) {
                fxMeditar = vars.meditacion.xgrande;
            } else {
                fxMeditar = vars.meditacion.xxgrande;
            }

            loopAreaByUserId(idUser, function (client: AreaTarget) {
                if (!client.isNpc) {
                    const targetClient = getClientById(client.id);

                    if (targetClient) {
                        if (!canReceiveCharacterEvent(client.id, idUser)) {
                            return;
                        }

                        handleProtocol.animFX(idUser, fxMeditar, targetClient);
                    }
                }
            });

            user.meditar = true;
        } catch (err) {
            funct.dumpError(err);
        }
    };

    /**
     * [meditar description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.meditar = function (idUser: EntityId) {
        try {
            const user = getCharacterById(idUser);

            if (!user) {
                return;
            }

            let cantMana = Math.floor((user.maxMana * 6) / 100);

            if (user.maxMana <= user.mana + cantMana) {
                cantMana = user.maxMana - user.mana;
            }

            user.mana += cantMana;

            withUserClient(idUser, (userClient) => {
                handleProtocol.updateMana(user.mana, userClient);
                handleProtocol.console("¡Has recuperado " + cantMana + " puntos de maná!", "white", 0, 0, userClient);
            });

            if (user.maxMana == user.mana) {
                user.meditar = false;

                withUserClient(idUser, (userClient) => {
                    handleProtocol.console("Terminas de meditar.", "white", 0, 0, userClient);
                });

                loopAreaByUserId(idUser, function (client: AreaTarget) {
                    if (!client.isNpc) {
                        const targetClient = getClientById(client.id);

                        if (targetClient) {
                            if (!canReceiveCharacterEvent(client.id, idUser)) {
                                return;
                            }

                            handleProtocol.animFX(idUser, 0, targetClient);
                        }
                    }
                });
            }
        } catch (err) {
            funct.dumpError(err);
        }
    };

    this.setHiddenSkill = function (idUser: EntityId, enabled: boolean) {
        try {
            setHiddenSkillState(idUser, enabled);
        } catch (err) {
            funct.dumpError(err);
        }
    };

    this.persistCharacterPatch = persistCharacterPatch;
    this.persistCharacterSnapshot = async function (
        user: RuntimeCharacter,
        options?: CharacterSnapshotPersistOptions,
    ): Promise<void> {
        await persistCharacterSnapshot(user, options);
    };

    this.waitForCharacterPersistence = async function (characterId?: string): Promise<void> {
        await waitForCharacterPersistence(characterId);
    };

    /**
     * [closeForce description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.closeForce = async function (idUser: EntityId) {
        try {
            const client = getClientById(idUser);

            if (client) {
                handleProtocol.closeForce(idUser);
                await socket.close(client);
                return;
            }

            await socket.closePjById(idUser);
        } catch (err) {
            funct.dumpError(err);
        }
    };

    /**
     * [calcularExp description]
     * @param  {[type]} idUser [description]
     * @param  {[type]} idNpc  [description]
     * @param  {[type]} dmg    [description]
     * @return {[type]}        [description]
     */
    this.distribuirExpRestanteNpc = function (idUser: EntityId, idNpc: EntityId) {
        try {
            const npc = vars.npcs[idNpc] as GameNpc | undefined;

            if (!npc || npc.exp <= 0) {
                return;
            }

            const totalScaledExp = scaleNpcExpReward(npc.exp);
            const hitExpAwarded = Math.max(0, Number(npc.hitExpAwarded ?? 0));
            const remainingExp = Math.max(0, totalScaledExp - hitExpAwarded);

            distribuirExpNpcEscalada(idUser, npc, remainingExp);
        } catch (err) {
            funct.dumpError(err);
        }
    };

    this.calcularExp = function (idUser: EntityId, idNpc: EntityId, dmg: number) {
        try {
            const npc = vars.npcs[idNpc] as GameNpc | undefined;

            if (!npc) {
                return;
            }

            if (dmg < 0) {
                dmg = 0;
            }

            if (npc.maxHp <= 0 || npc.exp <= 0) {
                return;
            }

            const remainingHpBeforeHit = Math.max(0, npc.hp + dmg);
            const effectiveDamage = Math.min(dmg, remainingHpBeforeHit);
            const exp = scaleNpcExpReward(effectiveDamage * ((npc.exp * NPC_HIT_EXP_RATIO) / npc.maxHp));

            if (!exp) {
                return;
            }

            npc.hitExpAwarded = Math.max(0, Number(npc.hitExpAwarded ?? 0)) + exp;
            distribuirExpNpcEscalada(idUser, npc, exp);
        } catch (err) {
            funct.dumpError(err);
        }
    };

    this.distribuirOroNpc = function (idUser: EntityId, idNpc: EntityId, totalGold: number) {
        try {
            const npc = vars.npcs[idNpc] as GameNpc | undefined;

            if (!npc || totalGold <= 0) {
                return;
            }

            const recipients = getPartyRewardRecipients(idUser, npc);
            const share = Math.floor(totalGold / Math.max(1, recipients.length));

            if (!share) {
                return;
            }

            recipients.forEach((recipient) => {
                pendingGoldRewards.credit(recipient.id, recipient, share);
            });
        } catch (err) {
            funct.dumpError(err);
        }
    };

    this.markNpcAggressor = function (idNpc: EntityId, idAttacker: EntityId) {
        markNpcAggressor(idNpc, idAttacker);
    };

    this.forceDismount = function (idUser: EntityId) {
        try {
            const user = getCharacterById(idUser);

            if (!user) {
                return;
            }

            dismountUser(user);
        } catch (err) {
            funct.dumpError(err);
        }
    };

    /**
     * [navegar description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.navegar = function (idUser: EntityId, idBarco?: number) {
        try {
            const user = getCharacterById(idUser);

            if (!user) {
                return;
            }

            if (user.navegando) {
                if (
                    game.legalPos(user.pos.x - 1, user.pos.y, user.map, false) ||
                    game.legalPos(user.pos.x, user.pos.y - 1, user.map, false) ||
                    game.legalPos(user.pos.x + 1, user.pos.y, user.map, false) ||
                    game.legalPos(user.pos.x, user.pos.y + 1, user.map, false)
                ) {
                    if (user.dead) {
                        user.idBody = 8;
                        user.idHead = 500;
                    } else {
                        user.idBody = user.idLastBody;
                        user.idHead = user.idLastHead;
                    }
                    user.idWeapon = user.idLastWeapon;
                    user.idHelmet = user.idLastHelmet;
                    user.idShield = user.idLastShield;

                    user.navegando = 0;

                    withUserClient(idUser, (userClient) => {
                        handleProtocol.selfMapMetaDelta(
                            {
                                navegando: Number(user.navegando ?? 0),
                            },
                            userClient,
                        );
                    });

                    loopAreaByUserId(idUser, function (client: AreaTarget) {
                        if (!client.isNpc) {
                            const targetClient = getClientById(client.id);

                            if (targetClient) {
                                handleProtocol.changeBody(idUser, targetClient);
                            }
                        }
                    });
                } else {
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console(
                            "¡Debes aproximarte a la costa para poder bajar del barco!",
                            "white",
                            0,
                            0,
                            userClient,
                        );
                    });
                    return;
                }
            } else {
                if (
                    game.legalPos(user.pos.x - 1, user.pos.y, user.map, true) ||
                    game.legalPos(user.pos.x, user.pos.y - 1, user.map, true) ||
                    game.legalPos(user.pos.x + 1, user.pos.y, user.map, true) ||
                    game.legalPos(user.pos.x, user.pos.y + 1, user.map, true)
                ) {
                    if (user.idHead != 500) {
                        user.idLastHead = Number(user.idHead);
                    }
                    if (user.idBody != 8) {
                        user.idLastBody = Number(user.idBody);
                    }
                    user.idLastHelmet = Number(user.idHelmet);
                    user.idLastWeapon = Number(user.idWeapon);
                    user.idLastShield = Number(user.idShield);

                    if (user.dead) {
                        user.idBody = 87;
                    } else {
                        const barco = idBarco ? vars.datObj[idBarco] : undefined;
                        user.idBody = Number(barco?.anim) || 84;
                    }

                    user.idHead = 0;
                    user.idWeapon = 0;
                    user.idHelmet = 0;
                    user.idShield = 0;

                    user.navegando = 1;

                    withUserClient(idUser, (userClient) => {
                        handleProtocol.selfMapMetaDelta(
                            {
                                navegando: Number(user.navegando ?? 0),
                            },
                            userClient,
                        );
                    });

                    loopAreaByUserId(idUser, function (client: AreaTarget) {
                        if (!client.isNpc) {
                            const targetClient = getClientById(client.id);

                            if (targetClient) {
                                handleProtocol.changeBody(idUser, targetClient);
                            }
                        }
                    });
                } else {
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console(
                            "¡Debes aproximarte al agua para usar el barco!",
                            "white",
                            0,
                            0,
                            userClient,
                        );
                    });
                    return;
                }
            }
        } catch (err) {
            funct.dumpError(err);
        }
    };

    /**
     * [deleteUserToAllNpcs description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.deleteUserToAllNpcs = function (idUser: EntityId) {
        try {
            loopAreaByUserId(idUser, function (target: AreaTarget) {
                if (target.isNpc && target.movement == 3) {
                    const index = vars.areaNpc[target.id].indexOf(idUser);

                    if (index > -1) {
                        vars.areaNpc[target.id].splice(index, 1);
                    }
                }
            });
        } catch (err) {
            funct.dumpError(err);
        }
    };

    this.syncUserNpcVisibility = function (idUser: EntityId) {
        try {
            const user = vars.personajes[idUser] as GameCharacter | undefined;
            const ws = vars.clients[idUser] as RuntimeClient | undefined;

            if (!user || !ws) {
                return;
            }

            const shouldBeVisibleToNpcs = canNpcDetectCharacter(user);

            game.loopArea(ws, function (target: AreaTarget) {
                if (!target.isNpc || vars.npcs[target.id]?.movement != 3) {
                    return;
                }

                const npcArea = Array.isArray(vars.areaNpc[target.id]) ? vars.areaNpc[target.id] : [];

                if (vars.areaNpc[target.id] !== npcArea) {
                    vars.areaNpc[target.id] = npcArea;
                }

                const index = npcArea.indexOf(idUser);

                if (shouldBeVisibleToNpcs) {
                    if (index < 0) {
                        npcArea.push(idUser);
                    }
                } else if (index > -1) {
                    npcArea.splice(index, 1);
                }
            });
        } catch (err) {
            funct.dumpError(err);
        }
    };

    /**
     * [hacerCriminal description]
     * @param  {[type]} idUser [description]
     * @return {[type]}        [description]
     */
    this.hacerCriminal = function (idUser: EntityId) {
        try {
            const user = vars.personajes[idUser];

            user.criminal = 1;
            user.faction = normalizeFaction(user.faction);

            const leavePartyResult = this.leaveParty(idUser);

            if (leavePartyResult.ok) {
                const userClient = getClientById(idUser);

                if (userClient) {
                    handleProtocol.console(
                        "Abandonaste la party porque los criminales no pueden mezclarse con ciudadanos.",
                        "white",
                        0,
                        0,
                        userClient,
                    );
                }
            }

            syncCharacterColor(user);
        } catch (err) {
            funct.dumpError(err);
        }
    };

    this.setCharacterFaction = function (idUser: EntityId, faction: CharacterFaction) {
        const user = getCharacterById(idUser);

        if (!user) {
            return;
        }

        user.faction = normalizeFaction(faction);
        syncCharacterColor(user);
    };

    this.clearCharacterFaction = function (idUser: EntityId) {
        const user = getCharacterById(idUser);

        if (!user) {
            return;
        }

        user.faction = "none";
        syncCharacterColor(user);
    };

    this.getFactionScore = function (idUser: EntityId, faction: CharacterFaction): number {
        const user = getCharacterById(idUser);

        if (!user) {
            return 0;
        }

        return getFactionScoreValue(user, faction);
    };

    this.addFactionScore = function (idUser: EntityId, faction: CharacterFaction, amount: number): number {
        const user = getCharacterById(idUser);

        if (!user) {
            return 0;
        }

        const nextScore = getFactionScoreValue(user, faction) + Math.max(0, Math.floor(amount));
        setFactionScoreValue(user, faction, nextScore);
        return getFactionScoreValue(user, faction);
    };

    this.getMaxEligibleFactionRank = function (idUser: EntityId, faction: CharacterFaction): number {
        const user = getCharacterById(idUser);

        if (!user) {
            return 0;
        }

        return getMaxEligibleFactionRankByThreshold(
            faction,
            Number(user.level ?? 0),
            getFactionScoreValue(user, faction),
        );
    };

    this.claimFactionRewards = function (idUser: EntityId) {
        if (bankOperations.isBusy(idUser)) {
            return { ok: false, message: "An inventory operation is still pending. Please wait.", rank: 0, grantedItems: [] };
        }
        const user = getCharacterById(idUser);

        if (!user) {
            return { ok: false, message: "Personaje invalido.", rank: 0, grantedItems: [] };
        }

        const faction = normalizeFaction(user.faction);

        if (faction === "none") {
            return { ok: false, message: "No perteneces a ninguna faccion.", rank: 0, grantedItems: [] };
        }

        const eligibleRank = this.getMaxEligibleFactionRank(idUser, faction);
        const claimedRank = getFactionRewardsValue(user, faction);
        const factionConfig = getFactionConfig(faction);

        setFactionRankValue(user, faction, eligibleRank);

        if (eligibleRank <= claimedRank) {
            const nextRankConfig = factionConfig?.ranks.find((rank) => rank.rank > claimedRank) ?? null;

            if (!nextRankConfig) {
                return {
                    ok: false,
                    message: "Ya alcanzaste el maximo rango disponible.",
                    rank: eligibleRank,
                    grantedItems: [],
                };
            }

            const missingScore = Math.max(0, nextRankConfig.minScore - getFactionScoreValue(user, faction));
            const missingLevel = Math.max(0, nextRankConfig.minLevel - Number(user.level ?? 0));
            const missingParts: string[] = [];

            if (missingLevel > 0) {
                missingParts.push(`${missingLevel} nivel(es)`);
            }

            if (missingScore > 0) {
                missingParts.push(`${missingScore} punto(s) de faccion`);
            }

            return {
                ok: false,
                message:
                    missingParts.length > 0
                        ? `Para ascender a ${nextRankConfig.title} te falta ${missingParts.join(" y ")}.`
                        : "No tienes nuevas recompensas disponibles.",
                rank: eligibleRank,
                grantedItems: [],
            };
        }

        const grantedItems: number[] = [];
        const rewardField = getRewardsFieldName(faction);
        const rankField = getRankFieldName(faction);

        const rewardItemIds = getFactionRewardItemIdsUpToRank(faction, eligibleRank).filter((itemId) => {
            return !getFactionRewardItemIdsUpToRank(faction, claimedRank).includes(itemId);
        });

        for (const itemId of rewardItemIds) {
            if (grantedItems.includes(itemId)) {
                continue;
            }

            const addedSlots = addItemToRecord(user.inv, itemId, 1, {
                maxSlots: 21,
                equipped: 0,
            });

            if (addedSlots == null) {
                const dropPos = this.findDropPosition(user.map, user.pos, user.id) ?? user.pos;
                this.placeDroppedFloorItem(user.map, dropPos, itemId, 1);
                this.renderDroppedFloorItem(user.map, dropPos, itemId);
            } else {
                withUserClient(idUser, (userClient) => {
                    for (const slot of addedSlots) {
                        handleProtocol.agregarUserInvItem(idUser, slot, userClient);
                    }
                });
            }

            grantedItems.push(itemId);
        }

        if (rewardField) {
            user[rewardField] = eligibleRank;
        }

        if (rankField) {
            user[rankField] = eligibleRank;
        }

        return {
            ok: true,
            message: "Recibiste tus recompensas faccionarias.",
            rank: eligibleRank,
            grantedItems,
        };
    };

    this.canUseFactionItem = function (idUser: EntityId, idItem: number): boolean {
        const user = getCharacterById(idUser);

        if (!user) {
            return true;
        }

        const requiredFaction = getRequiredFactionForItem(idItem);

        return requiredFaction === "none" || normalizeFaction(user.faction) === requiredFaction;
    };

    /**
     * [isRazaEnana description]
     * @param  {[type]}  idRaza [description]
     * @return {Boolean}        [description]
     */
    this.isRazaEnana = function (idRaza: number): boolean {
        try {
            if (idRaza == vars.razas.gnomo || idRaza == vars.razas.enano) {
                return true;
            } else {
                return false;
            }
        } catch (err) {
            funct.dumpError(err);
            return false;
        }
    };

    this.isNewbieCharacter = function (user: Pick<GameCharacter, "level"> | undefined | null): boolean {
        return isNewbieCharacter(user);
    };

    this.logCharacterActivity = logCharacterActivity;
}

// Guard the complete read/mutate/persist/rollback action, not just the HTTP save.
const rawBuyItem = game.buyItem.bind(game);
const rawSellItem = game.sellItem.bind(game);
const rawReorderBankItem = game.reorderBankItem.bind(game);
const rawDepositBankGold = game.depositBankGold.bind(game);
const rawWithdrawBankGold = game.withdrawBankGold.bind(game);
const rawOpenBankTrade = game.openBankTrade.bind(game);
const rawChangeBankTab = game.changeBankTab.bind(game);
const rawCloseTradeSession = game.closeTradeSession.bind(game);
const rawDeathDrop = game.tirarItemsUser.bind(game) as (id: EntityId, origin: {map: number; pos: Position}) => Promise<void>;
const pendingGoldRewards = new PendingGoldRewards<GameCharacter>(bankOperations, (recipient, amount) => {
    if (getCharacterById(recipient.id) !== recipient) return;
    recipient.gold = balance.clampGold(recipient.gold + amount);
    withUserClient(recipient.id, client => {
        handleProtocol.console("¡Has ganado " + amount + " monedas de oro!", "red", 1, 0, client);
        handleProtocol.actGold(recipient.gold, client);
    });
});
game.tirarItemsUser = id => {
    const user = getCharacterById(id);
    if (!user) return Promise.resolve();
    const origin = {map: user.map, pos: {...user.pos}};
    return bankOperations.runAfter(id, 'death-drop', async () => {
        if (getCharacterById(id) === user) await rawDeathDrop(id, origin);
    });
};
game.buyItem = (id, slot, quantity) => bankOperations.run(id, () => rawBuyItem(id, slot, quantity), undefined);
game.sellItem = (id, slot, quantity) => bankOperations.run(id, () => rawSellItem(id, slot, quantity), undefined);
game.reorderBankItem = (id, source, target) => bankOperations.run(id, () => rawReorderBankItem(id, source, target), undefined);
game.depositBankGold = (id, amount) => bankOperations.run(id, () => rawDepositBankGold(id, amount), undefined);
game.withdrawBankGold = (id, amount) => bankOperations.run(id, () => rawWithdrawBankGold(id, amount), undefined);
game.openBankTrade = (id, npc, tab) => bankOperations.run(id, () => rawOpenBankTrade(id, npc, tab), false);
game.changeBankTab = (id, tab) => bankOperations.run(id, () => rawChangeBankTab(id, tab), false);
game.closeTradeSession = id => bankOperations.after(id, () => rawCloseTradeSession(id), error => funct.dumpError(error));

module.exports = game;

const rawUseItem = game.useItem.bind(game);
const rawReorderSpell = game.reorderSpell.bind(game);
game.useItem = (ws, slot) => bankOperations.run(ws.id!, () => rawUseItem(ws, slot), undefined);
game.reorderSpell = (id, source, target) => bankOperations.run(id, () => rawReorderSpell(id, source, target), undefined);

const rawDropItem = game.tirarItem.bind(game);
const rawPickupItem = game.agarrarItem.bind(game);
const rawReorderInventory = game.reorderInventoryItem.bind(game);
game.tirarItem = (ws, slot, amount) => bankOperations.run(ws.id!, () => rawDropItem(ws, slot, amount), undefined);
game.agarrarItem = ws => bankOperations.run(ws.id!, () => rawPickupItem(ws), undefined);
game.reorderInventoryItem = (id, source, target) => bankOperations.run(id, () => rawReorderInventory(id, source, target), undefined);
