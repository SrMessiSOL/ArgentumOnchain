import type { PackageApi } from "./package";
import {canBuyFromNpc} from './npcVendorPolicy';
import type { SocketApi } from "./socket";
import { getRequiredFactionForItem } from "./factions";
import type {
    ClanRuntimeStateDelta,
    DataObject,
    DataSpell,
    EntityId,
    InventoryRecord,
    NumericFlag,
    PartyRuntimeStateDelta,
    Position,
    RuntimeCharacter,
    RuntimeClient,
    RuntimeNpc,
    SpellRecord,
    TradeItem,
} from "./types/runtime";
import { getCharacterById, getClientById } from "./runtimeRegistry";

export {};

type ConsoleChannel = "console" | "global" | "party" | "clan" | "whisper";

type CraftingOpenPayload = {
    profession: "carpentry" | "blacksmith" | "tailoring";
    title: string;
    recipes: Array<{
        itemId: number;
        name: string;
        grhIndex: number;
        details: string;
        stats: string;
        skill: number;
        category: string;
        materials: Array<{
            itemId: number;
            name: string;
            amount: number;
            owned: number;
        }>;
    }>;
};

type MarketOpenPayload = {
    npcName: string;
    publicationFeeBps: number;
    defaultDurationHours: number;
    maxDurationHours: number;
    listingGroups: Array<{
        itemId: number;
        itemName: string;
        itemGrhIndex: number;
        totalListings: number;
        totalQuantity: number;
        minUnitPrice: number;
        listings: Array<{
            id: string;
            sellerName: string;
            itemName: string;
            itemGrhIndex: number;
            quantity: number;
            price: number;
            status: "active" | "sold" | "expired" | "cancelled";
            expiresAt: string;
            createdAt: string;
        }>;
    }>;
    myListings: Array<{
        id: string;
        sellerName: string;
        itemName: string;
        itemGrhIndex: number;
        quantity: number;
        price: number;
        status: "active" | "sold" | "expired" | "cancelled";
        expiresAt: string;
        createdAt: string;
    }>;
    claims: Array<{
        id: string;
        claimType: "gold" | "item";
        goldAmount: number;
        itemId: number | null;
        itemName: string | null;
        itemGrhIndex: number | null;
        itemQuantity: number | null;
        sourceListingId: string | null;
        createdAt: string;
    }>;
};

type RetosOpenPayload = {
    challenges: Array<{
        id: string;
        createdAt: number;
        teamSize: 1 | 2;
        proposer: {
            id: string;
            persistedId: string;
            name: string;
            level: number;
            className: string;
            raceName: string;
        };
    }>;
};

type AreaItemSnapshot = {
    idItem: number;
    map: number;
    pos: Position;
};

type AreaMetaSnapshot = {
    map: number;
    name: string;
    blockedTiles: Array<{
        pos: Position;
        blocked: number;
    }>;
};

type SelfFlagsDeltaPayload = {
    zonaSegura: NumericFlag;
    seguroActivado: boolean;
    seguroClanActivado: boolean;
};

type SelfVitalsDeltaPayload = {
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
};

type SelfMapMetaDeltaPayload = {
    map?: number;
    name?: string | null;
    navegando?: NumericFlag;
};

const vars = require("./vars");
const pkg = require("./package") as PackageApi;
const socket = require("./socket") as SocketApi;
const funct = require("./functions");
const balance = require("./balance");

const PANEL_SNAPSHOT_CHUNK_CHAR_LIMIT = 60000;

function splitSnapshotIntoChunks(serializedSnapshot: string) {
    const characters = Array.from(serializedSnapshot);

    if (characters.length <= PANEL_SNAPSHOT_CHUNK_CHAR_LIMIT) {
        return [serializedSnapshot];
    }

    const chunks: string[] = [];

    for (let index = 0; index < characters.length; index += PANEL_SNAPSHOT_CHUNK_CHAR_LIMIT) {
        chunks.push(characters.slice(index, index + PANEL_SNAPSHOT_CHUNK_CHAR_LIMIT).join(""));
    }

    return chunks;
}

type ProtocolCharacter = RuntimeCharacter & {
    id: EntityId;
    nameCharacter: string;
    idClase: number;
    map: number;
    pos: Position;
    idHead: number;
    idHelmet: number;
    idWeapon: number;
    idShield: number;
    idBody: number;
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
    privileges: number;
    exp: number;
    expNextLevel: number;
    level: number;
    gold: number;
    heading: number;
    stateVersion: number;
    lastProcessedMoveId: number;
    inmovilizado: NumericFlag;
    zonaSegura: NumericFlag;
    color: string;
    clan: string;
    navegando: NumericFlag;
    attrAgilidad: number;
    attrFuerza: number;
    attrInteligencia: number;
    attrConstitucion: number;
    minHit: number;
    maxHit: number;
    tradeMode?: "merchant" | "bank" | "market";
    tradeBankTab?: "character" | "account" | "clan";
    tradeBankItems?: InventoryRecord;
    tradeBankGold?: number;
    tradeHasClanVault?: boolean;
    tradeClanName?: string | null;
    cooldownAgilidad?: number;
    cooldownFuerza?: number;
    idRaza: number;
    inv: InventoryRecord;
    spells: SpellRecord;
    adminSummonedBot?: boolean;
};
type ProtocolNpc = RuntimeNpc & {
    id: EntityId;
    nameCharacter: string;
    idClase: number;
    map: number;
    pos: Position;
    idHead: number;
    idHelmet: number;
    idWeapon: number;
    idShield: number;
    idBody: number;
    heading: number;
    color: string;
    clan: string;
    objs?: Record<string, TradeItem>;
};

function arePartyMembersForViewer(viewerId: EntityId | undefined, character: RuntimeCharacter | undefined): boolean {
    if (typeof viewerId === "undefined" || !character) {
        return false;
    }

    const viewer = getCharacterById(viewerId);

    return Boolean(viewer && viewer.partyId && character.partyId && viewer.partyId === character.partyId);
}

function getMovementRestrictionState(
    entity: Pick<RuntimeCharacter | RuntimeNpc, "inmovilizado" | "paralizado"> | undefined,
): number {
    if (entity?.paralizado) {
        return 2;
    }

    if (entity?.inmovilizado) {
        return 1;
    }

    return 0;
}

function getMovementRestrictionRemainingMs(
    entity: Pick<RuntimeCharacter | RuntimeNpc, "inmovilizado" | "paralizado" | "cooldownParalizado"> | undefined,
    durationMs: number,
): number {
    const movementRestriction = getMovementRestrictionState(entity);
    const startedAt = Number(entity?.cooldownParalizado ?? 0);

    if (movementRestriction === 0 || !Number.isFinite(startedAt) || startedAt <= 0) {
        return 0;
    }

    const remainingMs = startedAt + durationMs - Date.now();

    return Math.max(0, Math.min(durationMs, Math.round(remainingMs)));
}

