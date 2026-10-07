import type { GameApi } from "./game";
import type { HandleProtocolApi } from "./handleProtocol";
import type { SocketApi } from "./socket";
import { getCharacterById, getClientById } from "./runtimeRegistry";
import type {
    DataSpell,
    DropItem,
    EntityId,
    InventoryRecord,
    NpcSpellSlot,
    NumericFlag,
    Position,
    RespawnPosition,
    RouteCoord,
    RuntimeCallback,
    RuntimeCharacter,
    RuntimeClient,
    RuntimeNpc,
} from "./types/runtime";
import { setNpcRespawnCooldown, type NpcRespawnEntry } from "./npcRespawnCooldowns";
import * as safeZone from "./safeZone";

export {};

const vars = require("./vars");
const socket = require("./socket") as SocketApi;
const funct = require("./functions");
const game = require("./game") as GameApi;
const handleProtocol = require("./handleProtocol") as HandleProtocolApi;

const AREA_RANGE_X = vars.areaVisionRangeX as number;
const AREA_RANGE_Y = vars.areaVisionRangeY as number;
const AREA_DIAMETER_X = vars.areaVisionDiameterX as number;
const AREA_DIAMETER_Y = vars.areaVisionDiameterY as number;
const AREA_OUTSIDE_OFFSET_X = vars.areaVisionOutsideOffsetX as number;
const AREA_OUTSIDE_OFFSET_Y = vars.areaVisionOutsideOffsetY as number;
const DEFAULT_NPC_SPELL_CAST_INTERVAL_MS = 8000;
const DEFAULT_NPC_SPELL_RANGE_X = 11;
const DEFAULT_NPC_SPELL_RANGE_Y = 9;
const DRAGON_RESPAWN_COOLDOWN_MS = 1 * 60 * 60 * 1000;
const COMBAT_HIT_FX_ID = 14;
const COMBAT_SHIELD_BLOCK_FX_ID = 88;
const COMBAT_MISS_FX_ID = 90;

type Direction = number;
type NpcCharacter = RuntimeNpc & {
    id: EntityId;
    nameCharacter: string;
    idClase: number;
    idHead: number;
    idHelmet: number;
    idWeapon: number;
    idBody: number;
    idShield: number;
    npcType: number;
    hp: number;
    maxHp: number;
    minHit: number;
    maxHit: number;
    def: number;
    poderAtaque: number;
    poderEvasion: number;
    movement: number;
    color: string;
    map: number;
    pos: Position;
    gold: number;
    heading: number;
    moveOffsetX: number;
    moveOffsetY: number;
    inmovilizado: NumericFlag;
    paralizado: NumericFlag;
    fxId: number;
    frameFxCounter: number;
    zonaSegura: NumericFlag;
    exp: number;
    isNpc: true;
    drop: DropItem[];
    rute: RouteCoord[];
    clan: string;
    cooldownAtaque: number;
    cooldownParalizado: number;
    aguaValida: NumericFlag;
    tierraInvalida: NumericFlag;
    snd1: number;
    snd2: number;
    soundClose: number;
    spellCastIntervalMs: number;
    lastSpellCastAt: number;
    spellRange: number;
    spells: NpcSpellSlot[];
    desc: string;
    toPos?: Position;
    nextThinkAt?: number;
    pathTargetId?: EntityId;
    pathTargetPos?: Position;
    nextPathfindAt?: number;
    lastChasePos?: Position;
    currentTargetId?: EntityId;
    currentTargetLockedUntil?: number;
    lastAggressorId?: EntityId;
    lastAggressedAt?: number;
    reservedAttackTargetId?: EntityId;
    reservedAttackPos?: Position;
    attackReservationExpiresAt?: number;
};
type PlayerCharacter = RuntimeCharacter & {
    id: EntityId;
    map: number;
    pos: Position;
    hp: number;
    nameCharacter: string;
    gold: number;
    idItemShield: number | string;
    idItemHelmet: number | string;
    idItemBody: number | string;
    navegando: NumericFlag;
    meditar: boolean;
    inmovilizado: NumericFlag;
    paralizado: NumericFlag;
    disconnectOnDeath?: boolean;
    inv: InventoryRecord;
    summons?: EntityId[];
    summonTargetNpcId?: EntityId;
};
type NpcFollowTarget = {
    id: EntityId;
    map: number;
    pos: Position;
    hp: number;
};
type SummonedNpc = NpcCharacter & {
    summonedByUserId: EntityId;
    summonExpiresAt: number;
    summonCreatedAt: number;
};

function emitCharacterFxToUserArea(entityId: EntityId, fxId: number) {
    const userClient = getClientById(entityId);
    if (!userClient) {
        return;
    }

    game.loopArea(userClient, function (target) {
        if (target.isNpc) {
            return;
        }

        withUserClient(target.id, (targetClient) => {
            handleProtocol.animFX(entityId, fxId, targetClient);
        });
    });
}

export type NpcsApi = {
    createNpc: () => NpcCharacter;
    spawnSummon: (idUser: EntityId, idSpell: number, targetPos: Position) => EntityId | 0;
    removeOwnerSummons: (idUser: EntityId) => void;
    muereNpc: (idNpc: EntityId) => void;
    findDirection: (posNpc: Position, posUser: Position) => Direction;
    npcAttackUser: (idNpc: EntityId, targetPressure: Map<EntityId, number>) => void;
    posMovement: (heading: Direction, idNpc: EntityId) => Position;
    moveNpcByPos: (idNpc: EntityId, pos: Position) => void;
    processPendingMovements: () => void;
    loopArea: (idNpc: EntityId, callback: RuntimeCallback<PlayerCharacter>) => void;
    loopAreaPos: (idMap: number, pos: Position, callback: RuntimeCallback<PlayerCharacter>) => void;
    npcToArea: (idNpc: EntityId, heading: Direction) => void;
    deleteUserToAllNpcs: (idUser: EntityId) => void;
    tirarItems: (idNpc: EntityId, ws: RuntimeClient) => void;
    tirarItemAlSuelo: (
        idItem: number,
        cant: number,
        idMap: number,
        pos: Position,
        ignoreOccupantId?: EntityId,
        excludedPositions?: Set<string>,
    ) => void;
};

function getNpc(idNpc: EntityId) {
    return vars.npcs[idNpc] as NpcCharacter;
}

function getNpcRespawnEntry(npc: NpcCharacter): NpcRespawnEntry | null {
    const npcIndex = Number(npc.templateNpcIndex ?? 0);
    const spawnMapNum = Number(npc.spawnMapNum ?? npc.map ?? 0);
    const spawnX = Number(npc.spawnOrigin?.x ?? 0);
    const spawnY = Number(npc.spawnOrigin?.y ?? 0);

    if (!npcIndex || !spawnMapNum || !spawnX || !spawnY) {
        return null;
    }

    return {
        mapNum: spawnMapNum,
        x: spawnX,
        y: spawnY,
        npcIndex,
    };
}

function getNpcRespawnCooldownMs(npc: NpcCharacter): number {
    if (Number(npc.npcType ?? 0) === Number(vars.npcType.dragon)) {
        return DRAGON_RESPAWN_COOLDOWN_MS;
    }

    return 0;
}

function getUser(idUser: EntityId) {
    return getCharacterById<PlayerCharacter>(idUser);
}

function withUserClient(idUser: EntityId | null | undefined, callback: (client: RuntimeClient) => void) {
    const client = getClientById(idUser);

    if (!client) {
        return;
    }

    callback(client);
}

function addFlushGroupClient(clientMap: Map<string, RuntimeClient>, clientId: EntityId | null | undefined) {
    const client = getClientById(clientId);

    if (!client) {
        return;
    }

    clientMap.set(String(client.id ?? clientId), client);
}

function collectNpcCombatFlushGroupClients(
    npc: Pick<NpcCharacter, "id" | "map" | "pos">,
    options: {
        includeTargetArea?: {
            mapId: number;
            pos: Position;
        };
        extraClientIds?: Array<EntityId | null | undefined>;
    } = {},
) {
    const clients = new Map<string, RuntimeClient>();

    npcs.loopArea(npc.id, (areaUser) => {
        addFlushGroupClient(clients, areaUser.id);
    });

    if (options.includeTargetArea) {
        npcs.loopAreaPos(options.includeTargetArea.mapId, options.includeTargetArea.pos, (areaUser) => {
            addFlushGroupClient(clients, areaUser.id);
        });
    }

    for (const clientId of options.extraClientIds ?? []) {
        addFlushGroupClient(clients, clientId);
    }

    return [...clients.values()];
}

function withClientFlushGroups<T>(clients: RuntimeClient[], callback: () => T): T {
    const uniqueClients = [
        ...new Map(clients.map((client) => [String(client.id ?? client.clientIp ?? Math.random()), client])).values(),
    ];

    for (const client of uniqueClients) {
        socket.beginFlushGroup(client);
    }

    try {
        return callback();
    } finally {
        for (let index = uniqueClients.length - 1; index >= 0; index -= 1) {
            socket.endFlushGroup(uniqueClients[index]);
        }
    }
}

function getSpellData(idSpell: number) {
    return vars.datSpell[idSpell] as DataSpell | undefined;
}

function isSafeZonePosition(mapId: number | undefined, pos: Position | undefined) {
    return safeZone.isSafeZonePosition(mapId, pos);
}

function isUnsafeArenaPosition(mapId: number | undefined, pos: Position | undefined) {
    return safeZone.isUnsafeArenaPosition(mapId, pos);
}

function isArenaCombatCharacter(user: PlayerCharacter | undefined) {
    return Boolean(user && (user.pvpChar || user.arenaRoomId || user.challengeMatchId));
}

function canRenderCharacter(viewerId: EntityId, character: PlayerCharacter | undefined) {
    if (!character) {
        return true;
    }

    if (character.id === viewerId) {
        return true;
    }

    return !(character.privileges === 1 && character.invisibleAdmin);
}

function getEquippedInventoryItem(user: PlayerCharacter, slotId: number | string | undefined) {
    if (!slotId) {
        return null;
    }

    return user.inv[String(slotId)] ?? null;
}

function getUserMagicDefense(user: PlayerCharacter): number {
    let total = 0;

    for (const slotId of [user.idItemHelmet, user.idItemBody, user.idItemShield]) {
        const inventoryItem = getEquippedInventoryItem(user, slotId);

        if (!inventoryItem) {
            continue;
        }

        const itemData = vars.datObj[inventoryItem.idItem];

        if (itemData?.minDefMag && itemData?.maxDefMag) {
            total += funct.randomIntFromInterval(itemData.minDefMag, itemData.maxDefMag);
        }
    }

    return total;
}

function getUserMagicResistanceBonus(user: PlayerCharacter): number {
    let total = 0;

    for (const slotId of [user.idItemHelmet, user.idItemBody, user.idItemShield]) {
        const inventoryItem = getEquippedInventoryItem(user, slotId);

        if (!inventoryItem) {
            continue;
        }

        total += Number(vars.datObj[inventoryItem.idItem]?.resistenciaMagica ?? 0);
    }

    return total;
}

function getUserClassMagicResistanceBonus(user: PlayerCharacter): number {
    const modifier = Number(vars.modResistenciaMagica?.[Number(user.idClase ?? 0)] ?? 0);
    return Number.isFinite(modifier) ? modifier : 0;
}

function applyNpcSpellDamageToUser(baseDamage: number, user: PlayerCharacter): number {
    let damage = baseDamage;
    const magicResistance = getUserMagicResistanceBonus(user) + getUserClassMagicResistanceBonus(user);

    if (magicResistance > 0) {
        damage -= Math.floor((damage * magicResistance) / 100);
    }

    damage -= getUserMagicDefense(user);
    return damage;
}

function isWithinNpcSpellRange(npc: NpcCharacter, target: NpcFollowTarget) {
    const deltaX = Math.abs(npc.pos.x - target.pos.x);
    const deltaY = Math.abs(npc.pos.y - target.pos.y);

    if (deltaX > DEFAULT_NPC_SPELL_RANGE_X || deltaY > DEFAULT_NPC_SPELL_RANGE_Y) {
        return false;
    }

    if ((npc.spellRange ?? 0) <= 0) {
        return true;
    }

    return getManhattanDistance(npc.pos, target.pos) <= npc.spellRange;
}

function getAvailableNpcSpellSlots(npc: NpcCharacter) {
    const now = Date.now();
    const baseSpellIntervalMs = Math.max(0, Number(npc.spellCastIntervalMs ?? 0)) || DEFAULT_NPC_SPELL_CAST_INTERVAL_MS;

    if (now - Number(npc.lastSpellCastAt ?? 0) < baseSpellIntervalMs) {
        return [];
    }

    return (npc.spells ?? []).filter((slot) => {
        if (Number(slot?.idSpell ?? 0) <= 0 || !getSpellData(Number(slot.idSpell))) {
            return false;
        }

        const cooldownMs = Math.max(0, Number(slot.cooldownSeconds ?? 0)) * 1000;
        return now - Number(slot.lastUsedAt ?? 0) >= cooldownMs;
    });
}

