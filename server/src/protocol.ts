export {};
import {cosmeticInspectionMessage} from './cosmeticInspection';
import { getFactionColor, getFactionRankTitle, getMaxEligibleFactionRank, type CharacterFaction } from "./factions";
import type {
    DataObject,
    EntityId,
    InventoryRecord,
    MapObjectInfo,
    PendingReviveCast,
    Position,
    RuntimeCharacter,
    RuntimeClient,
    RuntimeNpc,
} from "./types/runtime";
import type { LoginApi } from "./login";
import type { PackageApi } from "./package";
import type { SocketApi } from "./socket";
import { getCharacterById, getClientById } from "./runtimeRegistry";

const game = require("./game");
const login = require("./login") as LoginApi;
const socket = require("./socket") as SocketApi;
const funct = require("./functions");

const cosmeticInspectionRequests = new WeakMap<object, number>();
function showCosmeticInspection(target:RuntimeCharacter, viewer:RuntimeCharacter, ws:RuntimeClient) {
    if(!target._id || Date.now()-(cosmeticInspectionRequests.get(ws)??0)<1500)return;
    cosmeticInspectionRequests.set(ws,Date.now());
    const name=target.nameCharacter;
    // Inspect asynchronously; blockchain availability must never delay normal gameplay.
    void funct.fetchUrl(`/internal/characters/${encodeURIComponent(target._id)}/cosmetic-title`, {
        headers:{Authorization:vars.tokenAuth},
    }).then((result:{kind:unknown})=>{
        if(ws.id===undefined || vars.personajes[ws.id]!==viewer || ws.readyState!==1 || target.map!==viewer.map)return;
        const message=cosmeticInspectionMessage(name,result.kind);
        if(message)handleProtocol.console(message,'#d8b4fe',0,0,ws);
    }).catch(()=>{/* Ownership unavailable: omit the title, never trust cached client claims. */});
}
const vars = require("./vars");
const command = require("./commands");
const chatAuditLogger = require("./chatAuditLogger");
const respawn = require("./respawn");
const pkg = require("./package") as PackageApi;
const npcs = require("./npcs");
const handleProtocol = require("./handleProtocol");
const safeZone = require("./safeZone");
const fishing = require("./fishing");
const harvesting = require("./harvesting");
const crafting = require("./crafting");
const smelting = require("./smelting");
const challengeManager = require("./challengeManager");
const LOGOUT_CANCELLED_MESSAGE = "[Servidor] La salida se canceló porque te moviste.";
const MAX_PENDING_MOVE_QUEUE_LENGTH = 8;
const REVIVE_CAST_MS = 10000;
const DRAGON_SLAYER_SWORD_ITEM_ID = 402;
const REORDER_PACKET_COOLDOWN_MS = 100;
const MARKET_BROWSE_COOLDOWN_MS = 700;
const MARKET_WRITE_COOLDOWN_MS = 1200;
const MARKET_NOTICE_COOLDOWN_MS = 3000;

function normalizeFaction(value: unknown): CharacterFaction {
    return value === "armada" || value === "caos" ? value : "none";
}

function getFactionDisplayName(faction: CharacterFaction): string {
    if (faction === "armada") {
        return "Armada";
    }

    if (faction === "caos") {
        return "Caos";
    }

    return "Sin faccion";
}

function isActionRateLimited(
    ws: RuntimeClient,
    key:
        | "nextDropItemAt"
        | "nextEquipToggleAt"
        | "nextMapClickAt"
        | "nextBuyItemAt"
        | "nextSellItemAt"
        | "nextReorderBankAt"
        | "nextMarketBrowseAt"
        | "nextMarketWriteAt",
    cooldownMs: number,
    now = Date.now(),
) {
    const nextAllowedAt = Number(ws[key] ?? 0);

    if (nextAllowedAt > now) {
        return true;
    }

    ws[key] = now + cooldownMs;
    return false;
}

function notifyMarketThrottle(ws: RuntimeClient, message: string, now = Date.now()) {
    const nextNoticeAt = Number(ws.nextMarketNoticeAt ?? 0);

    if (nextNoticeAt > now) {
        return;
    }

    ws.nextMarketNoticeAt = now + MARKET_NOTICE_COOLDOWN_MS;
    handleProtocol.console(message, "white", 0, 0, ws);
}

function isMarketEnabled(): boolean {
    return vars.subastasHabilitadas !== false;
}

function isInSafeZone(user: RuntimeCharacter | undefined) {
    if (!user) {
        return false;
    }

    return isSafeZonePosition(user.map, user.pos);
}

function isSafeZonePosition(mapId: number | undefined, pos: Position | undefined) {
    return safeZone.isSafeZonePosition(mapId, pos);
}