export type HandleProtocolApi = {
    changeHeading: (idUser: EntityId, heading: number, client: RuntimeClient) => void;
    console: (
        msg: string,
        color: string | null,
        bold: number | boolean,
        italica: number | boolean,
        client: RuntimeClient,
        channel?: ConsoleChannel,
        senderName?: string,
        npcName?: string,
    ) => void;
    consoleToAll: (msg: string, color: string | null, bold: number | boolean, italica: number | boolean) => void;
    globalNotice: (msg: string, durationMs: number, client: RuntimeClient) => void;
    globalNoticeToAll: (msg: string, durationMs: number) => void;
    changeHelmet: (idUser: EntityId, idHelmet: number, idPos: number | string, client: RuntimeClient) => void;
    changeRopa: (idUser: EntityId, idBody: number, idPos: number | string, client: RuntimeClient) => void;
    changeWeapon: (idUser: EntityId, idWeapon: number, idPos: number | string, client: RuntimeClient) => void;
    changeArrow: (idUser: EntityId, idPos: number | string, client: RuntimeClient) => void;
    changeShield: (idUser: EntityId, idShield: number, idPos: number | string, client: RuntimeClient) => void;
    inmo: (idUser: EntityId, movementRestriction: number | boolean, client: RuntimeClient) => void;
    legacyInmo: (idUser: EntityId, movementRestriction: number | boolean, client: RuntimeClient) => void;
    actPositionServer: (
        idMap: number,
        pos: Position,
        heading: number,
        lastProcessedMoveId: number,
        stateVersion: number,
        client: RuntimeClient,
    ) => void;
    moveEntity: (idUser: EntityId, pos: Position, heading: number, client: RuntimeClient) => void;
    actPosition: (idUser: EntityId, pos: Position, client: RuntimeClient) => void;
    deleteCharacter: (idUser: EntityId, client: RuntimeClient) => void;
    dialog: (
        idUser: EntityId,
        msg: string,
        name: string,
        color: string,
        consoleFlag: number | boolean,
        client: RuntimeClient,
    ) => void;
    pong: (
        client: RuntimeClient,
        payload?: {
            token?: number;
        },
    ) => void;
    animFX: (idUser: EntityId, fxGrh: number, client: RuntimeClient) => void;
    createProjectile: (startPos: Position, endPos: Position, grhIndex: number, client: RuntimeClient) => void;
    spellProjectile: (startPos: Position, endPos: Position, spellId: number, client: RuntimeClient) => void;
    spellVisual: (
        payload: {
            startPos?: Position;
            endPos?: Position;
            spellId?: number;
            targetId?: EntityId;
            fxGrh?: number;
            soundId?: number;
            casterId?: EntityId;
            msg?: string;
        },
        client: RuntimeClient,
    ) => void;
    playSound: (idUser: EntityId, idSound: number, client: RuntimeClient) => void;
    updateMana: (mana: number, client: RuntimeClient) => void;
    legacyUpdateMana: (mana: number, client: RuntimeClient) => void;
    updateAgilidad: (agilidad: number, buffSecondsRemaining: number, client: RuntimeClient) => void;
    updateFuerza: (fuerza: number, buffSecondsRemaining: number, client: RuntimeClient) => void;
    updateHP: (hp: number, client: RuntimeClient) => void;
    legacyUpdateHP: (hp: number, client: RuntimeClient) => void;
    updateMaxHP: (idUser: EntityId, hp: number, maxHP: number, client: RuntimeClient) => void;
    telepMe: (
        idUser: EntityId,
        idMap: number,
        pos: Position,
        heading: number,
        stateVersion: number,
        lastProcessedMoveId: number,
        movementLockMs: number,
        client: RuntimeClient,
    ) => void;
    sendMyCharacter: (character: ProtocolCharacter) => void;
    sendNpc: (npc: ProtocolNpc) => void;
    sendLegacyNpc: (npc: ProtocolNpc) => void;
    sendCharacter: (character: ProtocolCharacter, viewerId?: EntityId) => void;
    sendLegacyCharacter: (character: ProtocolCharacter, viewerId?: EntityId) => void;
    areaCharactersSnapshot: (
        characters: ProtocolCharacter[],
        viewerId: EntityId | undefined,
        client: RuntimeClient,
    ) => void;
    areaNpcsSnapshot: (npcs: ProtocolNpc[], client: RuntimeClient) => void;
    areaItemsSnapshot: (items: AreaItemSnapshot[], client: RuntimeClient) => void;
    areaMetaSnapshot: (snapshot: AreaMetaSnapshot, client: RuntimeClient) => void;
    selfFlagsDelta: (payload: SelfFlagsDeltaPayload, client: RuntimeClient) => void;
    selfVitalsDelta: (payload: SelfVitalsDeltaPayload, client: RuntimeClient) => void;
    selfMapMetaDelta: (payload: SelfMapMetaDeltaPayload, client: RuntimeClient) => void;
    entityVitalsDelta: (
        id: EntityId,
        hp: number,
        maxHp: number,
        mana: number,
        maxMana: number,
        client: RuntimeClient,
    ) => void;
    actMyLevel: (idUser: EntityId, client: RuntimeClient) => void;
    actExp: (exp: number, client: RuntimeClient) => void;
    actGold: (gold: number, client: RuntimeClient) => void;
    actOnline: (usersOnline: number) => void;
    error: (msg: string, client: RuntimeClient) => void;
    putBodyAndHeadDead: (idUser: EntityId, client: RuntimeClient) => void;
    revivirUsuario: (idUser: EntityId, client: RuntimeClient) => void;
    quitarUserInvItem: (idUser: EntityId, idPos: number | string, cant: number, client: RuntimeClient) => void;
    renderItem: (idItem: number, idMap: number, pos: Position, client: RuntimeClient) => void;
    deleteItem: (idMap: number, pos: Position, client: RuntimeClient) => void;
    agregarUserInvItem: (idUser: EntityId, idPos: number | string, client: RuntimeClient) => void;
    blockMap: (idMap: number, pos: Position, block: number | boolean, client: RuntimeClient) => void;
    openTrade: (idUser: EntityId, idNpc: EntityId, client: RuntimeClient) => void;
    openCrafting: (payload: CraftingOpenPayload, client: RuntimeClient) => void;
    openMarket: (payload: MarketOpenPayload, client: RuntimeClient) => void;
    openRetos: (payload: RetosOpenPayload, client: RuntimeClient) => void;
    aprenderSpell: (idUser: EntityId, idPosSpell: number | string) => void;
    closeForce: (idUser: EntityId) => void;
    nameMap: (idUser: EntityId) => void;
    changeBody: (idUser: EntityId, client: RuntimeClient) => void;
    navegando: (idUser: EntityId, client: RuntimeClient) => void;
    actColorName: (idUser: EntityId, color: string, client: RuntimeClient) => void;
    openBail: (
        data: {
            kills: number;
            citizensKilled: number;
            fianza: number;
            goldRequired: number;
            goldAvailable: number;
            canPay: boolean;
        },
        client: RuntimeClient,
    ) => void;
    closeBail: (client: RuntimeClient) => void;
    openAdminIntervals: (client: RuntimeClient) => void;
    panelSnapshot: (snapshot: unknown, client: RuntimeClient) => void;
    characterStatsSnapshot: (snapshot: unknown, client: RuntimeClient) => void;
    partyState: (delta: PartyRuntimeStateDelta, client: RuntimeClient) => void;
    clanState: (delta: ClanRuntimeStateDelta, client: RuntimeClient) => void;
    startCastBar: (idUser: EntityId, durationMs: number, client: RuntimeClient) => void;
    stopCastBar: (idUser: EntityId, client: RuntimeClient) => void;
};