function chooseNpcSpell(npc: NpcCharacter, target: PlayerCharacter) {
    const availableSpells = getAvailableNpcSpellSlots(npc);
    const healingSpells = availableSpells.filter((slot) => {
        const datSpell = getSpellData(Number(slot.idSpell));
        return Boolean(datSpell?.subeHp === 1 && npc.hp < npc.maxHp);
    });

    if (healingSpells.length > 0 && npc.hp <= Math.max(1, Math.floor(npc.maxHp * 0.75))) {
        return healingSpells[funct.randomIntFromInterval(0, healingSpells.length - 1)] as NpcSpellSlot;
    }

    if (!isWithinNpcSpellRange(npc, target)) {
        return;
    }

    const offensiveSpells = availableSpells.filter((slot) => {
        const datSpell = getSpellData(Number(slot.idSpell));

        if (!datSpell) {
            return false;
        }

        if ((datSpell.paraliza || datSpell.inmoviliza) && (target.paralizado || target.inmovilizado)) {
            return false;
        }

        return Boolean(datSpell.paraliza || datSpell.inmoviliza || datSpell.subeHp === 2);
    });

    if (offensiveSpells.length === 0) {
        return;
    }

    return offensiveSpells[funct.randomIntFromInterval(0, offensiveSpells.length - 1)] as NpcSpellSlot;
}

function sendNpcSpellFeedback(npc: NpcCharacter, targetId: EntityId, datSpell: DataSpell) {
    const fxId = Number(datSpell.fxGrh ?? 0);
    const soundId = Number(datSpell.wav ?? 0);
    const magicalWords = String(datSpell.palabrasMagicas ?? "").trim();

    npcs.loopArea(npc.id, (areaUser) => {
        withUserClient(areaUser.id, (targetClient) => {
            if (fxId > 0) {
                handleProtocol.animFX(targetId, fxId, targetClient);
            }

            if (soundId > 0) {
                handleProtocol.playSound(targetId, soundId, targetClient);
            }

            if (magicalWords.length > 0) {
                handleProtocol.dialog(npc.id, magicalWords, "", "#E69500", 0, targetClient);
            }
        });
    });
}

function sendNpcSpellProjectileToArea(npc: NpcCharacter, target: PlayerCharacter, spellId: number) {
    const isArenaProjectile =
        isArenaCombatCharacter(target) ||
        (isUnsafeArenaPosition(npc.map, npc.pos) && isUnsafeArenaPosition(target.map, target.pos));

    if (
        spellId <= 0 ||
        (!isArenaProjectile && (isSafeZonePosition(npc.map, npc.pos) || isSafeZonePosition(target.map, target.pos)))
    ) {
        return;
    }

    const sentClientIds = new Set<number>();
    const trySendToClient = (viewer: PlayerCharacter) => {
        if (sentClientIds.has(Number(viewer.id)) || !canRenderCharacter(viewer.id, target)) {
            return;
        }

        withUserClient(viewer.id, (targetClient) => {
            sentClientIds.add(Number(viewer.id));
            handleProtocol.spellProjectile(
                { x: npc.pos.x, y: npc.pos.y },
                { x: target.pos.x, y: target.pos.y },
                spellId,
                targetClient,
            );
        });
    };

    npcs.loopArea(npc.id, (areaUser) => {
        trySendToClient(areaUser);
    });

    npcs.loopAreaPos(target.map, target.pos, (areaUser) => {
        trySendToClient(areaUser);
    });
}

function handleNpcSpellKillUser(npc: NpcCharacter, user: PlayerCharacter) {
    npcs.deleteUserToAllNpcs(user.id);
    user.hp = 0;
    withUserClient(user.id, (userClient) => {
        handleProtocol.updateHP(user.hp, userClient);
    });
    game.putBodyAndHeadDead(user.id);

    void game.tirarItemsUser(user.id);

    game.logCharacterActivity(user, {
        category: "combat",
        action: "character_death",
        details: {
            map: user.map,
            posX: user.pos.x,
            posY: user.pos.y,
            killerType: "npc",
            killerId: Number(npc.id),
            killerName: npc.nameCharacter,
        },
    });

    withUserClient(user.id, (userClient) => {
        handleProtocol.console(`${npc.nameCharacter} te ha matado.`, "red", 1, 0, userClient, undefined, undefined, npc.nameCharacter);
        handleProtocol.console("En 15 segundos entraras al mundo de los muertos.", "gray", 1, 0, userClient);
    });

    if (user.disconnectOnDeath && !getClientById(user.id)) {
        game.closeForce(user.id);
    }
}

function tryNpcCastSpell(
    npc: NpcCharacter,
    target: PlayerCharacter,
    updateHeading: (npc: NpcCharacter, target: NpcFollowTarget) => void,
) {
    const spellSlot = chooseNpcSpell(npc, target);

    if (!spellSlot) {
        return false;
    }

    const datSpell = getSpellData(Number(spellSlot.idSpell));

    if (!datSpell) {
        return false;
    }

    updateHeading(npc, target);

    const now = Date.now();
    spellSlot.lastUsedAt = now;
    npc.lastSpellCastAt = now;
    npc.cooldownAtaque = now;
    const flushGroupClients = collectNpcCombatFlushGroupClients(npc, {
        includeTargetArea: {
            mapId: target.map,
            pos: target.pos,
        },
        extraClientIds: [target.id],
    });

    return withClientFlushGroups(flushGroupClients, () => {
        if (datSpell.subeHp === 1) {
            const healAmount = Math.min(
                Math.max(0, npc.maxHp - npc.hp),
                Math.max(0, funct.randomIntFromInterval(Number(datSpell.minHp ?? 0), Number(datSpell.maxHp ?? 0))),
            );

            if (healAmount <= 0) {
                return true;
            }

            npc.hp += healAmount;
            broadcastNpcVitalsDelta(npc);
            sendNpcSpellProjectileToArea(npc, target, Number(spellSlot.idSpell));
            sendNpcSpellFeedback(npc, npc.id, datSpell);
            npcs.loopArea(npc.id, (areaUser) => {
                withUserClient(areaUser.id, (targetClient) => {
                    handleProtocol.dialog(npc.id, String(healAmount), "", "green", 0, targetClient);
                });
            });
            return true;
        }

        sendNpcSpellProjectileToArea(npc, target, Number(spellSlot.idSpell));
        sendNpcSpellFeedback(npc, target.id, datSpell);
        game.interruptPendingLogoutOnAttack(target.id, "[Servidor] La salida se canceló porque una criatura te atacó.");

        if (datSpell.paraliza) {
            target.paralizado = 1;
            target.cooldownParalizado = now;

            withUserClient(target.id, (targetClient) => {
                handleProtocol.inmo(target.id, 2, targetClient);
                handleProtocol.console(`${npc.nameCharacter} te ha paralizado.`, "red", 1, 0, targetClient, undefined, undefined, npc.nameCharacter);
            });
            broadcastCharacterSnapshot(target);

            return true;
        }

        if (datSpell.inmoviliza) {
            target.inmovilizado = 1;
            target.cooldownParalizado = now;

            withUserClient(target.id, (targetClient) => {
                handleProtocol.inmo(target.id, 1, targetClient);
                handleProtocol.console(`${npc.nameCharacter} te ha inmovilizado.`, "red", 1, 0, targetClient, undefined, undefined, npc.nameCharacter);
            });
            broadcastCharacterSnapshot(target);

            return true;
        }

        if (datSpell.subeHp === 2) {
            let damage = applyNpcSpellDamageToUser(
                funct.randomIntFromInterval(Number(datSpell.minHp ?? 0), Number(datSpell.maxHp ?? 0)),
                target,
            );

            if (damage < 1) {
                damage = 1;
            }

            target.hp -= damage;
            withUserClient(target.id, (targetClient) => {
                handleProtocol.updateHP(target.hp, targetClient);
                handleProtocol.console(
                    `${npc.nameCharacter} te ha lanzado ${datSpell.name} por ${damage}`,
                    "red",
                    1,
                    0,
                    targetClient, undefined, undefined, npc.nameCharacter,
                );
            });

            npcs.loopArea(npc.id, (areaUser) => {
                withUserClient(areaUser.id, (targetClient) => {
                    handleProtocol.dialog(target.id, String(damage), "", "red", 0, targetClient);
                });
            });

            if (target.hp <= 0) {
                handleNpcSpellKillUser(npc, target);
            }

            return true;
        }

        return false;
    });
}

function getHeadingDisplacementPriority(heading?: Direction) {
    if (heading === vars.direcciones.up) {
        return [vars.direcciones.down, vars.direcciones.right, vars.direcciones.left, vars.direcciones.up];
    }

    if (heading === vars.direcciones.down) {
        return [vars.direcciones.up, vars.direcciones.right, vars.direcciones.left, vars.direcciones.down];
    }

    if (heading === vars.direcciones.right) {
        return [vars.direcciones.left, vars.direcciones.up, vars.direcciones.down, vars.direcciones.right];
    }

    if (heading === vars.direcciones.left) {
        return [vars.direcciones.right, vars.direcciones.up, vars.direcciones.down, vars.direcciones.left];
    }

    return [vars.direcciones.up, vars.direcciones.right, vars.direcciones.down, vars.direcciones.left];
}

function getDeadGhostAtPosition(idMap: number, pos: Position) {
    const occupantId = vars.mapData[idMap]?.[pos.y]?.[pos.x]?.id as EntityId | 0;

    if (!occupantId) {
        return;
    }

    const ghost = getUser(occupantId);

    if (!ghost?.dead) {
        return;
    }

    return ghost;
}

function resolveGhostDisplacementPosition(
    ghost: PlayerCharacter,
    moverId?: EntityId,
    preferredHeading?: Direction,
): { pos: Position; heading: Direction } | undefined {
    for (const heading of getHeadingDisplacementPriority(preferredHeading)) {
        const offset = getDirectionOffset(heading);
        const nextPos = {
            x: ghost.pos.x + offset.x,
            y: ghost.pos.y + offset.y,
        };

        if (!game.legalPos(nextPos.x, nextPos.y, ghost.map, Boolean(ghost.navegando), moverId)) {
            continue;
        }

        return {
            heading,
            pos: nextPos,
        };
    }
}

function canNpcOccupyPosition(npc: NpcCharacter, pos: Position, preferredHeading?: Direction) {
    if (game.legalPosNpc(pos.x, pos.y, npc.map, Boolean(npc.aguaValida), Boolean(npc.tierraInvalida))) {
        return true;
    }

    const ghost = getDeadGhostAtPosition(npc.map, pos);

    if (!ghost) {
        return false;
    }

    return Boolean(resolveGhostDisplacementPosition(ghost, npc.id, preferredHeading));
}

function applyNpcGhostDisplacement(ghost: PlayerCharacter, pos: Position, moverId: EntityId): boolean {
    const ghostClient = getClientById(ghost.id);

    vars.mapData[ghost.map][ghost.pos.y][ghost.pos.x].id = 0;

    if (!ghostClient) {
        if (!game.legalPos(pos.x, pos.y, ghost.map, Boolean(ghost.navegando), moverId)) {
            vars.mapData[ghost.map][ghost.pos.y][ghost.pos.x].id = ghost.id;
            return false;
        }

        ghost.pos.x = pos.x;
        ghost.pos.y = pos.y;
        ghost.stateVersion = Number(ghost.stateVersion ?? 0) + 1;
        ghost.nextWalkAt = Date.now() + vars.timing.walkStepMs;
        ghost.ignoreMovementUntil = ghost.nextWalkAt;
        vars.mapData[ghost.map][ghost.pos.y][ghost.pos.x].id = ghost.id;

        return true;
    }

    if (!game.legalPos(pos.x, pos.y, ghost.map, Boolean(ghost.navegando), moverId)) {
        vars.mapData[ghost.map][ghost.pos.y][ghost.pos.x].id = ghost.id;
        return false;
    }

    ghost.pos.x = pos.x;
    ghost.pos.y = pos.y;
    ghost.stateVersion = Number(ghost.stateVersion ?? 0) + 1;
    ghost.nextWalkAt = Date.now() + vars.timing.walkStepMs;
    ghost.ignoreMovementUntil = ghost.nextWalkAt;
    ghost.zonaSegura = safeZone.getSafeZoneFlag(ghost.map, ghost.pos);
    vars.mapData[ghost.map][ghost.pos.y][ghost.pos.x].id = ghost.id;

    handleProtocol.actPositionServer(
        ghost.map,
        ghost.pos,
        ghost.heading,
        Number(ghost.lastProcessedMoveId ?? 0),
        Number(ghost.stateVersion ?? 0),
        ghostClient,
    );
    handleProtocol.sendMyCharacter(ghost as any);
    game.setNewAreas(ghostClient);

    return ghost.pos.x === pos.x && ghost.pos.y === pos.y;
}