function isUnsafeArenaPosition(mapId: number | undefined, pos: Position | undefined) {
    return safeZone.isUnsafeArenaPosition(mapId, pos);
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

function canCitizenSupportCriminal(caster: RuntimeCharacter, target: RuntimeCharacter): boolean {
    return isUnsafeArenaPosition(caster.map, caster.pos) && isUnsafeArenaPosition(target.map, target.pos);
}

function isArenaCombatCharacter(user: RuntimeCharacter | RuntimeNpc | undefined) {
    return Boolean(user && !user.isNpc && (user.pvpChar || user.arenaRoomId || user.challengeMatchId));
}

function shouldHideSpellProjectile(caster: RuntimeCharacter, target: RuntimeCharacter | RuntimeNpc) {
    if (isArenaCombatCharacter(caster) || isArenaCombatCharacter(target)) {
        return false;
    }

    if (isUnsafeArenaPosition(caster.map, caster.pos) && isUnsafeArenaPosition(target.map, target.pos)) {
        return false;
    }

    return isSafeZonePosition(caster.map, caster.pos) || isSafeZonePosition(target.map, target.pos);
}

function isChallengeCombatLocked(user: RuntimeCharacter | undefined) {
    return Boolean(user && Number(user.challengeLockedUntil ?? 0) > Date.now());
}

function getChallengeManager() {
    return require("./challengeManager") as {
        isCharacterInActiveMatch: (user: RuntimeCharacter | undefined) => boolean;
    };
}

function getSimulatedSkill(user: RuntimeCharacter) {
    return Math.min(100, Number(user.level ?? 0) * 3);
}

function getRequiredLevelForSpell(minSkill: number | undefined) {
    return Math.ceil(Math.max(0, Number(minSkill ?? 0)) / 3);
}

function getNewbieLabel(user: Pick<RuntimeCharacter, "level"> | undefined) {
    return game.isNewbieCharacter(user) ? " [NEWBIE]" : "";
}

function ignoresClassRestrictionForItem(idItem: number) {
    return idItem === DRAGON_SLAYER_SWORD_ITEM_ID;
}

function isDragonSlayerSwordEquipped(user: RuntimeCharacter | undefined) {
    if (!user?.idItemWeapon) {
        return false;
    }

    const inventory = user.inv as InventoryRecord | undefined;
    const weaponItem = inventory?.[String(user.idItemWeapon)];
    return Number(weaponItem?.idItem ?? 0) === DRAGON_SLAYER_SWORD_ITEM_ID;
}

function isOriginalNpcInteractionOutOfRange(
    user: Pick<RuntimeCharacter, "pos">,
    npc: Pick<RuntimeNpc, "pos"> | undefined,
    maxDistance: number,
) {
    if (!npc) {
        return true;
    }

    return Math.round(Math.hypot(user.pos.x - npc.pos.x, user.pos.y - npc.pos.y)) > maxDistance;
}

function syncSafeZoneState(ws: RuntimeClient, user: RuntimeCharacter) {
    const nextZonaSegura = isInSafeZone(user) ? 1 : 0;

    if (user.zonaSegura === nextZonaSegura) {
        return;
    }

    user.zonaSegura = nextZonaSegura;
    handleProtocol.selfFlagsDelta(
        {
            zonaSegura: user.zonaSegura,
            seguroActivado: Boolean(user.seguroActivado),
            seguroClanActivado: Boolean(user.seguroClanActivado),
        },
        ws,
    );
}

function syncOwnCharacterState(ws: RuntimeClient, user: RuntimeCharacter) {
    handleProtocol.selfFlagsDelta(
        {
            zonaSegura: Number(user.zonaSegura ?? 0),
            seguroActivado: Boolean(user.seguroActivado),
            seguroClanActivado: Boolean(user.seguroClanActivado),
        },
        ws,
    );
}

function cancelPendingLogout(user: RuntimeCharacter, ws: RuntimeClient, reason: string) {
    if (!user.logoutExpiresAt || user.logoutExpiresAt <= Date.now()) {
        return;
    }

    user.logoutRequestedAt = 0;
    user.logoutExpiresAt = 0;
    handleProtocol.console(reason, "#E69500", 0, 0, ws);
}

type AreaTarget = RuntimeCharacter | RuntimeNpc;
type PacketHandler = (ws: RuntimeClient) => void;

function resolveAreaTarget(map: number, x: number, y: number) {
    const tile = vars.mapData[map]?.[y]?.[x];
    const targetId = tile?.id;

    if (!targetId) {
        return;
    }

    const npc = vars.npcs[targetId] as RuntimeNpc | undefined;

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

function isInvisibleAdmin(user: RuntimeCharacter | undefined) {
    return Boolean(user?.privileges === 1 && user.invisibleAdmin);
}

function isSpellInvisible(user: RuntimeCharacter | undefined) {
    return Boolean(user?.invisibleSpell);
}

function isHiddenBySkill(user: RuntimeCharacter | undefined) {
    return Boolean(user?.hiddenSkill);
}

function clampChance(value: number, min = 5, max = 95) {
    return Math.max(min, Math.min(max, value));
}

function isVisibleToPartyViewer(viewerId: EntityId, character: RuntimeCharacter | undefined) {
    const viewer = getCharacterById(viewerId);

    return Boolean(viewer && character && viewer.partyId && character.partyId && viewer.partyId === character.partyId);
}

function isVisibleToClanViewer(viewerId: EntityId, character: RuntimeCharacter | undefined) {
    const viewer = getCharacterById(viewerId);

    return Boolean(
        viewer && character && viewer.clanId && character.clanId && String(viewer.clanId) === String(character.clanId),
    );
}

function canRenderCharacter(viewerId: EntityId, character: RuntimeCharacter | undefined) {
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

    if (viewer?.deadWorldActive) {
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

function shouldIgnoreCharacterCollision(viewer: RuntimeCharacter | undefined, occupant: RuntimeCharacter | undefined) {
    return Boolean(viewer?.deadWorldActive && occupant && !occupant.dead);
}

function resolveDeadWorldMovementDestination(
    mover: RuntimeCharacter,
    targetX: number,
    targetY: number,
    heading: number,
): { x: number; y: number } {
    if (!mover.deadWorldActive) {
        return { x: targetX, y: targetY };
    }

    const offset = getHeadingOffset(heading);
    let candidateX = targetX;
    let candidateY = targetY;

    for (let step = 0; step < 10; step++) {
        const occupantId = vars.mapData[mover.map]?.[candidateY]?.[candidateX]?.id ?? 0;
        const occupant = occupantId ? getCharacterById(occupantId) : undefined;

        if (!shouldIgnoreCharacterCollision(mover, occupant)) {
            break;
        }

        candidateX += offset.x;
        candidateY += offset.y;
    }

    return {
        x: candidateX,
        y: candidateY,
    };
}

function withTargetClient(idUser: EntityId | null | undefined, callback: (client: RuntimeClient) => void) {
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

function collectCombatFlushGroupClients(
    ws: RuntimeClient,
    options: {
        includeTargetArea?: {
            mapId: number;
            pos: Position;
        };
        extraClientIds?: Array<EntityId | null | undefined>;
    } = {},
) {
    const clients = new Map<string, RuntimeClient>();
    addFlushGroupClient(clients, ws.id);

    game.loopArea(ws, function (target: AreaTarget) {
        if (!target.isNpc) {
            addFlushGroupClient(clients, target.id);
        }
    });

    if (options.includeTargetArea) {
        game.loopAreaPos(
            options.includeTargetArea.mapId,
            options.includeTargetArea.pos,
            function (target: RuntimeCharacter) {
                addFlushGroupClient(clients, target.id);
            },
        );
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

function sendProjectileToCombatViewers(
    ws: RuntimeClient,
    attackerId: EntityId,
    mapId: number,
    startPos: Position,
    endPos: Position,
    grhIndex: number,
) {
    if (grhIndex <= 0) {
        return;
    }

    const sentClientIds = new Set<number>();
    const trySendToClient = (viewerId: EntityId | null | undefined) => {
        if (!viewerId || sentClientIds.has(Number(viewerId))) {
            return;
        }

        withTargetClient(viewerId, (targetClient) => {
            if (!canReceiveCharacterEvent(viewerId, attackerId)) {
                return;
            }

            sentClientIds.add(Number(viewerId));
            handleProtocol.createProjectile(startPos, endPos, grhIndex, targetClient);
        });
    };

    game.loopArea(ws, function (target: AreaTarget) {
        if (!target.isNpc) {
            trySendToClient(target.id);
        }
    });

    game.loopAreaPos(mapId, endPos, function (target: RuntimeCharacter) {
        trySendToClient(target.id);
    });
}

function sendSpellProjectileToCombatViewers(
    ws: RuntimeClient,
    casterId: EntityId,
    mapId: number,
    startPos: Position,
    endPos: Position,
    spellId: number,
) {
    if (spellId <= 0) {
        return;
    }

    const sentClientIds = new Set<number>();
    const trySendToClient = (viewerId: EntityId | null | undefined) => {
        if (!viewerId || sentClientIds.has(Number(viewerId))) {
            return;
        }

        withTargetClient(viewerId, (targetClient) => {
            if (!canReceiveCharacterEvent(viewerId, casterId)) {
                return;
            }

            sentClientIds.add(Number(viewerId));
            handleProtocol.spellVisual(
                {
                    startPos,
                    endPos,
                    spellId,
                },
                targetClient,
            );
        });
    };

    game.loopArea(ws, function (target: AreaTarget) {
        if (!target.isNpc) {
            trySendToClient(target.id);
        }
    });

    game.loopAreaPos(mapId, endPos, function (target: RuntimeCharacter) {
        trySendToClient(target.id);
    });
}

function sendSpellImpactToAreaViewers(
    ws: RuntimeClient,
    casterId: EntityId,
    targetId: EntityId,
    impact: {
        fxGrh?: number;
        soundId?: number;
        msg?: string;
    },
) {
    const hasImpactVisual = Number(impact.fxGrh ?? 0) > 0 || Number(impact.soundId ?? 0) > 0;
    const hasMagicWords = String(impact.msg ?? "").trim().length > 0;

    if (!hasImpactVisual && !hasMagicWords) {
        return 0;
    }

    let viewerCount = 0;

    game.loopArea(ws, function (target: AreaTarget) {
        if (target.isNpc) {
            return;
        }

        withTargetClient(target.id, (targetClient) => {
            if (!canReceiveCharacterEvent(target.id, casterId) && !canReceiveCharacterEvent(target.id, targetId)) {
                return;
            }

            viewerCount++;
            handleProtocol.spellVisual(
                {
                    targetId,
                    fxGrh: impact.fxGrh,
                    soundId: impact.soundId,
                    casterId,
                    msg: impact.msg,
                },
                targetClient,
            );
        });
    });

    return viewerCount;
}

function canNpcDetectCharacter(user: RuntimeCharacter | undefined) {
    return Boolean(
        user &&
        !isInvisibleAdmin(user) &&
        !isSpellInvisible(user) &&
        !isHiddenBySkill(user) &&
        (!user.dead || user.deadWorldActive),
    );
}

function isOwnSummonTarget(ownerId: EntityId, target: AreaTarget | undefined) {
    return Boolean(target?.isNpc && target.summonedByUserId && String(target.summonedByUserId) === String(ownerId));
}

function resolveOwnSummonCombatRedirect(ownerId: EntityId, target: AreaTarget | undefined) {
    if (!isOwnSummonTarget(ownerId, target)) {
        return target;
    }

    const redirectTargetId = Number(target?.currentTargetId ?? 0);

    if (!redirectTargetId) {
        return target;
    }

    const redirectedCharacter = getCharacterById(redirectTargetId);

    if (redirectedCharacter && !redirectedCharacter.dead) {
        return redirectedCharacter;
    }

    const redirectedNpc = vars.npcs[redirectTargetId] as RuntimeNpc | undefined;

    if (redirectedNpc && Number(redirectedNpc.hp ?? 0) > 0) {
        return redirectedNpc;
    }

    return target;
}

function isHostileCombatSpell(datSpell: Record<string, unknown> | undefined) {
    return Boolean(datSpell && (datSpell.paraliza || datSpell.inmoviliza || datSpell.subeHp === 2));
}

function isHealingSpell(datSpell: Record<string, unknown> | undefined) {
    return Number(datSpell?.subeHp ?? 0) === 1;
}

function isNonAttackableNpcTarget(target: AreaTarget | undefined) {
    return Boolean(target?.isNpc && !target.summonedByUserId && Number(target.maxHp ?? target.hp ?? 0) <= 0);
}

function isPartialInvisibilityRemovalSpell(datSpell: Record<string, unknown> | undefined) {
    return Number(datSpell?.remueveInvisibilidadParcial ?? 0) === 1;
}

function isReviveSpell(datSpell: Record<string, unknown> | undefined) {
    return Number(datSpell?.revivir ?? 0) === 1;
}

function isSelfTargetFallbackEligibleSpell(datSpell: Record<string, unknown> | undefined) {
    return Boolean(
        datSpell && (datSpell.removerParalisis || datSpell.invisibilidad || datSpell.subeAg || datSpell.subeFz),
    );
}

function clearPendingReviveCastTimeout(user: RuntimeCharacter & { pendingReviveCast?: PendingReviveCast | null }) {
    if (user.pendingReviveCast?.timeoutId) {
        clearTimeout(user.pendingReviveCast.timeoutId);
    }
}

function broadcastReviveCastBar(casterId: EntityId, visible: boolean, durationMs = REVIVE_CAST_MS) {
    const casterClient = getClientById(casterId);

    if (!casterClient) {
        return;
    }

    game.loopArea(casterClient, function (target: RuntimeCharacter | RuntimeNpc) {
        if (target.isNpc) {
            return;
        }

        withTargetClient(target.id, (targetClient) => {
            if (!canReceiveCharacterEvent(target.id, casterId)) {
                return;
            }

            if (visible) {
                handleProtocol.startCastBar(casterId, durationMs, targetClient);
                return;
            }

            handleProtocol.stopCastBar(casterId, targetClient);
        });
    });
}

function cancelPendingReviveCast(
    ws: RuntimeClient,
    user: RuntimeCharacter & { pendingReviveCast?: PendingReviveCast | null },
    reason?: string,
) {
    if (!user.pendingReviveCast) {
        return;
    }

    clearPendingReviveCastTimeout(user);
    user.pendingReviveCast = null;
    broadcastReviveCastBar(ws.id!, false);

    if (reason) {
        handleProtocol.console(reason, "white", 0, 0, ws);
    }
}

function isReviveTargetVisibleToCaster(
    caster: RuntimeCharacter | null | undefined,
    target: RuntimeCharacter | null | undefined,
) {
    if (!caster || !target) {
        return false;
    }

    if (caster.map !== target.map) {
        return false;
    }

    return !isOutsideClientVision(caster.pos, target.pos);
}

function syncPendingReviveCastVisibilityForUser(movedUserId: EntityId) {
    for (const idUser in vars.personajes) {
        const caster = vars.personajes[idUser] as
            | (RuntimeCharacter & {
                  pendingReviveCast?: PendingReviveCast | null;
              })
            | undefined;

        if (!caster?.pendingReviveCast) {
            continue;
        }

        if (
            String(caster.id) !== String(movedUserId) &&
            String(caster.pendingReviveCast.targetId) !== String(movedUserId)
        ) {
            continue;
        }

        const casterClient = getClientById(caster.id);
        const target = getCharacterById(caster.pendingReviveCast.targetId);

        if (!casterClient) {
            continue;
        }

        if (!isReviveTargetVisibleToCaster(caster, target)) {
            cancelPendingReviveCast(
                casterClient,
                caster,
                "Se canceló el resucitar porque el objetivo salió de tu visión.",
            );
        }
    }
}

function completePendingReviveCast(casterId: EntityId) {
    const casterClient = getClientById(casterId);
    const caster = getCharacterById(casterId) as
        | (RuntimeCharacter & {
              pendingReviveCast?: PendingReviveCast | null;
          })
        | null;

    if (!casterClient || !caster?.pendingReviveCast) {
        return;
    }

    const pendingCast = caster.pendingReviveCast;
    const target = getCharacterById(pendingCast.targetId);
    const datSpell = vars.datSpell[pendingCast.spellId];

    clearPendingReviveCastTimeout(caster);
    caster.pendingReviveCast = null;
    broadcastReviveCastBar(casterId, false);

    if (!target || target.isNpc || !target.dead) {
        handleProtocol.console(
            "La resurrección se canceló porque el objetivo ya no está muerto.",
            "white",
            0,
            0,
            casterClient,
        );
        return;
    }

    if (caster.dead) {
        return;
    }

    if (!isReviveTargetVisibleToCaster(caster, target)) {
        handleProtocol.console(
            "La resurrección se canceló porque el objetivo salió de tu visión.",
            "white",
            0,
            0,
            casterClient,
        );
        return;
    }

    game.revivirUsuario(target.id, {
        hp: 1,
        mana: 0,
    });

    game.loopArea(casterClient, function (client: RuntimeCharacter | RuntimeNpc) {
        if (client.isNpc) {
            return;
        }

        withTargetClient(client.id, (targetClient) => {
            if (!canReceiveCharacterEvent(client.id, casterId) && !canReceiveCharacterEvent(client.id, target.id)) {
                return;
            }

            if (Number(datSpell?.fxGrh ?? 0) > 0) {
                handleProtocol.animFX(target.id, Number(datSpell.fxGrh), targetClient);
            }

            if (Number(datSpell?.wav ?? 0) > 0) {
                handleProtocol.playSound(target.id, Number(datSpell.wav), targetClient);
            }
        });
    });

    handleProtocol.console(`Has resucitado a ${target.nameCharacter}.`, "red", 1, 0, casterClient);
    withTargetClient(target.id, (targetClient) => {
        handleProtocol.console(`${caster.nameCharacter} te ha resucitado.`, "red", 1, 0, targetClient);
    });
}

function startPendingReviveCast(
    ws: RuntimeClient,
    user: RuntimeCharacter & { pendingReviveCast?: PendingReviveCast | null },
    targetId: EntityId,
    spellId: number,
    datSpell: Record<string, unknown>,
) {
    cancelPendingReviveCast(ws, user);

    user.mana = Math.max(0, Number(user.mana ?? 0) - Number(datSpell.manaRequired ?? 0));
    handleProtocol.updateMana(user.mana, ws);

    const startedAt = Date.now();
    const pendingCast: PendingReviveCast = {
        targetId,
        spellId,
        startedAt,
        endsAt: startedAt + REVIVE_CAST_MS,
    };

    pendingCast.timeoutId = setTimeout(() => {
        completePendingReviveCast(ws.id!);
    }, REVIVE_CAST_MS);

    user.pendingReviveCast = pendingCast;

    if (String(datSpell.palabrasMagicas ?? "").trim().length > 0) {
        game.loopArea(ws, function (client: RuntimeCharacter | RuntimeNpc) {
            if (client.isNpc) {
                return;
            }

            withTargetClient(client.id, (targetClient) => {
                if (!canReceiveCharacterEvent(client.id, ws.id)) {
                    return;
                }

                handleProtocol.dialog(ws.id!, String(datSpell.palabrasMagicas), "", "#E69500", 0, targetClient);
            });
        });
    }

    broadcastReviveCastBar(ws.id!, true, REVIVE_CAST_MS);
}

function isNonHostileCityNpcSpellTarget(target: AreaTarget | undefined) {
    if (!target?.isNpc || target.summonedByUserId) {
        return false;
    }

    if (typeof target.hp !== "number" || typeof target.maxHp !== "number") {
        return true;
    }

    return (
        target.npcType === vars.npcType.sacerdote ||
        target.npcType === vars.npcType.entrenador ||
        target.npcType === vars.npcType.banquero ||
        target.npcType === vars.npcType.noble ||
        target.npcType === vars.npcType.timbero ||
        target.npcType === vars.npcType.sacerdoteNewbie ||
        target.npcType === vars.npcType.comerciante ||
        target.npcType === vars.npcType.subastador
    );
}

export type ProtocolApi = {
    handleData: (ws: RuntimeClient, packageID: number) => void;
    processPendingMovements: () => void;
    syncPendingReviveCastVisibilityForUser: (movedUserId: EntityId) => void;
};

const protocol = {} as ProtocolApi;

protocol.syncPendingReviveCastVisibilityForUser = syncPendingReviveCastVisibilityForUser;

Protocol.call(protocol);
const AREA_RANGE_X = vars.areaVisionRangeX;
const AREA_RANGE_Y = vars.areaVisionRangeY;
const AREA_DIAMETER_X = vars.areaVisionDiameterX;
const AREA_DIAMETER_Y = vars.areaVisionDiameterY;
const AREA_OUTSIDE_OFFSET_X = vars.areaVisionOutsideOffsetX;
const AREA_OUTSIDE_OFFSET_Y = vars.areaVisionOutsideOffsetY;
const CLIENT_VIEW_RANGE_X = 10;
const CLIENT_VIEW_RANGE_Y = 10;
const CLIENT_VIEW_EXTRA_BOTTOM_Y = 1;

function isOutsideClientVision(origin: { x: number; y: number }, target: { x: number; y: number }) {
    const deltaX = Math.abs(origin.x - target.x);
    const deltaY = target.y - origin.y;
    const maxVisibleDownY = CLIENT_VIEW_RANGE_Y + CLIENT_VIEW_EXTRA_BOTTOM_Y;

    return deltaX > CLIENT_VIEW_RANGE_X || deltaY > maxVisibleDownY || deltaY < -CLIENT_VIEW_RANGE_Y;
}

function castPartialInvisibilityRemovalSpell(
    ws: RuntimeClient,
    user: RuntimeCharacter,
    datSpell: Record<string, unknown>,
) {
    const visibleUsers = new Set<EntityId>();
    const minX = Math.max(1, user.pos.x - CLIENT_VIEW_RANGE_X);
    const maxX = Math.min(100, user.pos.x + CLIENT_VIEW_RANGE_X);
    const minY = Math.max(1, user.pos.y - CLIENT_VIEW_RANGE_Y);
    const maxY = Math.min(100, user.pos.y + CLIENT_VIEW_RANGE_Y + CLIENT_VIEW_EXTRA_BOTTOM_Y);

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const targetId = vars.mapData[user.map]?.[y]?.[x]?.id;

            if (!targetId) {
                continue;
            }

            const targetUser = getCharacterById(targetId);

            if (!targetUser || targetUser.dead) {
                continue;
            }

            visibleUsers.add(targetUser.id);
        }
    }

    const affectedUsers: EntityId[] = [];

    for (const targetUserId of visibleUsers) {
        const targetUser = getCharacterById(targetUserId);

        if (!targetUser?.invisibleSpell) {
            continue;
        }

        game.setSpellInvisibility(targetUserId, false);

        if (targetUserId !== ws.id) {
            game.interruptPendingLogoutOnAttack(targetUserId);
        }

        affectedUsers.push(targetUserId);
    }

    user.mana = Number(user.mana ?? 0) - Number(datSpell.manaRequired ?? 0);

    game.loopArea(ws, function (client: AreaTarget) {
        if (client.isNpc) {
            return;
        }

        if (Number(datSpell.wav ?? 0) > 0) {
            withTargetClient(client.id, (targetClient) => {
                if (!canReceiveCharacterEvent(client.id, ws.id)) {
                    return;
                }

                handleProtocol.playSound(ws.id, Number(datSpell.wav ?? 0), targetClient);
            });
        }

        if (String(datSpell.palabrasMagicas ?? "").trim().length > 0) {
            withTargetClient(client.id, (targetClient) => {
                if (!canReceiveCharacterEvent(client.id, ws.id)) {
                    return;
                }

                handleProtocol.dialog(ws.id, String(datSpell.palabrasMagicas), "", "#E69500", 0, targetClient);
            });
        }

        if (Number(datSpell.fxGrh ?? 0) > 0) {
            const fxTargets = affectedUsers.length ? affectedUsers : [ws.id!];

            for (const targetUserId of fxTargets) {
                withTargetClient(client.id, (targetClient) => {
                    if (!canReceiveCharacterEvent(client.id, targetUserId)) {
                        return;
                    }

                    handleProtocol.animFX(targetUserId, Number(datSpell.fxGrh ?? 0), targetClient);
                });
            }
        }
    });

    handleProtocol.updateMana(user.mana, ws);
}

const dictionaryServer: Partial<Record<number, PacketHandler>> = {};

dictionaryServer[pkg.serverPacketID.changeHeading] = changeHeading;
dictionaryServer[pkg.serverPacketID.click] = eventClick;
dictionaryServer[pkg.serverPacketID.useItemClick] = useItemClick;
dictionaryServer[pkg.serverPacketID.equiparItem] = equiparItem;
dictionaryServer[pkg.serverPacketID.connectCharacter] = connectCharacter;
dictionaryServer[pkg.serverPacketID.position] = position;
dictionaryServer[pkg.serverPacketID.dialog] = dialog;
dictionaryServer[pkg.serverPacketID.ping] = ping;
dictionaryServer[pkg.serverPacketID.attackMele] = attackMele;
dictionaryServer[pkg.serverPacketID.attackRange] = attackRange;
dictionaryServer[pkg.serverPacketID.attackSpell] = attackSpell;
dictionaryServer[pkg.serverPacketID.tirarItem] = tirarItem;
dictionaryServer[pkg.serverPacketID.agarrarItem] = agarrarItem;
dictionaryServer[pkg.serverPacketID.buyItem] = buyItem;
dictionaryServer[pkg.serverPacketID.sellItem] = sellItem;
dictionaryServer[pkg.serverPacketID.resyncPosition] = resyncPosition;
dictionaryServer[pkg.serverPacketID.changeSeguro] = changeSeguro;
dictionaryServer[pkg.serverPacketID.changeClanSeguro] = changeClanSeguro;
dictionaryServer[pkg.serverPacketID.reorderSpell] = reorderSpell;
dictionaryServer[pkg.serverPacketID.reorderInventoryItem] = reorderInventoryItem;
dictionaryServer[pkg.serverPacketID.reorderBankItem] = reorderBankItem;
dictionaryServer[pkg.serverPacketID.changeBankTab] = changeBankTab;
dictionaryServer[pkg.serverPacketID.depositBankGold] = depositBankGold;
dictionaryServer[pkg.serverPacketID.withdrawBankGold] = withdrawBankGold;
dictionaryServer[pkg.serverPacketID.closeTrade] = closeTrade;
dictionaryServer[pkg.serverPacketID.marketAction] = marketAction;
dictionaryServer[pkg.serverPacketID.retosAction] = retosAction;
dictionaryServer[pkg.serverPacketID.toggleHiddenSkill] = toggleHiddenSkill;
dictionaryServer[pkg.serverPacketID.useItemU] = useItemU;
dictionaryServer[pkg.serverPacketID.craftItem] = craftItem;

function Protocol(this: ProtocolApi) {
    try {
        this.handleData = function (ws: RuntimeClient, packageID: number) {
            const handler = dictionaryServer[packageID];

            if (!handler) {
                return;
            }

            handler(ws);
        };

        this.processPendingMovements = function () {
            const now = Date.now();

            for (const idUser in vars.personajes) {
                const user = getCharacterById(idUser) as any;
                const pendingMoveQueue = Array.isArray(user?.pendingMoveQueue) ? user.pendingMoveQueue : [];

                if (!user || pendingMoveQueue.length === 0) {
                    continue;
                }

                drainPendingMovement(idUser, now);
            }
        };
    } catch (err) {
        funct.dumpError(err);
    }
}

function broadcastHeadingChange(ws: RuntimeClient, heading: number) {
    game.loopArea(ws, function (target: AreaTarget) {
        if (!target.isNpc && target.id != ws.id) {
            withTargetClient(target.id, (targetClient) => {
                if (!canReceiveCharacterEvent(target.id, ws.id)) {
                    return;
                }

                handleProtocol.changeHeading(ws.id, heading, targetClient);
            });
        }
    });
}

function stopMeditation(ws: RuntimeClient, user: RuntimeCharacter) {
    if (!user.meditar) {
        return;
    }

    user.meditar = false;

    handleProtocol.console("Terminas de meditar.", "white", 0, 0, ws);

    game.loopArea(ws, function (client: AreaTarget) {
        if (!client.isNpc) {
            withTargetClient(client.id, (targetClient) => {
                if (!canReceiveCharacterEvent(client.id, ws.id)) {
                    return;
                }

                handleProtocol.animFX(ws.id, 0, targetClient);
            });
        }
    });
}

function stopHiddenSkill(ws: RuntimeClient, user: RuntimeCharacter, rehideDelayMs = 0) {
    if (!user.hiddenSkill) {
        return;
    }

    game.setHiddenSkill(ws.id!, false);
    if (rehideDelayMs > 0) {
        user.hiddenSkillCooldownUntil = Math.max(
            Number(user.hiddenSkillCooldownUntil ?? 0),
            Date.now() + rehideDelayMs,
        );
    }

    handleProtocol.console("Has vuelto a ser visible.", "white", 0, 0, ws);
}

function getHiddenSkillAttemptCooldownMs() {
    return Number(vars.timing.actionCooldowns.hiddenSkillMs ?? 150);
}

function getHiddenSkillAfterHitCooldownMs() {
    return Number(vars.timing.actionCooldowns.hiddenSkillAfterHitMs ?? 2500);
}

function hasCamouflageArmorEquipped(user: RuntimeCharacter) {
    if (!user.idItemBody) {
        return false;
    }

    const inventory = user.inv as Record<string, { idItem: number }> | undefined;
    const equippedBodyItem = inventory?.[String(user.idItemBody)];

    if (!equippedBodyItem) {
        return false;
    }

    return Boolean(vars.datObj[equippedBodyItem.idItem]?.Camouflage);
}

function canKeepHiddenSkillWhileActing(user: RuntimeCharacter) {
    return Boolean(user.hiddenSkill && user.idClase === vars.clases.cazador && hasCamouflageArmorEquipped(user));
}

function getHiddenSkillChance(user: RuntimeCharacter): number {
    const skill = game.getSkillOcultarse(user.id) || 0;
    return clampChance((((0.000002 * skill - 0.0002) * skill + 0.0064) * skill + 0.1124) * 100, 1, 99);
}

function getHiddenSkillDurationMs(user: RuntimeCharacter): number {
    const skill = game.getSkillOcultarse(user.id) || 0;
    const interval = 500;
    const missingSkill = 100 - skill;
    let durationCounter =
        (-0.000001 * missingSkill ** 3 + 0.00009229 * missingSkill ** 2 + -0.0088 * missingSkill + 0.9571) * interval;

    if (user.idClase === vars.clases.cazador) {
        durationCounter = Math.floor(durationCounter / 2);
    } else {
        durationCounter = Math.floor(durationCounter / 3);
    }

    return Math.max(1000, durationCounter * 40);
}

function isHiddenSkillBlockedByMap(user: RuntimeCharacter) {
    const mapData = vars.mapData[user.map] ?? vars.infoMapData[user.map] ?? {};

    return Boolean(mapData.sinInviOcul || mapData.SinInviOcul);
}

function toggleHiddenSkill(ws: RuntimeClient) {
    const user = getCharacterById(ws.id!) as any;

    if (!user) {
        return;
    }

    if (user.dead) {
        handleProtocol.console("Los muertos no pueden ocultarse.", "white", 0, 0, ws);
        return;
    }

    if (user.inmovilizado || user.paralizado) {
        handleProtocol.console("No puedes ocultarte en tu estado actual.", "white", 0, 0, ws);
        return;
    }

    if (user.hiddenSkill) {
        handleProtocol.console("Ya estás oculto.", "white", 0, 0, ws);
        return;
    }

    if (user.invisibleSpell || isInvisibleAdmin(user)) {
        handleProtocol.console("No puedes ocultarte si ya estás invisible.", "white", 0, 0, ws);
        return;
    }

    if (getChallengeManager().isCharacterInActiveMatch(user)) {
        handleProtocol.console("[Retos] No puedes ocultarte dentro de la arena.", "white", 0, 0, ws);
        return;
    }

    if (isHiddenSkillBlockedByMap(user)) {
        handleProtocol.console("Una fuerza divina te impide ocultarte en esta zona.", "white", 0, 0, ws);
        return;
    }

    if (user.navegando) {
        handleProtocol.console("No puedes ocultarte mientras navegas.", "white", 0, 0, ws);
        return;
    }

    const now = Date.now();

    if ((user.hiddenSkillCooldownUntil ?? 0) > now) {
        handleProtocol.console("Todavía no puedes volver a ocultarte.", "white", 0, 0, ws);
        return;
    }

    stopMeditation(ws, user);

    const chance = getHiddenSkillChance(user);
    const roll = Math.floor(Math.random() * 100) + 1;

    user.hiddenSkillCooldownUntil = now + getHiddenSkillAttemptCooldownMs();

    if (roll > chance) {
        handleProtocol.console("Fallaste al intentar ocultarte.", "white", 0, 0, ws);
        return;
    }

    game.setHiddenSkill(ws.id!, true);
    user.hiddenSkillExpiresAt = now + getHiddenSkillDurationMs(user);

    handleProtocol.console("Te ocultas entre las sombras.", "white", 0, 0, ws);
}

function clearPendingMoveTimer(user: RuntimeCharacter & { pendingMoveTimerId?: ReturnType<typeof setTimeout> | null }) {
    if (user.pendingMoveTimerId) {
        clearTimeout(user.pendingMoveTimerId);
        user.pendingMoveTimerId = null;
    }
}

function schedulePendingMovement(userId: EntityId) {
    const user = getCharacterById(userId) as
        | (RuntimeCharacter & {
              pendingMoveTimerId?: ReturnType<typeof setTimeout> | null;
          })
        | null;

    if (!user) {
        return;
    }

    clearPendingMoveTimer(user);

    const pendingMoveQueue = Array.isArray(user.pendingMoveQueue) ? user.pendingMoveQueue : [];

    if (pendingMoveQueue.length === 0) {
        return;
    }

    const delayMs = Math.max(0, Number(user.nextWalkAt ?? 0) - Date.now());

    user.pendingMoveTimerId = setTimeout(() => {
        const activeUser = getCharacterById(userId) as
            | (RuntimeCharacter & {
                  pendingMoveTimerId?: ReturnType<typeof setTimeout> | null;
              })
            | null;
        const activeClient = getClientById(userId);

        if (!activeUser) {
            return;
        }

        activeUser.pendingMoveTimerId = null;

        if (!activeClient) {
            return;
        }

        const nextPendingMoveQueue = Array.isArray(activeUser.pendingMoveQueue) ? activeUser.pendingMoveQueue : [];

        if (nextPendingMoveQueue.length === 0) {
            return;
        }

        const now = Date.now();

        if ((activeUser.nextWalkAt ?? 0) > now) {
            schedulePendingMovement(userId);
            return;
        }

        const pendingMove = nextPendingMoveQueue.shift();

        if (!pendingMove) {
            return;
        }

        processUserMovement(activeClient, pendingMove.heading, pendingMove.moveId, now);
    }, delayMs);
}

function drainPendingMovement(userId: EntityId, now = Date.now()) {
    const user = getCharacterById(userId) as
        | (RuntimeCharacter & {
              pendingMoveTimerId?: ReturnType<typeof setTimeout> | null;
          })
        | null;
    const client = getClientById(userId);

    if (!user || !client) {
        return;
    }

    const pendingMoveQueue = Array.isArray(user.pendingMoveQueue) ? user.pendingMoveQueue : [];

    if (pendingMoveQueue.length === 0) {
        clearPendingMoveTimer(user);
        return;
    }

    if ((user.nextWalkAt ?? 0) > now) {
        schedulePendingMovement(userId);
        return;
    }

    clearPendingMoveTimer(user);

    const pendingMove = pendingMoveQueue.shift();

    if (!pendingMove) {
        return;
    }

    processUserMovement(client, pendingMove.heading, pendingMove.moveId, now);
}

function sendOwnPositionUpdate(ws: RuntimeClient, user: RuntimeCharacter) {
    handleProtocol.actPositionServer(
        user.map,
        user.pos,
        user.heading,
        Number(user.lastProcessedMoveId ?? 0),
        Number(user.stateVersion ?? 0),
        ws,
    );
}

function getHeadingOffset(heading: number) {
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

function isSameEntityId(left: EntityId | undefined, right: EntityId | undefined) {
    if (typeof left === "undefined" || typeof right === "undefined") {
        return false;
    }

    return String(left) === String(right);
}

function getGhostDisplacementHeadings(heading: number) {
    if (heading === vars.direcciones.up) {
        return [vars.direcciones.down, vars.direcciones.left, vars.direcciones.right, vars.direcciones.up];
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

function resolveGhostDisplacement(mover: RuntimeCharacter, targetX: number, targetY: number, heading: number) {
    if (mover.dead) {
        return null;
    }

    const occupantId = vars.mapData[mover.map]?.[targetY]?.[targetX]?.id ?? 0;

    if (!occupantId || isSameEntityId(occupantId, mover.id)) {
        return null;
    }

    const ghost = getCharacterById(occupantId);

    if (!ghost?.dead) {
        return null;
    }

    for (const candidateHeading of getGhostDisplacementHeadings(heading)) {
        const offset = getHeadingOffset(candidateHeading);
        const nextX = ghost.pos.x + offset.x;
        const nextY = ghost.pos.y + offset.y;

        if (!game.legalPos(nextX, nextY, ghost.map, Boolean(ghost.navegando), mover.id)) {
            continue;
        }

        return {
            ghost,
            heading: candidateHeading,
            pos: {
                x: nextX,
                y: nextY,
            },
        };
    }

    return null;
}

function applyGhostDisplacement(
    ghostMove: {
        ghost: RuntimeCharacter;
        heading: number;
        pos: { x: number; y: number };
    },
    now: number,
) {
    const ghost = ghostMove.ghost;
    const ghostClient = getClientById(ghost.id);

    ghost.pos.x = ghostMove.pos.x;
    ghost.pos.y = ghostMove.pos.y;
    ghost.heading = ghostMove.heading;
    ghost.stateVersion = Number(ghost.stateVersion ?? 0) + 1;
    ghost.nextWalkAt = now + vars.timing.walkStepMs;
    ghost.ignoreMovementUntil = ghost.nextWalkAt;

    vars.mapData[ghost.map][ghost.pos.y][ghost.pos.x].id = ghost.id;

    if (ghostClient) {
        syncSafeZoneState(ghostClient, ghost);
        sendOwnPositionUpdate(ghostClient, ghost);
        updateUserAreaAfterMovement(ghostClient, ghost, ghostMove.heading);
    }

    game.loopAreaPos(ghost.map, ghost.pos, function (target: RuntimeCharacter) {
        if (target.id !== ghost.id && canRenderCharacter(target.id, ghost)) {
            withTargetClient(target.id, (targetClient) => {
                handleProtocol.actPosition(ghost.id, ghost.pos, targetClient);
            });
        }
    });
}

function updateUserAreaAfterMovement(ws: RuntimeClient, user: RuntimeCharacter, heading: number) {
    const clientId = ws.id!;

    if (heading == vars.direcciones.right) {
        let positionStartX = user.pos.x + AREA_RANGE_X;
        let positionStartY = user.pos.y - AREA_RANGE_Y;

        for (let y = positionStartY; y < positionStartY + AREA_DIAMETER_Y; y++) {
            if (positionStartX >= 1 && y >= 1 && positionStartX <= 100 && y <= 100) {
                const mapData = vars.mapData[user.map][y][positionStartX];

                if (mapData.id) {
                    const areaTarget = resolveAreaTarget(user.map, positionStartX, y);

                    if (!areaTarget) {
                        continue;
                    }

                    if (areaTarget.isNpc) {
                        const npcArea = Array.isArray(vars.areaNpc[areaTarget.id]) ? vars.areaNpc[areaTarget.id] : [];

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

                        handleProtocol.sendNpc(areaTarget.target);
                        socket.send(ws);
                    } else if (canRenderCharacter(clientId, areaTarget.target as RuntimeCharacter)) {
                        handleProtocol.sendCharacter(areaTarget.target, clientId);
                        socket.send(ws);
                    }

                    if (!areaTarget.isNpc && canRenderCharacter(areaTarget.id, user)) {
                        handleProtocol.sendCharacter(user, areaTarget.id);
                        withTargetClient(areaTarget.id, (targetClient) => {
                            socket.send(targetClient);
                        });
                    }
                }

                const pos = {
                    x: positionStartX,
                    y: y,
                };

                if (game.hayObj(user.map, pos)) {
                    const item = game.objMap(user.map, pos);
                    const obj = vars.datObj[item.objIndex];

                    if (obj.objType == vars.objType.puerta) {
                        if (item.objIndex == obj.indexAbierta) {
                            handleProtocol.blockMap(user.map, pos, 0, ws);
                            handleProtocol.blockMap(
                                user.map,
                                {
                                    x: pos.x - 1,
                                    y: pos.y,
                                },
                                0,
                                ws,
                            );
                        }
                    }

                    handleProtocol.renderItem(item.objIndex, user.map, pos, ws);
                }
            }
        }

        positionStartX = user.pos.x - AREA_OUTSIDE_OFFSET_X;
        positionStartY = user.pos.y - AREA_RANGE_Y;

        for (let y = positionStartY; y < positionStartY + AREA_DIAMETER_Y; y++) {
            if (positionStartX >= 1 && y >= 1 && positionStartX <= 100 && y <= 100) {
                const mapData = vars.mapData[user.map][y][positionStartX];

                if (mapData.id) {
                    const areaTarget = resolveAreaTarget(user.map, positionStartX, y);

                    if (!areaTarget) {
                        continue;
                    }

                    handleProtocol.deleteCharacter(areaTarget.id, ws);

                    if (!areaTarget.isNpc) {
                        withTargetClient(areaTarget.id, (targetClient) => {
                            handleProtocol.deleteCharacter(ws.id, targetClient);
                        });
                    } else if (areaTarget.target.movement == 3) {
                        const npcArea = vars.areaNpc[areaTarget.id] as Array<string | number> | undefined;
                        const index = npcArea?.indexOf(clientId) ?? -1;

                        if (npcArea && index > -1) {
                            npcArea.splice(index, 1);
                        }
                    }
                }

                const pos = {
                    x: positionStartX,
                    y: y,
                };

                if (game.hayObj(user.map, pos)) {
                    handleProtocol.deleteItem(user.map, pos, ws);
                }
            }
        }
    } else if (heading == vars.direcciones.left) {
        let positionStartX = user.pos.x - AREA_RANGE_X;
        let positionStartY = user.pos.y - AREA_RANGE_Y;

        for (let y = positionStartY; y < positionStartY + AREA_DIAMETER_Y; y++) {
            if (positionStartX >= 1 && y >= 1 && positionStartX <= 100 && y <= 100) {
                const mapData = vars.mapData[user.map][y][positionStartX];

                if (mapData.id) {
                    const areaTarget = resolveAreaTarget(user.map, positionStartX, y);

                    if (!areaTarget) {
                        continue;
                    }

                    if (areaTarget.isNpc) {
                        const npcArea = Array.isArray(vars.areaNpc[areaTarget.id]) ? vars.areaNpc[areaTarget.id] : [];

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

                        handleProtocol.sendNpc(areaTarget.target);
                        socket.send(ws);
                    } else if (canRenderCharacter(clientId, areaTarget.target as RuntimeCharacter)) {
                        handleProtocol.sendCharacter(areaTarget.target, clientId);
                        socket.send(ws);
                    }

                    if (!areaTarget.isNpc && canRenderCharacter(areaTarget.id, user)) {
                        handleProtocol.sendCharacter(user, areaTarget.id);
                        withTargetClient(areaTarget.id, (targetClient) => {
                            socket.send(targetClient);
                        });
                    }
                }

                const pos = {
                    x: positionStartX,
                    y: y,
                };

                if (game.hayObj(user.map, pos)) {
                    const item = game.objMap(user.map, pos);
                    const obj = vars.datObj[item.objIndex];

                    if (obj.objType == vars.objType.puerta) {
                        if (item.objIndex == obj.indexAbierta) {
                            handleProtocol.blockMap(user.map, pos, 0, ws);
                            handleProtocol.blockMap(
                                user.map,
                                {
                                    x: pos.x - 1,
                                    y: pos.y,
                                },
                                0,
                                ws,
                            );
                        }
                    }

                    handleProtocol.renderItem(item.objIndex, user.map, pos, ws);
                }
            }
        }

        positionStartX = user.pos.x + AREA_OUTSIDE_OFFSET_X;
        positionStartY = user.pos.y - AREA_RANGE_Y;

        for (let y = positionStartY; y < positionStartY + AREA_DIAMETER_Y; y++) {
            if (positionStartX >= 1 && y >= 1 && positionStartX <= 100 && y <= 100) {
                const mapData = vars.mapData[user.map][y][positionStartX];

                if (mapData.id) {
                    const areaTarget = resolveAreaTarget(user.map, positionStartX, y);

                    if (!areaTarget) {
                        continue;
                    }

                    handleProtocol.deleteCharacter(areaTarget.id, ws);

                    if (!areaTarget.isNpc) {
                        withTargetClient(areaTarget.id, (targetClient) => {
                            handleProtocol.deleteCharacter(ws.id, targetClient);
                        });
                    } else if (areaTarget.target.movement == 3) {
                        const npcArea = vars.areaNpc[areaTarget.id] as Array<string | number> | undefined;
                        const index = npcArea?.indexOf(clientId) ?? -1;

                        if (npcArea && index > -1) {
                            npcArea.splice(index, 1);
                        }
                    }
                }

                const pos = {
                    x: positionStartX,
                    y: y,
                };

                if (game.hayObj(user.map, pos)) {
                    handleProtocol.deleteItem(user.map, pos, ws);
                }
            }
        }
    } else if (heading == vars.direcciones.down) {
        let positionStartX = user.pos.x - AREA_RANGE_X;
        let positionStartY = user.pos.y + AREA_RANGE_Y;

        for (let x = positionStartX; x < positionStartX + AREA_DIAMETER_X; x++) {
            if (x >= 1 && positionStartY >= 1 && x <= 100 && positionStartY <= 100) {
                const mapData = vars.mapData[user.map][positionStartY][x];

                if (mapData.id) {
                    const areaTarget = resolveAreaTarget(user.map, x, positionStartY);

                    if (!areaTarget) {
                        continue;
                    }

                    if (areaTarget.isNpc) {
                        const npcArea = Array.isArray(vars.areaNpc[areaTarget.id]) ? vars.areaNpc[areaTarget.id] : [];

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

                        handleProtocol.sendNpc(areaTarget.target);
                        socket.send(ws);
                    } else if (canRenderCharacter(clientId, areaTarget.target as RuntimeCharacter)) {
                        handleProtocol.sendCharacter(areaTarget.target, clientId);
                        socket.send(ws);
                    }

                    if (!areaTarget.isNpc && canRenderCharacter(areaTarget.id, user)) {
                        handleProtocol.sendCharacter(user, areaTarget.id);
                        withTargetClient(areaTarget.id, (targetClient) => {
                            socket.send(targetClient);
                        });
                    }
                }

                const pos = {
                    x: x,
                    y: positionStartY,
                };

                if (game.hayObj(user.map, pos)) {
                    const item = game.objMap(user.map, pos);
                    const obj = vars.datObj[item.objIndex];

                    if (obj.objType == vars.objType.puerta) {
                        if (item.objIndex == obj.indexAbierta) {
                            handleProtocol.blockMap(user.map, pos, 0, ws);
                            handleProtocol.blockMap(
                                user.map,
                                {
                                    x: pos.x - 1,
                                    y: pos.y,
                                },
                                0,
                                ws,
                            );
                        }
                    }

                    handleProtocol.renderItem(item.objIndex, user.map, pos, ws);
                }
            }
        }

        positionStartX = user.pos.x - AREA_RANGE_X;
        positionStartY = user.pos.y - AREA_OUTSIDE_OFFSET_Y;

        for (let x = positionStartX; x < positionStartX + AREA_DIAMETER_X; x++) {
            if (x >= 1 && positionStartY >= 1 && x <= 100 && positionStartY <= 100) {
                const mapData = vars.mapData[user.map][positionStartY][x];

                if (mapData.id) {
                    const areaTarget = resolveAreaTarget(user.map, x, positionStartY);

                    if (!areaTarget) {
                        continue;
                    }

                    handleProtocol.deleteCharacter(areaTarget.id, ws);

                    if (!areaTarget.isNpc) {
                        withTargetClient(areaTarget.id, (targetClient) => {
                            handleProtocol.deleteCharacter(ws.id, targetClient);
                        });
                    } else if (areaTarget.target.movement == 3) {
                        const npcArea = vars.areaNpc[areaTarget.id] as Array<string | number> | undefined;
                        const index = npcArea?.indexOf(clientId) ?? -1;

                        if (npcArea && index > -1) {
                            npcArea.splice(index, 1);
                        }
                    }
                }

                const pos = {
                    x: x,
                    y: positionStartY,
                };

                if (game.hayObj(user.map, pos)) {
                    handleProtocol.deleteItem(user.map, pos, ws);
                }
            }
        }
    } else if (heading == vars.direcciones.up) {
        let positionStartX = user.pos.x - AREA_RANGE_X;
        let positionStartY = user.pos.y - AREA_RANGE_Y;

        for (let x = positionStartX; x < positionStartX + AREA_DIAMETER_X; x++) {
            if (x >= 1 && positionStartY >= 1 && x <= 100 && positionStartY <= 100) {
                const mapData = vars.mapData[user.map][positionStartY][x];

                if (mapData.id) {
                    const areaTarget = resolveAreaTarget(user.map, x, positionStartY);

                    if (!areaTarget) {
                        continue;
                    }

                    if (areaTarget.isNpc) {
                        const npcArea = Array.isArray(vars.areaNpc[areaTarget.id]) ? vars.areaNpc[areaTarget.id] : [];

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

                        handleProtocol.sendNpc(areaTarget.target);
                        socket.send(ws);
                    } else if (canRenderCharacter(clientId, areaTarget.target as RuntimeCharacter)) {
                        handleProtocol.sendCharacter(areaTarget.target, clientId);
                        socket.send(ws);
                    }

                    if (!areaTarget.isNpc && canRenderCharacter(areaTarget.id, user)) {
                        handleProtocol.sendCharacter(user, areaTarget.id);
                        withTargetClient(areaTarget.id, (targetClient) => {
                            socket.send(targetClient);
                        });
                    }
                }

                const pos = {
                    x: x,
                    y: positionStartY,
                };

                if (game.hayObj(user.map, pos)) {
                    const item = game.objMap(user.map, pos);
                    const obj = vars.datObj[item.objIndex];

                    if (obj.objType == vars.objType.puerta) {
                        if (item.objIndex == obj.indexAbierta) {
                            handleProtocol.blockMap(user.map, pos, 0, ws);
                            handleProtocol.blockMap(
                                user.map,
                                {
                                    x: pos.x - 1,
                                    y: pos.y,
                                },
                                0,
                                ws,
                            );
                        }
                    }

                    handleProtocol.renderItem(item.objIndex, user.map, pos, ws);
                }
            }
        }

        positionStartX = user.pos.x - AREA_RANGE_X;
        positionStartY = user.pos.y + AREA_OUTSIDE_OFFSET_Y;

        for (let x = positionStartX; x < positionStartX + AREA_DIAMETER_X; x++) {
            if (x >= 1 && positionStartY >= 1 && x <= 100 && positionStartY <= 100) {
                const mapData = vars.mapData[user.map][positionStartY][x];

                if (mapData.id) {
                    const areaTarget = resolveAreaTarget(user.map, x, positionStartY);

                    if (!areaTarget) {
                        continue;
                    }

                    handleProtocol.deleteCharacter(areaTarget.id, ws);

                    if (!areaTarget.isNpc) {
                        withTargetClient(areaTarget.id, (targetClient) => {
                            handleProtocol.deleteCharacter(ws.id, targetClient);
                        });
                    } else if (areaTarget.target.movement == 3) {
                        const npcArea = vars.areaNpc[areaTarget.id] as Array<string | number> | undefined;
                        const index = npcArea?.indexOf(clientId) ?? -1;

                        if (npcArea && index > -1) {
                            npcArea.splice(index, 1);
                        }
                    }
                }

                const pos = {
                    x: x,
                    y: positionStartY,
                };

                if (game.hayObj(user.map, pos)) {
                    handleProtocol.deleteItem(user.map, pos, ws);
                }
            }
        }
    }
}

function processUserMovement(ws: RuntimeClient, heading: number, moveId: number, now = Date.now()) {
    const user = getCharacterById(ws.id!) as any;

    if (!user) {
        return;
    }

    user.lastProcessedMoveId = moveId;
    user.heading = heading;

    if (user.paralizado) {
        sendOwnPositionUpdate(ws, user);
        return;
    }

    if (user.inmovilizado) {
        sendOwnPositionUpdate(ws, user);
        return;
    }

    stopMeditation(ws, user);

    const oldX = user.pos.x;
    const oldY = user.pos.y;

    let newX = 0;
    let newY = 0;

    if (heading == vars.direcciones.right) {
        newX = 1;
    } else if (heading == vars.direcciones.left) {
        newX = -1;
    } else if (heading == vars.direcciones.down) {
        newY = 1;
    } else if (heading == vars.direcciones.up) {
        newY = -1;
    }

    let posX = oldX + newX;
    let posY = oldY + newY;
    const phasedDestination = resolveDeadWorldMovementDestination(user, posX, posY, heading);
    posX = phasedDestination.x;
    posY = phasedDestination.y;
    const ghostMove = resolveGhostDisplacement(user, posX, posY, heading);
    const canReachTargetPosition = game.legalPos(posX, posY, user.map, Boolean(user.navegando), ghostMove?.ghost.id);
    const deniedPortalMessage = game.getFactionPortalDeniedMessage(user, user.map, posX, posY);

    if (user.navegando && !game.legalPos(user.pos.x, user.pos.y, user.map, true, ws.id)) {
        if (!canReachTargetPosition) {
            const fallbackPos = game.getFreeSpace(
                ws,
                user.map,
                user.pos.x,
                user.pos.y,
                "protocol.writeWalk.bufferedFallback",
            );

            if (fallbackPos) {
                game.telep(ws, user.map, fallbackPos.x, fallbackPos.y, "protocol.writeWalk.bufferedFallback");
            } else {
                sendOwnPositionUpdate(ws, user);
            }

            return;
        }
    }

    if (deniedPortalMessage) {
        handleProtocol.console(deniedPortalMessage, "white", 0, 0, ws);
        sendOwnPositionUpdate(ws, user);
        return;
    }

    if (!canReachTargetPosition) {
        sendOwnPositionUpdate(ws, user);
        return;
    }

    const tileExit = vars.mapa[user.map]?.[posY]?.[posX]?.tileExit;
    const tileExitDestination = game.resolveTileExitDestination(
        ws,
        tileExit,
        `protocol.writeWalk.tileExit ${user.map}@${posX},${posY}`,
        { mapId: user.map, x: posX, y: posY },
    );

    if (tileExitDestination) {
        const mapChangeDeniedMessage = game.getPvpMapChangeDeniedMessage(user, now);

        if (mapChangeDeniedMessage) {
            handleProtocol.console(mapChangeDeniedMessage, "white", 0, 0, ws);
            sendOwnPositionUpdate(ws, user);
            return;
        }

        cancelPendingReviveCast(ws, user);
        npcs.deleteUserToAllNpcs(ws.id);
        game.telep(
            ws,
            tileExitDestination.map,
            tileExitDestination.x,
            tileExitDestination.y,
            `protocol.writeWalk.tileExit ${user.map}@${posX},${posY}`,
        );
        return;
    }

    cancelPendingReviveCast(ws, user, "Se canceló el resucitar al moverte.");

    vars.mapData[user.map][oldY][oldX].id = 0;
    vars.mapData[user.map][posY][posX].id = ws.id;

    user.pos.x = posX;
    user.pos.y = posY;
    user.nextWalkAt = now + vars.timing.walkStepMs;
    user.stateVersion = Number(user.stateVersion ?? 0) + 1;
    user.lastMovementActivityAt = now;

    if (ghostMove) {
        applyGhostDisplacement(ghostMove, now);
    }

    cancelPendingLogout(user, ws, LOGOUT_CANCELLED_MESSAGE);

    syncSafeZoneState(ws, user);

    fishing.cancelFishing(ws.id, "La pesca se canceló al moverte.");
    harvesting.cancelHarvesting(ws.id, "La recolección se canceló al moverte.");
    smelting.cancelSmelting(ws.id, "La fundición se canceló al moverte.");
    crafting.cancelPendingTarget(ws.id);
    if (!canKeepHiddenSkillWhileActing(user)) {
        stopHiddenSkill(ws, user);
    }

    game.loopArea(ws, function (target: AreaTarget) {
        if (!target.isNpc && target.id != ws.id && canRenderCharacter(target.id, user)) {
            withTargetClient(target.id, (targetClient) => {
                handleProtocol.moveEntity(ws.id, user.pos, user.heading, targetClient);
            });
        }
    });

    sendOwnPositionUpdate(ws, user);
    game.syncPartyStateForMember(ws.id);
    game.syncClanStateForMember(ws.id);
    updateUserAreaAfterMovement(ws, user, heading);
    syncPendingReviveCastVisibilityForUser(ws.id!);
    schedulePendingMovement(ws.id!);
}

function buyItem(ws: RuntimeClient) {
    try {
        if (!game.existPjOrClose(ws)) {
            return;
        }

        if (isActionRateLimited(ws, "nextBuyItemAt", vars.timing.actionCooldowns.clickMs)) {
            return;
        }

        if (!pkg.canReadBytes(3)) {
            return;
        }

        const idPos = pkg.getByte();
        const cant = pkg.getShort();

        void game.buyItem(ws.id, idPos, cant).catch((err: unknown) => {
            funct.dumpError(err);
        });
    } catch (err) {
        funct.dumpError(err);
    }
}

function changeSeguro(ws: RuntimeClient) {
    if (!game.existPjOrClose(ws)) {
        return;
    }

    const user = getCharacterById(ws.id!) as any;

    if (!user) {
        return;
    }

    const isDisablingSeguro = Boolean(user.seguroActivado);

    if (isDisablingSeguro && user.clanId && user.clanAlignment === "citizen" && !user.criminal) {
        handleProtocol.console(
            "No puedes desactivar el seguro perteneciendo a un clan de ciudadanos.",
            "white",
            0,
            0,
            ws,
        );
        syncOwnCharacterState(ws, user);
        return;
    }

    user.seguroActivado = !user.seguroActivado;
    syncOwnCharacterState(ws, user);
}

function changeClanSeguro(ws: RuntimeClient) {
    if (!game.existPjOrClose(ws)) {
        return;
    }

    const user = getCharacterById(ws.id!) as any;

    if (!user) {
        return;
    }

    if (!user.clanId) {
        user.seguroClanActivado = false;
        syncOwnCharacterState(ws, user);
        return;
    }

    if (user.seguroClanActivado && user.clanAlignment === "citizen") {
        handleProtocol.console(
            "No puedes desactivar el seguro del clan perteneciendo a un clan de ciudadanos.",
            "white",
            0,
            0,
            ws,
        );
        syncOwnCharacterState(ws, user);
        return;
    }

    user.seguroClanActivado = !user.seguroClanActivado;
    syncOwnCharacterState(ws, user);
}

function sellItem(ws: RuntimeClient) {
    try {
        if (!game.existPjOrClose(ws)) {
            return;
        }

        if (isActionRateLimited(ws, "nextSellItemAt", vars.timing.actionCooldowns.clickMs)) {
            return;
        }

        if (!pkg.canReadBytes(3)) {
            return;
        }

        const idPos = pkg.getByte();
        const cant = pkg.getShort();

        void game.sellItem(ws.id, idPos, cant).catch((err: unknown) => {
            funct.dumpError(err);
        });
    } catch (err) {
        funct.dumpError(err);
    }
}

function resyncPosition(ws: RuntimeClient) {
    try {
        if (!game.existPjOrClose(ws)) {
            return;
        }

        const user = getCharacterById(ws.id!) as any;

        if (!user) {
            return;
        }
        const now = Date.now();

        if ((user.nextResyncPositionAt ?? 0) > now) {
            return;
        }

        user.nextResyncPositionAt = now + 5_000;

        sendOwnPositionUpdate(ws, user);
    } catch (err) {
        funct.dumpError(err);
    }
}

function changeHeading(ws: RuntimeClient) {
    try {
        if (!game.existPjOrClose(ws)) {
            return;
        }

        const clientId = ws.id!;
        const user = getCharacterById(clientId) as any;

        if (!user) {
            return;
        }

        if (!pkg.canReadBytes(1)) {
            return;
        }

        const heading = pkg.getByte();

        if (heading < 1 || heading > 4) {
            return;
        }

        user.heading = heading;

        game.loopArea(ws, function (this: unknown, target: RuntimeCharacter | RuntimeNpc) {
            if (!target.isNpc && target.id != clientId && canRenderCharacter(target.id, user)) {
                withTargetClient(target.id, (targetClient) => {
                    if (!canReceiveCharacterEvent(target.id, clientId)) {
                        return;
                    }

                    handleProtocol.changeHeading(clientId, heading, targetClient);
                });
            }
        });
    } catch (err) {
        funct.dumpError(err);
    }
}

function eventClick(ws: RuntimeClient) {
    try {
        const clientId = ws.id!;

        if (!pkg.canReadBytes(2)) {
            return;
        }

        const x = pkg.getByte();
        const y = pkg.getByte();
        const mouseButton = pkg.canReadBytes(1) ? pkg.getByte() : 0;

        if (x < 1 || x > 100) {
            return;
        }

        if (y < 1 || y > 100) {
            return;
        }

        const user = getCharacterById(clientId) as any;

        if (!user) {
            return;
        }

        if (mouseButton === 2 && user.privileges === 1) {
            game.telep(ws, user.map, x, y, `protocol.clickMap.admin ${user.map}@${x},${y}`);
            return;
        }

        if (isActionRateLimited(ws, "nextMapClickAt", vars.timing.actionCooldowns.clickMs)) {
            return;
        }

        if (fishing.handleMapClick(ws, x, y)) {
            return;
        }

        if (harvesting.handleMapClick(ws, x, y)) {
            return;
        }

        if (smelting.handleMapClick(ws, x, y)) {
            return;
        }

        if (crafting.handleMapClick(ws, x, y)) {
            return;
        }

        const pos = {
            x: x,
            y: y,
        };

        let objMap: MapObjectInfo | null = null,
            obj: DataObject | null = null;

        if (game.hayObj(user.map, pos)) {
            objMap = game.objMap(user.map, pos) as MapObjectInfo;
            obj = vars.datObj[objMap.objIndex] as DataObject;

            if (obj.objType == vars.objType.puerta) {
                game.openDoor(clientId, pos, objMap, obj);
            }

            handleProtocol.console(obj.name + " - " + objMap.amount, "white", 1, 0, ws);
        } else if (
            game.hayObj(user.map, {
                x: pos.x + 1,
                y: pos.y,
            })
        ) {
            objMap = game.objMap(user.map, {
                x: pos.x + 1,
                y: pos.y,
            }) as MapObjectInfo;

            obj = vars.datObj[objMap.objIndex] as DataObject;

            if (obj.objType == vars.objType.puerta) {
                game.openDoor(
                    ws.id,
                    {
                        x: pos.x + 1,
                        y: pos.y,
                    },
                    objMap,
                    obj,
                );
            }

            handleProtocol.console(obj.name + " - " + objMap.amount, "white", 1, 0, ws);
        } else if (
            game.hayObj(user.map, {
                x: pos.x + 1,
                y: pos.y + 1,
            })
        ) {
            objMap = game.objMap(user.map, {
                x: pos.x + 1,
                y: pos.y + 1,
            }) as MapObjectInfo;
            obj = vars.datObj[objMap.objIndex] as DataObject;

            if (obj.objType == vars.objType.puerta) {
                game.openDoor(
                    ws.id,
                    {
                        x: pos.x + 1,
                        y: pos.y + 1,
                    },
                    objMap,
                    obj,
                );
            }

            handleProtocol.console(obj.name + " - " + objMap.amount, "white", 1, 0, ws);
        } else if (
            game.hayObj(user.map, {
                x: pos.x,
                y: pos.y + 1,
            })
        ) {
            objMap = game.objMap(user.map, {
                x: pos.x,
                y: pos.y + 1,
            }) as MapObjectInfo;
            obj = vars.datObj[objMap.objIndex] as DataObject;

            if (obj.objType == vars.objType.puerta) {
                game.openDoor(
                    ws.id,
                    {
                        x: pos.x,
                        y: pos.y + 1,
                    },
                    objMap,
                    obj,
                );
            }

            handleProtocol.console(obj.name + " - " + objMap.amount, "white", 1, 0, ws);
        }

        let selectedTarget = resolveAreaTarget(user.map, x, y);

        if (!selectedTarget && y < 100) {
            selectedTarget = resolveAreaTarget(user.map, x, y + 1);
        }

        if (selectedTarget) {
            const pjSelected = selectedTarget.target;
            const selectedId = selectedTarget.id;
            const selectedNpc = selectedTarget.isNpc ? (pjSelected as RuntimeNpc) : undefined;
            const selectedCharacter = !selectedTarget.isNpc ? (pjSelected as RuntimeCharacter) : undefined;

            if (selectedCharacter && isInvisibleAdmin(selectedCharacter) && selectedCharacter.id !== clientId) {
                return;
            }

            if (selectedCharacter && user.deadWorldActive && !selectedCharacter.dead) {
                return;
            }

            if (selectedNpc?.desc) {
                handleProtocol.dialog(selectedId, selectedNpc.desc, "", "white", 0, ws);
            }

            if (
                selectedNpc &&
                (selectedNpc.npcType === vars.npcType.sacerdote || selectedNpc.npcType === vars.npcType.sacerdoteNewbie)
            ) {
                if (user.dead) {
                    game.revivirUsuario(ws.id);
                } else {
                    if (user.hp < user.maxHp) {
                        user.hp = user.maxHp;

                        handleProtocol.updateHP(user.hp, ws);
                    }
                }
            }

            if (selectedNpc && selectedNpc.npcType === vars.npcType.comerciante && !user.dead) {
                game.closeTradeSession(ws.id);
                user.npcTrade = selectedId;
                user.tradeMode = "merchant";

                const npcTmp = vars.npcs[selectedId];

                if (isOriginalNpcInteractionOutOfRange(user, npcTmp, 3)) {
                    handleProtocol.console("Te encuentras muy lejos para comerciar.", "white", 1, 0, ws);
                    return;
                }

                handleProtocol.openTrade(ws.id, selectedId, ws);
            }

            if (selectedNpc && selectedNpc.npcType === vars.npcType.banquero && !user.dead) {
                const npcTmp = vars.npcs[selectedId];

                if (isOriginalNpcInteractionOutOfRange(user, npcTmp, 6)) {
                    handleProtocol.console("Te encuentras muy lejos para operar con el banco.", "white", 1, 0, ws);
                    return;
                }

                void game.openBankTrade(ws.id, selectedId, "character").catch((err: unknown) => {
                    funct.dumpError(err);
                });
            }

            if (selectedNpc && selectedNpc.npcType === vars.npcType.subastador && !user.dead) {
                const npcTmp = vars.npcs[selectedId];

                if (!isMarketEnabled()) {
                    handleProtocol.console("Las subastas se encuentran deshabilitadas.", "white", 1, 0, ws);
                    return;
                }

                if (isOriginalNpcInteractionOutOfRange(user, npcTmp, 6)) {
                    handleProtocol.console("Te encuentras muy lejos para operar con el mercado.", "white", 1, 0, ws);
                    return;
                }

                void game.openMarketTrade(ws.id, selectedId).catch((err: unknown) => {
                    funct.dumpError(err);
                });
            }

            let msg = "";

            if (selectedCharacter && (selectedCharacter.privileges == 1 || selectedCharacter.privileges == 2)) {
                const selectedCharacterDisplayName = `${selectedCharacter.nameCharacter}${selectedCharacter.clan ? ` ${selectedCharacter.clan}` : ""}`;
                const idClase = selectedCharacter.idClase ?? 0;
                let staffMsg =
                    "Ves a " +
                    selectedCharacterDisplayName +
                    getNewbieLabel(selectedCharacter) +
                    " - " +
                    vars.nameClases[idClase] +
                    ", nivel " +
                    selectedCharacter.level;

                const faction = normalizeFaction(selectedCharacter.faction);

                if (faction !== "none") {
                    const factionScore =
                        faction === "armada"
                            ? Number(selectedCharacter.factionScoreArmada ?? 0)
                            : Number(selectedCharacter.factionScoreCaos ?? 0);
                    const factionRank = getMaxEligibleFactionRank(
                        faction,
                        Number(selectedCharacter.level ?? 0),
                        factionScore,
                    );
                    const factionRankTitle = getFactionRankTitle(faction, factionRank) ?? "Sin rango";

                    staffMsg += ` - ${getFactionDisplayName(faction)} [${factionRankTitle}]`;
                } else if (selectedCharacter.criminal) {
                    staffMsg += " - Criminal";
                } else {
                    staffMsg += " - Ciudadano";
                }

                handleProtocol.console(staffMsg, "#419900", 1, 0, ws);
                showCosmeticInspection(selectedCharacter,user,ws);
            } else {
                if (selectedNpc) {
                    msg = "Ves a " + selectedNpc.nameCharacter + " [NPC]";

                    if (selectedNpc.summonedByUserId) {
                        const summonOwner = vars.personajes[selectedNpc.summonedByUserId] as
                            | RuntimeCharacter
                            | undefined;

                        if (summonOwner?.nameCharacter) {
                            msg += ` [Invocación de ${summonOwner.nameCharacter}]`;
                        }
                    }

                    if ((selectedNpc.maxHp ?? 0) > 0) {
                        msg += " [Vida: " + selectedNpc.hp + "/" + selectedNpc.maxHp + "]";
                    }

                    if (selectedNpc.paralizado) {
                        msg += " [Paralizado]";
                    }

                    if (selectedNpc.inmovilizado) {
                        msg += " [Inmovilizado]";
                    }

                    if (user.privileges == 1) {
                        const now = Date.now();
                        const targetId = selectedNpc.currentTargetId ?? 0;
                        const target = (targetId ? getCharacterById(targetId) : undefined) as any;
                        const targetName = target?.nameCharacter ?? "ninguno";
                        const lastAggressorId = selectedNpc.lastAggressorId ?? 0;
                        const lastAggressor = lastAggressorId ? vars.personajes[lastAggressorId] : undefined;
                        const lastAggressorName = lastAggressor?.nameCharacter ?? "ninguno";
                        const aggressorMemoryMs = vars.npcAi.lastAggressorMemoryMs as number;
                        const lastAggressedAt = selectedNpc.lastAggressedAt ?? 0;
                        const aggressorMemoryRemainingMs = Math.max(0, lastAggressedAt + aggressorMemoryMs - now);
                        const hasRecentAggro = aggressorMemoryRemainingMs > 0 && Boolean(lastAggressorId);
                        const targetLockedUntil = selectedNpc.currentTargetLockedUntil ?? 0;
                        const targetLockRemainingMs = Math.max(0, targetLockedUntil - now);
                        let targetPressure = 0;

                        if (targetId) {
                            for (const npcId in vars.npcs) {
                                const npc = vars.npcs[npcId];

                                if (npc?.currentTargetId === targetId) {
                                    targetPressure++;
                                }
                            }
                        }

                        msg +=
                            ` [Target: ${targetName}${targetId ? ` (${targetId})` : ""}]` +
                            ` [Lock: ${targetLockRemainingMs > 0 ? `${targetLockRemainingMs}ms` : "no"}]` +
                            ` [Agresor: ${lastAggressorName}${lastAggressorId ? ` (${lastAggressorId})` : ""}]` +
                            ` [Aggro reciente: ${hasRecentAggro ? "si" : "no"}]` +
                            ` [Memoria aggro: ${aggressorMemoryRemainingMs}ms]` +
                            ` [Presion: ${targetPressure}]`;
                    }

                    handleProtocol.console(msg, "#FFA500", 1, 0, ws);
                } else if (selectedCharacter) {
                    const selectedCharacterDisplayName = `${selectedCharacter.nameCharacter}${selectedCharacter.clan ? ` ${selectedCharacter.clan}` : ""}`;
                    const idClase = selectedCharacter.idClase ?? 0;
                    const statsCharacter = selectedCharacter as RuntimeCharacter & {
                        spellsAcertados?: number;
                        spellsErrados?: number;
                    };
                    const spellsAcertados = statsCharacter.spellsAcertados ?? 0;
                    const spellsErrados = statsCharacter.spellsErrados ?? 0;
                    const totalSpells = spellsAcertados + spellsErrados;
                    const accuracyPercentage = totalSpells > 0 ? (spellsAcertados * 100) / totalSpells : 0;
                    const accuracyLabel = Number.isFinite(accuracyPercentage)
                        ? accuracyPercentage.toFixed(2).replace(/\.00$/, "")
                        : "0";

                    msg =
                        "Ves a " +
                        selectedCharacterDisplayName +
                        getNewbieLabel(selectedCharacter) +
                        " - " +
                        vars.nameClases[idClase] +
                        ", nivel " +
                        selectedCharacter.level;

                    const faction = normalizeFaction(selectedCharacter.faction);
                    const factionScore =
                        faction === "armada"
                            ? Number(selectedCharacter.factionScoreArmada ?? 0)
                            : faction === "caos"
                              ? Number(selectedCharacter.factionScoreCaos ?? 0)
                              : 0;
                    const factionRank = getMaxEligibleFactionRank(
                        faction,
                        Number(selectedCharacter.level ?? 0),
                        factionScore,
                    );
                    const factionRankTitle = getFactionRankTitle(faction, factionRank) ?? "Sin rango";
                    let color = getFactionColor(faction) ?? "#3333ff";

                    if (faction !== "none") {
                        msg += ` - ${getFactionDisplayName(faction)} [${factionRankTitle}]`;
                    } else if (selectedCharacter.criminal) {
                        msg += " - Criminal";
                        color = "red";
                    } else {
                        msg += " - Ciudadano";
                    }

                    if (user.privileges == 1) {
                        msg +=
                            " - [Aciertos: " +
                            spellsAcertados +
                            " | Errados: " +
                            spellsErrados +
                            " | Porcentaje de aciertos: " +
                            accuracyLabel +
                            "%]";
                    }

                    handleProtocol.console(msg, color, 1, 0, ws);
                    showCosmeticInspection(selectedCharacter,user,ws);
                }
            }
        }
    } catch (err) {
        funct.dumpError(err);
    }
}

function useItemClick(ws: RuntimeClient) {
    try {
        if (!pkg.canReadBytes(4)) {
            return;
        }

        const idPos = pkg.getInt();

        game.useItem(ws, idPos);
    } catch (err) {
        funct.dumpError(err);
    }
}

function useItemU(ws: RuntimeClient) {
    try {
        if (!pkg.canReadBytes(4)) {
            return;
        }

        const idPos = pkg.getInt();

        game.useItem(ws, idPos);
    } catch (err) {
        funct.dumpError(err);
    }
}

function craftItem(ws: RuntimeClient) {
    try {
        if (!pkg.canReadBytes(7)) {
            return;
        }

        const professionId = pkg.getByte();
        const profession = professionId === 1 ? "blacksmith" : professionId === 2 ? "tailoring" : "carpentry";
        const itemId = pkg.getInt();
        const amount = pkg.getShort();

        void crafting.handleCraftRequest(ws, profession, itemId, amount).catch((err: unknown) => {
            funct.dumpError(err);
        });
    } catch (err) {
        funct.dumpError(err);
    }
}

function agarrarItem(ws: RuntimeClient) {
    try {
        void game.agarrarItem(ws).catch((err: unknown) => {
            funct.dumpError(err);
        });
    } catch (err) {
        funct.dumpError(err);
    }
}

function tirarItem(ws: RuntimeClient) {
    try {
        if (isActionRateLimited(ws, "nextDropItemAt", vars.timing.actionCooldowns.dropItemMs)) {
            return;
        }

        if (!pkg.canReadBytes(6)) {
            return;
        }

        const idPos = pkg.getInt();
        const cant = pkg.getShort();

        void game.tirarItem(ws, idPos, cant).catch((err: unknown) => {
            funct.dumpError(err);
        });
    } catch (err) {
        funct.dumpError(err);
    }
}

function equiparItem(ws: RuntimeClient) {
    try {
        if (!game.existPjOrClose(ws)) {
            return;
        }

        if (isActionRateLimited(ws, "nextEquipToggleAt", vars.timing.actionCooldowns.equipToggleMs)) {
            return;
        }

        const clientId = ws.id!;

        const syncInventorySlots = (
            user: RuntimeCharacter & { inv: InventoryRecord },
            slots: Array<number | string>,
        ) => {
            const sentSlots = new Set<string>();

            for (const slot of slots) {
                if (!slot && slot !== 0) {
                    continue;
                }

                const normalizedSlot = String(slot);
                if (normalizedSlot === "0" || sentSlots.has(normalizedSlot) || !user.inv[normalizedSlot]) {
                    continue;
                }

                sentSlots.add(normalizedSlot);
                handleProtocol.agregarUserInvItem(clientId, normalizedSlot, ws);
            }
        };

        if (!pkg.canReadBytes(4)) {
            return;
        }

        const idPos = pkg.getInt();

        const user = getCharacterById(clientId) as any;

        if (!user) {
            return;
        }

        if (user.dead) {
            handleProtocol.console("Los muertos no pueden equipar items.", "white", 0, 0, ws);
            return;
        }

        if (user.meditar) {
            handleProtocol.console("Debes dejar de meditar para realizar esta acción.", "white", 0, 0, ws);
            return;
        }

        if (user.pendingReviveCast) {
            handleProtocol.console("Ya estás casteando resucitar.", "white", 0, 0, ws);
            return;
        }

        const itemInventary = user.inv[idPos];

        if (itemInventary) {
            const idItem = itemInventary.idItem;
            const item = vars.datObj[idItem];

            if (item.newbie && !game.isNewbieCharacter(user)) {
                handleProtocol.console("Solo los personajes newbie pueden equipar este item.", "white", 0, 0, ws);
                return;
            }

            if (item.clasesNoPermitidas.indexOf(user.idClase) >= 0 && !ignoresClassRestrictionForItem(idItem)) {
                handleProtocol.console("Tu clase no puede equipar ese item.", "white", 0, 0, ws);
                return;
            }

            if (!game.canUseFactionItem(ws.id!, idItem)) {
                handleProtocol.console("Tu faccion no puede equipar ese item.", "white", 0, 0, ws);
                return;
            }

            if (
                (item.razaEnana && !game.isRazaEnana(user.idRaza) && item.objType == vars.objType.armaduras) ||
                (!item.razaEnana && game.isRazaEnana(user.idRaza) && item.objType == vars.objType.armaduras)
            ) {
                handleProtocol.console("Tu raza no puede equipar ese item.", "white", 0, 0, ws);
                return;
            }

            switch (item.objType) {
                case vars.objType.armaduras: //Ropa
                    const previousBodySlot = user.idItemBody;

                    if (itemInventary.equipped) {
                        const bodyNaked = game.bodyNaked(ws.id);
                        if (user.navegando) {
                            user.idLastBody = bodyNaked;
                        } else {
                            user.idBody = bodyNaked;
                        }
                        if (user.idItemBody && user.inv[user.idItemBody]) {
                            user.inv[user.idItemBody].equipped = 0;
                        }
                        user.idItemBody = 0;
                    } else {
                        if (user.navegando) {
                            user.idLastBody = item.anim;
                        } else {
                            user.idBody = item.anim;
                        }
                        if (user.idItemBody && user.inv[user.idItemBody]) {
                            user.inv[user.idItemBody].equipped = 0;
                        }
                        user.idItemBody = idPos;
                        itemInventary.equipped = 1;
                    }

                    if (user.navegando) {
                        syncInventorySlots(user, [previousBodySlot, idPos]);
                    } else {
                        game.loopArea(ws, function (target: AreaTarget) {
                            if (!target.isNpc) {
                                withTargetClient(target.id, (targetClient) => {
                                    if (!canReceiveCharacterEvent(target.id, ws.id)) {
                                        return;
                                    }

                                    handleProtocol.changeRopa(ws.id, user.idBody, user.idItemBody, targetClient);
                                });
                            }
                        });
                    }
                    break;

                case vars.objType.armas: //Arma
                    const previousWeaponSlot = user.idItemWeapon;
                    const previousWeaponItemId =
                        user.idItemWeapon && user.inv[user.idItemWeapon] ? user.inv[user.idItemWeapon].idItem : 0;

                    if (itemInventary.equipped) {
                        if (user.navegando) {
                            user.idLastWeapon = 0;
                        } else {
                            user.idWeapon = 0;
                        }
                        if (user.idItemWeapon && user.inv[user.idItemWeapon]) {
                            user.inv[user.idItemWeapon].equipped = 0;
                        }
                        user.idItemWeapon = 0;
                    } else {
                        if (user.navegando) {
                            user.idLastWeapon = item.anim;
                        } else {
                            user.idWeapon = item.anim;
                        }
                        if (user.idItemWeapon && user.inv[user.idItemWeapon]) {
                            user.inv[user.idItemWeapon].equipped = 0;
                        }
                        user.idItemWeapon = idPos;
                        itemInventary.equipped = 1;
                    }

                    if (user.navegando) {
                        syncInventorySlots(user, [previousWeaponSlot, idPos]);
                    } else {
                        game.loopArea(ws, function (target: AreaTarget) {
                            if (!target.isNpc) {
                                withTargetClient(target.id, (targetClient) => {
                                    if (!canReceiveCharacterEvent(target.id, ws.id)) {
                                        return;
                                    }

                                    handleProtocol.changeWeapon(ws.id, user.idWeapon, idPos, targetClient);
                                    handleProtocol.playSound(ws.id, vars.arSounds.SND_SACARARMA, targetClient);
                                });
                            }
                        });
                    }

                    if (fishing.isFishingRod(previousWeaponItemId) || fishing.isFishingRod(idItem)) {
                        fishing.cancelFishing(clientId, "La pesca se canceló porque cambiaste tu arma equipada.");
                    }

                    if (harvesting.usesHarvestingTool(previousWeaponItemId) || harvesting.usesHarvestingTool(idItem)) {
                        harvesting.cancelHarvesting(
                            clientId,
                            "La recolección se canceló porque cambiaste tu arma equipada.",
                        );
                    }
                    break;

                case vars.objType.anillos: //Anillo / accesorio
                    const previousRingSlot = user.idItemRing;

                    if (itemInventary.equipped) {
                        if (user.idItemRing && user.inv[user.idItemRing]) {
                            user.inv[user.idItemRing].equipped = 0;
                        }
                        user.idItemRing = 0;
                    } else {
                        if (user.idItemRing && user.inv[user.idItemRing]) {
                            user.inv[user.idItemRing].equipped = 0;
                        }
                        user.idItemRing = idPos;
                        itemInventary.equipped = 1;
                    }

                    syncInventorySlots(user, [previousRingSlot, idPos]);
                    break;

                case vars.objType.flechas: //Flechas
                    if (itemInventary.equipped) {
                        if (user.idItemArrow && user.inv[user.idItemArrow]) {
                            user.inv[user.idItemArrow].equipped = 0;
                        }
                        user.idItemArrow = 0;
                    } else {
                        if (user.idItemArrow && user.inv[user.idItemArrow]) {
                            user.inv[user.idItemArrow].equipped = 0;
                        }
                        user.idItemArrow = idPos;
                        itemInventary.equipped = 1;
                    }

                    game.loopArea(ws, function (target: AreaTarget) {
                        if (!target.isNpc) {
                            withTargetClient(target.id, (targetClient) => {
                                if (!canReceiveCharacterEvent(target.id, ws.id)) {
                                    return;
                                }

                                handleProtocol.changeArrow(ws.id, user.idItemArrow, targetClient);
                            });
                        }
                    });
                    break;

                case vars.objType.escudos: //Escudo
                    if (!itemInventary.equipped && Number(user.challengeShieldBlockedForRound ?? 0) > 0) {
                        handleProtocol.console(
                            "[Retos] No puedes volver a equipar el escudo hasta la próxima ronda.",
                            "white",
                            0,
                            0,
                            ws,
                        );
                        return;
                    }

                    const previousShieldSlot = user.idItemShield;

                    if (itemInventary.equipped) {
                        if (user.navegando) {
                            user.idLastShield = 0;
                        } else {
                            user.idShield = 0;
                        }
                        if (user.idItemShield && user.inv[user.idItemShield]) {
                            user.inv[user.idItemShield].equipped = 0;
                        }
                        user.idItemShield = 0;
                    } else {
                        if (user.navegando) {
                            user.idLastShield = item.anim;
                        } else {
                            user.idShield = item.anim;
                        }
                        if (user.idItemShield && user.inv[user.idItemShield]) {
                            user.inv[user.idItemShield].equipped = 0;
                        }
                        user.idItemShield = idPos;
                        itemInventary.equipped = 1;
                    }

                    if (user.navegando) {
                        syncInventorySlots(user, [previousShieldSlot, idPos]);
                    } else {
                        game.loopArea(ws, function (target: AreaTarget) {
                            if (!target.isNpc) {
                                withTargetClient(target.id, (targetClient) => {
                                    if (!canReceiveCharacterEvent(target.id, ws.id)) {
                                        return;
                                    }

                                    handleProtocol.changeShield(ws.id, user.idShield, idPos, targetClient);
                                });
                            }
                        });
                    }
                    break;

                case vars.objType.cascos: //Casco
                    const previousHelmetSlot = user.idItemHelmet;

                    if (itemInventary.equipped) {
                        if (user.navegando) {
                            user.idLastHelmet = 0;
                        } else {
                            user.idHelmet = 0;
                        }
                        if (user.idItemHelmet && user.inv[user.idItemHelmet]) {
                            user.inv[user.idItemHelmet].equipped = 0;
                        }
                        user.idItemHelmet = 0;
                    } else {
                        if (user.navegando) {
                            user.idLastHelmet = item.anim;
                        } else {
                            user.idHelmet = item.anim;
                        }
                        if (user.idItemHelmet && user.inv[user.idItemHelmet]) {
                            user.inv[user.idItemHelmet].equipped = 0;
                        }
                        user.idItemHelmet = idPos;
                        itemInventary.equipped = 1;
                    }

                    if (user.navegando) {
                        syncInventorySlots(user, [previousHelmetSlot, idPos]);
                    } else {
                        game.loopArea(ws, function (target: AreaTarget) {
                            if (!target.isNpc) {
                                withTargetClient(target.id, (targetClient) => {
                                    if (!canReceiveCharacterEvent(target.id, ws.id)) {
                                        return;
                                    }

                                    handleProtocol.changeHelmet(ws.id, user.idHelmet, idPos, targetClient);
                                });
                            }
                        });
                    }
                    break;
            }
        }
    } catch (err) {
        funct.dumpError(err);
    }
}

function connectCharacter(ws: RuntimeClient) {
    try {
        // const nameAccount = pkg.getString().trim();
        // const password = pkg.getString().trim();
        // const nameCharacter = pkg.getString().trim();
        // const typeGame = pkg.getByte();
        // const idChar = pkg.getByte();

        if (!pkg.canReadBytes(2)) {
            return;
        }

        const ticket = pkg.getString().trim();

        if (!pkg.canReadBytes(2)) {
            return;
        }

        const typeGame = pkg.getByte();
        const idChar = pkg.getByte();

        login.connect(ws, ticket, typeGame, idChar);
    } catch (err) {
        funct.dumpError(err);
    }
}

function position(ws: RuntimeClient) {
    try {
        if (!game.existPjOrClose(ws)) {
            return;
        }

        const clientId = ws.id!;
        const user = getCharacterById(clientId) as any;

        if (!user) {
            return;
        }

        if (user.walk.pasos >= 30) {
            user.walk.pasos = 0;
            user.walk.startTimer = +Date.now();
        }

        user.walk.pasos++;

        if (!pkg.canReadBytes(5)) {
            return;
        }

        const heading = pkg.getByte();
        const moveId = pkg.getInt();
        const now = Date.now();

        if (heading < 1 || heading > 5) {
            return;
        }

        if (!Array.isArray(user.pendingMoveQueue)) {
            user.pendingMoveQueue = [];
        }

        if ((user.ignoreMovementUntil ?? 0) > now) {
            while (user.pendingMoveQueue.length >= MAX_PENDING_MOVE_QUEUE_LENGTH) {
                user.pendingMoveQueue.shift();
            }

            user.pendingMoveQueue.push({ heading, moveId });
            user.nextWalkAt = Math.max(Number(user.nextWalkAt ?? 0), Number(user.ignoreMovementUntil ?? 0));
            schedulePendingMovement(clientId);
            return;
        }

        user.ignoreMovementUntil = 0;

        user.heading = heading;

        if (user.paralizado) {
            broadcastHeadingChange(ws, heading);
            user.lastProcessedMoveId = moveId;
            sendOwnPositionUpdate(ws, user);
            return;
        }

        if (user.inmovilizado) {
            broadcastHeadingChange(ws, heading);
            user.lastProcessedMoveId = moveId;
            sendOwnPositionUpdate(ws, user);
            return;
        }

        while (user.pendingMoveQueue.length >= MAX_PENDING_MOVE_QUEUE_LENGTH) {
            user.pendingMoveQueue.shift();
        }

        user.pendingMoveQueue.push({ heading, moveId });
        drainPendingMovement(clientId, now);
    } catch (err) {
        funct.dumpError(err);
    }
}

function dialog(ws: RuntimeClient) {
    try {
        if (!game.existPjOrClose(ws)) {
            return;
        }

        const clientId = ws.id!;
        const user = getCharacterById(clientId) as any;

        if (!user) {
            return;
        }
        const now = Date.now();

        if ((user.nextDialogAt ?? 0) > now) {
            return;
        }

        if (!pkg.canReadBytes(2)) {
            return;
        }

        const rawMsg = pkg.getString();
        const isClearDialogMessage = rawMsg.trim().length === 0;
        let msg = isClearDialogMessage ? " " : rawMsg.trim();

        const date = new Date();

        if (user.muted > date) {
            return;
        }

        if (!isClearDialogMessage && msg.length > vars.textMaxLength) {
            msg = msg.slice(0, vars.textMaxLength);
        }

        user.nextDialogAt = now + vars.timing.actionCooldowns.dialogMs;

        if (!isClearDialogMessage && msg[0] == "/") {
            command.msg(msg, ws);
            return;
        }

        let color = "white";

        if (user.privileges == 1 || user.privileges == 2) {
            color = "#419900";
        } else if (user.privileges == 2) {
            color = "red";
        } else {
            color = "white";
        }

        const name = game.getName(ws.id);
        let recipientsCount = 0;

        game.loopArea(ws, function (target: AreaTarget) {
            if (!target.isNpc) {
                withTargetClient(target.id, (targetClient) => {
                    if (!canReceiveCharacterEvent(target.id, ws.id)) {
                        return;
                    }

                    handleProtocol.dialog(ws.id, msg, name, color, isClearDialogMessage ? 0 : 1, targetClient);
                    recipientsCount++;
                });
            }
        });

        if (!isClearDialogMessage) {
            chatAuditLogger.logChat({
                channel: "local",
                sender: user,
                message: msg,
                recipientsCount,
            });
        }
    } catch (err) {
        funct.dumpError(err);
    }
}

function ping(ws: RuntimeClient) {
    try {
        const token = pkg.canReadBytes(4) ? pkg.getInt() : 0;

        handleProtocol.pong(ws, {
            token,
        });
    } catch (err) {
        funct.dumpError(err);
    }
}

function setCombatCooldowns(
    user: RuntimeCharacter,
    now: number,
    options: {
        meleeMs?: number;
        spellMs?: number;
        meleeToSpellMs?: number;
        spellToMeleeMs?: number;
        meleeToUseItemMs?: number;
    },
) {
    if (typeof options.meleeMs === "number") {
        user.nextMeleeAt = Math.max(user.nextMeleeAt || 0, now + options.meleeMs);
    }

    if (typeof options.spellMs === "number") {
        user.nextSpellAt = Math.max(user.nextSpellAt || 0, now + options.spellMs);
    }

    if (typeof options.meleeToSpellMs === "number") {
        user.nextSpellAfterMeleeAt = Math.max(user.nextSpellAfterMeleeAt || 0, now + options.meleeToSpellMs);
    }

    if (typeof options.spellToMeleeMs === "number") {
        user.nextMeleeAfterSpellAt = Math.max(user.nextMeleeAfterSpellAt || 0, now + options.spellToMeleeMs);
    }

    if (typeof options.meleeToUseItemMs === "number") {
        user.nextUseItemAfterMeleeAt = Math.max(user.nextUseItemAfterMeleeAt || 0, now + options.meleeToUseItemMs);
    }
}

function clearExpiredCombatCooldowns(user: RuntimeCharacter, now: number) {
    if ((user.nextMeleeAt ?? 0) > 0 && now >= (user.nextMeleeAt ?? 0)) {
        user.nextMeleeAt = 0;
    }

    if ((user.nextSpellAt ?? 0) > 0 && now >= (user.nextSpellAt ?? 0)) {
        user.nextSpellAt = 0;
    }

    if ((user.nextSpellAfterMeleeAt ?? 0) > 0 && now >= (user.nextSpellAfterMeleeAt ?? 0)) {
        user.nextSpellAfterMeleeAt = 0;
    }

    if ((user.nextMeleeAfterSpellAt ?? 0) > 0 && now >= (user.nextMeleeAfterSpellAt ?? 0)) {
        user.nextMeleeAfterSpellAt = 0;
    }

    if ((user.nextUseItemAfterMeleeAt ?? 0) > 0 && now >= (user.nextUseItemAfterMeleeAt ?? 0)) {
        user.nextUseItemAfterMeleeAt = 0;
    }
}

function attackMele(ws: RuntimeClient) {
    try {
        if (!game.existPjOrClose(ws)) {
            return;
        }

        const clientId = ws.id!;
        const user = getCharacterById(clientId) as any;

        if (!user) {
            return;
        }

        if (user.dead) {
            handleProtocol.console("Los muertos no pueden atacar.", "white", 0, 0, ws);
            return;
        }

        if (isChallengeCombatLocked(user)) {
            handleProtocol.console("[Retos] Espera a que termine la cuenta regresiva.", "white", 0, 0, ws);
            return;
        }

        cancelPendingReviveCast(ws, user, "Se canceló el resucitar al atacar.");

        if (user.meditar) {
            handleProtocol.console("Debes dejar de meditar para realizar esta acción.", "white", 0, 0, ws);
            return;
        }

        const itemWeapon = user.inv[user.idItemWeapon];

        if (itemWeapon) {
            const obj = vars.datObj[itemWeapon.idItem];
            if (obj.proyectil) {
                handleProtocol.console("No puedes usar esta arma así.", "white", 0, 0, ws);
                return;
            }
        }

        if (user.hit.hits >= 10) {
            user.hit.hits = 0;
            user.hit.startTimer = +Date.now();
        }

        user.hit.hits++;

        const now = Date.now();
        clearExpiredCombatCooldowns(user, now);

        if ((user.nextMeleeAt ?? 0) > now || (user.nextMeleeAfterSpellAt ?? 0) > now) {
            return;
        }

        cancelPendingLogout(user, ws, "[Servidor] La salida se canceló porque atacaste.");

        setCombatCooldowns(user, now, {
            meleeMs: vars.timing.actionCooldowns.meleeMs,
            meleeToSpellMs: vars.timing.actionCooldowns.meleeToSpellMs,
            meleeToUseItemMs: vars.timing.actionCooldowns.meleeToUseItemMs,
        });

        if (!canKeepHiddenSkillWhileActing(user)) {
            stopHiddenSkill(ws, user, getHiddenSkillAfterHitCooldownMs());
        }

        const x = user.pos.x;
        const y = user.pos.y;
        const heading = user.heading;
        let recibe: number | string | 0 = 0;
        let targetTile;

        switch (heading) {
            case 1:
                targetTile = vars.mapData[user.map]?.[y - 1]?.[x];
                recibe = targetTile?.id ?? 0;
                break;
            case 2:
                targetTile = vars.mapData[user.map]?.[y + 1]?.[x];
                recibe = targetTile?.id ?? 0;
                break;
            case 3:
                targetTile = vars.mapData[user.map]?.[y]?.[x + 1];
                recibe = targetTile?.id ?? 0;
                break;
            case 4:
                targetTile = vars.mapData[user.map]?.[y]?.[x - 1];
                recibe = targetTile?.id ?? 0;
                break;
        }

        if (!targetTile || !recibe) {
            return;
        }

        let pjSelected = getCharacterById(recibe);

        if (!pjSelected) {
            pjSelected = vars.npcs[recibe];
        }

        if (!pjSelected) {
            return;
        }

        const combatTarget = resolveOwnSummonCombatRedirect(clientId, pjSelected) ?? pjSelected;

        if (
            combatTarget &&
            !combatTarget.isNpc &&
            isInvisibleAdmin(combatTarget as RuntimeCharacter) &&
            combatTarget.id !== clientId
        ) {
            return;
        }

        if (user.idClase == vars.clases.arquero && !isDragonSlayerSwordEquipped(user)) {
            handleProtocol.console("Los arqueros no pueden atacar cuerpo a cuerpo.", "white", 0, 0, ws);
            return;
        }

        if (combatTarget.dead) {
            handleProtocol.console("No puedes atacar a un usuario muerto.", "white", 0, 0, ws);
            return;
        }

        if (isNonAttackableNpcTarget(combatTarget)) {
            handleProtocol.console("No puedes atacar a ese NPC.", "white", 0, 0, ws);
            return;
        }

        if (isOwnSummonTarget(clientId, combatTarget)) {
            handleProtocol.console("No puedes atacar a tus invocaciones.", "white", 0, 0, ws);
            return;
        }

        const resolvedTarget = combatTarget as any;

        if (resolvedTarget.hp > 0) {
            const flushGroupClients = collectCombatFlushGroupClients(ws, {
                extraClientIds: [
                    resolvedTarget.isNpc
                        ? (resolvedTarget.summonedByUserId as EntityId | undefined)
                        : resolvedTarget.id,
                ],
            });

            withClientFlushGroups(flushGroupClients, () => {
                user.lastCombatActivityAt = now;

                let dmg: number | string = 0;

                if (!resolvedTarget.isNpc) {
                    game.clearSummonTargetNpc(ws.id);
                }

                if (resolvedTarget.isNpc) {
                    dmg = game.userDmgNpc(ws.id, resolvedTarget.id);
                } else {
                    dmg = game.userDmgUser(ws.id, resolvedTarget.id);
                }

                if (dmg) {
                    game.loopArea(ws, function (target: AreaTarget) {
                        if (!target.isNpc) {
                            withTargetClient(target.id, (targetClient) => {
                                if (!canReceiveCharacterEvent(target.id, ws.id)) {
                                    return;
                                }

                                handleProtocol.dialog(ws.id, "" + dmg, "", "red", 0, targetClient);
                            });
                        }
                    });

                    if (resolvedTarget.isNpc && dmg !== "¡Fallas!") {
                        game.setSummonTargetNpc(ws.id, resolvedTarget.id);
                    }

                    respawn.muere(ws, resolvedTarget.id);
                }
            });
        }
    } catch (err) {
        funct.dumpError(err);
    }
}

function attackRange(ws: RuntimeClient) {
    try {
        if (!game.existPjOrClose(ws)) {
            return;
        }

        const clientId = ws.id!;
        const user = getCharacterById(clientId) as any;

        if (!user) {
            return;
        }

        if (user.dead) {
            handleProtocol.console("Los muertos no pueden atacar.", "white", 0, 0, ws);
            return;
        }

        if (isChallengeCombatLocked(user)) {
            handleProtocol.console("[Retos] Espera a que termine la cuenta regresiva.", "white", 0, 0, ws);
            return;
        }

        if (user.meditar) {
            handleProtocol.console("Debes dejar de meditar para realizar esta acción.", "white", 0, 0, ws);
            return;
        }

        const itemWeapon = user.inv[user.idItemWeapon];

        if (!itemWeapon) {
            return;
        }

        const obj = vars.datObj[itemWeapon.idItem];

        if (!user.idItemWeapon) {
            return;
        }

        if (!obj.proyectil) {
            return;
        }

        const arrowItem = user.idItemArrow ? user.inv[user.idItemArrow] : null;

        if (!user.idItemArrow || !arrowItem) {
            if (user.idItemArrow && !arrowItem) {
                user.idItemArrow = 0;
            }

            handleProtocol.console("No tienes flechas equipadas.", "white", 0, 0, ws);
            return;
        }

        if (user.spell.lanzados >= 10) {
            user.spell.lanzados = 0;
            user.spell.startTimer = +Date.now();
        }

        user.spell.lanzados++;

        const now = Date.now();
        clearExpiredCombatCooldowns(user, now);

        if (
            (user.nextSpellAt ?? 0) > now ||
            (user.nextSpellAfterMeleeAt ?? 0) > now ||
            (user.nextMeleeAfterSpellAt ?? 0) > now
        ) {
            return;
        }

        cancelPendingLogout(user, ws, "[Servidor] La salida se canceló porque atacaste.");

        setCombatCooldowns(user, now, {
            spellMs: vars.timing.actionCooldowns.rangeMs,
            spellToMeleeMs: vars.timing.actionCooldowns.spellToMeleeMs,
        });

        if (!pkg.canReadBytes(2)) {
            return;
        }

        const pos = {
            x: pkg.getByte(),
            y: pkg.getByte(),
        };

        if (pos.x < 1 || pos.x > 100) {
            return;
        }

        if (pos.y < 1 || pos.y > 100) {
            return;
        }

        const userMapData = vars.mapData[user.map];
        let tileSelected = userMapData?.[pos.y]?.[pos.x];

        if (!tileSelected?.id && pos.y < 100) {
            tileSelected = userMapData?.[pos.y + 1]?.[pos.x];
        }

        if (tileSelected?.id) {
            let pjSelected = getCharacterById(tileSelected.id);

            if (!pjSelected) {
                pjSelected = vars.npcs[tileSelected.id];
            }

            if (!pjSelected) {
                user.spellsErrados++;
                return;
            }

            const combatTarget = resolveOwnSummonCombatRedirect(clientId, pjSelected) ?? pjSelected;

            if (
                combatTarget &&
                !combatTarget.isNpc &&
                isInvisibleAdmin(combatTarget as RuntimeCharacter) &&
                combatTarget.id !== clientId
            ) {
                user.spellsErrados++;
                return;
            }

            if (combatTarget.dead) {
                handleProtocol.console("No puedes atacar a un usuario muerto.", "white", 0, 0, ws);
                return;
            }

            if (isNonAttackableNpcTarget(combatTarget)) {
                handleProtocol.console("No puedes atacar a ese NPC.", "white", 0, 0, ws);
                return;
            }

            if (isOwnSummonTarget(clientId, combatTarget)) {
                handleProtocol.console("No puedes atacar a tus invocaciones.", "white", 0, 0, ws);
                return;
            }

            if (!combatTarget.isNpc && !canKeepHiddenSkillWhileActing(user)) {
                stopHiddenSkill(ws, user, getHiddenSkillAfterHitCooldownMs());
            }

            const resolvedTarget = combatTarget as any;
            const arrowGraphicId = Number(vars.datObj[arrowItem.idItem]?.grhIndex ?? 0);

            if (resolvedTarget.hp > 0) {
                const flushGroupClients = collectCombatFlushGroupClients(ws, {
                    includeTargetArea: {
                        mapId: user.map,
                        pos: resolvedTarget.pos,
                    },
                    extraClientIds: [
                        resolvedTarget.isNpc
                            ? (resolvedTarget.summonedByUserId as EntityId | undefined)
                            : resolvedTarget.id,
                    ],
                });

                withClientFlushGroups(flushGroupClients, () => {
                    user.lastCombatActivityAt = now;
                    sendProjectileToCombatViewers(
                        ws,
                        clientId,
                        user.map,
                        { x: user.pos.x, y: user.pos.y },
                        { x: resolvedTarget.pos.x, y: resolvedTarget.pos.y },
                        arrowGraphicId,
                    );

                    let dmg: number | string = 0;

                    if (!resolvedTarget.isNpc) {
                        game.clearSummonTargetNpc(ws.id);
                    }

                    if (resolvedTarget.isNpc) {
                        dmg = game.userDmgNpc(ws.id, resolvedTarget.id);
                    } else {
                        dmg = game.userDmgUser(ws.id, resolvedTarget.id);
                    }

                    if (dmg) {
                        game.loopArea(ws, function (target: AreaTarget) {
                            if (!target.isNpc) {
                                withTargetClient(target.id, (targetClient) => {
                                    if (!canReceiveCharacterEvent(target.id, ws.id)) {
                                        return;
                                    }

                                    handleProtocol.dialog(ws.id, "" + dmg, "", "red", 0, targetClient);
                                });
                            }
                        });

                        if (resolvedTarget.isNpc && dmg !== "¡Fallas!") {
                            game.setSummonTargetNpc(ws.id, resolvedTarget.id);
                        }

                        respawn.muere(ws, resolvedTarget.id);
                    }
                });
            }

            if (!resolvedTarget.isNpc) {
                user.spellsAcertados++;
            }
        } else {
            user.spellsErrados++;
        }

        game.quitarUserInvItem(ws.id, user.idItemArrow, 1);
    } catch (err) {
        funct.dumpError(err);
    }
}

function attackSpell(ws: RuntimeClient) {
    try {
        if (!game.existPjOrClose(ws)) {
            return;
        }

        const clientId = ws.id!;
        const user = getCharacterById(clientId) as any;

        if (!user) {
            return;
        }

        if (user.dead) {
            handleProtocol.console("Los muertos no pueden tirar hechizos.", "white", 0, 0, ws);
            return;
        }

        cancelPendingReviveCast(ws, user, "Se canceló el resucitar al lanzar otro hechizo.");

        if (user.idClase === vars.clases.guerrero || user.idClase === vars.clases.cazador) {
            handleProtocol.console("Tu clase no puede usar hechizos.", "white", 0, 0, ws);
            return;
        }

        if (Number(vars.mapData[user.map]?.magiaSinEfecto ?? 0) === 1) {
            handleProtocol.console("En este mapa no se puede lanzar magia.", "white", 0, 0, ws);
            return;
        }

        if (user.spell.lanzados >= 10) {
            user.spell.lanzados = 0;
            user.spell.startTimer = +Date.now();
        }

        user.spell.lanzados++;

        const now = Date.now();
        clearExpiredCombatCooldowns(user, now);

        if ((user.nextSpellAt ?? 0) > now || (user.nextSpellAfterMeleeAt ?? 0) > now) {
            return;
        }

        cancelPendingLogout(user, ws, "[Servidor] La salida se canceló porque casteaste un hechizo.");

        setCombatCooldowns(user, now, {
            spellMs: vars.timing.actionCooldowns.spellMs,
            spellToMeleeMs: vars.timing.actionCooldowns.spellToMeleeMs,
        });

        if (user.meditar) {
            handleProtocol.console("Debes dejar de meditar para realizar esta acción.", "white", 0, 0, ws);
            return;
        }

        if (!pkg.canReadBytes(1)) {
            return;
        }

        const idPos = pkg.getByte();

        if (!user.spells[idPos]) {
            return;
        }

        const idSpell = user.spells[idPos].idSpell;
        const datSpell = vars.datSpell[idSpell];
        const isSummonSpell = Number(datSpell.type ?? 0) === 4 && Number(datSpell.numNpc ?? 0) > 0;
        const isPartialInvisibilityRemoval = isPartialInvisibilityRemovalSpell(datSpell);
        const reviveSpell = isReviveSpell(datSpell);

        if (getSimulatedSkill(user) < Number(datSpell.minSkill ?? 0)) {
            handleProtocol.console(
                "Necesitas ser nivel " + getRequiredLevelForSpell(datSpell.minSkill) + " para lanzar ese hechizo.",
                "white",
                0,
                0,
                ws,
            );
            return;
        }

        if (user.mana < datSpell.manaRequired) {
            handleProtocol.console("No tienes mana suficiente para lanzar ese hechizo.", "white", 0, 0, ws);
            return;
        }

        if (!pkg.canReadBytes(2)) {
            return;
        }

        const pos = {
            x: pkg.getByte(),
            y: pkg.getByte(),
        };
        const preferSelfIfEmpty = pkg.canReadBytes(1) ? pkg.getByte() === 1 : false;

        if (pos.x < 1 || pos.x > 100) {
            return;
        }

        if (pos.y < 1 || pos.y > 100) {
            return;
        }

        if (isPartialInvisibilityRemoval) {
            castPartialInvisibilityRemovalSpell(ws, user, datSpell);
            return;
        }

        if (isSummonSpell) {
            if (user.pvpChar || getChallengeManager().isCharacterInActiveMatch(user)) {
                handleProtocol.console("No puedes invocar criaturas en la arena.", "white", 0, 0, ws);
                return;
            }

            if (isInSafeZone(user)) {
                handleProtocol.console("Solo puedes invocar criaturas en zona insegura.", "white", 0, 0, ws);
                return;
            }

            const summonNpcIndex = Number(datSpell.numNpc ?? 0);
            const summonNpc = vars.datNpc[summonNpcIndex];

            if (game.hayAgua(user.map, pos) && !Number(summonNpc?.aguaValida ?? 0)) {
                handleProtocol.console("Ese NPC no puede ser invocado sobre agua.", "white", 0, 0, ws);
                user.spellsErrados++;
                return;
            }

            const summonId = npcs.spawnSummon(ws.id, idSpell, pos);

            if (!summonId) {
                handleProtocol.console("No hay una posición válida para invocar esa criatura.", "white", 0, 0, ws);
                user.spellsErrados++;
                return;
            }

            user.mana -= datSpell.manaRequired;

            game.loopArea(ws, function (client: AreaTarget) {
                if (!client.isNpc) {
                    withTargetClient(client.id, (targetClient) => {
                        if (!canReceiveCharacterEvent(client.id, ws.id)) {
                            return;
                        }

                        if (Number(datSpell.fxGrh ?? 0) > 0) {
                            handleProtocol.animFX(summonId, datSpell.fxGrh, targetClient);
                        }

                        handleProtocol.playSound(summonId, datSpell.wav, targetClient);

                        if (String(datSpell.palabrasMagicas ?? "").trim().length > 0) {
                            handleProtocol.dialog(ws.id, datSpell.palabrasMagicas, "", "#E69500", 0, targetClient);
                        }
                    });
                }
            });

            handleProtocol.updateMana(user.mana, ws);
            return;
        }

        const userMapData = vars.mapData[user.map];
        let tileSelected = userMapData?.[pos.y]?.[pos.x];

        if (!tileSelected?.id && pos.y < 100) {
            tileSelected = userMapData?.[pos.y + 1]?.[pos.x];
        }

        if (!tileSelected?.id && preferSelfIfEmpty && isSelfTargetFallbackEligibleSpell(datSpell)) {
            tileSelected = { id: clientId } as typeof tileSelected;
        }

        if (tileSelected?.id) {
            let pjSelected = getCharacterById(tileSelected.id);

            if (!pjSelected) {
                pjSelected = vars.npcs[tileSelected.id];
            }

            if (!pjSelected) {
                user.spellsErrados++;
                return;
            }

            const spellTarget = isHostileCombatSpell(datSpell)
                ? (resolveOwnSummonCombatRedirect(clientId, pjSelected) ?? pjSelected)
                : pjSelected;
            const targetCharacter = !spellTarget.isNpc ? (spellTarget as RuntimeCharacter) : null;

            if (
                spellTarget &&
                !spellTarget.isNpc &&
                isInvisibleAdmin(spellTarget as RuntimeCharacter) &&
                spellTarget.id !== clientId
            ) {
                user.spellsErrados++;
                return;
            }

            if (
                targetCharacter &&
                targetCharacter.id !== clientId &&
                !user.criminal &&
                targetCharacter.criminal &&
                isSupportSpell(datSpell) &&
                !canCitizenSupportCriminal(user, targetCharacter)
            ) {
                handleProtocol.console(
                    "Los ciudadanos no pueden lanzar hechizos de soporte sobre criminales.",
                    "white",
                    0,
                    0,
                    ws,
                );
                return;
            }

            if (spellTarget.dead && reviveSpell) {
                if (spellTarget.isNpc) {
                    handleProtocol.console("Solo puedes resucitar usuarios muertos.", "white", 0, 0, ws);
                    return;
                }

                startPendingReviveCast(ws, user, spellTarget.id, idSpell, datSpell);
                handleProtocol.console(`Comienzas a resucitar a ${spellTarget.nameCharacter}.`, "red", 1, 0, ws);
                return;
            }

            if (spellTarget.dead) {
                handleProtocol.console("No puedes atacar a un usuario muerto.", "white", 0, 0, ws);
                return;
            }

            if (reviveSpell) {
                handleProtocol.console("Solo puedes usar resucitar sobre usuarios muertos.", "white", 0, 0, ws);
                return;
            }

            if (isOwnSummonTarget(clientId, spellTarget) && isHostileCombatSpell(datSpell)) {
                handleProtocol.console("No puedes atacar a tus invocaciones.", "white", 0, 0, ws);
                return;
            }

            if (isNonAttackableNpcTarget(spellTarget) && isHostileCombatSpell(datSpell)) {
                handleProtocol.console("No puedes atacar a ese NPC.", "white", 0, 0, ws);
                return;
            }

            if (isInSafeZone(user) && isNonHostileCityNpcSpellTarget(spellTarget)) {
                handleProtocol.console("No puedes lanzar hechizos sobre ese NPC.", "white", 0, 0, ws);
                return;
            }

            if (spellTarget.isNpc && isHealingSpell(datSpell)) {
                handleProtocol.console("No puedes lanzar hechizos de curación sobre NPCs.", "white", 0, 0, ws);
                return;
            }

            if (!spellTarget.isNpc && !canKeepHiddenSkillWhileActing(user)) {
                stopHiddenSkill(ws, user, getHiddenSkillAfterHitCooldownMs());
            }

            let dmg = 0;

            if (isHostileCombatSpell(datSpell)) {
                user.lastCombatActivityAt = now;
            }

            if (!shouldHideSpellProjectile(user, spellTarget)) {
                sendSpellProjectileToCombatViewers(
                    ws,
                    clientId,
                    user.map,
                    { x: user.pos.x, y: user.pos.y },
                    { x: spellTarget.pos.x, y: spellTarget.pos.y },
                    idSpell,
                );
            }

            if (!spellTarget.isNpc) {
                game.clearSummonTargetNpc(ws.id);
            }

            if (spellTarget.isNpc) {
                dmg = game.userSpellNpc(ws.id, spellTarget.id, idSpell);
            } else {
                dmg = game.userSpellUser(ws.id, spellTarget.id, idSpell);
            }

            if (dmg !== 0) {
                const flushGroupClients = collectCombatFlushGroupClients(ws, {
                    includeTargetArea: {
                        mapId: user.map,
                        pos: spellTarget.pos,
                    },
                    extraClientIds: [
                        spellTarget.isNpc ? (spellTarget.summonedByUserId as EntityId | undefined) : spellTarget.id,
                    ],
                });

                withClientFlushGroups(flushGroupClients, () => {
                    user.mana -= datSpell.manaRequired;
                    sendSpellImpactToAreaViewers(ws, clientId, spellTarget.id, {
                        fxGrh: datSpell.fxGrh,
                        soundId: datSpell.wav,
                        msg: datSpell.palabrasMagicas,
                    });

                    if (spellTarget.isNpc) {
                        game.setSummonTargetNpc(ws.id, spellTarget.id);
                    }

                    handleProtocol.updateMana(user.mana, ws);
                    respawn.muere(ws, spellTarget.id);
                });
            }

            if (!spellTarget.isNpc) {
                user.spellsAcertados++;
            }
        } else {
            user.spellsErrados++;
        }
    } catch (err) {
        funct.dumpError(err);
    }
}

async function reorderSpell(ws: RuntimeClient) {
    try {
        if (!game.existPjOrClose(ws)) {
            return;
        }

        if (!pkg.canReadBytes(2)) {
            return;
        }

        const sourceSlot = pkg.getByte();
        const targetSlot = pkg.getByte();

        if (sourceSlot === targetSlot) {
            return;
        }

        await game.reorderSpell(ws.id!, sourceSlot, targetSlot);
    } catch (err) {
        funct.dumpError(err);
    }
}

async function reorderInventoryItem(ws: RuntimeClient) {
    try {
        if (!game.existPjOrClose(ws)) {
            return;
        }

        if (!pkg.canReadBytes(2)) {
            return;
        }

        const sourceSlot = pkg.getByte();
        const targetSlot = pkg.getByte();

        if (sourceSlot === targetSlot) {
            return;
        }

        await game.reorderInventoryItem(ws.id!, sourceSlot, targetSlot);
    } catch (err) {
        funct.dumpError(err);
    }
}

async function reorderBankItem(ws: RuntimeClient) {
    try {
        if (!game.existPjOrClose(ws)) {
            return;
        }

        if (isActionRateLimited(ws, "nextReorderBankAt", REORDER_PACKET_COOLDOWN_MS)) {
            return;
        }

        if (!pkg.canReadBytes(2)) {
            return;
        }

        const sourceSlot = pkg.getByte();
        const targetSlot = pkg.getByte();

        if (sourceSlot === targetSlot) {
            return;
        }

        await game.reorderBankItem(ws.id!, sourceSlot, targetSlot);
    } catch (err) {
        funct.dumpError(err);
    }
}

async function changeBankTab(ws: RuntimeClient) {
    try {
        if (!game.existPjOrClose(ws)) {
            return;
        }

        if (!pkg.canReadBytes(1)) {
            return;
        }

        const rawTab = pkg.getByte();
        const tab = rawTab === 1 ? "account" : rawTab === 2 ? "clan" : "character";
        await game.changeBankTab(ws.id!, tab);
    } catch (err) {
        funct.dumpError(err);
    }
}

async function depositBankGold(ws: RuntimeClient) {
    try {
        if (!game.existPjOrClose(ws)) {
            return;
        }

        if (!pkg.canReadBytes(4)) {
            return;
        }

        await game.depositBankGold(ws.id!, pkg.getInt());
    } catch (err) {
        funct.dumpError(err);
    }
}

async function withdrawBankGold(ws: RuntimeClient) {
    try {
        if (!game.existPjOrClose(ws)) {
            return;
        }

        if (!pkg.canReadBytes(4)) {
            return;
        }

        await game.withdrawBankGold(ws.id!, pkg.getInt());
    } catch (err) {
        funct.dumpError(err);
    }
}

async function marketAction(ws: RuntimeClient) {
    try {
        if (!game.existPjOrClose(ws)) {
            return;
        }

        if (!pkg.canReadBytes(2)) {
            return;
        }

        const rawPayload = pkg.getString();
        const payload = funct.jsonDecode(rawPayload || "{}") as {
            action?: "refresh" | "create" | "buy" | "cancel" | "claim";
            slot?: number;
            quantity?: number;
            price?: number;
            expectedItemId?: number;
            expectedQuantity?: number;
            expectedPrice?: number;
            durationHours?: number;
            listingId?: string;
            listingLimit?: number;
            search?: string;
            objType?: number | null;
            sortPrice?: "recent" | "asc" | "desc";
        };
        const now = Date.now();
        const user = getCharacterById(ws.id);

        if (!user || user.tradeMode !== "market" || !user.npcTrade) {
            return;
        }

        const npc = vars.npcs[String(user.npcTrade)] as RuntimeNpc | undefined;

        if (!npc || npc.npcType !== vars.npcType.subastador || isOriginalNpcInteractionOutOfRange(user, npc, 6)) {
            game.closeTradeSession(ws.id!);
            return;
        }

        if (!isMarketEnabled()) {
            handleProtocol.console("Las subastas se encuentran deshabilitadas.", "white", 1, 0, ws);
            game.closeTradeSession(ws.id!);
            return;
        }

        const normalizedAction = payload.action ?? "refresh";
        const isBrowseAction = normalizedAction === "refresh";
        const browseOptions = {
            listingLimit: Number(payload.listingLimit ?? 20),
            search: typeof payload.search === "string" ? payload.search.trim().slice(0, 80) : undefined,
            objType:
                typeof payload.objType === "number" && Number.isFinite(payload.objType)
                    ? Math.max(0, Math.floor(payload.objType))
                    : null,
            sortPrice: payload.sortPrice === "asc" || payload.sortPrice === "desc" ? payload.sortPrice : "recent",
        };

        if (
            isActionRateLimited(
                ws,
                isBrowseAction ? "nextMarketBrowseAt" : "nextMarketWriteAt",
                isBrowseAction ? MARKET_BROWSE_COOLDOWN_MS : MARKET_WRITE_COOLDOWN_MS,
                now,
            )
        ) {
            notifyMarketThrottle(
                ws,
                isBrowseAction
                    ? "Espera un momento antes de volver a consultar el mercado."
                    : "Espera un momento antes de volver a operar en el mercado.",
                now,
            );
            return;
        }

        if (ws.marketActionInFlight) {
            notifyMarketThrottle(ws, "Ya hay una operación de mercado en curso. Espera un momento.", now);
            return;
        }

        ws.marketActionInFlight = true;

        let message: string | null = null;
        let ok = true;

        switch (normalizedAction) {
            case "create": {
                const result = await game.createMarketListing(
                    ws.id!,
                    Number(payload.slot ?? 0),
                    Number(payload.quantity ?? 0),
                    Number(payload.price ?? 0),
                    Number(payload.durationHours ?? 0),
                );
                ok = result.ok;
                message = result.message;
                break;
            }
            case "buy": {
                const listingId = typeof payload.listingId === "string" ? payload.listingId.trim() : "";

                if (!listingId) {
                    ok = false;
                    message = "Selecciona una publicación válida para comprar.";
                    break;
                }

                const result = await game.buyMarketListing(ws.id!, listingId, {
                    itemId:
                        typeof payload.expectedItemId === "number" && Number.isFinite(payload.expectedItemId)
                            ? Math.floor(payload.expectedItemId)
                            : undefined,
                    quantity:
                        typeof payload.expectedQuantity === "number" && Number.isFinite(payload.expectedQuantity)
                            ? Math.floor(payload.expectedQuantity)
                            : undefined,
                    price:
                        typeof payload.expectedPrice === "number" && Number.isFinite(payload.expectedPrice)
                            ? Math.floor(payload.expectedPrice)
                            : undefined,
                });
                ok = result.ok;
                message = result.message;
                break;
            }
            case "cancel": {
                const result = await game.cancelMarketListing(ws.id!, String(payload.listingId ?? ""));
                ok = result.ok;
                message = result.message;
                break;
            }
            case "claim": {
                const result = await game.claimMarket(ws.id!);
                ok = result.ok;
                message = result.message;
                break;
            }
            case "refresh":
            default:
                break;
        }

        if (message) {
            handleProtocol.console(message, ok ? "#E69500" : "white", 0, 0, ws);
        }

        const nextState = await game.getMarketState(ws.id!, npc.nameCharacter ?? "Mercado Global", browseOptions);

        if (nextState) {
            handleProtocol.openMarket(nextState, ws);
        }
    } catch (err) {
        funct.dumpError(err);
    } finally {
        ws.marketActionInFlight = false;
    }
}

async function retosAction(ws: RuntimeClient) {
    try {
        if (!game.existPjOrClose(ws)) {
            return;
        }

        if (!pkg.canReadBytes(2)) {
            return;
        }

        const rawPayload = pkg.getString();
        const payload = rawPayload ? (JSON.parse(rawPayload) as Record<string, unknown>) : {};
        const action = typeof payload.action === "string" ? payload.action.trim().toLowerCase() : "refresh";
        let message: string | null = null;
        let ok = true;

        switch (action) {
            case "create": {
                challengeManager.createChallengeByUserId(ws.id!, Number(payload.teamSize ?? 0));
                message = "[Retos] Reto publicado.";
                break;
            }
            case "join": {
                challengeManager.joinChallengeByUserId(ws.id!, String(payload.challengeId ?? ""));
                message = "[Retos] Reto aceptado.";
                break;
            }
            case "cancel": {
                challengeManager.cancelChallengeByUserId(ws.id!, String(payload.challengeId ?? ""));
                message = "[Retos] Reto cancelado.";
                break;
            }
            case "refresh":
            default:
                break;
        }

        if (message) {
            handleProtocol.console(message, ok ? "#E69500" : "white", 0, 0, ws);
        }

        handleProtocol.openRetos(challengeManager.listChallengesForUserId(ws.id!), ws);
    } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo procesar el reto.";

        if (!(error instanceof Error)) {
            funct.dumpError(error);
        }

        handleProtocol.console(message, "white", 0, 0, ws);

        try {
            handleProtocol.openRetos(challengeManager.listChallengesForUserId(ws.id!), ws);
        } catch {
            return;
        }
    }
}

function closeTrade(ws: RuntimeClient) {
    try {
        if (!game.existPjOrClose(ws)) {
            return;
        }

        game.closeTradeSession(ws.id!);
    } catch (err) {
        funct.dumpError(err);
    }
}

module.exports = protocol;