function getCharacter(idUser: EntityId) {
    return getCharacterById<ProtocolCharacter>(idUser);
}

function getBuffSecondsRemaining(cooldownStartedAt?: number) {
    if (!cooldownStartedAt || cooldownStartedAt <= 0) {
        return 0;
    }

    const expiresAt = cooldownStartedAt + vars.timing.statusDurations.fuerzaAgilidadBuffMs;
    return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
}

function getInvisibilitySpellRemainingMs(cooldownStartedAt?: number) {
    if (!cooldownStartedAt || cooldownStartedAt <= 0) {
        return 0;
    }

    const expiresAt = cooldownStartedAt + vars.timing.statusDurations.invisibilitySpellMs;
    return Math.max(0, expiresAt - Date.now());
}

function getNpc(idNpc: EntityId) {
    return vars.npcs[idNpc] as ProtocolNpc;
}

function getObject(idItem: number) {
    return vars.datObj[idItem] as DataObject;
}

function getSpell(idSpell: number) {
    return vars.datSpell[idSpell] as DataSpell;
}

function isRazaEnana(idRaza: number) {
    return idRaza === vars.razas.gnomo || idRaza === vars.razas.enano;
}

function itemValidUser(idUser: EntityId, idItem: number) {
    const user = getCharacter(idUser);
    const obj = getObject(idItem);

    if (!user) {
        return 1;
    }

    if (
        (obj.clasesNoPermitidas && obj.clasesNoPermitidas.indexOf(user.idClase) >= 0) ||
        (getRequiredFactionForItem(idItem) !== "none" && user.faction !== getRequiredFactionForItem(idItem)) ||
        (obj.razaEnana && !isRazaEnana(user.idRaza) && obj.objType === vars.objType.armaduras) ||
        (!obj.razaEnana && isRazaEnana(user.idRaza) && obj.objType === vars.objType.armaduras)
    ) {
        return 0;
    }

    return 1;
}

function dataObj(idItem: number) {
    try {
        const obj = getObject(idItem);

        let data = "";
        const itemTier = Number(obj.tier ?? 0);

        switch (obj.objType) {
            case vars.objType.armas:
                data = `Daño: ${obj.minHit}/${obj.maxHit}`;

                if (obj.apu) {
                    data += " | Apuñala";
                }

                if (obj.magicDamageBonus) {
                    data += ` | Bonus daño mágico: ${obj.magicDamageBonus}%`;
                }
                break;

            case vars.objType.anillos: {
                const parts: string[] = [];

                if (obj.minDefMag && obj.maxDefMag) {
                    parts.push(`Defensa Mágica: ${obj.minDefMag}/${obj.maxDefMag}`);
                }

                if (obj.resistenciaMagica) {
                    parts.push(`Resistencia mágica: ${obj.resistenciaMagica}%`);
                }

                if (obj.magicDamageBonus) {
                    parts.push(`Bonus daño mágico: ${obj.magicDamageBonus}%`);
                }

                data = parts.join(" | ");
                break;
            }

            case vars.objType.armaduras:
            case vars.objType.escudos:
            case vars.objType.cascos:
                data = `Defensa: ${obj.minDef}/${obj.maxDef}`;

                if (obj.objType === vars.objType.cascos && obj.minDefMag && obj.maxDefMag) {
                    data += ` | Defensa Mágica: ${obj.minDefMag}/${obj.maxDefMag}`;
                }

                if (obj.resistenciaMagica) {
                    data += ` | Resistencia mágica: ${obj.resistenciaMagica}%`;
                }
                break;

            case vars.objType.flechas:
                data = `Daño: ${obj.minHit}/${obj.maxHit}`;
                break;

            case vars.objType.pergaminos: {
                const spell = getSpell(obj.spellIndex ?? 0);
                const requiredLevel = Math.ceil(Number(spell.minSkill ?? 0) / 3);

                if (spell.minHp && spell.maxHp) {
                    if (spell.subeHp === 1) {
                        data = `Curación: ${spell.minHp}/${spell.maxHp} | `;
                    } else if (spell.subeHp === 2) {
                        data = `Daño: ${spell.minHp}/${spell.maxHp} | `;
                    }
                }

                data += `Maná requerida: ${spell.manaRequired}`;

                if (requiredLevel > 0) {
                    data += ` | Nivel requerido: ${requiredLevel}`;
                }
                break;
            }
        }

        if (itemTier > 0) {
            data += data ? ` | Tier: ${itemTier}` : `Tier: ${itemTier}`;
        }

        return data;
    } catch (err) {
        funct.dumpError(err);
        return "";
    }
}

function writeConsolePayload(
    msg: string,
    color: string | null,
    bold: number | boolean,
    italica: number | boolean,
    channel: ConsoleChannel = "console",
    senderName?: string,
    npcName?: string,
) {
    pkg.setPackageID(pkg.clientPacketID.console);
    pkg.writeString(msg);

    if (color) {
        pkg.writeByte(1);
        pkg.writeString(color);
    } else {
        pkg.writeByte(0);
    }

    pkg.writeByte(bold);
    pkg.writeByte(italica);
    pkg.writeByte(1);
    pkg.writeString(channel);

    if (senderName) {
        pkg.writeByte(1);
        pkg.writeString(senderName);
    } else {
        pkg.writeByte(0);
    }
    // Optional trailing metadata: only this authored entity name may be translated.
    // Older console packets remain valid without the trailing string.
    if (npcName) pkg.writeString(npcName);
}

function writeGlobalNoticePayload(msg: string, durationMs: number) {
    pkg.setPackageID(pkg.clientPacketID.globalNotice);
    pkg.writeString(msg);
    pkg.writeInt(durationMs);
}