function isUserInsideNpcViewport(npc: NpcCharacter, user: PlayerCharacter) {
    return (
        npc.map === user.map &&
        Math.abs(npc.pos.x - user.pos.x) <= AREA_RANGE_X &&
        Math.abs(npc.pos.y - user.pos.y) <= AREA_RANGE_Y
    );
}

function syncNpcVisibilityForUser(npc: NpcCharacter, user: PlayerCharacter | undefined) {
    if (!user) {
        return;
    }

    const client = getClientById(user.id);

    if (!client) {
        return;
    }

    if (isUserInsideNpcViewport(npc, user)) {
        handleProtocol.sendNpc(npc);
        socket.send(client);
        return;
    }

    handleProtocol.deleteCharacter(npc.id, client);
}

function broadcastNpcVitalsDelta(npc: NpcCharacter | undefined) {
    if (!npc) {
        return;
    }

    game.loopAreaPos(npc.map, npc.pos, (target) => {
        const targetClient = getClientById(target.id);

        if (!targetClient) {
            return;
        }

        handleProtocol.entityVitalsDelta(npc.id, npc.hp, npc.maxHp, 0, 0, targetClient);
        socket.send(targetClient);
    });
}

function broadcastCharacterSnapshot(user: PlayerCharacter | undefined) {
    if (!user) {
        return;
    }

    game.loopAreaPos(user.map, user.pos, (target) => {
        if (target.id === user.id) {
            return;
        }

        const targetClient = getClientById(target.id);

        if (!targetClient) {
            return;
        }

        handleProtocol.sendCharacter(user as any, target.id);
        socket.send(targetClient);
    });
}

function isSummonedNpc(npc: NpcCharacter | undefined): npc is SummonedNpc {
    return Boolean(npc?.summonedByUserId);
}

function isSummonOwnerValid(owner: PlayerCharacter | undefined, summon: SummonedNpc) {
    return Boolean(owner && !owner.cerrado && !owner.dead && owner.map === summon.map && owner.hp > 0);
}

function getCardinalPositions(pos: Position) {
    return [
        { x: pos.x, y: pos.y - 1 },
        { x: pos.x, y: pos.y + 1 },
        { x: pos.x - 1, y: pos.y },
        { x: pos.x + 1, y: pos.y },
    ];
}

function preservesOwnerExit(owner: PlayerCharacter, movingSummonId: EntityId | undefined, nextPos: Position) {
    for (const exitPos of getCardinalPositions(owner.pos)) {
        if (exitPos.x === nextPos.x && exitPos.y === nextPos.y) {
            continue;
        }

        if (game.legalPos(exitPos.x, exitPos.y, owner.map, Boolean(owner.navegando), movingSummonId)) {
            return true;
        }
    }

    return false;
}

function findSummonSpawnPosition(
    owner: PlayerCharacter,
    targetPos: Position,
    aguaValida: boolean,
    tierraInvalida = false,
) {
    for (let radius = 0; radius <= SUMMON_SPAWN_SEARCH_RADIUS; radius++) {
        const minX = targetPos.x - radius;
        const maxX = targetPos.x + radius;
        const minY = targetPos.y - radius;
        const maxY = targetPos.y + radius;

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const isInnerTile = radius > 0 && x > minX && x < maxX && y > minY && y < maxY;

                if (isInnerTile) {
                    continue;
                }

                const pos = { x, y };

                if (
                    game.validPosRespawnNpc(pos, owner.map, aguaValida, tierraInvalida) &&
                    preservesOwnerExit(owner, undefined, pos)
                ) {
                    return pos;
                }
            }
        }
    }
}

function canSummonUseParkingPosition(summon: SummonedNpc, owner: PlayerCharacter, pos: Position) {
    const isCurrentPos = areSamePosition(pos, summon.pos);

    if (
        !isCurrentPos &&
        !game.legalPosNpc(pos.x, pos.y, summon.map, Boolean(summon.aguaValida), Boolean(summon.tierraInvalida))
    ) {
        return false;
    }

    if (getManhattanDistance(pos, owner.pos) === 1 && !preservesOwnerExit(owner, summon.id, pos)) {
        return false;
    }

    return true;
}

function getSummonParkingCandidates(owner: PlayerCharacter) {
    return [
        { x: owner.pos.x, y: owner.pos.y - 2 },
        { x: owner.pos.x - 2, y: owner.pos.y },
        { x: owner.pos.x + 2, y: owner.pos.y },
        { x: owner.pos.x, y: owner.pos.y + 2 },
        { x: owner.pos.x - 1, y: owner.pos.y - 1 },
        { x: owner.pos.x + 1, y: owner.pos.y - 1 },
        { x: owner.pos.x - 1, y: owner.pos.y + 1 },
        { x: owner.pos.x + 1, y: owner.pos.y + 1 },
        { x: owner.pos.x, y: owner.pos.y - 1 },
        { x: owner.pos.x - 1, y: owner.pos.y },
        { x: owner.pos.x + 1, y: owner.pos.y },
        { x: owner.pos.x, y: owner.pos.y + 1 },
    ];
}

function findSummonParkingPosition(summon: SummonedNpc, owner: PlayerCharacter) {
    const orderedSummons = (owner.summons ?? [])
        .map((summonId) => vars.npcs[summonId] as NpcCharacter | undefined)
        .filter((npc): npc is SummonedNpc => isSummonedNpc(npc) && npc.map === owner.map && npc.hp > 0)
        .sort((left, right) => {
            const createdAtDelta = (left.summonCreatedAt ?? 0) - (right.summonCreatedAt ?? 0);

            if (createdAtDelta !== 0) {
                return createdAtDelta;
            }

            return Number(left.id) - Number(right.id);
        });
    const candidates = getSummonParkingCandidates(owner);
    const usedCandidateIndexes = new Set<number>();

    for (const orderedSummon of orderedSummons) {
        const candidateIndex = candidates.findIndex(
            (candidate, index) =>
                !usedCandidateIndexes.has(index) && canSummonUseParkingPosition(orderedSummon, owner, candidate),
        );

        if (candidateIndex === -1) {
            if (orderedSummon.id === summon.id && canSummonUseParkingPosition(summon, owner, summon.pos)) {
                return { x: summon.pos.x, y: summon.pos.y };
            }

            continue;
        }

        usedCandidateIndexes.add(candidateIndex);

        if (orderedSummon.id === summon.id) {
            return candidates[candidateIndex];
        }
    }
}

function findNextSummonParkingStep(summon: SummonedNpc, owner: PlayerCharacter, targetPos: Position) {
    if (areSamePosition(summon.pos, targetPos)) {
        return;
    }

    const preferredHeadings = getOrderedHeadings(summon.pos, targetPos, summon.heading);
    const currentDistance = getManhattanDistance(summon.pos, targetPos);
    let bestPos: Position | undefined;
    let bestDistance = currentDistance;

    for (const heading of preferredHeadings) {
        const offset = getDirectionOffset(heading);
        const nextPos = {
            x: summon.pos.x + offset.x,
            y: summon.pos.y + offset.y,
        };
        const nextDistance = getManhattanDistance(nextPos, targetPos);

        if (
            !game.legalPosNpc(
                nextPos.x,
                nextPos.y,
                summon.map,
                Boolean(summon.aguaValida),
                Boolean(summon.tierraInvalida),
            )
        ) {
            continue;
        }

        if (getManhattanDistance(nextPos, owner.pos) === 1 && !preservesOwnerExit(owner, summon.id, nextPos)) {
            continue;
        }

        if (nextDistance >= bestDistance) {
            continue;
        }

        if (summon.lastChasePos && areSamePosition(nextPos, summon.lastChasePos) && bestPos) {
            continue;
        }

        bestDistance = nextDistance;
        bestPos = nextPos;
    }

    return bestPos;
}

function removeSummonFromOwnerList(npc: SummonedNpc) {
    const owner = getUser(npc.summonedByUserId);

    if (!owner) {
        return;
    }

    owner.summons = (owner.summons ?? []).filter((summonId) => String(summonId) !== String(npc.id));
}

function despawnSummon(npc: SummonedNpc) {
    vars.mapData[npc.map]?.[npc.pos.y]?.[npc.pos.x] && (vars.mapData[npc.map][npc.pos.y][npc.pos.x].id = 0);

    npcs.loopArea(npc.id, (target) => {
        withUserClient(target.id, (targetClient) => {
            handleProtocol.deleteCharacter(npc.id, targetClient);
        });
    });

    vars.areaNpc[npc.id] = [];
    releaseNpcAttackReservation(npc);
    clearNpcRoute(npc);
    removeSummonFromOwnerList(npc);
    delete vars.npcs[npc.id];
}

const NPC_FLOW_FIELD_RADIUS = AREA_RANGE_X;
const NPC_FLOW_FIELD_TTL_MS = vars.npcAi.flowFieldTtlMs as number;
const NPC_ATTACK_TILE_RESERVATION_MS = vars.npcAi.attackTileReservationMs as number;
const NPC_CROWD_DETOUR_MAX_DEPTH = vars.npcAi.crowdDetourMaxDepth as number;
const NPC_TARGET_LOCK_MS = vars.npcAi.targetLockMs as number;
const NPC_LAST_AGGRESSOR_MEMORY_MS = vars.npcAi.lastAggressorMemoryMs as number;
const NPC_TARGET_SWITCH_MARGIN = vars.npcAi.targetSwitchMargin as number;
const MAX_SUMMONS_PER_USER = 3;
const SUMMON_DURATION_MS = 60000;
const SUMMON_SPAWN_SEARCH_RADIUS = 6;
const MAX_SUMMON_OWNER_DISTANCE = 20;
const NPC_TARGET_SCORE_WEIGHTS = vars.npcAi.targetScoreWeights as {
    distance: number;
    pressure: number;
    escapeTiles: number;
    attackTiles: number;
    adjacentBonus: number;
    currentTargetBonus: number;
    recentAggressorBonus: number;
    aggressorRetargetBonus: number;
};

type FlowFieldCache = {
    targetId: EntityId;
    map: number;
    aguaValida: boolean;
    tierraInvalida?: boolean;
    targetPos: Position;
    expiresAt: number;
    distances: Map<string, number>;
};

const targetFlowFields = new Map<string, FlowFieldCache>();
const attackTileReservations = new Map<string, { npcId: EntityId; expiresAt: number }>();
let nextFlowFieldCleanupAt = 0;
let nextAttackTileReservationCleanupAt = 0;

function getDirectionOffset(heading: Direction): Position {
    if (heading === vars.direcciones.right) {
        return { x: 1, y: 0 };
    }

    if (heading === vars.direcciones.left) {
        return { x: -1, y: 0 };
    }

    if (heading === vars.direcciones.down) {
        return { x: 0, y: 1 };
    }

    if (heading === vars.direcciones.up) {
        return { x: 0, y: -1 };
    }

    return { x: 0, y: 0 };
}

function getPositionKey(pos: Position) {
    return `${pos.x},${pos.y}`;
}

function areSamePosition(left?: Position, right?: Position) {
    return Boolean(left && right && left.x === right.x && left.y === right.y);
}