function writeInmoPayload(idUser: EntityId, movementRestriction: number | boolean) {
    const user = getCharacter(idUser);

    if (!user) {
        return false;
    }

    pkg.writeByte(movementRestriction);
    pkg.writeByte(user.pos.x);
    pkg.writeByte(user.pos.y);
    pkg.writeInt(getMovementRestrictionRemainingMs(user, vars.timing.statusDurations.crowdControlUserMs));
    return true;
}

function writeCharacterPayload(character: ProtocolCharacter, viewerId?: EntityId, includeExtendedVitals = true) {
    pkg.writeDouble(character.id);
    pkg.writeString(character.nameCharacter);
    pkg.writeByte(character.idClase);
    pkg.writeShort(character.map);
    pkg.writeByte(character.pos.x);
    pkg.writeByte(character.pos.y);
    pkg.writeShort(character.idHead);
    pkg.writeShort(character.idHelmet);
    pkg.writeShort(character.idWeapon);
    pkg.writeShort(character.idShield);
    pkg.writeShort(character.idBody);
    pkg.writeByte(character.privileges);
    pkg.writeByte(character.heading);
    pkg.writeString(character.color);
    pkg.writeString(character.clan);
    pkg.writeByte(character.dead ? 1 : 0);
    pkg.writeByte(character.invisibleSpell ? 1 : 0);
    pkg.writeByte(character.hiddenSkill ? 1 : 0);
    pkg.writeByte(arePartyMembersForViewer(viewerId, character) ? 1 : 0);
    pkg.writeByte(getMovementRestrictionState(character));
    pkg.writeInt(getMovementRestrictionRemainingMs(character, vars.timing.statusDurations.crowdControlUserMs));
    pkg.writeShort(character.hp);
    pkg.writeShort(character.maxHp);

    if (includeExtendedVitals) {
        pkg.writeShort(character.mana);
        pkg.writeShort(character.maxMana);
        pkg.writeByte(character.adminSummonedBot ? 1 : 0);
    }
}

function writeNpcPayload(npc: ProtocolNpc) {
    pkg.writeDouble(npc.id);
    pkg.writeString(npc.nameCharacter);
    pkg.writeByte(npc.idClase);
    pkg.writeShort(npc.map);
    pkg.writeByte(npc.pos.x);
    pkg.writeByte(npc.pos.y);
    pkg.writeShort(npc.idHead);
    pkg.writeShort(npc.idHelmet);
    pkg.writeShort(npc.idWeapon);
    pkg.writeShort(npc.idShield);
    pkg.writeShort(npc.idBody);
    pkg.writeByte(npc.heading);
    pkg.writeString(npc.color);
    pkg.writeString(npc.clan);
    pkg.writeByte(getMovementRestrictionState(npc));
    pkg.writeInt(getMovementRestrictionRemainingMs(npc, vars.timing.statusDurations.crowdControlNpcMs));
    pkg.writeShort(npc.hp);
    pkg.writeShort(npc.maxHp);
}

function writeAreaItemSnapshot(item: AreaItemSnapshot) {
    pkg.writeInt(item.idItem);
    pkg.writeShort(item.map);
    pkg.writeByte(item.pos.x);
    pkg.writeByte(item.pos.y);
}

function writeAreaMetaSnapshot(snapshot: AreaMetaSnapshot) {
    pkg.writeShort(snapshot.map);
    pkg.writeString(snapshot.name);
    pkg.writeShort(snapshot.blockedTiles.length);

    for (const tile of snapshot.blockedTiles) {
        pkg.writeByte(tile.pos.x);
        pkg.writeByte(tile.pos.y);
        pkg.writeByte(tile.blocked);
    }
}

function writeSelfMapMetaDeltaPayload(payload: SelfMapMetaDeltaPayload) {
    let flags = 0;

    if (typeof payload.map === "number") {
        flags |= 1;
    }

    if (typeof payload.name === "string") {
        flags |= 1 << 1;
    }

    if (typeof payload.navegando !== "undefined") {
        flags |= 1 << 2;
    }

    pkg.writeByte(flags);

    if (flags & 1) {
        pkg.writeShort(payload.map ?? 0);
    }

    if (flags & (1 << 1)) {
        pkg.writeString(payload.name ?? "");
    }

    if (flags & (1 << 2)) {
        pkg.writeByte(payload.navegando ?? 0);
    }
}

const handleServer: HandleProtocolApi = {
    changeHeading(idUser, heading, client) {
        pkg.setPackageID(pkg.clientPacketID.changeHeading);
        pkg.writeDouble(idUser);
        pkg.writeByte(heading);
        socket.send(client);
    },

    console(msg, color, bold, italica, client, channel = "console", senderName, npcName) {
        writeConsolePayload(msg, color, bold, italica, channel, senderName, npcName);
        socket.send(client);
    },

    consoleToAll(msg, color, bold, italica) {
        writeConsolePayload(msg, color, bold, italica);
        socket.sendAll(pkg.dataSend());
    },

    globalNotice(msg, durationMs, client) {
        writeGlobalNoticePayload(msg, durationMs);
        socket.send(client);
    },

    globalNoticeToAll(msg, durationMs) {
        writeGlobalNoticePayload(msg, durationMs);
        socket.sendAll(pkg.dataSend());
    },

    changeHelmet(idUser, idHelmet, idPos, client) {
        pkg.setPackageID(pkg.clientPacketID.changeHelmet);
        pkg.writeDouble(idUser);
        pkg.writeShort(idHelmet);
        pkg.writeByte(idPos);
        socket.send(client);
    },

    changeRopa(idUser, idBody, idPos, client) {
        pkg.setPackageID(pkg.clientPacketID.changeRopa);
        pkg.writeDouble(idUser);
        pkg.writeShort(idBody);
        pkg.writeByte(idPos);
        socket.send(client);
    },

    changeWeapon(idUser, idWeapon, idPos, client) {
        pkg.setPackageID(pkg.clientPacketID.changeWeapon);
        pkg.writeDouble(idUser);
        pkg.writeShort(idWeapon);
        pkg.writeByte(idPos);
        socket.send(client);
    },

    changeArrow(idUser, idPos, client) {
        pkg.setPackageID(pkg.clientPacketID.changeArrow);
        pkg.writeDouble(idUser);
        pkg.writeByte(idPos);
        socket.send(client);
    },

    changeShield(idUser, idShield, idPos, client) {
        pkg.setPackageID(pkg.clientPacketID.changeShield);
        pkg.writeDouble(idUser);
        pkg.writeShort(idShield);
        pkg.writeByte(idPos);
        socket.send(client);
    },

    inmo(idUser, movementRestriction, client) {
        pkg.setPackageID(pkg.clientPacketID.tInmo);
        if (!writeInmoPayload(idUser, movementRestriction)) {
            return;
        }
        socket.send(client);
    },

    legacyInmo(idUser, movementRestriction, client) {
        pkg.setPackageID(pkg.clientPacketID.inmo);
        if (!writeInmoPayload(idUser, movementRestriction)) {
            return;
        }
        socket.send(client);
    },

    actPositionServer(idMap, pos, heading, lastProcessedMoveId, stateVersion, client) {
        pkg.setPackageID(pkg.clientPacketID.actPositionServer);
        pkg.writeShort(idMap);
        pkg.writeByte(pos.x);
        pkg.writeByte(pos.y);
        pkg.writeByte(heading);
        pkg.writeInt(lastProcessedMoveId);
        pkg.writeInt(stateVersion);
        socket.send(client);
    },

    moveEntity(idUser, pos, heading, client) {
        pkg.setPackageID(pkg.clientPacketID.moveEntity);
        pkg.writeDouble(idUser);
        pkg.writeByte(pos.x);
        pkg.writeByte(pos.y);
        pkg.writeByte(heading);
        socket.send(client);
    },

    actPosition(idUser, pos, client) {
        pkg.setPackageID(pkg.clientPacketID.actPosition);
        pkg.writeDouble(idUser);
        pkg.writeByte(pos.x);
        pkg.writeByte(pos.y);
        socket.send(client);
    },

    deleteCharacter(idUser, client) {
        pkg.setPackageID(pkg.clientPacketID.deleteCharacter);
        pkg.writeDouble(idUser);
        socket.send(client);
    },

    dialog(idUser, msg, name, color, consoleFlag, client) {
        pkg.setPackageID(pkg.clientPacketID.dialog);
        pkg.writeDouble(idUser);
        pkg.writeString(msg);

        if (name) {
            pkg.writeByte(1);
            pkg.writeString(name);
        } else {
            pkg.writeByte(0);
        }

        pkg.writeString(color);
        pkg.writeByte(consoleFlag);
        socket.send(client);
    },

    pong(
        client,
        payload: {
            token?: number;
        } = {},
    ) {
        pkg.setPackageID(pkg.clientPacketID.pong);
        pkg.writeInt(payload.token ?? 0);
        socket.send(client);
    },

    animFX(idUser, fxGrh, client) {
        pkg.setPackageID(pkg.clientPacketID.animFX);
        pkg.writeDouble(idUser);
        pkg.writeShort(fxGrh);
        socket.send(client);
    },

    createProjectile(startPos, endPos, grhIndex, client) {
        pkg.setPackageID(pkg.clientPacketID.createProjectile);
        pkg.writeByte(startPos.x);
        pkg.writeByte(startPos.y);
        pkg.writeByte(endPos.x);
        pkg.writeByte(endPos.y);
        pkg.writeShort(grhIndex);
        socket.send(client);
    },

    spellProjectile(startPos, endPos, spellId, client) {
        pkg.setPackageID(pkg.clientPacketID.spellProjectile);
        pkg.writeByte(startPos.x);
        pkg.writeByte(startPos.y);
        pkg.writeByte(endPos.x);
        pkg.writeByte(endPos.y);
        pkg.writeShort(spellId);
        socket.send(client);
    },

    spellVisual(payload, client) {
        let flags = 0;
        const hasProjectile = payload.startPos && payload.endPos && Number(payload.spellId ?? 0) > 0;
        const hasFx = Number(payload.fxGrh ?? 0) > 0;
        const hasSound = Number(payload.soundId ?? 0) > 0;
        const hasWords = String(payload.msg ?? "").trim().length > 0 && typeof payload.casterId !== "undefined";

        if (hasProjectile) {
            flags |= 1;
        }

        if (hasFx) {
            flags |= 1 << 1;
        }

        if (hasSound) {
            flags |= 1 << 2;
        }

        if (hasWords) {
            flags |= 1 << 3;
        }

        if (!flags) {
            return;
        }

        pkg.setPackageID(pkg.clientPacketID.spellVisual);
        pkg.writeByte(flags);

        if (hasProjectile) {
            pkg.writeByte(payload.startPos!.x);
            pkg.writeByte(payload.startPos!.y);
            pkg.writeByte(payload.endPos!.x);
            pkg.writeByte(payload.endPos!.y);
            pkg.writeShort(payload.spellId!);
        }

        if (hasFx || hasSound) {
            pkg.writeDouble(payload.targetId ?? 0);
        }

        if (hasFx) {
            pkg.writeShort(payload.fxGrh ?? 0);
        }

        if (hasSound) {
            pkg.writeShort(payload.soundId ?? 0);
        }

        if (hasWords) {
            pkg.writeDouble(payload.casterId ?? 0);
            pkg.writeString(payload.msg ?? "");
        }

        socket.send(client);
    },

    playSound(_idUser, idSound, client) {
        pkg.setPackageID(pkg.clientPacketID.playSound);
        pkg.writeDouble(_idUser);
        pkg.writeShort(idSound);
        socket.send(client);
    },

    updateMana(mana, client) {
        pkg.setPackageID(pkg.clientPacketID.tUpdateMana);
        pkg.writeShort(mana);
        socket.send(client);
    },

    legacyUpdateMana(mana, client) {
        pkg.setPackageID(pkg.clientPacketID.updateMana);
        pkg.writeShort(mana);
        socket.send(client);
    },

    updateAgilidad(agilidad, buffSecondsRemaining, client) {
        pkg.setPackageID(pkg.clientPacketID.updateAgilidad);
        pkg.writeByte(agilidad);
        pkg.writeShort(buffSecondsRemaining);
        socket.send(client);
    },

    updateFuerza(fuerza, buffSecondsRemaining, client) {
        pkg.setPackageID(pkg.clientPacketID.updateFuerza);
        pkg.writeByte(fuerza);
        pkg.writeShort(buffSecondsRemaining);
        socket.send(client);
    },

    updateHP(hp, client) {
        pkg.setPackageID(pkg.clientPacketID.tUpdateHP);
        pkg.writeShort(hp);
        socket.send(client);
    },

    legacyUpdateHP(hp, client) {
        pkg.setPackageID(pkg.clientPacketID.updateHP);
        pkg.writeShort(hp);
        socket.send(client);
    },

    updateMaxHP(_idUser, hp, maxHP, client) {
        pkg.setPackageID(pkg.clientPacketID.updateMaxHP);
        pkg.writeShort(hp);
        pkg.writeShort(hp);
        pkg.writeShort(maxHP);
        socket.send(client);
    },

    telepMe(idUser, idMap, pos, heading, stateVersion, lastProcessedMoveId, movementLockMs, client) {
        pkg.setPackageID(pkg.clientPacketID.telepMe);
        pkg.writeDouble(idUser);
        pkg.writeShort(idMap);
        pkg.writeByte(pos.x);
        pkg.writeByte(pos.y);
        pkg.writeByte(heading);
        pkg.writeInt(lastProcessedMoveId);
        pkg.writeInt(stateVersion);
        pkg.writeInt(movementLockMs);
        socket.send(client);
    },

    sendMyCharacter(character) {
        const agilityBuffSecondsRemaining = getBuffSecondsRemaining(character.cooldownAgilidad);
        const strengthBuffSecondsRemaining = getBuffSecondsRemaining(character.cooldownFuerza);
        const invisibilitySpellRemainingMs = character.invisibleSpell
            ? getInvisibilitySpellRemainingMs(character.cooldownInvisibleSpell)
            : 0;

        pkg.setPackageID(pkg.clientPacketID.getMyCharacter);
        pkg.writeDouble(character.id);
        pkg.writeString(character.nameCharacter);
        pkg.writeByte(character.idClase);
        pkg.writeShort(character.map);
        pkg.writeByte(character.pos.x);
        pkg.writeByte(character.pos.y);
        pkg.writeShort(character.idHead);
        pkg.writeShort(character.idHelmet);
        pkg.writeShort(character.idWeapon);
        pkg.writeShort(character.idShield);
        pkg.writeShort(character.idBody);
        pkg.writeShort(character.hp);
        pkg.writeShort(character.hp);
        pkg.writeShort(character.maxHp);
        pkg.writeShort(character.mana);
        pkg.writeShort(character.mana);
        pkg.writeShort(character.maxMana);
        pkg.writeByte(character.privileges);
        pkg.writeDouble(character.exp);
        pkg.writeDouble(character.expNextLevel);
        pkg.writeByte(character.level);
        pkg.writeInt(balance.clampGold(character.gold));
        pkg.writeByte(character.heading);
        pkg.writeByte(getMovementRestrictionState(character));
        pkg.writeByte(getMovementRestrictionState(character));
        pkg.writeInt(getMovementRestrictionRemainingMs(character, vars.timing.statusDurations.crowdControlUserMs));
        pkg.writeByte(character.zonaSegura);
        pkg.writeByte(character.seguroActivado);
        pkg.writeByte(character.seguroClanActivado);
        pkg.writeString(character.color);
        pkg.writeString(character.clan);
        pkg.writeByte(character.dead ? 1 : 0);
        pkg.writeByte(character.deadWorldActive ? 1 : 0);
        pkg.writeByte(character.invisibleAdmin ? 1 : 0);
        pkg.writeByte(character.invisibleSpell ? 1 : 0);
        pkg.writeByte(character.hiddenSkill ? 1 : 0);
        pkg.writeByte(character.navegando);
        pkg.writeByte(character.attrAgilidad);
        pkg.writeByte(character.attrFuerza);
        pkg.writeByte(character.attrInteligencia);
        pkg.writeByte(character.attrConstitucion);
        pkg.writeShort(character.minHit);
        pkg.writeShort(character.maxHit);
        pkg.writeShort(agilityBuffSecondsRemaining);
        pkg.writeShort(strengthBuffSecondsRemaining);
        pkg.writeInt(character.stateVersion);
        pkg.writeByte(Object.keys(character.inv).length);

        for (const idPos in character.inv) {
            const item = character.inv[idPos];
            const idItem = item.idItem;
            const obj = getObject(idItem);

            if (!obj) {
                continue;
            }

            pkg.writeByte(idPos);
            pkg.writeInt(idItem);
            pkg.writeString(obj.name);
            pkg.writeByte(item.equipped);
            pkg.writeShort(obj.grhIndex);
            pkg.writeShort(item.cant);
            pkg.writeInt(obj.valor);
            pkg.writeByte(obj.objType);
            pkg.writeByte(itemValidUser(character.id, idItem));
            pkg.writeString(dataObj(idItem));
        }

        if (character.maxMana > 0) {
            pkg.writeByte(Object.keys(character.spells).length);

            for (const idPos in character.spells) {
                const spell = character.spells[idPos];
                const idSpell = spell.idSpell;
                const datSpell = getSpell(idSpell);

                if (!datSpell) {
                    continue;
                }

                pkg.writeByte(idPos);
                pkg.writeShort(idSpell);
                pkg.writeString(datSpell.name);
                pkg.writeShort(datSpell.manaRequired);
            }
        }

        pkg.writeInt(invisibilitySpellRemainingMs);
    },

    sendNpc(npc) {
        if (!npc) {
            return;
        }

        pkg.setPackageID(pkg.clientPacketID.getNpc);
        writeNpcPayload(npc);
        pkg.writeByte(0);
    },

    sendLegacyNpc(npc) {
        if (!npc) {
            return;
        }

        pkg.setPackageID(pkg.clientPacketID.getNpc);
        writeNpcPayload(npc);
        pkg.writeByte(1);
    },

    sendCharacter(character, viewerId) {
        if (!character) {
            return;
        }

        pkg.setPackageID(pkg.clientPacketID.getCharacter);
        writeCharacterPayload(character, viewerId);
        pkg.writeByte(0);
    },

    sendLegacyCharacter(character, viewerId) {
        if (!character) {
            return;
        }

        pkg.setPackageID(pkg.clientPacketID.getCharacter);
        writeCharacterPayload(character, viewerId, false);
        pkg.writeByte(1);
    },

    areaCharactersSnapshot(characters, viewerId, client) {
        pkg.setPackageID(pkg.clientPacketID.areaCharactersSnapshot);
        pkg.writeShort(characters.length);

        for (const character of characters) {
            writeCharacterPayload(character, viewerId);
            pkg.writeByte(0);
        }

        socket.send(client);
    },

    areaNpcsSnapshot(npcs, client) {
        pkg.setPackageID(pkg.clientPacketID.areaNpcsSnapshot);
        pkg.writeShort(npcs.length);

        for (const npc of npcs) {
            writeNpcPayload(npc);
            pkg.writeByte(0);
        }

        socket.send(client);
    },

    areaItemsSnapshot(items, client) {
        pkg.setPackageID(pkg.clientPacketID.areaItemsSnapshot);
        pkg.writeShort(items.length);

        for (const item of items) {
            writeAreaItemSnapshot(item);
        }

        socket.send(client);
    },

    areaMetaSnapshot(snapshot, client) {
        pkg.setPackageID(pkg.clientPacketID.areaMetaSnapshot);
        writeAreaMetaSnapshot(snapshot);
        socket.send(client);
    },

    selfFlagsDelta(payload, client) {
        pkg.setPackageID(pkg.clientPacketID.selfFlagsDelta);
        pkg.writeByte(payload.zonaSegura);
        pkg.writeByte(payload.seguroActivado);
        pkg.writeByte(payload.seguroClanActivado);
        socket.send(client);
    },

    selfVitalsDelta(payload, client) {
        pkg.setPackageID(pkg.clientPacketID.selfVitalsDelta);
        pkg.writeShort(payload.hp);
        pkg.writeShort(payload.maxHp);
        pkg.writeShort(payload.mana);
        pkg.writeShort(payload.maxMana);
        socket.send(client);
    },

    entityVitalsDelta(id, hp, maxHp, mana, maxMana, client) {
        pkg.setPackageID(pkg.clientPacketID.entityVitalsDelta);
        pkg.writeDouble(id);
        pkg.writeShort(hp);
        pkg.writeShort(maxHp);
        pkg.writeShort(mana);
        pkg.writeShort(maxMana);
        socket.send(client);
    },

    selfMapMetaDelta(payload, client) {
        pkg.setPackageID(pkg.clientPacketID.selfMapMetaDelta);
        writeSelfMapMetaDeltaPayload(payload);
        socket.send(client);
    },

    actMyLevel(idUser, client) {
        const user = getCharacter(idUser);

        if (!user) {
            return;
        }

        pkg.setPackageID(pkg.clientPacketID.actMyLevel);
        pkg.writeDouble(user.exp);
        pkg.writeDouble(user.expNextLevel);
        pkg.writeByte(user.level);
        pkg.writeShort(user.hp);
        pkg.writeShort(user.hp);
        pkg.writeShort(user.maxHp);
        pkg.writeShort(user.mana);
        pkg.writeShort(user.mana);
        pkg.writeShort(user.maxMana);
        socket.send(client);
    },

    actExp(exp, client) {
        pkg.setPackageID(pkg.clientPacketID.actExp);
        pkg.writeDouble(exp);
        socket.send(client);
    },

    actGold(gold, client) {
        pkg.setPackageID(pkg.clientPacketID.actGold);
        pkg.writeInt(balance.clampGold(gold));
        socket.send(client);
    },

    actOnline(usersOnline) {
        pkg.setPackageID(pkg.clientPacketID.actOnline);
        pkg.writeShort(usersOnline);
        socket.sendAll(pkg.dataSend());
    },

    error(msg, client) {
        pkg.setPackageID(pkg.clientPacketID.error);
        pkg.writeString(msg);
        socket.send(client);
        socket.close(client);
    },

    putBodyAndHeadDead(idUser, client) {
        const user = getCharacter(idUser);

        if (!user) {
            return;
        }

        pkg.setPackageID(pkg.clientPacketID.putBodyAndHeadDead);
        pkg.writeDouble(idUser);
        pkg.writeShort(user.idHead);
        pkg.writeShort(user.idHelmet);
        pkg.writeShort(user.idWeapon);
        pkg.writeShort(user.idShield);
        pkg.writeShort(user.idBody);
        socket.send(client);
    },

    revivirUsuario(idUser, client) {
        const user = getCharacter(idUser);

        if (!user) {
            return;
        }

        pkg.setPackageID(pkg.clientPacketID.revivirUsuario);
        pkg.writeDouble(idUser);
        pkg.writeShort(user.idHead);
        pkg.writeShort(user.idBody);
        socket.send(client);
    },

    startCastBar(idUser, durationMs, client) {
        pkg.setPackageID(pkg.clientPacketID.startCastBar);
        pkg.writeDouble(idUser);
        pkg.writeInt(durationMs);
        socket.send(client);
    },

    stopCastBar(idUser, client) {
        pkg.setPackageID(pkg.clientPacketID.stopCastBar);
        pkg.writeDouble(idUser);
        socket.send(client);
    },

    quitarUserInvItem(idUser, idPos, cant, client) {
        pkg.setPackageID(pkg.clientPacketID.quitarUserInvItem);
        pkg.writeDouble(idUser);
        pkg.writeByte(idPos);
        pkg.writeShort(cant);
        socket.send(client);
    },

    renderItem(idItem, idMap, pos, client) {
        pkg.setPackageID(pkg.clientPacketID.renderItem);
        pkg.writeInt(idItem);
        pkg.writeShort(idMap);
        pkg.writeByte(pos.x);
        pkg.writeByte(pos.y);
        socket.send(client);
    },

    deleteItem(idMap, pos, client) {
        pkg.setPackageID(pkg.clientPacketID.deleteItem);
        pkg.writeShort(idMap);
        pkg.writeByte(pos.x);
        pkg.writeByte(pos.y);
        socket.send(client);
    },

    agregarUserInvItem(idUser, idPos, client) {
        pkg.setPackageID(pkg.clientPacketID.agregarUserInvItem);

        const user = getCharacter(idUser);
        if (!user) {
            return;
        }

        const item = user.inv[String(idPos)];

        if (!item) {
            return;
        }

        const idItem = item.idItem;
        const obj = getObject(idItem);

        pkg.writeByte(idPos);
        pkg.writeInt(idItem);
        pkg.writeString(obj.name);
        pkg.writeByte(item.equipped);
        pkg.writeShort(obj.grhIndex);
        pkg.writeShort(item.cant);
        pkg.writeInt(Math.floor(obj.valor / 3));
        pkg.writeByte(obj.objType);
        pkg.writeByte(itemValidUser(idUser, idItem));
        pkg.writeString(dataObj(idItem));

        socket.send(client);
    },

    blockMap(idMap, pos, block, client) {
        pkg.setPackageID(pkg.clientPacketID.blockMap);
        pkg.writeShort(idMap);
        pkg.writeByte(pos.x);
        pkg.writeByte(pos.y);
        pkg.writeByte(block);
        socket.send(client);
    },

    openTrade(idUser, idNpc, client) {
        const user = getCharacter(idUser);
        const npc = getNpc(idNpc);

        if (!user || !npc) {
            return;
        }

        const isBankTrade = user.tradeMode === "bank" || npc.npcType === vars.npcType.banquero;
        const tradeObjects = (isBankTrade ? (user.tradeBankItems ?? user.bank ?? {}) : (npc.objs ?? {})) as Record<
            string,
            {
                item?: number;
                idItem?: number;
                cant: number;
            }
        >;
        const serializedTradeItems = Object.entries(tradeObjects)
            .map(([indexObj, item]) => {
                const idItem = isBankTrade ? item.idItem : item.item;

                if (typeof idItem !== "number") {
                    return null;
                }

                if (!isBankTrade && !canBuyFromNpc(idItem, vars.datObj, vars.datNpc, vars.craftingRecipes ?? [], vars.smeltingRecipes ?? [])) return null;

                return {
                    indexObj,
                    item,
                    idItem,
                };
            })
            .filter(
                (
                    entry,
                ): entry is {
                    indexObj: string;
                    item: { item?: number; idItem?: number; cant: number };
                    idItem: number;
                } => entry !== null,
            );

        pkg.setPackageID(pkg.clientPacketID.openTrade);
        pkg.writeByte(isBankTrade ? 1 : 0);
        pkg.writeByte(serializedTradeItems.length);

        for (const { indexObj, item, idItem } of serializedTradeItems) {
            const objItem = getObject(idItem);

            pkg.writeByte(Number(indexObj));
            pkg.writeShort(objItem.grhIndex);
            pkg.writeString(objItem.name);
            pkg.writeShort(item.cant);
            pkg.writeInt(isBankTrade ? 0 : objItem.valor);
            pkg.writeByte(itemValidUser(idUser, idItem));
            pkg.writeString(dataObj(idItem));
        }

        pkg.writeByte(Object.keys(user.inv).length);

        for (const idPos in user.inv) {
            const itemUser = user.inv[idPos];
            const idItem = itemUser.idItem;
            const obj = getObject(idItem);

            pkg.writeShort(obj.grhIndex);
            pkg.writeString(obj.name);
            pkg.writeShort(itemUser.cant);
            pkg.writeInt(Math.floor(obj.valor / 3));
            pkg.writeByte(itemUser.equipped);
            pkg.writeByte(idPos);
            pkg.writeByte(itemValidUser(idUser, idItem));
            pkg.writeString(dataObj(idItem));
        }

        if (isBankTrade) {
            const bankTab = user.tradeBankTab === "account" ? 1 : user.tradeBankTab === "clan" ? 2 : 0;
            pkg.writeByte(bankTab);
            pkg.writeInt(Math.max(0, Math.floor(Number(user.tradeBankGold ?? 0))));
            pkg.writeByte(user.tradeHasClanVault ? 1 : 0);
            pkg.writeString(user.tradeClanName ?? "");
        }

        socket.send(client);
    },

    openCrafting(payload, client) {
        pkg.setPackageID(pkg.clientPacketID.openCrafting);
        pkg.writeString(JSON.stringify(payload));
        socket.send(client);
    },

    openMarket(payload, client) {
        pkg.setPackageID(pkg.clientPacketID.openMarket);
        pkg.writeString(JSON.stringify(payload));
        socket.send(client);
    },

    openRetos(payload, client) {
        pkg.setPackageID(pkg.clientPacketID.openRetos);
        pkg.writeString(JSON.stringify(payload));
        socket.send(client);
    },

    aprenderSpell(idUser, idPosSpell) {
        const user = getCharacter(idUser);
        const client = getClientById(idUser);

        if (!user || !client) {
            return;
        }

        const spell = user.spells[String(idPosSpell)];

        if (!spell) {
            return;
        }

        const idSpell = spell.idSpell;
        const datSpell = getSpell(idSpell);

        pkg.setPackageID(pkg.clientPacketID.aprenderSpell);
        pkg.writeByte(idPosSpell);
        pkg.writeShort(idSpell);
        pkg.writeString(datSpell.name);
        pkg.writeShort(datSpell.manaRequired);
        socket.send(client);
    },

    closeForce(idUser) {
        const client = getClientById(idUser);

        if (!client) {
            return;
        }

        pkg.setPackageID(pkg.clientPacketID.closeForce);
        socket.send(client);
    },

    nameMap(idUser) {
        const user = getCharacter(idUser);

        if (!user) {
            return;
        }

        const client = getClientById(idUser);

        if (!client) {
            return;
        }

        pkg.setPackageID(pkg.clientPacketID.nameMap);
        pkg.writeString(vars.mapData[user.map].name);
        socket.send(client);
    },

    changeBody(idUser, client) {
        const user = getCharacter(idUser);

        if (!user) {
            return;
        }

        pkg.setPackageID(pkg.clientPacketID.changeBody);
        pkg.writeDouble(idUser);
        pkg.writeShort(user.idHead);
        pkg.writeShort(user.idBody);
        pkg.writeShort(user.idHelmet);
        pkg.writeShort(user.idWeapon);
        pkg.writeShort(user.idShield);
        socket.send(client);
    },

    navegando(idUser, client) {
        const user = getCharacter(idUser);

        if (!user) {
            return;
        }

        pkg.setPackageID(pkg.clientPacketID.navegando);
        pkg.writeByte(user.navegando);
        socket.send(client);
    },

    actColorName(idUser, color, client) {
        pkg.setPackageID(pkg.clientPacketID.actColorName);
        pkg.writeDouble(idUser);
        pkg.writeString(color);
        socket.send(client);
    },

    openBail(data, client) {
        pkg.setPackageID(pkg.clientPacketID.openBail);
        pkg.writeInt(data.kills);
        pkg.writeInt(data.citizensKilled);
        pkg.writeInt(data.fianza);
        pkg.writeInt(data.goldRequired);
        pkg.writeInt(data.goldAvailable);
        pkg.writeByte(data.canPay);
        socket.send(client);
    },

    closeBail(client) {
        pkg.setPackageID(pkg.clientPacketID.closeBail);
        socket.send(client);
    },

    openAdminIntervals(client) {
        pkg.setPackageID(pkg.clientPacketID.openAdminIntervals);
        socket.send(client);
    },

    panelSnapshot(snapshot, client) {
        const serializedSnapshot = JSON.stringify(snapshot);
        const chunks = splitSnapshotIntoChunks(serializedSnapshot);

        if (chunks.length === 1) {
            pkg.setPackageID(pkg.clientPacketID.panelSnapshot);
            pkg.writeString(serializedSnapshot);
            socket.send(client);
            return;
        }

        chunks.forEach((chunk, index) => {
            pkg.setPackageID(pkg.clientPacketID.panelSnapshotChunk);
            pkg.writeShort(index);
            pkg.writeShort(chunks.length);
            pkg.writeString(chunk);
            socket.send(client);
        });
    },

    characterStatsSnapshot(snapshot, client) {
        const serializedSnapshot = JSON.stringify(snapshot);
        const chunks = splitSnapshotIntoChunks(serializedSnapshot);

        if (chunks.length === 1) {
            pkg.setPackageID(pkg.clientPacketID.characterStatsSnapshot);
            pkg.writeString(serializedSnapshot);
            socket.send(client);
            return;
        }

        chunks.forEach((chunk, index) => {
            pkg.setPackageID(pkg.clientPacketID.characterStatsSnapshotChunk);
            pkg.writeShort(index);
            pkg.writeShort(chunks.length);
            pkg.writeString(chunk);
            socket.send(client);
        });
    },

    partyState(delta, client) {
        pkg.setPackageID(pkg.clientPacketID.partyState);
        pkg.writeString(JSON.stringify(delta));
        socket.send(client);
    },

    clanState(delta, client) {
        pkg.setPackageID(pkg.clientPacketID.clanState);
        pkg.writeString(JSON.stringify(delta));
        socket.send(client);
    },
};

module.exports = handleServer;