function getManhattanDistance(from: Position, to: Position) {
    return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

function clearNpcRoute(npc: NpcCharacter) {
    npc.rute = [];
    npc.pathTargetId = 0;
    npc.pathTargetPos = undefined;
}

function clearNpcTarget(npc: NpcCharacter) {
    npc.currentTargetId = 0;
    npc.currentTargetLockedUntil = 0;
    clearNpcRoute(npc);
    releaseNpcAttackReservation(npc);
}

function getAttackTileReservationKey(targetId: EntityId, pos: Position) {
    return `${targetId}:${getPositionKey(pos)}`;
}

function clearExpiredAttackTileReservations(now = Date.now()) {
    if (now < nextAttackTileReservationCleanupAt) {
        return;
    }

    nextAttackTileReservationCleanupAt = now + NPC_ATTACK_TILE_RESERVATION_MS;

    for (const [key, reservation] of attackTileReservations.entries()) {
        if (reservation.expiresAt <= now) {
            attackTileReservations.delete(key);
        }
    }
}

function clearExpiredFlowFields(now = Date.now()) {
    if (now < nextFlowFieldCleanupAt) {
        return;
    }

    nextFlowFieldCleanupAt = now + NPC_FLOW_FIELD_TTL_MS;

    for (const [key, cache] of targetFlowFields.entries()) {
        if (cache.expiresAt <= now) {
            targetFlowFields.delete(key);
        }
    }
}

function releaseNpcAttackReservation(npc: NpcCharacter) {
    if (!npc.reservedAttackTargetId || !npc.reservedAttackPos) {
        npc.reservedAttackTargetId = 0;
        npc.reservedAttackPos = undefined;
        npc.attackReservationExpiresAt = 0;
        return;
    }

    attackTileReservations.delete(getAttackTileReservationKey(npc.reservedAttackTargetId, npc.reservedAttackPos));
    npc.reservedAttackTargetId = 0;
    npc.reservedAttackPos = undefined;
    npc.attackReservationExpiresAt = 0;
}

function reserveAttackTile(npc: NpcCharacter, targetId: EntityId, pos: Position) {
    const key = getAttackTileReservationKey(targetId, pos);
    const now = Date.now();

    if (
        npc.reservedAttackTargetId !== targetId ||
        !areSamePosition(npc.reservedAttackPos, pos) ||
        (npc.attackReservationExpiresAt ?? 0) <= now
    ) {
        releaseNpcAttackReservation(npc);
    }

    attackTileReservations.set(key, {
        npcId: npc.id,
        expiresAt: now + NPC_ATTACK_TILE_RESERVATION_MS,
    });
    npc.reservedAttackTargetId = targetId;
    npc.reservedAttackPos = { x: pos.x, y: pos.y };
    npc.attackReservationExpiresAt = now + NPC_ATTACK_TILE_RESERVATION_MS;
}

function isAttackTileReservedByOtherNpc(targetId: EntityId, pos: Position, npcId: EntityId) {
    const now = Date.now();
    clearExpiredAttackTileReservations(now);

    const key = getAttackTileReservationKey(targetId, pos);
    const reservation = attackTileReservations.get(key);

    if (reservation && reservation.expiresAt <= now) {
        attackTileReservations.delete(key);
        return false;
    }

    return Boolean(reservation && reservation.npcId !== npcId);
}

function isWithinMapBounds(pos: Position) {
    return pos.x >= 1 && pos.y >= 1 && pos.x <= 100 && pos.y <= 100;
}

function isWithinFlowFieldBounds(pos: Position, center: Position) {
    return Math.abs(pos.x - center.x) <= NPC_FLOW_FIELD_RADIUS && Math.abs(pos.y - center.y) <= NPC_FLOW_FIELD_RADIUS;
}

function canNpcUseTileForFlow(idMap: number, pos: Position, aguaValida: boolean, tierraInvalida = false) {
    if (!isWithinMapBounds(pos)) {
        return false;
    }

    const tile = vars.mapa[idMap]?.[pos.y]?.[pos.x];
    const isWaterTile = game.hayAgua(idMap, pos);

    if (aguaValida && tierraInvalida) {
        return isWaterTile && !tile?.blocked;
    }

    if (aguaValida) {
        return isWaterTile || !tile?.blocked;
    }

    return !isWaterTile && !tile?.blocked;
}

function getAdjacentAttackPositions(
    target: NpcFollowTarget,
    idMap: number,
    aguaValida: boolean,
    tierraInvalida = false,
) {
    const positions = [
        { x: target.pos.x, y: target.pos.y - 1 },
        { x: target.pos.x, y: target.pos.y + 1 },
        { x: target.pos.x - 1, y: target.pos.y },
        { x: target.pos.x + 1, y: target.pos.y },
    ];

    return positions.filter((pos) => {
        if (game.legalPosNpc(pos.x, pos.y, idMap, aguaValida, tierraInvalida)) {
            return true;
        }

        const ghost = getDeadGhostAtPosition(idMap, pos);

        if (!ghost) {
            return false;
        }

        return Boolean(resolveGhostDisplacementPosition(ghost));
    });
}

function countAvailableAttackTiles(target: NpcFollowTarget, npc: NpcCharacter) {
    const positions = [
        { x: target.pos.x, y: target.pos.y - 1 },
        { x: target.pos.x, y: target.pos.y + 1 },
        { x: target.pos.x - 1, y: target.pos.y },
        { x: target.pos.x + 1, y: target.pos.y },
    ];

    let available = 0;

    for (const pos of positions) {
        if (
            areSamePosition(pos, npc.pos) ||
            (canNpcOccupyPosition(npc, pos) && !isAttackTileReservedByOtherNpc(target.id, pos, npc.id))
        ) {
            available++;
        }
    }

    return available;
}

function countUserEscapeTiles(user: PlayerCharacter) {
    const positions = [
        { x: user.pos.x, y: user.pos.y - 1 },
        { x: user.pos.x, y: user.pos.y + 1 },
        { x: user.pos.x - 1, y: user.pos.y },
        { x: user.pos.x + 1, y: user.pos.y },
    ];

    let available = 0;

    for (const pos of positions) {
        if (game.legalPos(pos.x, pos.y, user.map, Boolean(user.navegando))) {
            available++;
        }
    }

    return available;
}

function getTargetScore(npc: NpcCharacter, user: PlayerCharacter, targetPressure: Map<EntityId, number>) {
    const now = Date.now();
    const distance = getManhattanDistance(npc.pos, user.pos);
    const pressure = targetPressure.get(user.id) ?? 0;
    const availableAttackTiles = countAvailableAttackTiles(user, npc);
    const escapeTiles = countUserEscapeTiles(user);
    const isCurrentTarget = npc.currentTargetId === user.id;
    const isAdjacent = distance === 1;
    const isRecentAggressor =
        npc.lastAggressorId === user.id && now - (npc.lastAggressedAt ?? 0) <= NPC_LAST_AGGRESSOR_MEMORY_MS;
    const shouldRetargetToAggressor =
        isRecentAggressor &&
        npc.currentTargetId !== user.id &&
        now > (npc.currentTargetLockedUntil ?? 0) &&
        !(npc.currentTargetId && npc.lastAggressorId && npc.currentTargetId === npc.lastAggressorId);

    return (
        distance * NPC_TARGET_SCORE_WEIGHTS.distance +
        pressure * NPC_TARGET_SCORE_WEIGHTS.pressure +
        escapeTiles * NPC_TARGET_SCORE_WEIGHTS.escapeTiles -
        availableAttackTiles * NPC_TARGET_SCORE_WEIGHTS.attackTiles -
        (isAdjacent ? NPC_TARGET_SCORE_WEIGHTS.adjacentBonus : 0) -
        (isCurrentTarget ? NPC_TARGET_SCORE_WEIGHTS.currentTargetBonus : 0) -
        (isRecentAggressor ? NPC_TARGET_SCORE_WEIGHTS.recentAggressorBonus : 0) -
        (shouldRetargetToAggressor ? NPC_TARGET_SCORE_WEIGHTS.aggressorRetargetBonus : 0)
    );
}

function getRecentAggressorTarget(npc: NpcCharacter, visibleUsers: EntityId[]) {
    const now = Date.now();

    if (
        !npc.lastAggressorId ||
        now - (npc.lastAggressedAt ?? 0) > NPC_LAST_AGGRESSOR_MEMORY_MS ||
        visibleUsers.indexOf(npc.lastAggressorId) < 0
    ) {
        return;
    }

    const user = getUser(npc.lastAggressorId);

    if (!user || user.cerrado || user.map !== npc.map || user.hp <= 0 || isInvisibleToNpc(user)) {
        return;
    }

    return user;
}

function selectNpcTarget(npc: NpcCharacter, targetPressure: Map<EntityId, number>) {
    const visibleUsers = (vars.areaNpc[npc.id] as EntityId[] | undefined) ?? [];
    const recentAggressorTarget = getRecentAggressorTarget(npc, visibleUsers);

    if (recentAggressorTarget) {
        return recentAggressorTarget;
    }

    let bestUser: PlayerCharacter | undefined;
    let bestScore = Number.MAX_SAFE_INTEGER;
    let currentTargetUser: PlayerCharacter | undefined;
    let currentTargetScore = Number.MAX_SAFE_INTEGER;
    const now = Date.now();

    for (const idUser of visibleUsers) {
        const user = getUser(idUser);

        if (!user || user.cerrado || user.map !== npc.map || user.hp <= 0 || isInvisibleToNpc(user)) {
            removeUserFromNpcArea(npc.id, idUser);
            continue;
        }

        const score = getTargetScore(npc, user, targetPressure);

        if (npc.currentTargetId === idUser) {
            currentTargetUser = user;
            currentTargetScore = score;
        }

        if (score < bestScore) {
            bestScore = score;
            bestUser = user;
        }
    }

    if (!currentTargetUser) {
        return bestUser;
    }

    if ((npc.currentTargetLockedUntil ?? 0) > now) {
        return currentTargetUser;
    }

    if (!bestUser || bestUser.id === currentTargetUser.id) {
        return currentTargetUser;
    }

    if (bestScore + NPC_TARGET_SWITCH_MARGIN >= currentTargetScore) {
        return currentTargetUser;
    }

    return bestUser;
}

function getOrderedHeadings(referencePos: Position, targetPos: Position, preferredHeading?: Direction) {
    const candidates = [
        preferredHeading,
        vars.direcciones.up,
        vars.direcciones.down,
        vars.direcciones.left,
        vars.direcciones.right,
    ].filter(
        (heading, index, headings): heading is Direction => Boolean(heading) && headings.indexOf(heading) === index,
    );

    return candidates.sort((left, right) => {
        const leftOffset = getDirectionOffset(left);
        const rightOffset = getDirectionOffset(right);
        const leftDistance = getManhattanDistance(
            {
                x: referencePos.x + leftOffset.x,
                y: referencePos.y + leftOffset.y,
            },
            targetPos,
        );
        const rightDistance = getManhattanDistance(
            {
                x: referencePos.x + rightOffset.x,
                y: referencePos.y + rightOffset.y,
            },
            targetPos,
        );

        return leftDistance - rightDistance;
    });
}

function getFlowFieldCacheKey(targetId: EntityId, idMap: number, aguaValida: boolean, tierraInvalida = false) {
    return `${targetId}:${idMap}:${aguaValida ? 1 : 0}:${tierraInvalida ? 1 : 0}`;
}

function buildFlowField(
    target: NpcFollowTarget,
    idMap: number,
    aguaValida: boolean,
    tierraInvalida = false,
): FlowFieldCache {
    const distances = new Map<string, number>();
    const queue: Position[] = [];
    let queueIndex = 0;
    const goalPositions = getAdjacentAttackPositions(target, idMap, aguaValida, tierraInvalida);
    const preferredHeadings = getOrderedHeadings(target.pos, target.pos);

    for (const goalPos of goalPositions) {
        const key = getPositionKey(goalPos);

        if (distances.has(key) || !isWithinFlowFieldBounds(goalPos, target.pos)) {
            continue;
        }

        distances.set(key, 0);
        queue.push(goalPos);
    }

    while (queueIndex < queue.length) {
        const current = queue[queueIndex++];
        const currentDistance = distances.get(getPositionKey(current)) as number;

        for (const heading of preferredHeadings) {
            const offset = getDirectionOffset(heading);
            const nextPos = {
                x: current.x + offset.x,
                y: current.y + offset.y,
            };
            const nextKey = getPositionKey(nextPos);

            if (
                distances.has(nextKey) ||
                !isWithinFlowFieldBounds(nextPos, target.pos) ||
                !canNpcUseTileForFlow(idMap, nextPos, aguaValida, tierraInvalida)
            ) {
                continue;
            }

            distances.set(nextKey, currentDistance + 1);
            queue.push(nextPos);
        }
    }

    return {
        targetId: target.id,
        map: idMap,
        aguaValida,
        tierraInvalida,
        targetPos: {
            x: target.pos.x,
            y: target.pos.y,
        },
        expiresAt: Date.now() + NPC_FLOW_FIELD_TTL_MS,
        distances,
    };
}

function getFlowField(target: NpcFollowTarget, idMap: number, aguaValida: boolean, tierraInvalida = false) {
    const now = Date.now();
    clearExpiredFlowFields(now);

    const key = getFlowFieldCacheKey(target.id, idMap, aguaValida, tierraInvalida);
    const cached = targetFlowFields.get(key);

    if (cached && cached.expiresAt > now && areSamePosition(cached.targetPos, target.pos)) {
        return cached;
    }

    if (cached) {
        targetFlowFields.delete(key);
    }

    const nextCache = buildFlowField(target, idMap, aguaValida, tierraInvalida);
    targetFlowFields.set(key, nextCache);
    return nextCache;
}

function reconstructFirstStep(previous: Map<string, string>, startKey: string, targetKey: string) {
    let currentKey = targetKey;

    while (true) {
        const parentKey = previous.get(currentKey);

        if (!parentKey) {
            return;
        }

        if (parentKey === startKey) {
            const [x, y] = currentKey.split(",").map(Number);
            return { x, y };
        }

        currentKey = parentKey;
    }
}

function findCrowdDetourStep(
    npc: NpcCharacter,
    target: NpcFollowTarget,
    flowField: FlowFieldCache,
    currentDistance?: number,
) {
    const startKey = getPositionKey(npc.pos);
    const queue: Array<{ pos: Position; depth: number }> = [{ pos: npc.pos, depth: 0 }];
    const visited = new Set<string>([startKey]);
    const previous = new Map<string, string>();
    let queueIndex = 0;

    while (queueIndex < queue.length) {
        const current = queue[queueIndex++];
        const orderedHeadings = getOrderedHeadings(current.pos, target.pos, npc.heading);

        if (current.depth >= NPC_CROWD_DETOUR_MAX_DEPTH) {
            continue;
        }

        for (const heading of orderedHeadings) {
            const offset = getDirectionOffset(heading);
            const nextPos = {
                x: current.pos.x + offset.x,
                y: current.pos.y + offset.y,
            };
            const nextKey = getPositionKey(nextPos);

            if (
                visited.has(nextKey) ||
                !isWithinFlowFieldBounds(nextPos, target.pos) ||
                !canNpcOccupyPosition(npc, nextPos, heading)
            ) {
                continue;
            }

            visited.add(nextKey);
            previous.set(nextKey, getPositionKey(current.pos));

            const nextDistance = flowField.distances.get(nextKey);
            const isAttackTileBlocked =
                getManhattanDistance(nextPos, target.pos) === 1 &&
                isAttackTileReservedByOtherNpc(target.id, nextPos, npc.id);

            if (!isAttackTileBlocked && (typeof currentDistance === "undefined" || nextDistance! < currentDistance)) {
                if (typeof nextDistance !== "undefined") {
                    return reconstructFirstStep(previous, startKey, nextKey);
                }
            }

            queue.push({
                pos: nextPos,
                depth: current.depth + 1,
            });
        }
    }
}

function getNextChasePosition(npc: NpcCharacter, target: NpcFollowTarget) {
    const flowField = getFlowField(target, npc.map, Boolean(npc.aguaValida), Boolean(npc.tierraInvalida));
    const currentDistance = flowField.distances.get(getPositionKey(npc.pos));
    const preferredHeadings = getOrderedHeadings(npc.pos, target.pos, npc.heading);
    let bestPos: Position | undefined;
    let bestDistance = Number.MAX_SAFE_INTEGER;

    for (const heading of preferredHeadings) {
        const offset = getDirectionOffset(heading);
        const nextPos = {
            x: npc.pos.x + offset.x,
            y: npc.pos.y + offset.y,
        };

        if (!canNpcOccupyPosition(npc, nextPos, heading)) {
            continue;
        }

        if (
            getManhattanDistance(nextPos, target.pos) === 1 &&
            isAttackTileReservedByOtherNpc(target.id, nextPos, npc.id)
        ) {
            continue;
        }

        const nextDistance = flowField.distances.get(getPositionKey(nextPos));

        if (typeof nextDistance === "undefined") {
            continue;
        }

        if (typeof currentDistance !== "undefined" && nextDistance >= currentDistance) {
            continue;
        }

        if (nextDistance > bestDistance) {
            continue;
        }

        if (nextDistance === bestDistance && areSamePosition(nextPos, npc.lastChasePos)) {
            continue;
        }

        bestDistance = nextDistance;
        bestPos = nextPos;
    }

    return bestPos ?? findCrowdDetourStep(npc, target, flowField, currentDistance);
}

function isInvisibleToNpc(user: PlayerCharacter | undefined) {
    return Boolean(user && ((user.privileges === 1 && user.invisibleAdmin) || user.invisibleSpell || user.hiddenSkill));
}

function removeUserFromNpcArea(idNpc: EntityId, idUser: EntityId) {
    const npcArea = vars.areaNpc[idNpc] as EntityId[] | undefined;
    const index = npcArea?.indexOf(idUser) ?? -1;

    if (npcArea && index > -1) {
        npcArea.splice(index, 1);
    }
}

function isTargetAdjacent(npc: NpcCharacter, target: NpcFollowTarget) {
    const x = target.pos.x - npc.pos.x;
    const y = target.pos.y - npc.pos.y;

    return (x === 0 && y === 1) || (x === -1 && y === 0) || (x === 0 && y === -1) || (x === 1 && y === 0);
}

function getSummonedNpcTarget(idNpc: EntityId | undefined) {
    if (!idNpc) {
        return;
    }

    const npc = vars.npcs[idNpc] as NpcCharacter | undefined;

    if (!isSummonedNpc(npc) || npc.hp <= 0) {
        return;
    }

    return npc;
}

function getHostileNpcCurrentSummonTarget(npc: NpcCharacter) {
    const target = getSummonedNpcTarget(npc.currentTargetId);

    if (!target || target.map !== npc.map) {
        return;
    }

    return target;
}

function getRecentSummonAggressorTarget(npc: NpcCharacter) {
    const now = Date.now();

    if (!npc.lastAggressorId || now - (npc.lastAggressedAt ?? 0) > NPC_LAST_AGGRESSOR_MEMORY_MS) {
        return;
    }

    const target = getSummonedNpcTarget(npc.lastAggressorId);

    if (!target || target.map !== npc.map) {
        return;
    }

    return target;
}

function getValidSummonCombatTarget(idNpc: EntityId | undefined, map: number) {
    if (!idNpc) {
        return;
    }

    const npc = vars.npcs[idNpc] as NpcCharacter | undefined;

    if (!npc || npc.hp <= 0 || npc.map !== map || isSummonedNpc(npc)) {
        return;
    }

    return npc;
}

function getSummonCombatTarget(summon: SummonedNpc, owner: PlayerCharacter | undefined) {
    const currentTarget = getValidSummonCombatTarget(summon.currentTargetId, summon.map);

    if (currentTarget) {
        return currentTarget;
    }

    return getValidSummonCombatTarget(owner?.summonTargetNpcId, summon.map);
}

function clearDeadNpcFromSummonTargets(idNpc: EntityId) {
    const deadNpcId = String(idNpc);

    for (const character of Object.values(vars.personajes) as PlayerCharacter[]) {
        if (String(character?.summonTargetNpcId ?? 0) === deadNpcId) {
            character.summonTargetNpcId = 0;
        }
    }

    for (const npc of Object.values(vars.npcs) as NpcCharacter[]) {
        if (isSummonedNpc(npc) && String(npc.currentTargetId ?? 0) === deadNpcId) {
            clearNpcTarget(npc);
        }
    }
}

const npcs = {} as NpcsApi;

Npcs.call(npcs);

function Npcs(this: NpcsApi) {
    this.createNpc = function () {
        return {
            id: 0,
            nameCharacter: "",
            idClase: 1,
            idHead: 0,
            idHelmet: 0,
            idWeapon: 0,
            idBody: 0,
            idShield: 0,
            npcType: 0,
            hp: 0,
            maxHp: 0,
            minHit: 0,
            maxHit: 0,
            def: 0,
            poderAtaque: 0,
            poderEvasion: 0,
            movement: 1,
            color: "white",
            map: 0,
            pos: { x: 0, y: 0 },
            gold: 0,
            heading: 2,
            moveOffsetX: 0,
            moveOffsetY: 0,
            inmovilizado: 0,
            paralizado: 0,
            fxId: 0,
            frameFxCounter: 0,
            zonaSegura: 0,
            exp: 0,
            isNpc: true,
            drop: [],
            rute: [],
            clan: "",
            cooldownAtaque: 0,
            cooldownParalizado: 0,
            aguaValida: 0,
            tierraInvalida: 0,
            snd1: 0,
            snd2: 0,
            soundClose: 0,
            spellCastIntervalMs: 0,
            lastSpellCastAt: 0,
            spellRange: 0,
            spells: [],
            desc: "",
            nextThinkAt: 0,
            pathTargetId: 0,
            pathTargetPos: undefined,
            nextPathfindAt: 0,
            lastChasePos: undefined,
            currentTargetId: 0,
            currentTargetLockedUntil: 0,
            lastAggressorId: 0,
            lastAggressedAt: 0,
            reservedAttackTargetId: 0,
            reservedAttackPos: undefined,
            attackReservationExpiresAt: 0,
            summonedByUserId: 0,
            summonExpiresAt: 0,
            summonCreatedAt: 0,
        };
    };

    this.spawnSummon = function (idUser: EntityId, idSpell: number, targetPos: Position) {
        try {
            const owner = getUser(idUser);
            const datSpell = vars.datSpell[idSpell] as { numNpc?: number } | undefined;
            const summonNpcIndex = Number(datSpell?.numNpc ?? 0);
            const datNpc = vars.datNpc[summonNpcIndex];

            if (!owner || !summonNpcIndex || !datNpc) {
                return 0;
            }

            const spawnPos = findSummonSpawnPosition(
                owner,
                targetPos,
                Boolean(datNpc.aguaValida),
                Boolean(datNpc.tierraInvalida),
            );

            if (!spawnPos) {
                return 0;
            }

            owner.summons = (owner.summons ?? []).filter((summonId) => {
                const summon = vars.npcs[summonId] as NpcCharacter | undefined;
                return Boolean(summon && isSummonedNpc(summon) && String(summon.summonedByUserId) === String(idUser));
            });

            while ((owner.summons?.length ?? 0) >= MAX_SUMMONS_PER_USER) {
                const oldestSummon = (owner.summons ?? [])
                    .map((summonId) => vars.npcs[summonId] as NpcCharacter | undefined)
                    .filter((summon): summon is SummonedNpc => isSummonedNpc(summon))
                    .sort((left, right) => (left.summonCreatedAt ?? 0) - (right.summonCreatedAt ?? 0))[0];

                if (!oldestSummon) {
                    break;
                }

                this.muereNpc(oldestSummon.id);
            }

            const login = require("./login") as { createId: () => EntityId };
            const now = Date.now();
            const npc = this.createNpc() as SummonedNpc;

            npc.id = login.createId();
            npc.templateNpcIndex = summonNpcIndex;
            npc.map = owner.map;
            npc.pos = { x: spawnPos.x, y: spawnPos.y };
            npc.nameCharacter = datNpc.name;
            npc.color = "white";
            npc.isNpc = true;
            npc.idBody = datNpc.idBody;
            npc.idHead = datNpc.idHead;
            npc.movement = 3;
            npc.npcType = Number.parseInt(String(datNpc.npcType ?? 0), 10);
            npc.exp = datNpc.exp ?? 0;
            npc.gold = datNpc.gold ?? 0;
            npc.hp = datNpc.hp ?? datNpc.maxHp ?? 1;
            npc.maxHp = datNpc.maxHp ?? datNpc.hp ?? 1;
            npc.minHit = datNpc.minHit ?? 0;
            npc.maxHit = datNpc.maxHit ?? 0;
            npc.def = datNpc.def ?? 0;
            npc.poderAtaque = datNpc.poderAtaque ?? 0;
            npc.poderEvasion = datNpc.poderEvasion ?? 0;
            npc.snd1 = datNpc.snd1 ?? 0;
            npc.snd2 = datNpc.snd2 ?? 0;
            npc.soundClose = datNpc.soundClose ?? 0;
            npc.spellCastIntervalMs = datNpc.spellCastIntervalMs ?? 0;
            npc.lastSpellCastAt = 0;
            npc.spellRange = datNpc.spellRange ?? 0;
            npc.spells = Array.isArray(datNpc.spells)
                ? datNpc.spells
                      .filter(
                          (spell: { idSpell?: number; cooldownSeconds?: number }) => Number(spell?.idSpell ?? 0) > 0,
                      )
                      .map((spell: { idSpell?: number; cooldownSeconds?: number }) => ({
                          idSpell: Number(spell.idSpell),
                          cooldownSeconds: Math.max(0, Number(spell.cooldownSeconds ?? 0)),
                          lastUsedAt: 0,
                      }))
                : [];
            npc.aguaValida = datNpc.aguaValida ?? 0;
            npc.tierraInvalida = datNpc.tierraInvalida ?? 0;
            npc.heading = owner.heading;
            npc.cooldownAtaque = now;
            npc.nextThinkAt = now + vars.timing.npcThinkMs;
            npc.summonedByUserId = idUser;
            npc.summonCreatedAt = now;
            npc.summonExpiresAt = now + SUMMON_DURATION_MS;

            vars.npcs[npc.id] = npc;
            vars.areaNpc[npc.id] = [];
            vars.mapData[owner.map][spawnPos.y][spawnPos.x].id = npc.id;
            owner.summons = [...(owner.summons ?? []), npc.id];

            this.loopArea(npc.id, (target: PlayerCharacter) => {
                if (!isInvisibleToNpc(target) && !target.dead && vars.areaNpc[npc.id].indexOf(target.id) < 0) {
                    vars.areaNpc[npc.id].push(target.id);
                }

                handleProtocol.sendNpc(npc);
                withUserClient(target.id, (targetClient) => {
                    socket.send(targetClient);
                });
            });

            return npc.id;
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    this.removeOwnerSummons = function (idUser: EntityId) {
        try {
            const owner = getUser(idUser);

            if (!owner) {
                return;
            }

            const summonIds = [...(owner.summons ?? [])];
            owner.summons = [];
            owner.summonTargetNpcId = 0;

            for (const summonId of summonIds) {
                const summon = vars.npcs[summonId] as NpcCharacter | undefined;

                if (isSummonedNpc(summon) && String(summon.summonedByUserId) === String(idUser)) {
                    this.muereNpc(summon.id);
                }
            }
        } catch (err) {
            funct.dumpError(err);
        }
    };

    const updateNpcHeading = (npc: NpcCharacter, target: NpcFollowTarget) => {
        const directionNpc = this.findDirection(npc.pos, target.pos);

        if (directionNpc === npc.heading) {
            return;
        }

        npc.heading = directionNpc;
        this.loopArea(npc.id, (client) => {
            withUserClient(client.id, (targetClient) => {
                handleProtocol.changeHeading(npc.id, npc.heading, targetClient);
            });
        });
    };

    const attackNpcTarget = (attacker: NpcCharacter, target: NpcCharacter, owner?: PlayerCharacter) => {
        if (Date.now() - attacker.cooldownAtaque < vars.timing.statusDurations.npcAttackMs) {
            return;
        }

        const targetOwner = isSummonedNpc(target) ? getUser(target.summonedByUserId) : undefined;
        const flushGroupClients = collectNpcCombatFlushGroupClients(attacker, {
            includeTargetArea: {
                mapId: target.map,
                pos: target.pos,
            },
            extraClientIds: [owner?.id, targetOwner?.id],
        });

        withClientFlushGroups(flushGroupClients, () => {
            updateNpcHeading(attacker, target);
            attacker.cooldownAtaque = Date.now();

            if (attacker.snd1 > 0) {
                this.loopArea(attacker.id, (nearbyUser) => {
                    withUserClient(nearbyUser.id, (nearbyClient) => {
                        handleProtocol.playSound(attacker.id, attacker.snd1, nearbyClient);
                    });
                });
            }

            const probExito = Math.max(10, Math.min(90, 50 + (attacker.poderAtaque - target.poderEvasion) * 0.4));
            const impacto = funct.randomIntFromInterval(1, 100) <= probExito;
            let result: number | "¡Fallas!" = "¡Fallas!";

            game.markNpcAggressor(target.id, attacker.id);

            if (impacto) {
                let dmg =
                    Number.parseInt(String(funct.randomIntFromInterval(attacker.minHit, attacker.maxHit)), 10) -
                    target.def;

                if (dmg < 1) {
                    dmg = 1;
                }

                target.hp -= dmg;
                broadcastNpcVitalsDelta(target);
                result = dmg;

                if (owner) {
                    withUserClient(owner.id, (ownerClient) => {
                        handleProtocol.console(
                            `${attacker.nameCharacter} golpeó a ${target.nameCharacter} por ${dmg}.`,
                            "red",
                            1,
                            0,
                            ownerClient,
                        );
                    });
                    game.calcularExp(owner.id, target.id, dmg);
                }

                if (targetOwner) {
                    withUserClient(targetOwner.id, (targetOwnerClient) => {
                        handleProtocol.console(
                            `${attacker.nameCharacter} golpeó a tu ${target.nameCharacter} por ${dmg}.`,
                            "red",
                            1,
                            0,
                            targetOwnerClient,
                        );
                    });
                }

                if (target.snd2 > 0) {
                    this.loopArea(target.id, (nearbyUser) => {
                        withUserClient(nearbyUser.id, (nearbyClient) => {
                            handleProtocol.playSound(target.id, target.snd2, nearbyClient);
                        });
                    });
                }
            }

            this.loopArea(attacker.id, (nearbyUser) => {
                withUserClient(nearbyUser.id, (nearbyClient) => {
                    handleProtocol.dialog(attacker.id, String(result), "", "red", 0, nearbyClient);
                });
            });

            if (target.hp > 0) {
                return;
            }

            target.hp = 0;

            if (owner) {
                const ownerClient = getClientById(owner.id);

                if (ownerClient) {
                    const respawn = require("./respawn") as {
                        muere: (ws: RuntimeClient, idPersonaje: EntityId) => void;
                    };
                    respawn.muere(ownerClient, target.id);
                    return;
                }
            }

            if (targetOwner) {
                withUserClient(targetOwner.id, (targetOwnerClient) => {
                    handleProtocol.console(`Tu ${target.nameCharacter} ha muerto.`, "red", 1, 0, targetOwnerClient);
                });
            }

            this.muereNpc(target.id);
        });
    };

    const processSummonMovement = (summon: SummonedNpc) => {
        if ((summon.summonExpiresAt ?? 0) <= Date.now()) {
            this.muereNpc(summon.id);
            return;
        }

        const owner = getUser(summon.summonedByUserId);

        if (!isSummonOwnerValid(owner, summon)) {
            this.muereNpc(summon.id);
            return;
        }

        const summonOwner = owner as PlayerCharacter;

        if (getManhattanDistance(summon.pos, summonOwner.pos) > MAX_SUMMON_OWNER_DISTANCE) {
            this.muereNpc(summon.id);
            return;
        }

        const targetNpc = getSummonCombatTarget(summon, summonOwner);

        if (!targetNpc) {
            summonOwner.summonTargetNpcId = 0;
            summon.currentTargetId = 0;
            releaseNpcAttackReservation(summon);

            const parkingPos = findSummonParkingPosition(summon, summonOwner);

            if (!parkingPos) {
                return;
            }

            if (areSamePosition(summon.pos, parkingPos)) {
                return;
            }

            const nextPos = findNextSummonParkingStep(summon, summonOwner, parkingPos);

            if (nextPos) {
                this.moveNpcByPos(summon.id, nextPos);
            }

            return;
        }

        summon.currentTargetId = targetNpc.id;

        if (!isTargetAdjacent(summon, targetNpc)) {
            if (!summon.paralizado && !summon.inmovilizado) {
                const nextPos = getNextChasePosition(summon, targetNpc);

                if (nextPos) {
                    const isAttackTile = getManhattanDistance(nextPos, targetNpc.pos) === 1;

                    if (isAttackTile) {
                        reserveAttackTile(summon, targetNpc.id, nextPos);
                    } else if (summon.reservedAttackTargetId) {
                        releaseNpcAttackReservation(summon);
                    }

                    this.moveNpcByPos(summon.id, nextPos);
                }
            }

            return;
        }

        reserveAttackTile(summon, targetNpc.id, summon.pos);

        if (summon.paralizado || summon.inmovilizado) {
            return;
        }

        attackNpcTarget(summon, targetNpc, owner);
    };

    this.processPendingMovements = function () {
        try {
            const now = Date.now();
            const targetPressure = new Map<EntityId, number>();

            for (const npcId in vars.npcs) {
                const npc = vars.npcs[npcId] as NpcCharacter | undefined;

                if (!npc?.currentTargetId || isSummonedNpc(npc)) {
                    continue;
                }

                targetPressure.set(npc.currentTargetId, (targetPressure.get(npc.currentTargetId) ?? 0) + 1);
            }

            for (const idNpc in vars.npcs) {
                const npc = vars.npcs[idNpc] as NpcCharacter | undefined;

                if (!npc) {
                    continue;
                }

                if (isSummonedNpc(npc)) {
                    if ((npc.nextThinkAt ?? 0) > now) {
                        continue;
                    }

                    npc.nextThinkAt = now + vars.timing.npcThinkMs;
                    processSummonMovement(npc);
                    continue;
                }

                if (
                    npc.movement !== 3 ||
                    (!vars.areaNpc[idNpc]?.length &&
                        !getHostileNpcCurrentSummonTarget(npc) &&
                        !getRecentSummonAggressorTarget(npc))
                ) {
                    continue;
                }

                if ((npc.nextThinkAt ?? 0) > now) {
                    continue;
                }

                if (npc.currentTargetId) {
                    targetPressure.set(
                        npc.currentTargetId,
                        Math.max(0, (targetPressure.get(npc.currentTargetId) ?? 1) - 1),
                    );
                }

                npc.nextThinkAt = now + vars.timing.npcThinkMs;
                this.npcAttackUser(idNpc, targetPressure);

                if (npc.currentTargetId) {
                    targetPressure.set(npc.currentTargetId, (targetPressure.get(npc.currentTargetId) ?? 0) + 1);
                }
            }
        } catch (err) {
            funct.dumpError(err);
        }
    };

    this.muereNpc = function (idNpc: EntityId) {
        try {
            const npc = getNpc(idNpc);

            if (isSummonedNpc(npc)) {
                despawnSummon(npc);
                return;
            }

            clearDeadNpcFromSummonTargets(idNpc);

            const npcArea = Array.isArray(vars.areaNpc[idNpc]) ? (vars.areaNpc[idNpc] as EntityId[]) : [];

            if (vars.areaNpc[idNpc] !== npcArea) {
                vars.areaNpc[idNpc] = npcArea;
            }

            vars.mapData[npc.map][npc.pos.y][npc.pos.x].id = 0;

            for (const userId of npcArea) {
                withUserClient(userId, (targetClient) => {
                    handleProtocol.deleteCharacter(idNpc, targetClient);
                });
            }

            this.loopArea(idNpc, (target) => {
                withUserClient(target.id, (targetClient) => {
                    handleProtocol.deleteCharacter(idNpc, targetClient);
                });
            });

            vars.areaNpc[idNpc] = [];

            const respawnCooldownMs = getNpcRespawnCooldownMs(npc);
            const respawnEntry = getNpcRespawnEntry(npc);

            if (respawnCooldownMs > 0 && respawnEntry) {
                setNpcRespawnCooldown(respawnEntry, respawnCooldownMs, (entry) => {
                    const LoadNpcs = require("./loadNpcs") as {
                        new (): { createNpcInMap: (npc: NpcRespawnEntry, skipRespawnCooldownCheck?: boolean) => void };
                    };

                    new LoadNpcs().createNpcInMap(entry, true);
                });

                delete vars.npcs[idNpc];
                delete vars.areaNpc[idNpc];
                return;
            }

            const posNewNpc = game.respawnNpc(
                npc.map,
                Boolean(npc.aguaValida),
                Boolean(npc.tierraInvalida),
            ) as RespawnPosition;

            npc.pos.x = posNewNpc.posNewX;
            npc.pos.y = posNewNpc.posNewY;
            npc.cooldownAtaque = Date.now() + 2000;
            npc.hp = npc.maxHp;
            npc.hitExpAwarded = 0;
            npc.deathProcessed = false;
            npc.cooldownParalizado = 0;
            npc.inmovilizado = 0;
            npc.paralizado = 0;
            npc.nextThinkAt = Date.now() + vars.timing.npcThinkMs;
            clearNpcRoute(npc);
            npc.lastChasePos = undefined;
            releaseNpcAttackReservation(npc);
            npc.currentTargetId = 0;
            npc.currentTargetLockedUntil = 0;
            npc.lastAggressorId = 0;
            npc.lastAggressedAt = 0;

            vars.mapData[npc.map][npc.pos.y][npc.pos.x].id = idNpc;

            this.loopArea(idNpc, (target) => {
                const targetClient = getClientById(target.id);

                if (!targetClient) {
                    return;
                }

                if (!isInvisibleToNpc(target) && vars.areaNpc[idNpc].indexOf(target.id) < 0) {
                    vars.areaNpc[idNpc].push(target.id);
                }

                handleProtocol.sendNpc(npc);
                socket.send(targetClient);
            });
        } catch (err) {
            funct.dumpError(err);
        }
    };

    this.findDirection = function (posNpc: Position, posUser: Position): Direction {
        try {
            const X = Math.sign(posNpc.x - posUser.x);
            const Y = Math.sign(posNpc.y - posUser.y);

            if (X === -1 && Y === 1) return vars.direcciones.up;
            if (X === 1 && Y === 1) return vars.direcciones.left;
            if (X === 1 && Y === -1) return vars.direcciones.left;
            if (X === -1 && Y === -1) return vars.direcciones.down;
            if (X === 0 && Y === -1) return vars.direcciones.down;
            if (X === 0 && Y === 1) return vars.direcciones.up;
            if (X === 1 && Y === 0) return vars.direcciones.left;
            if (X === -1 && Y === 0) return vars.direcciones.right;
            return 0;
        } catch (err) {
            funct.dumpError(err);
            return 0;
        }
    };

    this.npcAttackUser = function (idNpc: EntityId, targetPressure: Map<EntityId, number>) {
        try {
            const npc = vars.npcs[idNpc] as NpcCharacter | undefined;

            if (!npc) {
                console.log(`No existe npc ${idNpc}`);
                return;
            }

            const previousTargetId = npc.currentTargetId;
            const summonTarget = getRecentSummonAggressorTarget(npc) ?? getHostileNpcCurrentSummonTarget(npc);
            const userTarget = summonTarget ? undefined : selectNpcTarget(npc, targetPressure);
            const target = (summonTarget ?? userTarget) as NpcFollowTarget | undefined;

            if (!target) {
                clearNpcTarget(npc);
                return;
            }

            const targetIsSummon = Boolean((target as NpcCharacter).isNpc);
            npc.currentTargetId = target.id;

            if (previousTargetId !== target.id) {
                npc.currentTargetLockedUntil = Date.now() + NPC_TARGET_LOCK_MS;
            }

            if (npc.map !== target.map) {
                clearNpcTarget(npc);

                if (!targetIsSummon) {
                    removeUserFromNpcArea(idNpc, target.id);
                }

                return;
            }

            if (target.hp <= 0) {
                clearNpcTarget(npc);
                return;
            }

            if (userTarget && isInvisibleToNpc(userTarget)) {
                clearNpcTarget(npc);
                removeUserFromNpcArea(idNpc, userTarget.id);
                return;
            }

            if (npc.paralizado || npc.inmovilizado) {
                return;
            }

            if (!targetIsSummon && userTarget && tryNpcCastSpell(npc, userTarget, updateNpcHeading)) {
                return;
            }

            if (!isTargetAdjacent(npc, target)) {
                const chaseStartAt = vars.debugNpcPathfinding ? Date.now() : 0;
                clearNpcRoute(npc);

                const nextPos = getNextChasePosition(npc, target);

                if (vars.debugNpcPathfinding) {
                    const chaseDurationMs = Date.now() - chaseStartAt;
                    console.log(
                        `[npc-path] npc=${idNpc} target=${target.id} map=${npc.map} pos=${npc.pos.x},${npc.pos.y} targetPos=${target.pos.x},${target.pos.y} durationMs=${chaseDurationMs}`,
                    );
                }

                if (nextPos) {
                    const isAttackTile = getManhattanDistance(nextPos, target.pos) === 1;

                    if (isAttackTile) {
                        reserveAttackTile(npc, target.id, nextPos);
                    } else if (npc.reservedAttackTargetId) {
                        releaseNpcAttackReservation(npc);
                    }

                    this.moveNpcByPos(idNpc, nextPos);
                } else if (npc.reservedAttackTargetId) {
                    releaseNpcAttackReservation(npc);
                }

                return;
            }

            clearNpcRoute(npc);
            reserveAttackTile(npc, target.id, npc.pos);
            npc.currentTargetLockedUntil = Date.now() + NPC_TARGET_LOCK_MS;

            if (targetIsSummon) {
                attackNpcTarget(npc, target as NpcCharacter);
                return;
            }

            const user = userTarget as PlayerCharacter;
            const idUser = user.id;

            if (Date.now() - npc.cooldownAtaque < vars.timing.statusDurations.npcAttackMs) {
                return;
            }

            updateNpcHeading(npc, user);

            npc.cooldownAtaque = Date.now();

            game.interruptPendingLogoutOnAttack(
                idUser,
                "[Servidor] La salida se canceló porque una criatura te atacó.",
            );
            const flushGroupClients = collectNpcCombatFlushGroupClients(npc, {
                extraClientIds: [idUser],
            });

            withClientFlushGroups(flushGroupClients, () => {
                if (npc.snd1 > 0) {
                    this.loopArea(idNpc, (target) => {
                        withUserClient(target.id, (targetClient) => {
                            handleProtocol.playSound(idNpc, npc.snd1, targetClient);
                        });
                    });
                }

                let userEvasion = game.poderEvasion(idUser);
                const npcPoderAtaque = npc.poderAtaque;
                const poderEvasionEscudo = game.poderEvasionEscudo(idUser);

                if (user.idItemShield) {
                    userEvasion += poderEvasionEscudo;
                }

                const probExito = Math.max(10, Math.min(90, 50 + (npcPoderAtaque - userEvasion) * 0.4));
                const npcImpacto = funct.randomIntFromInterval(1, 100) <= probExito;

                let dmg: number | "¡Fallas!" = "¡Fallas!";

                if (npcImpacto) {
                    dmg = Number.parseInt(String(funct.randomIntFromInterval(npc.minHit, npc.maxHit)), 10);

                    const lugarCuerpo = funct.randomIntFromInterval(vars.partesCuerpo.cabeza, vars.partesCuerpo.torso);
                    let absorbeDmg = 0;

                    switch (lugarCuerpo) {
                        case vars.partesCuerpo.cabeza:
                            if (user.idItemHelmet) {
                                const itemInventaryHelmet = user.inv[String(user.idItemHelmet)];
                                if (itemInventaryHelmet) {
                                    const itemHelmet = vars.datObj[itemInventaryHelmet.idItem];
                                    absorbeDmg = funct.randomIntFromInterval(itemHelmet.minDef, itemHelmet.maxDef);
                                }
                            }
                            break;
                        default: {
                            let minDef = 0;
                            let maxDef = 0;

                            if (user.idItemBody) {
                                const itemInventaryBody = user.inv[String(user.idItemBody)];
                                if (itemInventaryBody) {
                                    const itemBody = vars.datObj[itemInventaryBody.idItem];
                                    minDef = itemBody.minDef;
                                    maxDef = itemBody.maxDef;
                                }
                            }

                            if (user.idItemShield) {
                                const itemInventaryShield = user.inv[String(user.idItemShield)];
                                if (itemInventaryShield) {
                                    const itemShield = vars.datObj[itemInventaryShield.idItem];
                                    minDef += itemShield.minDef;
                                    maxDef += itemShield.maxDef;
                                }
                            }

                            if (maxDef > 0) {
                                absorbeDmg = funct.randomIntFromInterval(minDef, maxDef);
                            }
                            break;
                        }
                    }

                    dmg -= absorbeDmg;
                    if (dmg < 1) {
                        dmg = 1;
                    }

                    user.hp -= dmg;
                    user.lastCombatActivityAt = Date.now();
                    emitCharacterFxToUserArea(idUser, COMBAT_HIT_FX_ID);
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.updateHP(user.hp, userClient);
                    });

                    this.loopArea(idNpc, (target) => {
                        withUserClient(target.id, (targetClient) => {
                            handleProtocol.playSound(idNpc, vars.arSounds.SND_IMPACTO, targetClient);
                        });
                    });

                    switch (lugarCuerpo) {
                        case vars.partesCuerpo.cabeza:
                            withUserClient(idUser, (userClient) => {
                                handleProtocol.console(
                                    `${npc.nameCharacter} te ha pegado en la cabeza por ${dmg}`,
                                    "red",
                                    1,
                                    0,
                                    userClient, undefined, undefined, npc.nameCharacter,
                                );
                            });
                            break;
                        case vars.partesCuerpo.piernaIzquierda:
                            withUserClient(idUser, (userClient) => {
                                handleProtocol.console(
                                    `${npc.nameCharacter} te ha pegado en la pierna izquierda por ${dmg}`,
                                    "red",
                                    1,
                                    0,
                                    userClient, undefined, undefined, npc.nameCharacter,
                                );
                            });
                            break;
                        case vars.partesCuerpo.piernaDerecha:
                            withUserClient(idUser, (userClient) => {
                                handleProtocol.console(
                                    `${npc.nameCharacter} te ha pegado en la pierna derecha por ${dmg}`,
                                    "red",
                                    1,
                                    0,
                                    userClient, undefined, undefined, npc.nameCharacter,
                                );
                            });
                            break;
                        case vars.partesCuerpo.brazoDerecho:
                            withUserClient(idUser, (userClient) => {
                                handleProtocol.console(
                                    `${npc.nameCharacter} te ha pegado en el brazo derecho por ${dmg}`,
                                    "red",
                                    1,
                                    0,
                                    userClient, undefined, undefined, npc.nameCharacter,
                                );
                            });
                            break;
                        case vars.partesCuerpo.brazoIzquierdo:
                            withUserClient(idUser, (userClient) => {
                                handleProtocol.console(
                                    `${npc.nameCharacter} te ha pegado en el brazo izquierdo por ${dmg}`,
                                    "red",
                                    1,
                                    0,
                                    userClient, undefined, undefined, npc.nameCharacter,
                                );
                            });
                            break;
                        case vars.partesCuerpo.torso:
                            withUserClient(idUser, (userClient) => {
                                handleProtocol.console(
                                    `${npc.nameCharacter} te ha pegado en el torso por ${dmg}`,
                                    "red",
                                    1,
                                    0,
                                    userClient, undefined, undefined, npc.nameCharacter,
                                );
                            });
                            break;
                    }

                    if (user.hp <= 0) {
                        this.deleteUserToAllNpcs(idUser);
                        user.hp = 0;
                        withUserClient(idUser, (userClient) => {
                            handleProtocol.updateHP(user.hp, userClient);
                        });
                        game.putBodyAndHeadDead(idUser);

                        void game.tirarItemsUser(idUser);

                        game.logCharacterActivity(user, {
                            category: "combat",
                            action: "character_death",
                            details: {
                                map: user.map,
                                posX: user.pos.x,
                                posY: user.pos.y,
                                killerType: "npc",
                                killerId: Number(idNpc),
                                killerName: npc.nameCharacter,
                            },
                        });

                        withUserClient(idUser, (userClient) => {
                            handleProtocol.console(`${npc.nameCharacter} te ha matado.`, "red", 1, 0, userClient, undefined, undefined, npc.nameCharacter);
                            handleProtocol.console(
                                "En 15 segundos entraras al mundo de los muertos.",
                                "gray",
                                1,
                                0,
                                userClient,
                            );
                        });

                        if (user.disconnectOnDeath && !getClientById(idUser)) {
                            game.closeForce(idUser);
                        }
                    }
                } else {
                    let rechazo = false;

                    if (user.idItemShield) {
                        const skillDefensa = game.getSkillDefensa(idUser);
                        const skillTacticasCombate = game.getSkillTacticasCombate(idUser);
                        const itemInventaryShield = user.inv[String(user.idItemShield)];
                        const itemShield = itemInventaryShield ? vars.datObj[itemInventaryShield.idItem] : null;
                        const shieldChancePercentage = Math.max(0, Number(itemShield?.porcentaje ?? 0));

                        if (shieldChancePercentage > 0 && skillDefensa + skillTacticasCombate > 0) {
                            const probRechazo = Math.max(
                                10,
                                Math.min(90, 100 * (skillDefensa / (skillDefensa + skillTacticasCombate))),
                            );
                            rechazo = funct.randomIntFromInterval(1, 100) <= probRechazo;
                        }
                    }

                    if (rechazo) {
                        emitCharacterFxToUserArea(idUser, COMBAT_SHIELD_BLOCK_FX_ID);
                        withUserClient(idUser, (userClient) => {
                            handleProtocol.console("¡Has bloqueado el golpe con el escudo!", "red", 1, 0, userClient);
                        });

                        this.loopArea(idNpc, (target) => {
                            withUserClient(target.id, (targetClient) => {
                                handleProtocol.playSound(idNpc, vars.arSounds.SND_ESCUDO, targetClient);
                            });
                        });
                    } else {
                        emitCharacterFxToUserArea(idUser, COMBAT_MISS_FX_ID);
                        withUserClient(idUser, (userClient) => {
                            handleProtocol.console(
                                `${npc.nameCharacter} ha fallado un golpe.`,
                                "red",
                                1,
                                0,
                                userClient, undefined, undefined, npc.nameCharacter,
                            );
                        });
                    }
                }

                this.loopArea(idNpc, (target) => {
                    withUserClient(target.id, (targetClient) => {
                        handleProtocol.dialog(idNpc, String(dmg), "", "red", 0, targetClient);
                    });
                });

                if (user.meditar) {
                    user.meditar = false;
                    withUserClient(idUser, (userClient) => {
                        handleProtocol.console("Terminas de meditar.", "white", 0, 0, userClient);
                    });

                    const userClient = getClientById(idUser);

                    if (userClient) {
                        game.loopArea(userClient, (client) => {
                            if (!client.isNpc) {
                                withUserClient(client.id, (targetClient) => {
                                    handleProtocol.animFX(idUser, 0, targetClient);
                                });
                            }
                        });
                    }
                }
            });
        } catch (err) {
            funct.dumpError(err);
        }
    };

    this.posMovement = function (heading: Direction, idNpc: EntityId): Position {
        try {
            let newX = 0;
            let newY = 0;
            const npc = getNpc(idNpc);

            if (heading === vars.direcciones.right) newX = 1;
            else if (heading === vars.direcciones.left) newX = -1;
            else if (heading === vars.direcciones.down) newY = 1;
            else if (heading === vars.direcciones.up) newY = -1;

            return {
                x: npc.pos.x + newX,
                y: npc.pos.y + newY,
            };
        } catch (err) {
            funct.dumpError(err);
            return { x: 0, y: 0 };
        }
    };

    this.moveNpcByPos = function (idNpc: EntityId, pos: Position) {
        try {
            const npc = getNpc(idNpc);
            const oldX = npc.pos.x;
            const oldY = npc.pos.y;

            const heading =
                pos.x > oldX
                    ? vars.direcciones.right
                    : pos.x < oldX
                      ? vars.direcciones.left
                      : pos.y > oldY
                        ? vars.direcciones.down
                        : vars.direcciones.up;
            const ghost = getDeadGhostAtPosition(npc.map, pos);
            const ghostMove = ghost ? resolveGhostDisplacementPosition(ghost, idNpc, heading) : undefined;

            if (
                !game.legalPosNpc(pos.x, pos.y, npc.map, Boolean(npc.aguaValida), Boolean(npc.tierraInvalida)) &&
                !ghostMove
            ) {
                clearNpcRoute(npc);
                return;
            }

            let moveHeading = 0;
            const newX = pos.x - oldX;
            const newY = pos.y - oldY;

            if (funct.sign(newX) === 1) moveHeading = vars.direcciones.right;
            else if (funct.sign(newX) === -1) moveHeading = vars.direcciones.left;
            else if (funct.sign(newY) === 1) moveHeading = vars.direcciones.down;
            else if (funct.sign(newY) === -1) moveHeading = vars.direcciones.up;

            npc.heading = moveHeading;
            npc.lastChasePos = { x: oldX, y: oldY };
            vars.mapData[npc.map][oldY][oldX].id = 0;

            if (ghostMove) {
                if (!ghost || !applyNpcGhostDisplacement(ghost, ghostMove.pos, idNpc)) {
                    vars.mapData[npc.map][oldY][oldX].id = idNpc;
                    clearNpcRoute(npc);
                    return;
                }
            }

            vars.mapData[npc.map][pos.y][pos.x].id = idNpc;
            npc.pos.x = pos.x;
            npc.pos.y = pos.y;
            npc.rute.shift();

            this.npcToArea(idNpc, moveHeading);
            syncNpcVisibilityForUser(npc, ghost);
        } catch (err) {
            funct.dumpError(err);
        }
    };

    this.loopArea = function (idNpc: EntityId, callback: RuntimeCallback<PlayerCharacter>) {
        try {
            const npc = getNpc(idNpc);
            const posXStart = npc.pos.x - AREA_RANGE_X;
            const posYStart = npc.pos.y - AREA_RANGE_Y;
            const posXEnd = npc.pos.x + AREA_RANGE_X;
            const posYEnd = npc.pos.y + AREA_RANGE_Y;

            for (let y = posYStart; y <= posYEnd; y++) {
                for (let x = posXStart; x <= posXEnd; x++) {
                    if (x >= 1 && x <= 100 && y >= 1 && y <= 100) {
                        const mapData = vars.mapData[npc.map][y][x];
                        if (mapData.id) {
                            const target = getUser(mapData.id);
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

    this.loopAreaPos = function (idMap: number, pos: Position, callback: RuntimeCallback<PlayerCharacter>) {
        try {
            const posXStart = pos.x - AREA_RANGE_X;
            const posYStart = pos.y - AREA_RANGE_Y;
            const posXEnd = pos.x + AREA_RANGE_X;
            const posYEnd = pos.y + AREA_RANGE_Y;

            for (let y = posYStart; y <= posYEnd; y++) {
                for (let x = posXStart; x <= posXEnd; x++) {
                    if (x >= 1 && x <= 100 && y >= 1 && y <= 100) {
                        const mapData = vars.mapData[idMap][y][x];
                        if (mapData.id) {
                            const target = getUser(mapData.id);
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

    this.npcToArea = function (idNpc: EntityId, heading: Direction) {
        try {
            const npc = getNpc(idNpc);

            this.loopArea(idNpc, (client) => {
                withUserClient(client.id, (targetClient) => {
                    handleProtocol.actPosition(idNpc, npc.pos, targetClient);
                });
            });

            const addNpcToUser = (userId: EntityId) => {
                const target = getUser(userId);

                if (!target) {
                    return;
                }

                const targetClient = getClientById(userId);

                if (!targetClient) {
                    return;
                }

                if (!isInvisibleToNpc(target) && vars.areaNpc[idNpc].indexOf(userId) < 0) {
                    vars.areaNpc[idNpc].push(userId);
                }

                handleProtocol.sendNpc(npc);
                socket.send(targetClient);
            };

            const removeNpcFromUser = (userId: EntityId) => {
                const targetClient = getClientById(userId);

                if (!getUser(userId) || !targetClient) {
                    return;
                }

                const index = vars.areaNpc[idNpc].indexOf(userId);

                if (index > -1) {
                    vars.areaNpc[idNpc].splice(index, 1);
                }

                handleProtocol.deleteCharacter(idNpc, targetClient);
            };

            if (heading === vars.direcciones.right) {
                let positionStartX = npc.pos.x + AREA_RANGE_X;
                let positionStartY = npc.pos.y - AREA_RANGE_Y;

                for (let y = positionStartY; y < positionStartY + AREA_DIAMETER_Y; y++) {
                    if (positionStartX >= 1 && y >= 1 && positionStartX <= 100 && y <= 100) {
                        const newUserID = vars.mapData[npc.map][y][positionStartX].id as EntityId | 0;
                        if (newUserID) addNpcToUser(newUserID);
                    }
                }

                positionStartX = npc.pos.x - AREA_OUTSIDE_OFFSET_X;
                positionStartY = npc.pos.y - AREA_RANGE_Y;

                for (let y = positionStartY; y < positionStartY + AREA_DIAMETER_Y; y++) {
                    if (positionStartX >= 1 && y >= 1 && positionStartX <= 100 && y <= 100) {
                        const newUserID = vars.mapData[npc.map][y][positionStartX].id as EntityId | 0;
                        if (newUserID) removeNpcFromUser(newUserID);
                    }
                }
            } else if (heading === vars.direcciones.left) {
                let positionStartX = npc.pos.x - AREA_RANGE_X;
                let positionStartY = npc.pos.y - AREA_RANGE_Y;

                for (let y = positionStartY; y < positionStartY + AREA_DIAMETER_Y; y++) {
                    if (positionStartX >= 1 && y >= 1 && positionStartX <= 100 && y <= 100) {
                        const newUserID = vars.mapData[npc.map][y][positionStartX].id as EntityId | 0;
                        if (newUserID) addNpcToUser(newUserID);
                    }
                }

                positionStartX = npc.pos.x + AREA_OUTSIDE_OFFSET_X;
                positionStartY = npc.pos.y - AREA_RANGE_Y;

                for (let y = positionStartY; y < positionStartY + AREA_DIAMETER_Y; y++) {
                    if (positionStartX >= 1 && y >= 1 && positionStartX <= 100 && y <= 100) {
                        const newUserID = vars.mapData[npc.map][y][positionStartX].id as EntityId | 0;
                        if (newUserID) removeNpcFromUser(newUserID);
                    }
                }
            } else if (heading === vars.direcciones.down) {
                let positionStartX = npc.pos.x - AREA_RANGE_X;
                let positionStartY = npc.pos.y + AREA_RANGE_Y;

                for (let x = positionStartX; x < positionStartX + AREA_DIAMETER_X; x++) {
                    if (x >= 1 && positionStartY >= 1 && x <= 100 && positionStartY <= 100) {
                        const newUserID = vars.mapData[npc.map][positionStartY][x].id as EntityId | 0;
                        if (newUserID) addNpcToUser(newUserID);
                    }
                }

                positionStartX = npc.pos.x - AREA_RANGE_X;
                positionStartY = npc.pos.y - AREA_OUTSIDE_OFFSET_Y;

                for (let x = positionStartX; x < positionStartX + AREA_DIAMETER_X; x++) {
                    if (x >= 1 && positionStartY >= 1 && x <= 100 && positionStartY <= 100) {
                        const newUserID = vars.mapData[npc.map][positionStartY][x].id as EntityId | 0;
                        if (newUserID) removeNpcFromUser(newUserID);
                    }
                }
            } else if (heading === vars.direcciones.up) {
                let positionStartX = npc.pos.x - AREA_RANGE_X;
                let positionStartY = npc.pos.y - AREA_RANGE_Y;

                for (let x = positionStartX; x < positionStartX + AREA_DIAMETER_X; x++) {
                    if (x >= 1 && positionStartY >= 1 && x <= 100 && positionStartY <= 100) {
                        const newUserID = vars.mapData[npc.map][positionStartY][x].id as EntityId | 0;
                        if (newUserID) addNpcToUser(newUserID);
                    }
                }

                positionStartX = npc.pos.x - AREA_RANGE_X;
                positionStartY = npc.pos.y + AREA_OUTSIDE_OFFSET_Y;

                for (let x = positionStartX; x < positionStartX + AREA_DIAMETER_X; x++) {
                    if (x >= 1 && positionStartY >= 1 && x <= 100 && positionStartY <= 100) {
                        const newUserID = vars.mapData[npc.map][positionStartY][x].id as EntityId | 0;
                        if (newUserID) removeNpcFromUser(newUserID);
                    }
                }
            }
        } catch (err) {
            funct.dumpError(err);
        }
    };

    this.deleteUserToAllNpcs = function (idUser: EntityId) {
        try {
            const userClient = getClientById(idUser);

            if (!userClient) {
                return;
            }

            game.loopArea(userClient, (target) => {
                if (target.isNpc && target.movement === 3) {
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

    this.tirarItems = function (idNpc: EntityId, ws: RuntimeClient) {
        try {
            const npc = getNpc(idNpc);
            if (!getUser(ws.id!)) {
                return;
            }

            let cantDrop = 0;
            let random = funct.randomIntFromInterval(1, 100);

            if (!npc.drop) {
                return;
            }

            if (random <= 90) {
                cantDrop++;

                if (random <= 10) {
                    cantDrop++;

                    for (let i = 0; i < 3; i++) {
                        random = funct.randomIntFromInterval(1, 100);
                        if (random <= 10) {
                            cantDrop++;
                        } else {
                            break;
                        }
                    }
                }
            }

            if (cantDrop > 0) {
                const reservedDropPositions = new Set<string>();

                for (let i = 0; i < cantDrop; i++) {
                    const item = npc.drop[i];
                    if (!item) {
                        continue;
                    }

                    const datObj = vars.datObj[item.item];

                    if (datObj.objType === vars.objType.dinero) {
                        const goldGanado = item.cant * vars.multiplicadorGold;
                        game.distribuirOroNpc(ws.id!, idNpc, goldGanado);
                    } else {
                        this.tirarItemAlSuelo(item.item, item.cant, npc.map, npc.pos, idNpc, reservedDropPositions);
                    }
                }
            }
        } catch (err) {
            funct.dumpError(err);
        }
    };

    this.tirarItemAlSuelo = function (
        idItem: number,
        cant: number,
        idMap: number,
        pos: Position,
        ignoreOccupantId?: EntityId,
        excludedPositions?: Set<string>,
    ) {
        try {
            let tmpPos = game.findDropPosition(idMap, pos, ignoreOccupantId, {
                maxRadius: 3,
                excludedPositions,
            });

            if (!tmpPos) {
                tmpPos = game.findDropPosition(idMap, pos, ignoreOccupantId, {
                    maxRadius: 3,
                    allowWater: true,
                    excludedPositions,
                });
            }

            if (!tmpPos) {
                tmpPos = game.findDropPosition(idMap, pos, ignoreOccupantId, {
                    maxRadius: 3,
                    allowReplacingDroppedFloorItem: true,
                    excludedPositions,
                });
            }

            if (!tmpPos) {
                tmpPos = game.findDropPosition(idMap, pos, ignoreOccupantId, {
                    maxRadius: 3,
                    allowWater: true,
                    allowReplacingDroppedFloorItem: true,
                    excludedPositions,
                });
            }

            if (!tmpPos) {
                console.log("<<<>>> NO SPACE ON MAP FLOOR:" + idMap);
                return;
            }

            excludedPositions?.add(`${idMap}:${tmpPos.x}:${tmpPos.y}`);

            void game.spawnDroppedFloorItem(idMap, tmpPos, idItem, cant).catch((error: unknown) => funct.dumpError(error));
        } catch (err) {
            funct.dumpError(err);
        }
    };
}

module.exports = npcs;
