import type { GameApi } from "./game";
import { bankOperations } from './bankOperationGuard';
import { resolveCommandAlias, playerCommandHelp, normalizeClassInput, parseNpcSpawnOptions, formatAdminBotName } from "./commandAliases";
import type { HandleProtocolApi } from "./handleProtocol";
import type { SocketApi } from "./socket";
import {
    getFactionColor,
    getFactionConfig,
    getFactionRankTitle,
    getMaxEligibleFactionRank,
    type CharacterFaction,
} from "./factions";
import type {
    EntityId,
    RuntimeCharacter,
    RuntimeClient,
    RuntimeClients,
    RuntimeCharacters,
    RuntimeNpc,
} from "./types/runtime";

import { reloadBalanceDiff, reloadCraftingRecipesDiff, reloadNpcsDiff, reloadObjectsDiff } from "./gameDataSync";
import {
    appendMapNpcPlacement,
    loadAllMapNpcPlacements,
    loadMapNpcPlacements,
    replaceAllMapNpcPlacements,
} from "./mapNpcStorage";
import * as safeZone from "./safeZone";

export {};

const socket = require("./socket") as SocketApi;
const game = require("./game") as GameApi;
const npcs = require("./npcs");
const vars = require("./vars");
const funct = require("./functions");
const chatAuditLogger = require("./chatAuditLogger");
const handleProtocol = require("./handleProtocol") as HandleProtocolApi;
const login = require("./login");
const runtimeTiming = require("./runtimeTiming");
const balance = require("./balance");
const mapInstanceManager = require("./mapInstanceManager");
const _ = require("lodash");
const npcsInMap = loadAllMapNpcPlacements() as Array<{
    mapNum: number;
    x: number;
    y: number;
    npcIndex: number;
    movement?: number;
}>;

type CommandClient = RuntimeClient & { id: EntityId };
type CommandCharacter = RuntimeCharacter & {
    id: EntityId;
    _id?: string;
    idAccount?: string | null;
    pvpChar?: boolean;
    privileges: number;
    gold: number;
    exp: number;
    nameCharacter: string;
    color: string;
    clan: string;
    criminal: number;
    faction?: CharacterFaction;
    factionScoreArmada?: number;
    factionScoreCaos?: number;
    factionRankArmada?: number;
    factionRankCaos?: number;
    factionRewardsArmada?: number;
    factionRewardsCaos?: number;
    map: number;
    pos: { x: number; y: number };
    seguroActivado: boolean;
    seguroClanActivado?: boolean;
    npcMatados?: number;
    ciudadanosMatados?: number;
    criminalesMatados?: number;
    fianza?: number;
    homeMap?: number;
    homeX?: number;
    homeY?: number;
};

type CharacterStatsSnapshotPayload = {
    sampledAt: number;
    skills: {
        tacticasCombate: number;
        defensa: number;
        armas: number;
        proyectiles: number;
        wrestling: number;
        ocultarse: number;
        apunalar: number;
    };
    kills: {
        npcMatados: number;
        ciudadanosMatados: number;
        criminalesMatados: number;
    };
    factions: {
        activeFaction: CharacterFaction;
        armada: FactionStatsSnapshot;
        caos: FactionStatsSnapshot;
    };
};

type FactionStatsSnapshot = {
    score: number;
    currentRank: number;
    currentTitle: string | null;
    nextRank: number | null;
    nextTitle: string | null;
    scoreToNextRank: number;
};

type ClanCharacterSummary = {
    clanId: string | null;
    clanName: string | null;
    clanTag: string | null;
    clanAlignment: "citizen" | "criminal" | null;
    clanMinJoinLevel: number | null;
    clanRole: "leader" | "co_leader" | "member" | null;
};

type ChatChannel = "global" | "party" | "clan" | "whisper";

const HOME_MAP = 1;
const HOME_X = 54;
const HOME_Y = 60;
const GOVERNOR_NPC_IDS = [13, 150, 151, 152, 153, 9019] as const;
const GOVERNOR_HOME_COORDS: Record<number, { x: number; y: number }> = {
    13: { x: 54, y: 59 },
    150: { x: 40, y: 88 },
    151: { x: 43, y: 52 },
    152: { x: 72, y: 40 },
    153: { x: 58, y: 80 },
    9019: { x: 30, y: 75 },
};
const UNSAFE_LOGOUT_DELAY_MS = 10000;
const GLOBAL_NOTICE_DURATION_MS = 10000;
const SERVER_RESTART_WARNING_COLOR = "#E69500";
const pendingServerRestartWarningTimeouts = new Set<ReturnType<typeof setTimeout>>();
const LOGOUT_STARTED_MESSAGE =
    "[Servidor] Debes permanecer quieto durante 10 segundos para salir. Si te mueves, la salida se cancelará.";
const LOGOUT_CLOSING_MESSAGE = "[Servidor] Cerrando sesión...";
const BAIL_COST_PER_CITIZEN = 5000;
const PERMANENT_BAN_UNTIL = "9999-12-31T23:59:59.000Z";
const JAIL_MAP = 66;
const JAIL_X = 68;
const JAIL_Y = 47;
const MAX_JAIL_MINUTES = 8640;

type BanCommandResult = {
    characterId: string;
    name: string;
    bannedUntil: string;
};

type BanIpCommandResult = {
    ip: string;
    name: string;
    bannedUntil: string;
    affectedCharacters: number;
};

type UnbanCommandResult = {
    characterId: string;
    name: string;
};

type UnbanIpCommandResult = {
    ip: string;
    name: string;
    affectedCharacters: number;
};

type JailCommandResult = {
    characterId: string;
    name: string;
    jailMinutes: number;
    jailReason: string;
};

const TIMING_PATH_ALIASES: Record<string, string> = {
    gameplay: "gameplayTickMs",
    gameplaytick: "gameplayTickMs",
    walk: "walkStepMs",
    walkstep: "walkStepMs",
    playerstatus: "playerStatusTickMs",
    fishing: "fishingTickMs",
    npcthink: "npcThinkMs",
    idle: "idleCharacterTimeoutMs",
    idlesweep: "idleCharacterSweepMs",
    cleanup: "cleanupClosedCharactersMs",
    onlinestats: "onlineStatsSnapshotMs",
    worldsave: "worldSaveMs",
    dialog: "actionCooldowns.dialogMs",
    click: "actionCooldowns.clickMs",
    doortoggle: "actionCooldowns.doorToggleMs",
    melee: "actionCooldowns.meleeMs",
    range: "actionCooldowns.rangeMs",
    spell: "actionCooldowns.spellMs",
    meleetospell: "actionCooldowns.meleeToSpellMs",
    spelltomelee: "actionCooldowns.spellToMeleeMs",
    useitem: "actionCooldowns.useItemMs",
    useitemclick: "actionCooldowns.useItemMs",
    useitemu: "actionCooldowns.useItemMs",
    meleetouseitem: "actionCooldowns.meleeToUseItemMs",
    meleetouseitemu: "actionCooldowns.meleeToUseItemMs",
    dropitem: "actionCooldowns.dropItemMs",
    equiptoggle: "actionCooldowns.equipToggleMs",
    crowdcontroluser: "statusDurations.crowdControlUserMs",
    crowdcontrolnpc: "statusDurations.crowdControlNpcMs",
    fuerzaagilidadbuff: "statusDurations.fuerzaAgilidadBuffMs",
    invisibility: "statusDurations.invisibilitySpellMs",
    invisibilityfadeout: "visualEffects.invisibilityFadeOutMs",
    invisibilityfadein: "visualEffects.invisibilityFadeInMs",
    invisibilityalphamin: "visualEffects.invisibilityMinAlpha",
    invisibilityalphamax: "visualEffects.invisibilityMaxAlpha",
    npcattack: "statusDurations.npcAttackMs",
};

export type CommandApi = {
    msg: (msg: string, ws: RuntimeClient) => Promise<void>;
};

function getClientId(ws: RuntimeClient) {
    return ws.id as EntityId;
}

function buildCharacterStatsSnapshot(userId: EntityId): CharacterStatsSnapshotPayload {
    const user = getCharacter(userId);
    const armadaScore = Number(user?.factionScoreArmada ?? 0);
    const caosScore = Number(user?.factionScoreCaos ?? 0);
    const level = Number(user?.level ?? 0);

    const buildFactionSnapshot = (faction: Exclude<CharacterFaction, "none">, score: number): FactionStatsSnapshot => {
        const currentRank = getMaxEligibleFactionRank(faction, level, score);
        const config = getFactionConfig(faction);
        const nextRankConfig = config?.ranks.find((rank) => rank.rank > currentRank) ?? null;

        return {
            score,
            currentRank,
            currentTitle: getFactionRankTitle(faction, currentRank),
            nextRank: nextRankConfig?.rank ?? null,
            nextTitle: nextRankConfig?.title ?? null,
            scoreToNextRank: Math.max(0, Number(nextRankConfig?.minScore ?? score) - score),
        };
    };

    return {
        sampledAt: Date.now(),
        skills: {
            tacticasCombate: game.getSkillTacticasCombate(userId),
            defensa: game.getSkillDefensa(userId),
            armas: game.getSkillArmas(userId),
            proyectiles: game.getSkillProyectiles(userId),
            wrestling: game.getSkillWrestling(userId),
            ocultarse: game.getSkillOcultarse(userId),
            apunalar: game.getSkillApu(userId),
        },
        kills: {
            npcMatados: Number(user?.npcMatados ?? 0),
            ciudadanosMatados: Number(user?.ciudadanosMatados ?? 0),
            criminalesMatados: Number(user?.criminalesMatados ?? 0),
        },
        factions: {
            activeFaction: normalizeFaction(user?.faction),
            armada: buildFactionSnapshot("armada", armadaScore),
            caos: buildFactionSnapshot("caos", caosScore),
        },
    };
}

function getCharacter(idUser: EntityId) {
    return (vars.personajes as RuntimeCharacters)[String(idUser)] as CommandCharacter;
}

function getClient(idUser: EntityId) {
    return (vars.clients as RuntimeClients)[String(idUser)] as RuntimeClient;
}

function normalizeFaction(value: unknown): CharacterFaction {
    return value === "armada" || value === "caos" ? value : "none";
}

function isNearNpcTemplate(user: CommandCharacter, npcTemplateId: number, maxDistance = 3) {
    const activeNpcs = Object.values(vars.npcs ?? {}) as Array<
        RuntimeNpc & { templateNpcIndex?: number; map?: number }
    >;

    return activeNpcs.some((npc) => {
        if (Number(npc.templateNpcIndex ?? 0) !== npcTemplateId || npc.map !== user.map || !npc.pos) {
            return false;
        }

        return Math.round(Math.hypot(user.pos.x - npc.pos.x, user.pos.y - npc.pos.y)) <= maxDistance;
    });
}

function resolveFactionNpc(user: CommandCharacter): CharacterFaction {
    if (isNearNpcTemplate(user, getFactionConfig("armada")!.enlistNpcId)) {
        return "armada";
    }

    if (isNearNpcTemplate(user, getFactionConfig("caos")!.enlistNpcId)) {
        return "caos";
    }

    return "none";
}

function resolveNearbyGovernorHome(user: CommandCharacter) {
    const nearbyGovernorId = GOVERNOR_NPC_IDS.find((npcId) => isNearNpcTemplate(user, npcId));

    if (!nearbyGovernorId) {
        return null;
    }

    const home = GOVERNOR_HOME_COORDS[nearbyGovernorId];

    if (!home) {
        return null;
    }

    return {
        map: user.map,
        x: home.x,
        y: home.y,
    };
}

function resolveHomeDestination(user: CommandCharacter) {
    const homeMap = Number(user.homeMap ?? 0);
    const homeX = Number(user.homeX ?? 0);
    const homeY = Number(user.homeY ?? 0);

    if (homeMap > 0 && homeX > 0 && homeY > 0) {
        return {
            map: homeMap,
            x: homeX,
            y: homeY,
        };
    }

    return {
        map: HOME_MAP,
        x: HOME_X,
        y: HOME_Y,
    };
}

function getFactionDisplayName(faction: CharacterFaction) {
    if (faction === "armada") {
        return "Armada";
    }

    if (faction === "caos") {
        return "Caos";
    }

    return "ninguna faccion";
}

function hasOpenClient(idUser: EntityId | undefined) {
    if (typeof idUser === "undefined") {
        return false;
    }

    const client = getClient(idUser);
    return Boolean(client && socket.state(client) === client.OPEN);
}

function isSameEntityId(left: EntityId | undefined, right: EntityId | undefined) {
    if (typeof left === "undefined" || typeof right === "undefined") {
        return false;
    }

    return String(left) === String(right);
}

function getBailCost(user: CommandCharacter) {
    const citizensKilled = Number(user.ciudadanosMatados ?? 0);
    const paidBailKills = Number(user.fianza ?? 0);
    const bailKills = citizensKilled > paidBailKills ? citizensKilled : 0;

    if (bailKills > 0) {
        return bailKills * vars.multiplicadorGold * BAIL_COST_PER_CITIZEN;
    }

    return Math.floor(BAIL_COST_PER_CITIZEN / 2);
}

function getBailOffer(user: CommandCharacter) {
    const citizensKilled = Number(user.ciudadanosMatados ?? 0);
    const paidBailKills = Number(user.fianza ?? 0);
    const kills = citizensKilled > paidBailKills ? citizensKilled : 0;
    const goldRequired = getBailCost(user);

    return {
        kills,
        citizensKilled,
        fianza: paidBailKills,
        goldRequired,
        goldAvailable: user.gold,
        canPay: user.gold >= goldRequired,
    };
}

async function persistBailState(user: CommandCharacter) {
    if (!user._id || user.pvpChar) {
        return;
    }

    await game.persistCharacterPatch(user, { gold: user.gold, criminal: Boolean(user.criminal), fianza: user.fianza ?? 0 });
}

function makeCitizen(user: CommandCharacter, ws: RuntimeClient) {
    user.criminal = 0;
    user.faction = "none";
    user.color = user.privileges === 1 || user.privileges === 2 ? "#419900" : "#3333ff";
    user.seguroActivado = true;

    const leavePartyResult = game.leaveParty(user.id);

    handleProtocol.sendMyCharacter(user as any);
    socket.send(ws);

    if (leavePartyResult.ok) {
        handleProtocol.console(
            "Abandonaste la party porque los ciudadanos no pueden mezclarse con criminales.",
            "white",
            0,
            0,
            ws,
        );
    }

    game.loopArea(ws, (target: RuntimeCharacter | RuntimeNpc) => {
        if (!target.isNpc) {
            handleProtocol.actColorName(user.id, user.color, getClient(target.id));
        }
    });
}

function isInSafeZone(user: RuntimeCharacter | undefined) {
    if (!user) {
        return false;
    }

    return safeZone.isSafeZonePosition(user.map, user.pos);
}

function hasAdminPrivileges(user: CommandCharacter) {
    return user.privileges === 1;
}

function hasStaffPrivileges(user: CommandCharacter) {
    return user.privileges === 1 || user.privileges === 2;
}

function isJailed(user: CommandCharacter | undefined) {
    return Number(user?.jailMinutes ?? 0) > 0;
}

function normalizeCharacterName(name?: string) {
    return name?.trim().toLocaleLowerCase("es-AR") ?? "";
}

function matchesCharacterName(left?: string, right?: string) {
    const normalizedLeft = normalizeCharacterName(left);
    const normalizedRight = normalizeCharacterName(right);

    return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function findOnlineCharacterByName(name?: string) {
    for (const idUser in vars.personajes as RuntimeCharacters) {
        const target = (vars.personajes as RuntimeCharacters)[idUser] as CommandCharacter | undefined;

        if (
            matchesCharacterName(target?.nameCharacter, name) &&
            target?.connected &&
            !target?.cerrado &&
            hasOpenClient(target.id)
        ) {
            return target;
        }
    }
}

function getOnlineCharacters() {
    return Object.values(vars.personajes as RuntimeCharacters).filter((target): target is CommandCharacter =>
        Boolean(target?.connected && !target?.cerrado && hasOpenClient(target.id)),
    );
}

function sendChatToTargets(
    targets: CommandCharacter[],
    message: string,
    channel: ChatChannel,
    color = "#E5E7EB",
    senderName?: string,
) {
    const delivered = new Set<string>();

    targets.forEach((target) => {
        const targetClient = getClient(target.id);

        if (!targetClient || socket.state(targetClient) !== targetClient.OPEN) {
            return;
        }

        const deliveryKey = String(target.id);

        if (delivered.has(deliveryKey)) {
            return;
        }

        delivered.add(deliveryKey);
        handleProtocol.console(message, color, 0, 0, targetClient, channel, senderName);
    });
}

function showChatBubbleToVisibleTargets(
    sender: CommandCharacter,
    targets: CommandCharacter[],
    message: string,
    color: string,
) {
    const senderClient = getClient(sender.id);

    if (!senderClient) {
        return;
    }

    const eligibleIds = new Set(targets.map((target) => String(target.id)));
    const delivered = new Set<string>();

    game.loopArea(senderClient, (target: RuntimeCharacter | RuntimeNpc) => {
        if (target.isNpc) {
            return;
        }

        const targetId = String(target.id);

        if (!eligibleIds.has(targetId) || delivered.has(targetId)) {
            return;
        }

        const targetClient = getClient(target.id);

        if (!targetClient || socket.state(targetClient) !== targetClient.OPEN) {
            return;
        }

        delivered.add(targetId);
        handleProtocol.dialog(sender.id, message, sender.nameCharacter, color, 0, targetClient);
    });
}

function handleGlobalChat(user: CommandCharacter, messageText: string) {
    const message = messageText.trim();

    if (!message) {
        return "Uso: /global mensaje";
    }

    const onlineCharacters = getOnlineCharacters();

    sendChatToTargets(onlineCharacters, `[Global] ${user.nameCharacter}: ${message}`, "global", "#93C5FD");
    chatAuditLogger.logChat({
        channel: "global",
        sender: user,
        message,
        recipientsCount: onlineCharacters.length,
    });

    return null;
}

function clearPendingServerRestartWarnings() {
    pendingServerRestartWarningTimeouts.forEach((timeoutId) => {
        clearTimeout(timeoutId);
    });
    pendingServerRestartWarningTimeouts.clear();
}

function scheduleServerRestartWarning(delayMs: number, secondsRemaining: number) {
    const timeoutId = setTimeout(() => {
        pendingServerRestartWarningTimeouts.delete(timeoutId);
        handleProtocol.consoleToAll(
            `[Servidor] Reinicio del servidor en ${secondsRemaining} segundo${secondsRemaining === 1 ? "" : "s"}.`,
            SERVER_RESTART_WARNING_COLOR,
            1,
            0,
        );
    }, delayMs);

    pendingServerRestartWarningTimeouts.add(timeoutId);
}

function startServerRestartWarningSequence() {
    clearPendingServerRestartWarnings();

    handleProtocol.consoleToAll("[Servidor] Reinicio del servidor en 1 minuto.", SERVER_RESTART_WARNING_COLOR, 1, 0);

    for (let secondsRemaining = 15; secondsRemaining >= 1; secondsRemaining -= 1) {
        scheduleServerRestartWarning((60 - secondsRemaining) * 1000, secondsRemaining);
    }

    const worldSaveTimeoutId = setTimeout(() => {
        pendingServerRestartWarningTimeouts.delete(worldSaveTimeoutId);
        runWorldSave();
    }, 60000);

    pendingServerRestartWarningTimeouts.add(worldSaveTimeoutId);
}

function runWorldSave(targetClient?: CommandClient) {
    handleProtocol.consoleToAll("[Servidor] Guardando personajes.", "#E69500", 0, 0);
    game.worldSave((result) => {
        console.log("[COMMAND] WorldSave");

        if (!targetClient) {
            return;
        }

        handleProtocol.console(
            result.ok
                ? `[INFO] Worldsave completado: ${result.savedCharacters} personajes en ${result.durationMs}ms.`
                : `[INFO] Worldsave fallido: ${result.savedCharacters} personajes guardados en ${result.durationMs}ms.`,
            result.ok ? "#E69500" : "red",
            0,
            0,
            targetClient,
        );
    });
}

function handlePartyChat(user: CommandCharacter, messageText: string) {
    const message = messageText.trim();

    if (!message) {
        return "Uso: /p mensaje";
    }

    if (!user.partyId) {
        return "No estás en una party.";
    }

    const partyMembers = getOnlineCharacters().filter((target) => target.partyId && target.partyId === user.partyId);

    if (partyMembers.length === 0) {
        return "No hay miembros online en tu party.";
    }

    sendChatToTargets(partyMembers, `[Party] ${user.nameCharacter}: ${message}`, "party", "#86EFAC");
    showChatBubbleToVisibleTargets(user, partyMembers, message, "#86EFAC");
    chatAuditLogger.logChat({
        channel: "party",
        sender: user,
        message,
        groupId: String(user.partyId),
        recipientsCount: partyMembers.length,
    });

    return null;
}

function handleClanChat(user: CommandCharacter, messageText: string) {
    const message = messageText.trim();

    if (!message) {
        return "Uso: /c mensaje";
    }

    if (!user.clanId) {
        return "No estás en un clan.";
    }

    const clanMembers = getOnlineCharacters().filter(
        (target) => target.clanId && String(target.clanId) === String(user.clanId),
    );

    if (clanMembers.length === 0) {
        return "No hay miembros online en tu clan.";
    }

    sendChatToTargets(clanMembers, `[Clan] ${user.nameCharacter}: ${message}`, "clan", "#C4B5FD");
    showChatBubbleToVisibleTargets(user, clanMembers, message, "#C4B5FD");
    chatAuditLogger.logChat({
        channel: "clan",
        sender: user,
        message,
        groupId: String(user.clanId),
        recipientsCount: clanMembers.length,
    });

    return null;
}

function resolveWhisperTarget(rawText: string): { target: CommandCharacter; message: string } | null {
    const trimmedText = rawText.trim();

    if (!trimmedText) {
        return null;
    }

    const quotedMatch = trimmedText.match(/^"(.+?)"\s+(.+)$/);

    if (quotedMatch) {
        const targetName = quotedMatch[1]?.trim();
        const message = quotedMatch[2]?.trim();

        if (!targetName || !message) {
            return null;
        }

        const target = findOnlineCharacterByName(targetName);

        if (!target) {
            return null;
        }

        return { target, message };
    }

    let bestMatch: { target: CommandCharacter; message: string } | null = null;

    getOnlineCharacters().forEach((target) => {
        const targetName = target.nameCharacter?.trim();

        if (!targetName) {
            return;
        }

        if (!trimmedText.toLocaleLowerCase("es-AR").startsWith(targetName.toLocaleLowerCase("es-AR"))) {
            return;
        }

        const remainder = trimmedText.slice(targetName.length).trim();

        if (!remainder) {
            return;
        }

        if (!bestMatch || targetName.length > bestMatch.target.nameCharacter.length) {
            bestMatch = {
                target,
                message: remainder,
            };
        }
    });

    return bestMatch;
}

function handleWhisperChat(user: CommandCharacter, rawText: string) {
    const trimmedText = rawText.trim();

    if (!trimmedText) {
        return 'Uso: /w "usuario" mensaje';
    }

    const whisper = resolveWhisperTarget(trimmedText);

    if (!whisper) {
        return 'Uso: /w "usuario" mensaje';
    }

    const { target, message } = whisper;

    if (isSameEntityId(target.id, user.id)) {
        return "No puedes enviarte un mensaje privado a ti mismo.";
    }

    sendChatToTargets(
        [user],
        `[Privado] ${target.nameCharacter}: ${message}`,
        "whisper",
        "#F9A8D4",
        user.nameCharacter,
    );
    sendChatToTargets(
        [target],
        `[Privado] ${user.nameCharacter}: ${message}`,
        "whisper",
        "#F9A8D4",
        user.nameCharacter,
    );
    showChatBubbleToVisibleTargets(user, [user, target], message, "#F9A8D4");
    chatAuditLogger.logChat({
        channel: "private",
        sender: user,
        recipient: target,
        message,
        recipientsCount: 2,
    });

    return null;
}

function splitClanCommandArgs(rawText: string) {
    return rawText
        .split("|")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}

function findOnlineCharacterByPersistedId(characterId?: string | null) {
    if (!characterId) {
        return;
    }

    for (const idUser in vars.personajes as RuntimeCharacters) {
        const target = (vars.personajes as RuntimeCharacters)[idUser] as CommandCharacter | undefined;

        if (target?._id && String(target._id) === String(characterId) && target.connected && !target.cerrado) {
            return target;
        }
    }
}

async function fetchClanSummaryForCharacter(characterId: string) {
    return (await funct.fetchUrl(`/internal/clans/character/${encodeURIComponent(characterId)}/summary`, {
        method: "GET",
        headers: {
            Authorization: vars.tokenAuth,
        },
    })) as ClanCharacterSummary;
}

async function refreshOnlineCharacterClanStateByPersistedId(characterId?: string | null) {
    const onlineCharacter = findOnlineCharacterByPersistedId(characterId);

    if (!onlineCharacter?._id) {
        return;
    }

    const previousClanId = onlineCharacter.clanId;
    const summary = await fetchClanSummaryForCharacter(onlineCharacter._id);
    const client = getClient(onlineCharacter.id);

    onlineCharacter.clanId = summary.clanId;
    onlineCharacter.clanAlignment = summary.clanAlignment;
    onlineCharacter.clanMinJoinLevel = summary.clanMinJoinLevel;
    onlineCharacter.clanRole = summary.clanRole;
    onlineCharacter.seguroClanActivado = Boolean(summary.clanId);

    if (onlineCharacter.privileges === 1 || onlineCharacter.privileges === 2) {
        onlineCharacter.clan = "<AOWeb Staff>";
    } else {
        onlineCharacter.clan = summary.clanTag ?? "";
    }

    game.refreshRelationshipIndexesForMember(onlineCharacter.id, onlineCharacter.partyId, previousClanId);

    if (!client || socket.state(client) !== client.OPEN) {
        game.syncClanState(previousClanId);
        game.syncClanStateForMember(onlineCharacter.id);
        return;
    }

    handleProtocol.sendMyCharacter(onlineCharacter as any);
    socket.send(client);
    game.setNewAreas(client);
    game.syncClanState(previousClanId);
    game.syncClanStateForMember(onlineCharacter.id);
}

async function refreshOnlineCharacterClanStateByPersistedIds(characterIds: Array<string | null | undefined>) {
    for (const characterId of new Set(characterIds.filter(Boolean) as string[])) {
        await refreshOnlineCharacterClanStateByPersistedId(characterId);
    }
}

function resetInstanceMapNpcs(mapNum: number) {
    const resetOk = mapInstanceManager.resetMapNpcs(mapNum);

    if (!resetOk) {
        return false;
    }

    for (const idUser in vars.personajes as RuntimeCharacters) {
        const target = (vars.personajes as RuntimeCharacters)[idUser];
        if (target?.map === mapNum && target.connected && !target.cerrado) {
            game.syncUserNpcVisibility(target.id);
        }
    }

    return true;
}

function getPermanentBanDate() {
    return new Date(PERMANENT_BAN_UNTIL);
}

function parseBanUntil(rawDuration?: string) {
    const duration = rawDuration?.trim();

    if (!duration) {
        return getPermanentBanDate();
    }

    const now = Date.now();
    const numericDuration = Number(duration);

    if (Number.isFinite(numericDuration) && numericDuration > 0) {
        return new Date(now + numericDuration * 60 * 1000);
    }

    const durationMatch = duration.match(/^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i);

    if (durationMatch) {
        const amount = Number(durationMatch[1]);
        const unit = durationMatch[2].toLowerCase();
        let multiplier = 60 * 1000;

        if (unit.startsWith("h")) {
            multiplier = 60 * 60 * 1000;
        } else if (unit.startsWith("d")) {
            multiplier = 24 * 60 * 60 * 1000;
        }

        return new Date(now + amount * multiplier);
    }

    const parsedDate = new Date(duration);

    if (Number.isNaN(parsedDate.getTime()) || parsedDate.getTime() <= now) {
        return null;
    }

    return parsedDate;
}

function formatBanUntil(rawDate: string | Date) {
    const date = rawDate instanceof Date ? rawDate : new Date(rawDate);

    if (Number.isNaN(date.getTime())) {
        return "una fecha invalida";
    }

    if (date.getUTCFullYear() >= 9999) {
        return "de forma permanente";
    }

    return `hasta ${date.toLocaleString("es-AR")}`;
}

function findOnlineCharactersByIp(ip?: string) {
    const normalizedIp = ip?.trim();
    const matches: Array<{ id: EntityId; user: CommandCharacter }> = [];

    if (!normalizedIp) {
        return matches;
    }

    for (const idUser in vars.personajes as RuntimeCharacters) {
        const user = (vars.personajes as RuntimeCharacters)[idUser] as CommandCharacter | undefined;
        const client = (vars.clients as RuntimeClients)[idUser] as RuntimeClient | undefined;

        if (!user || !client) {
            continue;
        }

        if (socket.getIp(client) === normalizedIp) {
            matches.push({
                id: idUser as EntityId,
                user,
            });
        }
    }

    return matches;
}

async function disconnectCharacterWithMessage(targetId: EntityId, message: string) {
    const targetClient = getClient(targetId);

    if (targetClient && socket.state(targetClient) === targetClient.OPEN) {
        handleProtocol.error(message, targetClient);
        return;
    }

    await game.closeForce(targetId);
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

function isVisibleToPartyViewer(viewerId: EntityId, character: RuntimeCharacter | undefined) {
    const viewer = (vars.personajes as RuntimeCharacters)[viewerId] as RuntimeCharacter | undefined;

    return Boolean(viewer && character && viewer.partyId && character.partyId && viewer.partyId === character.partyId);
}

function canRenderCharacter(viewerId: EntityId, character: RuntimeCharacter | undefined) {
    if (!character) {
        return false;
    }

    if (character.id === viewerId || isVisibleToPartyViewer(viewerId, character)) {
        return true;
    }

    return !isInvisibleAdmin(character);
}

function canNpcDetectCharacter(user: RuntimeCharacter | undefined) {
    return Boolean(user && !user.dead && !isInvisibleAdmin(user) && !isSpellInvisible(user) && !isHiddenBySkill(user));
}

function syncAdminVisibility(user: CommandCharacter, ws: RuntimeClient) {
    game.loopArea(ws, (target: RuntimeCharacter | RuntimeNpc) => {
        if (target.isNpc || target.id === user.id) {
            return;
        }

        const targetClient = getClient(target.id);

        if (!targetClient) {
            return;
        }

        if (!canRenderCharacter(target.id, user)) {
            handleProtocol.deleteCharacter(user.id, targetClient);
            return;
        }

        handleProtocol.sendCharacter(user as any, target.id);
        socket.send(targetClient);
    });
}

function getLeftNpcSpawnPosition(user: CommandCharacter, aguaValida: boolean, tierraInvalida = false) {
    const pos = {
        x: user.pos.x - 1,
        y: user.pos.y,
    };

    if (game.validPosRespawnNpc(pos, user.map, aguaValida, tierraInvalida)) {
        return pos;
    }

    return null;
}

type AdminSummonedBotCharacter = CommandCharacter & {
    adminSummonedBot: true;
    adminSummonedBotOwnerId?: EntityId;
};

function normalizeBotClassInput(value: string) {
    return normalizeClassInput(value);
}

function listAvailableAdminBotClasses() {
    return (Array.isArray(vars.charactersPvP) ? vars.charactersPvP : [])
        .map((template: { name?: string }) => String(template?.name ?? "").trim())
        .filter(Boolean)
        .join(", ");
}

function resolveAdminBotTemplateIndex(classInput: string) {
    const normalizedInput = normalizeBotClassInput(classInput);

    if (!normalizedInput) {
        return -1;
    }

    if (/^\d+$/.test(normalizedInput)) {
        const numericIndex = Number.parseInt(normalizedInput, 10);
        return vars.charactersPvP?.[numericIndex] ? numericIndex : -1;
    }

    return (Array.isArray(vars.charactersPvP) ? vars.charactersPvP : []).findIndex(
        (template: { name?: string }) => normalizeBotClassInput(String(template?.name ?? "")) === normalizedInput,
    );
}

function getLeftCharacterSpawnPosition(user: CommandCharacter) {
    const pos = {
        x: user.pos.x - 1,
        y: user.pos.y,
    };

    if (game.validPosRespawn(pos, user.map, false)) {
        return pos;
    }

    return null;
}

function createInternalBotClient(sourceClient: RuntimeClient): CommandClient {
    const OPEN = 1;
    const CLOSED = 3;
    const clientIp = socket.getIp(sourceClient);
    const internalClient = {
        id: 0,
        OPEN,
        readyState: OPEN,
        bot: true,
        clientIp,
        on: () => undefined,
        send: () => undefined,
        close: () => undefined,
        _socket: {
            remoteAddress: clientIp,
        },
    } as unknown as CommandClient;

    internalClient.close = () => {
        internalClient.readyState = CLOSED;
    };

    return internalClient;
}

function getAdminSummonedBots(ownerId?: EntityId) {
    return Object.values(vars.personajes as RuntimeCharacters).filter((target): target is AdminSummonedBotCharacter => {
        if (!target?.adminSummonedBot || !target.connected || target.cerrado || !hasOpenClient(target.id)) {
            return false;
        }

        if (typeof ownerId === "undefined") {
            return true;
        }

        return isSameEntityId(target.adminSummonedBotOwnerId, ownerId);
    });
}

function removeAdminSummonedBot(bot: AdminSummonedBotCharacter) {
    const tile = vars.mapData[bot.map]?.[bot.pos.y]?.[bot.pos.x];

    if (tile?.id === bot.id) {
        tile.id = 0;
    }

    getOnlineCharacters()
        .filter((target) => target.map === bot.map && !isSameEntityId(target.id, bot.id))
        .forEach((target) => {
            const targetClient = getClient(target.id);

            if (!targetClient) {
                return;
            }

            handleProtocol.deleteCharacter(bot.id, targetClient);
        });

    const botClient = getClient(bot.id);

    if (botClient) {
        botClient.close();
    }

    delete (vars.clients as RuntimeClients)[String(bot.id)];
    delete (vars.personajes as RuntimeCharacters)[String(bot.id)];
}

function removeAdminSummonedBotsForOwner(ownerId: EntityId) {
    const bots = getAdminSummonedBots(ownerId);

    bots.forEach((bot) => {
        removeAdminSummonedBot(bot);
    });

    return bots.length;
}

async function spawnAdminSummonedBot(idUser: EntityId, classInput: string, level: number, ws: RuntimeClient) {
    const user = getCharacter(idUser);
    const templateIndex = resolveAdminBotTemplateIndex(classInput);

    if (!user || templateIndex < 0) {
        handleProtocol.console(
            `[INFO] Clase invalida. Disponibles: ${listAvailableAdminBotClasses()}.`,
            "#E69500",
            0,
            0,
            ws as CommandClient,
        );
        return;
    }

    const spawnPos = getLeftCharacterSpawnPosition(user);

    if (!spawnPos) {
        handleProtocol.console(
            "[INFO] La casilla a tu izquierda no es valida o no esta libre para invocar un bot.",
            "#E69500",
            0,
            0,
            ws as CommandClient,
        );
        return;
    }

    const targetLevel = Math.max(1, Math.min(Number(balance.MAX_LEVEL ?? 50), Math.floor(level)));
    const template = vars.charactersPvP[templateIndex];
    const currentBotCount = getAdminSummonedBots(idUser).length;
    const botClient = createInternalBotClient(ws);
    const botName = formatAdminBotName(template.name, targetLevel, currentBotCount + 1);

    try {
        await login.connectCharacterPvP(
            botClient,
            botName,
            `admin-bot:${String(idUser)}:${Date.now()}`,
            templateIndex,
            undefined,
            undefined,
            {
                spawn: {
                    mapId: user.map,
                    x: spawnPos.x,
                    y: spawnPos.y,
                },
                adminSummonedBot: {
                    ownerId: idUser,
                    level: targetLevel,
                },
                pvpChar: false,
            },
        );
    } catch (error) {
        handleProtocol.console(
            `[INFO] No se pudo invocar el bot: ${error instanceof Error ? error.message : "error desconocido"}.`,
            "red",
            0,
            0,
            ws as CommandClient,
        );
        return;
    }

    const bot = getCharacter(botClient.id);

    handleProtocol.console(
        `[INFO] Invocaste a ${bot?.nameCharacter ?? botName} (ID ${String(bot?.id ?? botClient.id)}) en ${user.map}@${spawnPos.x},${spawnPos.y}.`,
        "#86efac",
        0,
        0,
        ws as CommandClient,
    );
}

function listAvailableClassNames() {
    return Object.values(vars.nameClases ?? {})
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join(", ");
}

function resolveClassIdInput(classInput: string) {
    const normalizedInput = normalizeBotClassInput(classInput);

    if (!normalizedInput) {
        return 0;
    }

    if (/^\d+$/.test(normalizedInput)) {
        const numericClassId = Number.parseInt(normalizedInput, 10);
        return vars.nameClases?.[numericClassId] ? numericClassId : 0;
    }

    for (const [classId, className] of Object.entries(vars.nameClases ?? {})) {
        if (normalizeBotClassInput(String(className ?? "")) === normalizedInput) {
            return Number.parseInt(classId, 10);
        }
    }

    for (const [className, classId] of Object.entries(vars.clases ?? {})) {
        if (normalizeBotClassInput(className) === normalizedInput) {
            return Number(classId);
        }
    }

    return 0;
}

function refreshVisibleCharacterSnapshot(user: CommandCharacter) {
    getOnlineCharacters()
        .filter((target) => target.map === user.map && !isSameEntityId(target.id, user.id))
        .forEach((target) => {
            const targetClient = getClient(target.id);

            if (!targetClient) {
                return;
            }

            handleProtocol.sendCharacter(user as any, target.id);
            socket.send(targetClient);
        });
}

function itemBlockedForClass(user: CommandCharacter, classId: number, itemId: number) {
    const obj = vars.datObj[itemId];

    if (!obj) {
        return false;
    }

    if (Array.isArray(obj.clasesNoPermitidas) && obj.clasesNoPermitidas.includes(classId)) {
        return true;
    }

    const isDwarfRace = user.idRaza === vars.razas.gnomo || user.idRaza === vars.razas.enano;

    if (obj.objType === vars.objType.armaduras) {
        if (obj.razaEnana && !isDwarfRace) {
            return true;
        }

        if (!obj.razaEnana && isDwarfRace) {
            return true;
        }
    }

    return false;
}

function resetCharacterClassState(user: CommandCharacter, classId: number) {
    const raceId = Number(user.idRaza ?? 0);
    const raceBalance = raceId > 0 ? vars.balanceRazas?.[raceId] : null;
    const baseAttrFuerza = raceBalance ? 18 + Number(raceBalance.fuerza ?? 0) : Number(user.attrFuerza ?? 18);
    const baseAttrAgilidad = raceBalance ? 18 + Number(raceBalance.agilidad ?? 0) : Number(user.attrAgilidad ?? 18);
    const baseAttrInteligencia = raceBalance
        ? 18 + Number(raceBalance.inteligencia ?? 0)
        : Number(user.attrInteligencia ?? 18);
    const baseAttrConstitucion = raceBalance
        ? 18 + Number(raceBalance.constitucion ?? 0)
        : Number(user.attrConstitucion ?? 18);
    const level = balance.clampLevel(Number(user.level ?? 1));

    user.idClase = classId;
    user.level = level;
    user.expNextLevel = balance.getLegacyExpNextLevelForLevel(level);
    user.attrFuerza = baseAttrFuerza;
    user.attrAgilidad = baseAttrAgilidad;
    user.attrInteligencia = baseAttrInteligencia;
    user.attrConstitucion = baseAttrConstitucion;
    user.bkAttrFuerza = baseAttrFuerza;
    user.bkAttrAgilidad = baseAttrAgilidad;
    user.cooldownFuerza = 0;
    user.cooldownAgilidad = 0;
    user.cooldownInvisibleSpell = 0;
    user.invisibleSpell = false;
    user.hiddenSkill = false;
    user.hiddenSkillStartedAt = 0;
    user.hiddenSkillExpiresAt = 0;
    user.hiddenSkillCooldownUntil = 0;
    user.meditar = false;
    user.maxHp = balance.getMaxHpForLevel(classId, baseAttrConstitucion, level);
    user.maxMana = balance.getMaxManaForLevel(classId, baseAttrInteligencia, level);
    user.minHit = balance.getMinHitForLevel(classId, level);
    user.maxHit = balance.getMaxHitForLevel(classId, level);
    user.hp = user.dead ? 0 : user.maxHp;
    user.mana = user.dead ? 0 : user.maxMana;

    if (user.adminSummonedBot) {
        user.attrFuerza = baseAttrFuerza * 2;
        user.attrAgilidad = baseAttrAgilidad * 2;
        user.cooldownFuerza = Date.now();
        user.cooldownAgilidad = Date.now();
    }

    user.nextMeleeAt = 0;
    user.nextSpellAt = 0;
    user.nextSpellAfterMeleeAt = 0;
    user.nextMeleeAfterSpellAt = 0;
    user.nextUseItemAt = 0;
    user.nextUseItemAfterMeleeAt = 0;
}

function rebuildCharacterEquipmentState(user: CommandCharacter) {
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

    for (const [idPos, item] of Object.entries(user.inv ?? {})) {
        if (!item?.equipped) {
            continue;
        }

        const obj = vars.datObj[item.idItem];

        if (!obj) {
            continue;
        }

        if (obj.objType === vars.objType.armaduras) {
            if (!user.navegando) {
                user.idBody = obj.anim;
            }
            user.idItemBody = idPos;
            continue;
        }

        if (obj.objType === vars.objType.armas) {
            if (!user.navegando) {
                user.idWeapon = obj.anim;
            }
            user.idItemWeapon = idPos;
            continue;
        }

        if (obj.objType === vars.objType.anillos) {
            user.idItemRing = idPos;
            continue;
        }

        if (obj.objType === vars.objType.escudos) {
            if (!user.navegando) {
                user.idShield = obj.anim;
            }
            user.idItemShield = idPos;
            continue;
        }

        if (obj.objType === vars.objType.cascos) {
            if (!user.navegando) {
                user.idHelmet = obj.anim;
            }
            user.idItemHelmet = idPos;
            continue;
        }

        if (obj.objType === vars.objType.flechas) {
            user.idItemArrow = idPos;
        }
    }
}

function normalizeEquippedItemsForCurrentClass(user: CommandCharacter) {
    let changed = false;
    const currentClassId = Number(user.idClase ?? 0);

    for (const item of Object.values(user.inv ?? {})) {
        if (!item?.equipped) {
            continue;
        }

        if (!itemBlockedForClass(user, currentClassId, item.idItem)) {
            continue;
        }

        item.equipped = 0;
        changed = true;
    }

    return changed;
}

async function changeCharacterClassByAdmin(target: CommandCharacter, classInput: string, ws: RuntimeClient) {
    const classId = resolveClassIdInput(classInput);

    if (!classId) {
        handleProtocol.console(
            `[INFO] Clase invalida. Disponibles: ${listAvailableClassNames()}.`,
            "#E69500",
            0,
            0,
            ws as CommandClient,
        );
        return;
    }

    resetCharacterClassState(target, classId);
    normalizeEquippedItemsForCurrentClass(target);
    rebuildCharacterEquipmentState(target);

    const targetClient = getClient(target.id);

    if (targetClient && socket.state(targetClient) === targetClient.OPEN) {
        handleProtocol.sendMyCharacter(target as any);
        socket.send(targetClient);
    }

    refreshVisibleCharacterSnapshot(target);
    game.syncUserNpcVisibility(target.id);

    try {
        await game.persistCharacterSnapshot(target, { connected: true });
    } catch (error) {
        handleProtocol.console(
            `[INFO] La clase se cambio pero no se pudo persistir: ${error instanceof Error ? error.message : "error desconocido"}.`,
            "red",
            0,
            0,
            ws as CommandClient,
        );
    }

    const className = vars.nameClases?.[classId] ?? `Clase ${classId}`;
    handleProtocol.console(
        `[INFO] ${target.nameCharacter} ahora es ${className}.`,
        "#86efac",
        0,
        0,
        ws as CommandClient,
    );

    if (targetClient && socket.state(targetClient) === targetClient.OPEN) {
        handleProtocol.console(`[INFO] Tu clase fue cambiada a ${className}.`, "#86efac", 0, 0, targetClient);
    }
}

function persistNpcInMapEntry(entry: { mapNum: number; x: number; y: number; npcIndex: number; movement?: number }) {
    appendMapNpcPlacement(entry);
    npcsInMap.push(entry);
}

function replacePersistedNpcsInMapEntries(
    entries: Array<{ mapNum: number; x: number; y: number; npcIndex: number; movement?: number }>,
) {
    replaceAllMapNpcPlacements(entries);
    npcsInMap.length = 0;
    npcsInMap.push(...entries);
}

function removeNpcByAdmin(idNpc: EntityId, ws: RuntimeClient, removeFromPersistedMap = false) {
    const npc = (vars.npcs as Record<string, RuntimeNpc>)[String(idNpc)] as
        | (RuntimeNpc & {
              summonedByUserId?: EntityId;
              templateNpcIndex?: number;
              spawnMapNum?: number;
              spawnOrigin?: { x: number; y: number };
              nameCharacter?: string;
          })
        | undefined;

    if (!npc?.isNpc) {
        handleProtocol.console(`[INFO] No existe un NPC activo con ID ${idNpc}.`, "#E69500", 0, 0, ws as CommandClient);
        return;
    }

    if (npc.summonedByUserId) {
        handleProtocol.console(
            "[INFO] No puedes quitar invocaciones temporales de usuarios con esta accion.",
            "#E69500",
            0,
            0,
            ws as CommandClient,
        );
        return;
    }

    const npcMap = Number(npc.map);
    const npcX = Number(npc.pos.x);
    const npcY = Number(npc.pos.y);
    const spawnMapNum = Number(npc.spawnMapNum ?? npc.map);
    const spawnX = Number(npc.spawnOrigin?.x ?? npc.pos.x);
    const spawnY = Number(npc.spawnOrigin?.y ?? npc.pos.y);
    const templateNpcIndex = Number(npc.templateNpcIndex ?? 0);
    const tile = vars.mapData[npcMap]?.[npcY]?.[npcX];
    const persistedEntryIndex = removeFromPersistedMap
        ? npcsInMap.findIndex(
              (entry) =>
                  entry.mapNum === spawnMapNum &&
                  Number(entry.x) === spawnX &&
                  Number(entry.y) === spawnY &&
                  Number(entry.npcIndex) === templateNpcIndex,
          )
        : -1;
    const wasPersisted = persistedEntryIndex >= 0;

    if (removeFromPersistedMap && templateNpcIndex <= 0) {
        handleProtocol.console(
            `[INFO] ${npc.nameCharacter ?? `NPC ${idNpc}`} no tiene template valido para quitarlo permanentemente.`,
            "#E69500",
            0,
            0,
            ws as CommandClient,
        );
        return;
    }

    if (removeFromPersistedMap && !wasPersisted) {
        handleProtocol.console(
            `[INFO] No se encontro a ${npc.nameCharacter ?? `NPC ${idNpc}`} en los NPCs persistidos del mapa usando su spawn original (${spawnMapNum}, ${spawnX}, ${spawnY}).`,
            "#E69500",
            0,
            0,
            ws as CommandClient,
        );
        return;
    }

    if (wasPersisted) {
        const nextEntries = npcsInMap.filter((_, index) => index !== persistedEntryIndex);
        try {
            replacePersistedNpcsInMapEntries(nextEntries);
            if (vars.mapa[spawnMapNum]?.[spawnY]?.[spawnX]) {
                vars.mapa[spawnMapNum][spawnY][spawnX].npcIndex = 0;
            }
        } catch (error) {
            handleProtocol.console(
                `[INFO] No se pudo actualizar los NPCs persistidos del mapa: ${error instanceof Error ? error.message : "error desconocido"}.`,
                "red",
                0,
                0,
                ws as CommandClient,
            );
            return;
        }
    }

    if (tile?.id === npc.id) {
        tile.id = 0;
    }

    getOnlineCharacters()
        .filter((target) => target.map === npcMap)
        .forEach((target) => {
            if (isSameEntityId(target.summonTargetNpcId, npc.id)) {
                game.clearSummonTargetNpc(target.id);
            }

            const targetClient = getClient(target.id);

            if (!targetClient) {
                return;
            }

            handleProtocol.deleteCharacter(npc.id, targetClient);
        });

    vars.areaNpc[String(npc.id)] = [];
    delete vars.areaNpc[String(npc.id)];
    delete (vars.npcs as Record<string, RuntimeNpc>)[String(npc.id)];

    handleProtocol.console(
        wasPersisted
            ? `[INFO] Quitaste a ${npc.nameCharacter ?? `NPC ${idNpc}`} (ID ${idNpc}) del mapa y de su archivo del mapa.`
            : `[INFO] Quitaste a ${npc.nameCharacter ?? `NPC ${idNpc}`} (ID ${idNpc}) del mapa.`,
        "#E69500",
        0,
        0,
        ws as CommandClient,
    );
}

function spawnNpcNextToAdmin(
    idUser: EntityId,
    idNpc: number,
    ws: RuntimeClient,
    persist = false,
    persistMovement = false,
) {
    const user = getCharacter(idUser);
    const datNpc = vars.datNpc[idNpc];

    if (!datNpc) {
        handleProtocol.console(`[INFO] No existe un NPC con ID ${idNpc}.`, "#E69500", 0, 0, ws as CommandClient);
        return;
    }

    const spawnPos = getLeftNpcSpawnPosition(user, Boolean(datNpc.aguaValida), Boolean(datNpc.tierraInvalida));

    if (!spawnPos) {
        handleProtocol.console(
            "[INFO] La casilla a tu izquierda no es valida o no esta libre para invocar ese NPC.",
            "#E69500",
            0,
            0,
            ws as CommandClient,
        );
        return;
    }

    if (
        persist &&
        loadMapNpcPlacements(user.map).some(
            (entry) => entry.mapNum === user.map && Number(entry.x) === spawnPos.x && Number(entry.y) === spawnPos.y,
        )
    ) {
        handleProtocol.console(
            "[INFO] Ya existe un NPC persistente guardado en esa posicion del mapa.",
            "#E69500",
            0,
            0,
            ws as CommandClient,
        );
        return;
    }

    const npc = _.cloneDeep(npcs.createNpc());

    npc.id = login.createId();
    npc.templateNpcIndex = idNpc;
    npc.map = user.map;
    npc.pos.x = spawnPos.x;
    npc.pos.y = spawnPos.y;
    npc.nameCharacter = datNpc.name;
    npc.color = "white";
    npc.isNpc = true;
    npc.idBody = datNpc.idBody;
    npc.idHead = datNpc.idHead;
    npc.movement = persist ? (persistMovement ? datNpc.movement : 0) : datNpc.movement;
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
    npc.aguaValida = datNpc.aguaValida ?? 0;
    npc.tierraInvalida = datNpc.tierraInvalida ?? 0;
    npc.heading = user.heading;

    if (datNpc.drop) npc.drop = datNpc.drop;
    if (datNpc.objs) npc.objs = datNpc.objs;
    if (datNpc.desc) npc.desc = datNpc.desc;

    const clan = vars.clanNpc[npc.npcType];

    if (clan) {
        npc.clan = clan;
    }

    vars.npcs[npc.id] = npc;
    vars.npcs[npc.id].cooldownAtaque = Date.now() + 4000;
    vars.npcs[npc.id].nextThinkAt = Date.now() + vars.timing.npcThinkMs;
    vars.areaNpc[npc.id] = [];
    vars.mapData[user.map][spawnPos.y][spawnPos.x].id = npc.id;

    if (persist) {
        try {
            vars.mapa[user.map][spawnPos.y][spawnPos.x].npcIndex = idNpc;
            persistNpcInMapEntry({
                mapNum: user.map,
                x: spawnPos.x,
                y: spawnPos.y,
                npcIndex: idNpc,
                movement: persistMovement ? datNpc.movement : 0,
            });
        } catch (error) {
            delete vars.npcs[npc.id];
            delete vars.areaNpc[npc.id];
            vars.mapData[user.map][spawnPos.y][spawnPos.x].id = 0;
            vars.mapa[user.map][spawnPos.y][spawnPos.x].npcIndex = 0;
            handleProtocol.console(
                `[INFO] No se pudo guardar el NPC persistente: ${error instanceof Error ? error.message : "error desconocido"}.`,
                "red",
                0,
                0,
                ws as CommandClient,
            );
            return;
        }
    }

    npcs.loopArea(npc.id, (target: CommandCharacter) => {
        if (canNpcDetectCharacter(target) && vars.areaNpc[npc.id].indexOf(target.id) < 0) {
            vars.areaNpc[npc.id].push(target.id);
        }

        handleProtocol.sendNpc(npc);
        socket.send(vars.clients[target.id]);
    });

    handleProtocol.console(
        persist
            ? `[INFO] Invocaste y guardaste a ${npc.nameCharacter} (ID ${idNpc}) ${persistMovement ? "con movimiento" : "fijo"} en ${user.map}@${spawnPos.x}@${spawnPos.y}.`
            : `[INFO] Invocaste a ${npc.nameCharacter} (ID ${idNpc}) en ${user.map}@${spawnPos.x}@${spawnPos.y}.`,
        "#E69500",
        0,
        0,
        ws as CommandClient,
    );
}

function normalizeTimingPath(rawPath: string) {
    const trimmedPath = rawPath.trim();
    const aliasKey = trimmedPath.toLowerCase().replace(/[^a-z]/g, "");

    return TIMING_PATH_ALIASES[aliasKey] ?? trimmedPath;
}

function renderTimingEntries() {
    return runtimeTiming
        .listRuntimeTimingEntries()
        .map((entry: { path: string; value: number }) => `${entry.path}=${entry.value}ms`);
}

function sendTimingList(ws: RuntimeClient) {
    handleProtocol.console("[INFO] Intervalos configurados:", "#E69500", 0, 0, ws as CommandClient);

    for (const entry of renderTimingEntries()) {
        handleProtocol.console(`[INFO] ${entry}`, "#FFFFFF", 0, 0, ws as CommandClient);
    }
}

function average(values: number[]) {
    if (values.length === 0) {
        return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function minimum(values: number[]) {
    if (values.length === 0) {
        return 0;
    }

    return values.reduce((smallest, value) => Math.min(smallest, value), values[0]);
}

function roundTo(value: number, decimals = 1) {
    const factor = 10 ** decimals;

    return Math.round(value * factor) / factor;
}

function percentile(values: number[], percentileValue: number) {
    if (values.length === 0) {
        return 0;
    }

    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));

    return sorted[index];
}

function countIntervalsAtOrBelow(values: number[], thresholdMs: number) {
    if (values.length === 0) {
        return 0;
    }

    return values.reduce((count, value) => count + (value <= thresholdMs ? 1 : 0), 0);
}

function getPeakPacketsPerSecond(timestamps: number[]) {
    const buckets: Record<string, number> = {};

    for (const timestamp of timestamps) {
        const bucketKey = String(Math.floor(timestamp / 1000));
        buckets[bucketKey] = Number(buckets[bucketKey] ?? 0) + 1;
    }

    return Object.values(buckets).reduce((peak, count) => Math.max(peak, count), 0);
}

function getBurstSecondsOverThreshold(timestamps: number[], thresholdPps: number) {
    const buckets: Record<string, number> = {};

    for (const timestamp of timestamps) {
        const bucketKey = String(Math.floor(timestamp / 1000));
        buckets[bucketKey] = Number(buckets[bucketKey] ?? 0) + 1;
    }

    return Object.values(buckets).reduce(
        (count, packetsInSecond) => count + (packetsInSecond >= thresholdPps ? 1 : 0),
        0,
    );
}

function getPacketTypeName(packetType: string) {
    if (packetType === "move") {
        return "movimiento";
    }

    if (packetType === "melee") {
        return "golpe";
    }

    if (packetType === "range") {
        return "rango";
    }

    if (packetType === "spell") {
        return "hechizo";
    }

    if (packetType === "useItemClick") {
        return "usarItemClick";
    }

    if (packetType === "useItemU") {
        return "usarItemU";
    }

    if (packetType === "equipItem") {
        return "equipar";
    }

    if (packetType === "dropItem") {
        return "tirarItem";
    }

    if (packetType === "pickItem") {
        return "agarrarItem";
    }

    if (packetType === "buyItem") {
        return "comprar";
    }

    if (packetType === "sellItem") {
        return "vender";
    }

    if (packetType === "connect") {
        return "conexion";
    }

    if (packetType === "hiddenSkill") {
        return "hiddenSkill";
    }

    return packetType;
}

function buildPacketTypeShares(packetTypeCounts: Record<string, number>) {
    const entries = Object.entries(packetTypeCounts).filter(([, count]) => Number(count) > 0);
    const total = entries.reduce((sum, [, count]) => sum + Number(count), 0);

    if (total <= 0) {
        return [];
    }

    return entries
        .map(([type, count]) => ({
            type: getPacketTypeName(type),
            count: Number(count),
            percentage: roundTo((Number(count) / total) * 100, 1),
        }))
        .sort((left, right) => {
            if (left.count !== right.count) {
                return right.count - left.count;
            }

            return left.type.localeCompare(right.type);
        })
        .slice(0, 4);
}

function sendPacketUsageRanking(ws: RuntimeClient) {
    const sampledAt = Date.now();
    const connectedUsers = Object.values(vars.personajes as RuntimeCharacters)
        .filter((character): character is CommandCharacter => Boolean(character && !character.cerrado))
        .map((character) => {
            const client = getClient(character.id);
            const recentIntervals = Array.isArray(client?.recentPacketIntervalsMs)
                ? client.recentPacketIntervalsMs.filter((value: unknown) => typeof value === "number")
                : [];
            const recentPacketTimestamps = Array.isArray(client?.recentPacketTimestamps)
                ? client.recentPacketTimestamps.filter((value: unknown) => typeof value === "number")
                : [];
            const recentPacketTimestamps60s = Array.isArray(client?.recentPacketTimestamps60s)
                ? client.recentPacketTimestamps60s.filter((value: unknown) => typeof value === "number")
                : [];
            const packetTypeCounts =
                typeof client?.packetTypeCounts === "object" && client.packetTypeCounts !== null
                    ? client.packetTypeCounts
                    : {};
            const totalPackets = Number(client?.packetCount ?? 0);
            const nonPingPackets = Number(client?.packetCountNonPing ?? 0);
            const onlineMs = Math.max(0, sampledAt - Number(client?.connectedAt ?? sampledAt));
            if (!client || (recentIntervals.length === 0 && nonPingPackets === 0)) {
                return null;
            }

            return {
                name: character.nameCharacter,
                onlineMs,
                totalPackets,
                nonPingPackets,
                pingPackets: Math.max(0, totalPackets - nonPingPackets),
                avgSessionPpm: onlineMs > 0 ? roundTo(nonPingPackets / (onlineMs / 60000), 1) : 0,
                pps5: roundTo(recentPacketTimestamps.length / 5, 1),
                pps60: roundTo(recentPacketTimestamps60s.length / 60, 1),
                peakPps1s: getPeakPacketsPerSecond(recentPacketTimestamps60s),
                burstSecondsOver10Pps1m: getBurstSecondsOverThreshold(recentPacketTimestamps60s, 10),
                minRecentPacketIntervalMs: minimum(recentIntervals),
                medianRecentPacketIntervalMs: Math.round(percentile(recentIntervals, 50)),
                p95RecentPacketIntervalMs: Math.round(percentile(recentIntervals, 95)),
                burstUnder10Pct:
                    recentIntervals.length > 0
                        ? roundTo((countIntervalsAtOrBelow(recentIntervals, 10) / recentIntervals.length) * 100, 1)
                        : 0,
                burstUnder20Pct:
                    recentIntervals.length > 0
                        ? roundTo((countIntervalsAtOrBelow(recentIntervals, 20) / recentIntervals.length) * 100, 1)
                        : 0,
                intervalsSampleSize: recentIntervals.length,
                baselineRatioPps60: 0,
                topPacketTypes: buildPacketTypeShares(packetTypeCounts),
            };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    if (connectedUsers.length === 0) {
        handleProtocol.console(
            "[INFO] No hay personajes conectados con actividad de paquetes suficiente todavia.",
            "#E69500",
            0,
            0,
            ws as CommandClient,
        );
        return;
    }

    const baselinePps60 = roundTo(average(connectedUsers.map((entry) => entry.pps60)), 1);
    const entries = connectedUsers
        .map((entry) => ({
            ...entry,
            baselineRatioPps60: baselinePps60 > 0 ? roundTo(entry.pps60 / baselinePps60, 2) : 0,
        }))
        .sort((left, right) => {
            if (left.pps60 !== right.pps60) {
                return right.pps60 - left.pps60;
            }

            if (left.peakPps1s !== right.peakPps1s) {
                return right.peakPps1s - left.peakPps1s;
            }

            if (left.burstUnder20Pct !== right.burstUnder20Pct) {
                return right.burstUnder20Pct - left.burstUnder20Pct;
            }

            return right.nonPingPackets - left.nonPingPackets;
        });

    handleProtocol.panelSnapshot(
        {
            sampledAt,
            baselinePps60,
            entries,
        },
        ws as CommandClient,
    );
}

async function inspectLegacyFrontendUsage(targetName: string, ws: RuntimeClient) {
    const safeName = targetName.trim();

    if (!safeName) {
        handleProtocol.console("[INFO] Uso: /inspect nombre.", "#E69500", 0, 0, ws as CommandClient);
        return;
    }

    handleProtocol.console(
        `[INFO] La inspeccion de eventos internos no esta disponible en esta version (${safeName}).`,
        "#E69500",
        0,
        0,
        ws as CommandClient,
    );
}

const command: CommandApi = {
    async msg(msg, ws) {
        try {
            const searchSpace = msg.indexOf(" ");
            let commandText = msg.slice(0, searchSpace);
            let nextText = msg.slice(searchSpace + 1);

            if (searchSpace < 0) {
                commandText = msg;
                nextText = "";
            }

            commandText = resolveCommandAlias(commandText);

            if (!game.existPjOrClose(ws)) {
                return;
            }

            const clientId = getClientId(ws);
            const user = getCharacter(clientId);
            const userInSafeZone = isInSafeZone(user);

            switch (commandText) {
                case "/help":
                    for (const line of playerCommandHelp) {
                        handleProtocol.console(line, "white", 0, 0, ws as CommandClient);
                    }
                    break;
                case "/online":
                    handleProtocol.console(
                        `Usuarios online en PvE: ${vars.usuariosOnline}`,
                        "#FFFFFF",
                        0,
                        0,
                        ws as CommandClient,
                    );
                    handleProtocol.console(
                        `Usuarios online en PvP: ${vars.usuariosOnlinePvP}`,
                        "#FFFFFF",
                        0,
                        0,
                        ws as CommandClient,
                    );
                    break;

                case "/global": {
                    const error = handleGlobalChat(user, nextText);

                    if (error) {
                        handleProtocol.console(error, "white", 0, 0, ws as CommandClient);
                    }
                    break;
                }

                case "/estadisticas":
                case "/stats":
                    handleProtocol.characterStatsSnapshot(buildCharacterStatsSnapshot(clientId), ws as CommandClient);
                    break;

                case "/devrevivir": {
                    if (process.env.NODE_ENV === "production") {
                        break;
                    }

                    if (!user.dead) {
                        handleProtocol.console(
                            "Solo puedes usar /devrevivir estando muerto.",
                            "white",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    game.revivirUsuario(clientId, {
                        hp: 1,
                        mana: 0,
                    });
                    handleProtocol.console("[INFO] Personaje revivido en el lugar.", "white", 0, 0, ws as CommandClient);
                    break;
                }

                case "/p": {
                    const error = handlePartyChat(user, nextText);

                    if (error) {
                        handleProtocol.console(error, "white", 0, 0, ws as CommandClient);
                    }
                    break;
                }

                case "/c": {
                    const error = handleClanChat(user, nextText);

                    if (error) {
                        handleProtocol.console(error, "white", 0, 0, ws as CommandClient);
                    }
                    break;
                }

                case "/w": {
                    const error = handleWhisperChat(user, nextText);

                    if (error) {
                        handleProtocol.console(error, "white", 0, 0, ws as CommandClient);
                    }
                    break;
                }

                case "/party": {
                    const targetName = nextText.trim();

                    if (!targetName) {
                        handleProtocol.console("Uso: /party {usuario}", "white", 0, 0, ws as CommandClient);
                        break;
                    }

                    const target = findOnlineCharacterByName(targetName) as CommandCharacter | undefined;

                    if (!target || typeof target.id === "undefined") {
                        handleProtocol.console("Ese usuario no está online.", "white", 0, 0, ws as CommandClient);
                        break;
                    }

                    const inviteResult = game.inviteToParty(clientId, target.id);
                    handleProtocol.console(
                        inviteResult.message,
                        inviteResult.ok ? "#E69500" : "white",
                        0,
                        0,
                        ws as CommandClient,
                    );

                    if (inviteResult.ok) {
                        const targetClient = getClient(target.id);

                        if (!targetClient || socket.state(targetClient) !== targetClient.OPEN) {
                            game.clearPartyInvitation(target.id);
                            handleProtocol.console(
                                "No se pudo entregar la invitación porque el usuario destino ya no tiene una conexión activa.",
                                "white",
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        handleProtocol.console(
                            `${user.nameCharacter} te invitó a su party. Escribe /aceptar para unirte.`,
                            "#E69500",
                            0,
                            0,
                            targetClient,
                        );
                    }
                    break;
                }

                case "/aceptar": {
                    const inviterId = user.partyInvitationFrom;
                    const acceptResult = game.acceptPartyInvitation(clientId);
                    handleProtocol.console(
                        acceptResult.message,
                        acceptResult.ok ? "#E69500" : "white",
                        0,
                        0,
                        ws as CommandClient,
                    );

                    const inviterClient = inviterId ? getClient(inviterId) : undefined;

                    if (acceptResult.ok && inviterClient) {
                        handleProtocol.console(
                            `${user.nameCharacter} aceptó tu invitación de party.`,
                            "#E69500",
                            0,
                            0,
                            inviterClient,
                        );
                    }
                    break;
                }

                case "/salirparty": {
                    const partyMemberIdsBeforeLeave = Object.values(vars.personajes as RuntimeCharacters)
                        .filter((target): target is CommandCharacter =>
                            Boolean(target && target.partyId && target.partyId === user.partyId),
                        )
                        .map((target) => target.id as EntityId)
                        .filter((targetId) => !isSameEntityId(targetId, clientId));
                    const leaveResult = game.leaveParty(clientId);
                    handleProtocol.console(
                        leaveResult.message,
                        leaveResult.ok ? "#E69500" : "white",
                        0,
                        0,
                        ws as CommandClient,
                    );

                    if (leaveResult.ok) {
                        const partyWasDisbanded = /disolviste la party/i.test(leaveResult.message);

                        partyMemberIdsBeforeLeave.forEach((targetId) => {
                            const targetClient = getClient(targetId);

                            if (targetClient) {
                                handleProtocol.console(
                                    partyWasDisbanded
                                        ? `${user.nameCharacter} disolvió la party.`
                                        : `${user.nameCharacter} salió de la party.`,
                                    "#E69500",
                                    0,
                                    0,
                                    targetClient,
                                );
                            }
                        });
                    }
                    break;
                }

                case "/expulsarparty": {
                    const targetName = nextText.trim();

                    if (!targetName) {
                        handleProtocol.console("Uso: /expulsarparty {usuario}", "white", 0, 0, ws as CommandClient);
                        break;
                    }

                    const target = findOnlineCharacterByName(targetName) as CommandCharacter | undefined;

                    if (!target || typeof target.id === "undefined") {
                        handleProtocol.console("Ese usuario no está online.", "white", 0, 0, ws as CommandClient);
                        break;
                    }

                    const kickResult = game.kickPartyMember(clientId, target.id);
                    handleProtocol.console(
                        kickResult.message,
                        kickResult.ok ? "#E69500" : "white",
                        0,
                        0,
                        ws as CommandClient,
                    );

                    if (kickResult.ok) {
                        const targetClient = getClient(target.id);

                        if (targetClient) {
                            handleProtocol.console(
                                `${user.nameCharacter} te expulsó de la party.`,
                                "#E69500",
                                0,
                                0,
                                targetClient,
                            );
                        }
                    }
                    break;
                }

                case "/clan": {
                    handleProtocol.console(
                        "Uso: /clancrear nombre|nivelMin, /clanpostular clanId|mensaje, /clanaceptar requestId, /clanrechazar requestId, /clansalir, /clanexpulsar characterId, /clancolider characterId|co_leader|member, /clanlider characterId, /claneliminar confirmar",
                        "white",
                        0,
                        0,
                        ws as CommandClient,
                    );
                    break;
                }

                case "/clancrear": {
                    const args = splitClanCommandArgs(nextText);
                    const name = args[0] ?? "";
                    const minJoinLevel = Number(args[1] ?? 1);

                    if (!name || !Number.isInteger(minJoinLevel) || minJoinLevel < 1) {
                        handleProtocol.console("Uso: /clancrear nombre|nivelMin", "white", 0, 0, ws as CommandClient);
                        break;
                    }

                    const result = (await funct.fetchUrl("/internal/clans", {
                        method: "POST",
                        body: JSON.stringify({
                            characterId: user._id,
                            name,
                            minJoinLevel,
                        }),
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: vars.tokenAuth,
                        },
                    })) as { gold: number };

                    user.gold = balance.clampGold(result.gold);
                    handleProtocol.actGold(user.gold, ws as CommandClient);
                    await refreshOnlineCharacterClanStateByPersistedId(user._id);
                    handleProtocol.console("Clan creado correctamente.", "#E69500", 0, 0, ws as CommandClient);
                    break;
                }

                case "/clanpostular": {
                    const args = splitClanCommandArgs(nextText);
                    const clanId = args[0] ?? "";
                    const message = args.slice(1).join(" | ");

                    if (!clanId) {
                        handleProtocol.console("Uso: /clanpostular clanId|mensaje", "white", 0, 0, ws as CommandClient);
                        break;
                    }

                    await funct.fetchUrl("/internal/clans/requests", {
                        method: "POST",
                        body: JSON.stringify({
                            characterId: user._id,
                            clanId,
                            message,
                        }),
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: vars.tokenAuth,
                        },
                    });

                    handleProtocol.console("Solicitud enviada al clan.", "#E69500", 0, 0, ws as CommandClient);
                    break;
                }

                case "/clanaceptar": {
                    const requestId = nextText.trim();

                    if (!requestId) {
                        handleProtocol.console("Uso: /clanaceptar requestId", "white", 0, 0, ws as CommandClient);
                        break;
                    }

                    const result = (await funct.fetchUrl(
                        `/internal/clans/requests/${encodeURIComponent(requestId)}/accept`,
                        {
                            method: "POST",
                            body: JSON.stringify({
                                reviewerCharacterId: user._id,
                            }),
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: vars.tokenAuth,
                            },
                        },
                    )) as { applicantCharacterId: string };

                    await refreshOnlineCharacterClanStateByPersistedId(result.applicantCharacterId);
                    const target = findOnlineCharacterByPersistedId(result.applicantCharacterId);

                    if (target) {
                        const targetClient = getClient(target.id);

                        if (targetClient) {
                            handleProtocol.console(
                                `Fuiste aceptado en el clan ${user.clan || ""}.`,
                                "#E69500",
                                0,
                                0,
                                targetClient,
                            );
                        }
                    }

                    handleProtocol.console("Solicitud aceptada.", "#E69500", 0, 0, ws as CommandClient);
                    break;
                }

                case "/clanrechazar": {
                    const requestId = nextText.trim();

                    if (!requestId) {
                        handleProtocol.console("Uso: /clanrechazar requestId", "white", 0, 0, ws as CommandClient);
                        break;
                    }

                    const result = (await funct.fetchUrl(
                        `/internal/clans/requests/${encodeURIComponent(requestId)}/reject`,
                        {
                            method: "POST",
                            body: JSON.stringify({
                                reviewerCharacterId: user._id,
                            }),
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: vars.tokenAuth,
                            },
                        },
                    )) as { applicantCharacterId: string };

                    const target = findOnlineCharacterByPersistedId(result.applicantCharacterId);

                    if (target) {
                        const targetClient = getClient(target.id);

                        if (targetClient) {
                            handleProtocol.console("Tu solicitud de clan fue rechazada.", "white", 0, 0, targetClient);
                        }
                    }

                    handleProtocol.console("Solicitud rechazada.", "#E69500", 0, 0, ws as CommandClient);
                    break;
                }

                case "/clansalir": {
                    await funct.fetchUrl("/internal/clans/leave", {
                        method: "POST",
                        body: JSON.stringify({
                            characterId: user._id,
                        }),
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: vars.tokenAuth,
                        },
                    });

                    await refreshOnlineCharacterClanStateByPersistedId(user._id);
                    handleProtocol.console("Saliste del clan.", "#E69500", 0, 0, ws as CommandClient);
                    break;
                }

                case "/clanexpulsar": {
                    const targetCharacterId = nextText.trim();

                    if (!targetCharacterId) {
                        handleProtocol.console("Uso: /clanexpulsar characterId", "white", 0, 0, ws as CommandClient);
                        break;
                    }

                    const result = (await funct.fetchUrl("/internal/clans/kick", {
                        method: "POST",
                        body: JSON.stringify({
                            leaderCharacterId: user._id,
                            targetCharacterId,
                        }),
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: vars.tokenAuth,
                        },
                    })) as { targetCharacterId: string };

                    await refreshOnlineCharacterClanStateByPersistedId(result.targetCharacterId);
                    const target = findOnlineCharacterByPersistedId(result.targetCharacterId);

                    if (target) {
                        const targetClient = getClient(target.id);

                        if (targetClient) {
                            handleProtocol.console("Fuiste expulsado del clan.", "white", 0, 0, targetClient);
                        }
                    }

                    handleProtocol.console("Miembro expulsado del clan.", "#E69500", 0, 0, ws as CommandClient);
                    break;
                }

                case "/clancolider": {
                    const args = splitClanCommandArgs(nextText);
                    const targetCharacterId = args[0] ?? "";
                    const rawRole = (args[1] ?? "").toLowerCase();
                    const role = rawRole === "co_leader" || rawRole === "member" ? rawRole : null;

                    if (!targetCharacterId || !role) {
                        handleProtocol.console(
                            "Uso: /clancolider characterId|co_leader|member",
                            "white",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    const result = (await funct.fetchUrl("/internal/clans/member-role", {
                        method: "POST",
                        body: JSON.stringify({
                            leaderCharacterId: user._id,
                            targetCharacterId,
                            role,
                        }),
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: vars.tokenAuth,
                        },
                    })) as { targetCharacterId: string; role: "co_leader" | "member" };

                    await refreshOnlineCharacterClanStateByPersistedId(result.targetCharacterId);
                    const target = findOnlineCharacterByPersistedId(result.targetCharacterId);

                    if (target) {
                        const targetClient = getClient(target.id);

                        if (targetClient) {
                            handleProtocol.console(
                                result.role === "co_leader"
                                    ? "Ahora eres co-lider del clan."
                                    : "Ya no eres co-lider del clan.",
                                "#E69500",
                                0,
                                0,
                                targetClient,
                            );
                        }
                    }

                    handleProtocol.console(
                        result.role === "co_leader"
                            ? "Co-lider asignado correctamente."
                            : "Co-lider removido correctamente.",
                        "#E69500",
                        0,
                        0,
                        ws as CommandClient,
                    );
                    break;
                }

                case "/claneliminar": {
                    const confirmation = nextText.trim().toLowerCase();

                    if (confirmation !== "confirmar" && confirmation !== "confirm") {
                        handleProtocol.console("Uso: /claneliminar confirmar", "white", 0, 0, ws as CommandClient);
                        break;
                    }

                    const result = (await funct.fetchUrl("/internal/clans/delete", {
                        method: "POST",
                        body: JSON.stringify({
                            leaderCharacterId: user._id,
                        }),
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: vars.tokenAuth,
                        },
                    })) as { memberCharacterIds: string[] };

                    await refreshOnlineCharacterClanStateByPersistedIds(result.memberCharacterIds);

                    for (const memberCharacterId of result.memberCharacterIds) {
                        if (String(memberCharacterId) === String(user._id)) {
                            continue;
                        }

                        const target = findOnlineCharacterByPersistedId(memberCharacterId);

                        if (!target) {
                            continue;
                        }

                        const targetClient = getClient(target.id);

                        if (targetClient) {
                            handleProtocol.console("Tu clan fue eliminado por su lider.", "white", 0, 0, targetClient);
                        }
                    }

                    handleProtocol.console("Clan eliminado correctamente.", "#E69500", 0, 0, ws as CommandClient);
                    break;
                }

                case "/clanlider": {
                    const targetCharacterId = nextText.trim();

                    if (!targetCharacterId) {
                        handleProtocol.console("Uso: /clanlider characterId", "white", 0, 0, ws as CommandClient);
                        break;
                    }

                    const result = (await funct.fetchUrl("/internal/clans/transfer-leadership", {
                        method: "POST",
                        body: JSON.stringify({
                            leaderCharacterId: user._id,
                            targetCharacterId,
                        }),
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: vars.tokenAuth,
                        },
                    })) as { previousLeaderCharacterId: string; newLeaderCharacterId: string };

                    await refreshOnlineCharacterClanStateByPersistedIds([
                        result.previousLeaderCharacterId,
                        result.newLeaderCharacterId,
                    ]);

                    const target = findOnlineCharacterByPersistedId(result.newLeaderCharacterId);

                    if (target) {
                        const targetClient = getClient(target.id);

                        if (targetClient) {
                            handleProtocol.console("Ahora eres el lider del clan.", "#E69500", 0, 0, targetClient);
                        }
                    }

                    handleProtocol.console("Transferiste el liderazgo del clan.", "#E69500", 0, 0, ws as CommandClient);
                    break;
                }

                case "/darexp":
                    if (hasAdminPrivileges(user)) {
                        user.exp += 9999999999;
                        game.checkUserLevel(clientId);
                    }
                    break;

                case "/daroro":
                    if (hasAdminPrivileges(user)) {
                        user.gold = balance.clampGold(user.gold + 9999999);
                        handleProtocol.actGold(user.gold, getClient(clientId));
                    }
                    break;

                case "/meditar":
                    game.accionMeditar(clientId);
                    break;

                case "/fianza": {
                    if (!userInSafeZone) {
                        handleProtocol.console(
                            "Solo puedes usar /fianza en zona segura.",
                            "white",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    if (!user.criminal) {
                        handleProtocol.console("Ya eres ciudadano.", "white", 0, 0, ws as CommandClient);
                        break;
                    }

                    if (user.clanId && user.clanAlignment === "criminal") {
                        handleProtocol.console(
                            "No puedes pagar una fianza para volverte ciudadano porque perteneces a un clan criminal.",
                            "white",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    const action = nextText.trim().toLowerCase();

                    if (action !== "pagar") {
                        handleProtocol.openBail(getBailOffer(user), ws as CommandClient);
                        break;
                    }

                    await bankOperations.run(user.id, async () => {
                        const bailCost = getBailCost(user);

                        if (user.gold < bailCost) {
                            handleProtocol.openBail(getBailOffer(user), ws as CommandClient);
                            handleProtocol.console(
                                `Necesitas ${bailCost} monedas de oro para pagar tu fianza y volver a ser ciudadano.`,
                                "white",
                                1,
                                0,
                                ws as CommandClient,
                            );
                            return;
                        }

                        user.gold = balance.clampGold(user.gold - bailCost);
                        user.fianza = Number(user.ciudadanosMatados ?? 0);
                        handleProtocol.actGold(user.gold, getClient(clientId));
                        makeCitizen(user, ws);
                        handleProtocol.closeBail(ws as CommandClient);
                        game.logCharacterActivity(user, {
                            category: "economy",
                            action: "bail_paid",
                            goldDelta: -bailCost,
                            details: {
                                map: user.map,
                                posX: user.pos.x,
                                posY: user.pos.y,
                                bailCost,
                            },
                        });
                        await persistBailState(user);
                        handleProtocol.console(
                            `Has pagado ${bailCost} monedas de oro y vuelves a ser ciudadano.`,
                            "#E69500",
                            1,
                            0,
                            ws as CommandClient,
                        );
                    }, undefined);
                    break;
                }

                case "/enlistar": {
                    const nearbyFaction = resolveFactionNpc(user);

                    if (nearbyFaction === "none") {
                        handleProtocol.console(
                            "Debes estar cerca del NPC faccionario correspondiente para enlistarte.",
                            "white",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    const factionConfig = getFactionConfig(nearbyFaction);
                    const firstRank = factionConfig?.ranks[0];

                    if (!factionConfig || !firstRank) {
                        handleProtocol.console("La faccion no esta configurada.", "white", 0, 0, ws as CommandClient);
                        break;
                    }

                    const currentFaction = normalizeFaction(user.faction);

                    if (currentFaction === nearbyFaction) {
                        handleProtocol.console(
                            `Ya perteneces a ${getFactionDisplayName(nearbyFaction)}.`,
                            "white",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    if (nearbyFaction === "armada" && user.criminal) {
                        handleProtocol.console(
                            "Debes ser ciudadano para enlistarte en la Armada.",
                            "white",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    if (nearbyFaction === "caos" && !user.criminal) {
                        handleProtocol.console(
                            "Debes ser criminal para enlistarte en el Caos.",
                            "white",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    const score = game.getFactionScore(clientId, nearbyFaction);

                    if (Number(user.level ?? 0) < firstRank.minLevel || score < firstRank.minScore) {
                        handleProtocol.console(
                            `Necesitas nivel ${firstRank.minLevel} y ${firstRank.minScore} puntos de faccion para enlistarte en ${getFactionDisplayName(nearbyFaction)}.`,
                            "white",
                            1,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    game.setCharacterFaction(clientId, nearbyFaction);
                    await game.persistCharacterSnapshot(user, { connected: true });
                    handleProtocol.console(
                        `Te enlistaste en ${getFactionDisplayName(nearbyFaction)}.`,
                        getFactionColor(nearbyFaction) ?? "white",
                        1,
                        0,
                        ws as CommandClient,
                    );
                    break;
                }

                case "/recompensa": {
                    const nearbyFaction = resolveFactionNpc(user);
                    const currentFaction = normalizeFaction(user.faction);

                    if (nearbyFaction === "none") {
                        handleProtocol.console(
                            "Debes estar cerca del NPC faccionario correspondiente para reclamar recompensas.",
                            "white",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    if (currentFaction !== nearbyFaction) {
                        handleProtocol.console(
                            `Solo puedes reclamar recompensas de ${getFactionDisplayName(currentFaction)} con su NPC correspondiente.`,
                            "white",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    const rewardResult = game.claimFactionRewards(clientId);

                    if (!rewardResult.ok) {
                        await game.persistCharacterSnapshot(user, { connected: true });
                        handleProtocol.console(rewardResult.message, "white", 0, 0, ws as CommandClient);
                        break;
                    }

                    await game.persistCharacterSnapshot(user, { connected: true });
                    const reachedRankTitle =
                        getFactionRankTitle(currentFaction, rewardResult.rank) ?? `rango ${rewardResult.rank}`;
                    handleProtocol.console(
                        `Ascendiste a ${reachedRankTitle}.`,
                        getFactionColor(currentFaction) ?? "white",
                        1,
                        0,
                        ws as CommandClient,
                    );
                    break;
                }

                case "/hogar":
                    if (user.challengeMatchId) {
                        handleProtocol.console(
                            "[Retos] No puedes usar /hogar durante un reto.",
                            "white",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    if (isJailed(user)) {
                        handleProtocol.console(
                            "No puedes usar /hogar mientras estas en la carcel.",
                            "white",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    if (user.pvpChar) {
                        if (user.dead && user.spawnMap && user.spawnPos) {
                            game.forceDismount(clientId);
                            game.telep(
                                ws as CommandClient,
                                user.spawnMap,
                                user.spawnPos.x,
                                user.spawnPos.y,
                                "/hogar arena",
                            );
                        }
                        break;
                    } else if (user.dead || userInSafeZone) {
                        const home = resolveHomeDestination(user);
                        game.forceDismount(clientId);
                        game.telep(ws as CommandClient, home.map, home.x, home.y, "/hogar");
                    } else {
                        handleProtocol.console(
                            "Solo puedes usar /hogar estando muerto o en zona segura.",
                            "white",
                            0,
                            0,
                            ws as CommandClient,
                        );
                    }
                    break;

                case "/asignarhogar": {
                    if (user.pvpChar) {
                        handleProtocol.console(
                            "No puedes asignar hogar con un personaje de arena.",
                            "white",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    if (isJailed(user)) {
                        handleProtocol.console(
                            "No puedes asignar hogar mientras estas en la carcel.",
                            "white",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    const home = resolveNearbyGovernorHome(user);

                    if (!home) {
                        handleProtocol.console(
                            "Debes estar cerca de un gobernador para asignar tu hogar.",
                            "white",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    user.homeMap = home.map;
                    user.homeX = home.x;
                    user.homeY = home.y;
                    await game.persistCharacterSnapshot(user, { connected: true });
                    handleProtocol.console(
                        "Tu hogar fue asignado a esta ciudad.",
                        "#E69500",
                        1,
                        0,
                        ws as CommandClient,
                    );
                    break;
                }

                case "/salir":
                    if (user.logoutExpiresAt && user.logoutExpiresAt > Date.now()) {
                        handleProtocol.console(LOGOUT_STARTED_MESSAGE, "#E69500", 0, 0, ws as CommandClient);
                        break;
                    }

                    if (!user.dead && (user.paralizado || user.inmovilizado)) {
                        handleProtocol.console(
                            "[Servidor] No puedes salir mientras estás paralizado o inmovilizado.",
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    if (user.dead || userInSafeZone) {
                        handleProtocol.console(LOGOUT_CLOSING_MESSAGE, "#E69500", 0, 0, ws as CommandClient);
                        await game.closeForce(clientId);
                        break;
                    }

                    user.disconnectOnDeath = false;
                    user.logoutRequestedAt = Date.now();
                    user.logoutExpiresAt = user.logoutRequestedAt + UNSAFE_LOGOUT_DELAY_MS;
                    handleProtocol.console(LOGOUT_STARTED_MESSAGE, "#E69500", 0, 0, ws as CommandClient);
                    break;

                case "/devresetmap": {
                    if (process.env.NODE_ENV !== "development") {
                        break;
                    }

                    const mapNum = Number.parseInt(nextText.trim(), 10);
                    if (!Number.isInteger(mapNum) || mapNum < 500) {
                        handleProtocol.console("[INFO] Uso: /devresetmap 500", "#E69500", 0, 0, ws as CommandClient);
                        break;
                    }

                    const currentBaseMapId = mapInstanceManager.getBaseMapId(user.map);
                    const targetMapNum =
                        currentBaseMapId === mapNum && mapInstanceManager.isInstanceMap(user.map) ? user.map : mapNum;

                    const resetOk = resetInstanceMapNpcs(targetMapNum);
                    if (resetOk && user.map === targetMapNum) {
                        game.telep(
                            ws as CommandClient,
                            user.map,
                            user.pos.x,
                            user.pos.y,
                            `/devresetmap ${targetMapNum}`,
                        );
                    }
                    handleProtocol.console(
                        resetOk
                            ? `[INFO] Mapa ${mapNum} reiniciado.`
                            : `[INFO] No se pudo reiniciar el mapa ${mapNum}.`,
                        resetOk ? "#E69500" : "red",
                        0,
                        0,
                        ws as CommandClient,
                    );
                    break;
                }

                case "/limpiarpiso":
                case "/cleanfloor": {
                    if (!hasAdminPrivileges(user)) {
                        break;
                    }

                    const mapNum = Number.parseInt(nextText.trim(), 10);

                    if (!Number.isInteger(mapNum) || mapNum < 1 || !vars.mapData[mapNum]) {
                        handleProtocol.console("[INFO] Uso: /limpiarpiso {mapa}", "#E69500", 0, 0, ws as CommandClient);
                        break;
                    }

                    const removedFloorItems = await game.cleanupDroppedFloorItemsInMap(mapNum);

                    handleProtocol.console(
                        `[INFO] Se limpiaron ${removedFloorItems} item${removedFloorItems === 1 ? "" : "s"} del piso en el mapa ${mapNum}.`,
                        "#E69500",
                        0,
                        0,
                        ws as CommandClient,
                    );
                    break;
                }

                case "/dobleexp":
                    if (hasAdminPrivileges(user)) {
                        vars.dobleExp = !vars.dobleExp;
                        handleProtocol.consoleToAll(
                            vars.dobleExp
                                ? "[Servidor] El evento de experiencia doble ha comenzado."
                                : "[Servidor] El evento de experiencia doble ha finalizado.",
                            "#E69500",
                            0,
                            0,
                        );
                    }
                    break;

                case "/dobleoro":
                    if (hasAdminPrivileges(user)) {
                        vars.dobleGold = !vars.dobleGold;
                        handleProtocol.consoleToAll(
                            vars.dobleGold
                                ? "[Servidor] El evento de oro doble ha comenzado."
                                : "[Servidor] El evento de oro doble ha finalizado.",
                            "#E69500",
                            0,
                            0,
                        );
                    }
                    break;

                case "/intervalos":
                    if (hasAdminPrivileges(user)) {
                        sendTimingList(ws);
                    }
                    break;

                case "/paquetes":
                case "/packettop":
                    if (hasAdminPrivileges(user)) {
                        sendPacketUsageRanking(ws);
                    }
                    break;

                case "/intervalo": {
                    if (!hasAdminPrivileges(user)) {
                        break;
                    }

                    const splitText = nextText.trim().split(/\s+/).filter(Boolean);

                    if (splitText.length === 0) {
                        handleProtocol.openAdminIntervals(ws as CommandClient);
                        break;
                    }

                    if (splitText.length === 1) {
                        const path = normalizeTimingPath(splitText[0]);
                        const currentEntry = renderTimingEntries().find((entry: string) =>
                            entry.startsWith(`${path}=`),
                        );

                        if (!currentEntry) {
                            handleProtocol.console(
                                "[INFO] Intervalo invalido. Usa /intervalos para ver las claves disponibles.",
                                "#E69500",
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        handleProtocol.console(`[INFO] ${currentEntry}`, "#E69500", 0, 0, ws as CommandClient);
                        break;
                    }

                    const path = normalizeTimingPath(splitText[0]);
                    const value = Number(splitText[1]);

                    const isAlphaPath =
                        path === "visualEffects.invisibilityMinAlpha" || path === "visualEffects.invisibilityMaxAlpha";

                    if (!Number.isFinite(value) || (isAlphaPath ? value < 0 || value > 1 : value <= 0)) {
                        handleProtocol.console(
                            isAlphaPath
                                ? "[INFO] El alpha debe estar entre 0 y 1."
                                : "[INFO] El valor debe ser un numero positivo en milisegundos.",
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    try {
                        await runtimeTiming.updateRuntimeTimingValue(path, isAlphaPath ? value : Math.round(value));
                        const updatedEntry = renderTimingEntries().find((entry: string) =>
                            entry.startsWith(`${path}=`),
                        );

                        handleProtocol.console(
                            updatedEntry
                                ? `[INFO] Intervalo actualizado: ${updatedEntry}`
                                : `[INFO] Intervalo actualizado: ${path}=${Math.round(value)}ms`,
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );

                        if (path === "walkStepMs") {
                            handleProtocol.console(
                                "[INFO] Los clientes nuevos tomarán este valor al iniciar; el cliente conectado lo aplicará al recargar la sesión.",
                                "#FFFFFF",
                                0,
                                0,
                                ws as CommandClient,
                            );
                        }
                    } catch (err) {
                        const message = err instanceof Error ? err.message : "No se pudo actualizar el intervalo.";
                        handleProtocol.console(`[INFO] ${message}`, "#E69500", 0, 0, ws as CommandClient);
                    }

                    break;
                }

                case "/telepme":
                    if (hasAdminPrivileges(user)) {
                        const splitText = nextText.split("@");
                        const numMap = Number.parseInt(splitText[0] ?? "1", 10);
                        const posX = Number.parseInt(splitText[1] ?? "50", 10) || 50;
                        const posY = Number.parseInt(splitText[2] ?? "50", 10) || 50;

                        game.telep(ws as CommandClient, numMap, posX, posY, `/telepme ${numMap}@${posX},${posY}`);
                    }
                    break;

                case "/telepuser": {
                    if (!hasAdminPrivileges(user)) {
                        break;
                    }

                    const name = nextText.trim();

                    if (!name) {
                        handleProtocol.console("[INFO] Usa /telepuser nombre.", "#E69500", 0, 0, ws as CommandClient);
                        break;
                    }

                    const target = findOnlineCharacterByName(name);

                    if (!target) {
                        handleProtocol.console(
                            `[INFO] No hay ningun usuario online con el nombre ${name}.`,
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    if (
                        target.map < 1 ||
                        target.pos.x < 1 ||
                        target.pos.y < 1 ||
                        target.pos.x > 100 ||
                        target.pos.y > 100
                    ) {
                        handleProtocol.console(
                            `[INFO] ${target.nameCharacter} no tiene una ubicacion valida para teletransportarte.`,
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    game.telep(
                        ws as CommandClient,
                        target.map,
                        target.pos.x,
                        target.pos.y,
                        `/telepuser ${target.nameCharacter}`,
                    );
                    break;
                }

                case "/traer": {
                    if (!hasAdminPrivileges(user)) {
                        break;
                    }

                    const name = nextText.trim();

                    if (!name) {
                        handleProtocol.console("[INFO] Usa /traer nombre.", "#E69500", 0, 0, ws as CommandClient);
                        break;
                    }

                    const target = findOnlineCharacterByName(name);

                    if (!target) {
                        handleProtocol.console(
                            `[INFO] No hay ningun usuario online con el nombre ${name}.`,
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    if (isSameEntityId(target.id, user.id)) {
                        handleProtocol.console(
                            "[INFO] No puedes traerte a ti mismo.",
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    const targetClient = getClient(target.id);

                    if (!targetClient || socket.state(targetClient) !== targetClient.OPEN) {
                        handleProtocol.console(
                            `[INFO] ${target.nameCharacter} ya no tiene una conexion activa.`,
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    const targetPosX = user.pos.x - 1;
                    const targetPosY = user.pos.y;

                    if (!game.validPosRespawn({ x: targetPosX, y: targetPosY }, user.map, false)) {
                        handleProtocol.console(
                            "[INFO] La posicion a tu izquierda no es valida para traer usuarios.",
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    game.forceDismount(target.id);
                    game.telep(targetClient, user.map, targetPosX, targetPosY, `/traer ${target.nameCharacter}`);
                    break;
                }

                case "/revivir": {
                    if (!hasAdminPrivileges(user)) {
                        break;
                    }

                    const name = nextText.trim();

                    if (!name) {
                        handleProtocol.console("[INFO] Usa /revivir nombre.", "#E69500", 0, 0, ws as CommandClient);
                        break;
                    }

                    const target = findOnlineCharacterByName(name);

                    if (!target) {
                        handleProtocol.console(
                            `[INFO] No hay ningun usuario online con el nombre ${name}.`,
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    if (!target.dead) {
                        handleProtocol.console(
                            `[INFO] ${target.nameCharacter} no esta muerto.`,
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    const targetClient = getClient(target.id);

                    if (!targetClient || socket.state(targetClient) !== targetClient.OPEN) {
                        handleProtocol.console(
                            `[INFO] ${target.nameCharacter} ya no tiene una conexion activa.`,
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    game.revivirUsuario(target.id, {
                        hp: 1,
                        mana: 0,
                    });
                    handleProtocol.console(
                        `[INFO] Reviviste a ${target.nameCharacter}.`,
                        "#E69500",
                        0,
                        0,
                        ws as CommandClient,
                    );
                    handleProtocol.console(`${user.nameCharacter} te ha revivido.`, "white", 1, 0, targetClient);
                    break;
                }

                case "/cambiarclase": {
                    if (!hasAdminPrivileges(user)) {
                        break;
                    }

                    const changeClassArgs = nextText.trim().split(/\s+/).filter(Boolean);

                    if (changeClassArgs.length < 2) {
                        handleProtocol.console(
                            `[INFO] Uso: /cambiarclase NOMBRE CLASE. Clases: ${listAvailableClassNames()}.`,
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    const targetName = changeClassArgs[0];
                    const classInput = changeClassArgs.slice(1).join(" ");
                    const target = findOnlineCharacterByName(targetName);

                    if (!target) {
                        handleProtocol.console(
                            `[INFO] No hay ningun usuario online con el nombre ${targetName}.`,
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    await changeCharacterClassByAdmin(target, classInput, ws);
                    break;
                }

                case "/inspect": {
                    if (!hasAdminPrivileges(user)) {
                        break;
                    }

                    try {
                        await inspectLegacyFrontendUsage(nextText, ws);
                    } catch (err) {
                        const message = err instanceof Error ? err.message : "No se pudo inspeccionar al usuario.";
                        handleProtocol.console(`[INFO] ${message}`, "#E69500", 0, 0, ws as CommandClient);
                    }

                    break;
                }

                case "/invi":
                    if (hasAdminPrivileges(user)) {
                        user.invisibleAdmin = !user.invisibleAdmin;
                        handleProtocol.sendMyCharacter(user as any);
                        socket.send(ws);
                        syncAdminVisibility(user, ws);
                        game.syncUserNpcVisibility(user.id);
                        handleProtocol.console(
                            user.invisibleAdmin
                                ? "[INFO] Activaste la invisibilidad de admin."
                                : "[INFO] Desactivaste la invisibilidad de admin.",
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                    }
                    break;

                case "/invocarnpc":
                    if (hasAdminPrivileges(user)) {
                        const spawnArgs = nextText.trim().split(/\s+/).filter(Boolean);

                        if (spawnArgs.length === 0) {
                            handleProtocol.console(
                                "[INFO] Uso: /invocarnpc ID_NPC [guardar|fijo|persistente] [mover|movil]",
                                "#E69500",
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        const idNpc = Number.parseInt(spawnArgs[0], 10);

                        if (!Number.isInteger(idNpc) || idNpc <= 0) {
                            handleProtocol.console(
                                "[INFO] Uso: /invocarnpc ID_NPC [guardar|fijo|persistente] [mover|movil]",
                                "#E69500",
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        const { persist, persistMovement } = parseNpcSpawnOptions(spawnArgs[1], spawnArgs[2]);

                        spawnNpcNextToAdmin(clientId, idNpc, ws, persist, persistMovement);
                    }
                    break;

                case "/bot": {
                    if (!hasAdminPrivileges(user)) {
                        break;
                    }

                    const botArgs = nextText.trim().split(/\s+/).filter(Boolean);

                    if (botArgs.length === 0) {
                        handleProtocol.console(
                            `[INFO] Uso: /bot CLASE NIVEL o /bot limpiar. Clases: ${listAvailableAdminBotClasses()}.`,
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    const action = normalizeBotClassInput(botArgs[0]);

                    if (["limpiar", "clear", "off", "borrar", "desinvocar"].includes(action)) {
                        const removedBots = removeAdminSummonedBotsForOwner(clientId);
                        handleProtocol.console(
                            removedBots > 0
                                ? `[INFO] Desinvocaste ${removedBots} bot${removedBots === 1 ? "" : "s"}.`
                                : "[INFO] No tienes bots invocados.",
                            removedBots > 0 ? "#86efac" : "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    if (botArgs.length < 2) {
                        handleProtocol.console(
                            `[INFO] Uso: /bot CLASE NIVEL. Clases: ${listAvailableAdminBotClasses()}.`,
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    const level = Number.parseInt(botArgs[1], 10);

                    if (!Number.isInteger(level) || level <= 0) {
                        handleProtocol.console(
                            "[INFO] El nivel del bot debe ser un entero positivo.",
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    await spawnAdminSummonedBot(clientId, botArgs[0], level, ws);
                    break;
                }

                case "/desinvocarbots":
                case "/quitarbots":
                case "/borrarbots": {
                    if (!hasAdminPrivileges(user)) {
                        break;
                    }

                    const removedBots = removeAdminSummonedBotsForOwner(clientId);
                    handleProtocol.console(
                        removedBots > 0
                            ? `[INFO] Desinvocaste ${removedBots} bot${removedBots === 1 ? "" : "s"}.`
                            : "[INFO] No tienes bots invocados.",
                        removedBots > 0 ? "#86efac" : "#E69500",
                        0,
                        0,
                        ws as CommandClient,
                    );
                    break;
                }

                case "/crearitem":
                    if (hasAdminPrivileges(user)) {
                        const createItemArgs = nextText.trim().split(/\s+/).filter(Boolean);

                        if (createItemArgs.length < 2) {
                            handleProtocol.console(
                                "[INFO] Uso: /crearitem ID_ITEM CANTIDAD",
                                "#E69500",
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        const idItem = Number.parseInt(createItemArgs[0], 10);
                        const cant = Number.parseInt(createItemArgs[1], 10);

                        if (!Number.isInteger(idItem) || idItem <= 0 || !Number.isInteger(cant) || cant <= 0) {
                            handleProtocol.console(
                                "[INFO] Uso: /crearitem ID_ITEM CANTIDAD",
                                "#E69500",
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        const itemData = vars.datObj[idItem];

                        if (!itemData) {
                            handleProtocol.console(
                                `[INFO] No existe un item con ID ${idItem}.`,
                                "#E69500",
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        void bankOperations.run(user.id, async () => {
                            game.putItemToInv(user.id, idItem, cant);
                            await game.persistCharacterEconomyById(user.id);
                            handleProtocol.console(
                            `[INFO] Recibiste ${cant} ${itemData.name ?? "item"}.`,
                            "#86efac",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        }, undefined).catch((error: unknown) => funct.dumpError(error));
                    }
                    break;

                case "/quitarnpc":
                case "/borrarnpc":
                    if (hasAdminPrivileges(user)) {
                        const npcEntityId = Number.parseInt(nextText.trim(), 10);

                        if (!Number.isInteger(npcEntityId) || npcEntityId <= 0) {
                            handleProtocol.console(
                                "[INFO] Uso: /quitarnpc ID_ENTIDAD_NPC",
                                "#E69500",
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        removeNpcByAdmin(npcEntityId, ws);
                    }
                    break;

                case "/quitarnpcpermanente":
                case "/borrarnpcpermanente":
                    if (hasAdminPrivileges(user)) {
                        const npcEntityId = Number.parseInt(nextText.trim(), 10);

                        if (!Number.isInteger(npcEntityId) || npcEntityId <= 0) {
                            handleProtocol.console(
                                "[INFO] Uso: /quitarnpcpermanente ID_ENTIDAD_NPC",
                                "#E69500",
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        removeNpcByAdmin(npcEntityId, ws, true);
                    }
                    break;

                case "/worldsave":
                    if (hasAdminPrivileges(user)) {
                        runWorldSave(ws as CommandClient);
                    }
                    break;

                case "/recargarobjs": {
                    if (!hasAdminPrivileges(user)) {
                        break;
                    }

                    const result = await reloadObjectsDiff();
                    handleProtocol.console(
                        `[INFO] Objs recargados. Version ${result.previousVersion} -> ${result.currentVersion}. Cambios aplicados: ${result.updatedObjects}.`,
                        "#E69500",
                        0,
                        0,
                        ws as CommandClient,
                    );
                    break;
                }

                case "/recargarnpcs": {
                    if (!hasAdminPrivileges(user)) {
                        break;
                    }

                    const result = await reloadNpcsDiff();
                    handleProtocol.console(
                        `[INFO] NPCs recargados. Version ${result.previousVersion} -> ${result.currentVersion}. Templates: ${result.updatedTemplates}. Vivos parcheados: ${result.patchedLiveNpcs}. Omitidos: ${result.skippedLiveNpcs}.`,
                        "#E69500",
                        0,
                        0,
                        ws as CommandClient,
                    );
                    break;
                }

                case "/recargarbalance": {
                    if (!hasAdminPrivileges(user)) {
                        break;
                    }

                    const result = await reloadBalanceDiff();
                    handleProtocol.console(
                        `[INFO] Balance recargado. Version ${result.previousVersion} -> ${result.currentVersion}. Perfiles actualizados: ${result.updatedProfiles}. Personajes refrescados: ${result.refreshedCharacters}.`,
                        "#E69500",
                        0,
                        0,
                        ws as CommandClient,
                    );
                    break;
                }

                case "/recargarcrafting": {
                    if (!hasAdminPrivileges(user)) {
                        break;
                    }

                    const result = await reloadCraftingRecipesDiff();
                    handleProtocol.console(
                        `[INFO] Crafting recargado. Version ${result.previousVersion} -> ${result.currentVersion}. Recetas actualizadas: ${result.updatedRecipes}.`,
                        "#E69500",
                        0,
                        0,
                        ws as CommandClient,
                    );
                    break;
                }

                case "/verip":
                    break;

                case "/kick":
                    if (hasStaffPrivileges(user)) {
                        const name = nextText.trim();

                        for (const i in vars.personajes as RuntimeCharacters) {
                            const target = (vars.personajes as RuntimeCharacters)[i];

                            if (matchesCharacterName(target?.nameCharacter, name)) {
                                const wsKick = getClient(i);

                                if (!wsKick) {
                                    handleProtocol.console(
                                        `[INFO] ${name} ya no tiene una conexion activa.`,
                                        "#E69500",
                                        0,
                                        0,
                                        ws as CommandClient,
                                    );
                                    break;
                                }

                                handleProtocol.error("Has sido expulsado del servidor.", wsKick);
                                break;
                            }
                        }
                    }
                    break;

                case "/mute":
                    if (hasStaffPrivileges(user)) {
                        const splitText = nextText.split("@");
                        const name = splitText[0];
                        const time = splitText[1];

                        if (!name || !time) {
                            return;
                        }
                    }
                    break;

                case "/carcel":
                case "/jail": {
                    if (!hasAdminPrivileges(user)) {
                        break;
                    }

                    const splitText = nextText.split("@");
                    const name = splitText[0]?.trim();
                    const reason = splitText[1]?.trim();
                    const minutes = Number.parseInt(splitText[2]?.trim() ?? "", 10);

                    if (splitText.length !== 3 || !name || !reason || !Number.isInteger(minutes) || minutes <= 0) {
                        handleProtocol.console(
                            "[INFO] Usa /carcel nick@motivo@minutos.",
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    if (minutes > MAX_JAIL_MINUTES) {
                        handleProtocol.console(
                            `[INFO] El tiempo maximo de carcel es ${MAX_JAIL_MINUTES} minutos.`,
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    const target = findOnlineCharacterByName(name);

                    if (target) {
                        if (target.privileges && target.privileges > 0) {
                            handleProtocol.console(
                                "[INFO] No puedes encarcelar a un miembro del staff.",
                                "#E69500",
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        const targetClient = getClient(target.id);

                        if (!targetClient || socket.state(targetClient) !== targetClient.OPEN) {
                            handleProtocol.console(
                                `[INFO] ${target.nameCharacter} ya no tiene una conexion activa.`,
                                "#E69500",
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        target.jailMinutes = minutes;
                        target.jailReason = reason;
                        game.forceDismount(target.id);
                        game.telep(targetClient, JAIL_MAP, JAIL_X, JAIL_Y, `/carcel ${target.nameCharacter}`);
                        await game.persistCharacterSnapshot(target, { connected: true });

                        handleProtocol.console(
                            `[INFO] ${target.nameCharacter} fue enviado a la carcel por ${minutes} minuto${minutes === 1 ? "" : "s"}.`,
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        handleProtocol.console(
                            `Has sido enviado a la carcel por ${minutes} minuto${minutes === 1 ? "" : "s"} por ${user.nameCharacter}. Motivo: ${reason}.`,
                            "white",
                            1,
                            0,
                            targetClient,
                        );
                        break;
                    }

                    try {
                        const result = (await funct.fetchUrl(`/internal/moderation/jail-character`, {
                            method: "POST",
                            body: JSON.stringify({
                                name,
                                jailMinutes: minutes,
                                jailReason: reason,
                                map: JAIL_MAP,
                                posX: JAIL_X,
                                posY: JAIL_Y,
                            }),
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: vars.tokenAuth,
                            },
                        })) as JailCommandResult;

                        handleProtocol.console(
                            `[INFO] ${result.name} fue enviado a la carcel por ${result.jailMinutes} minuto${result.jailMinutes === 1 ? "" : "s"}.`,
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                    } catch (err) {
                        const message = err instanceof Error ? err.message : "No se pudo encarcelar al personaje.";

                        if (message === "Character not found") {
                            handleProtocol.console(
                                `[INFO] No existe ningun usuario con el nombre ${name}.`,
                                "#E69500",
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        if (message === "Cannot jail staff member") {
                            handleProtocol.console(
                                "[INFO] No puedes encarcelar a un miembro del staff.",
                                "#E69500",
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        throw err;
                    }

                    break;
                }

                case "/resetaciertos":
                    if (hasAdminPrivileges(user)) {
                    }
                    break;

                case "/globalgm":
                    if (hasStaffPrivileges(user)) {
                        const message = nextText.trim();

                        if (!message) {
                            handleProtocol.console(
                                "[INFO] Usa /globalgm mensaje.",
                                SERVER_RESTART_WARNING_COLOR,
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        handleProtocol.globalNoticeToAll(message, GLOBAL_NOTICE_DURATION_MS);
                        handleProtocol.consoleToAll(`[Servidor] ${message}`, SERVER_RESTART_WARNING_COLOR, 0, 0);
                        handleProtocol.console(
                            "[INFO] Aviso global enviado.",
                            SERVER_RESTART_WARNING_COLOR,
                            0,
                            0,
                            ws as CommandClient,
                        );
                    }
                    break;

                case "/apagar":
                    if (hasStaffPrivileges(user)) {
                        startServerRestartWarningSequence();
                        handleProtocol.console(
                            "[INFO] Secuencia de aviso de reinicio iniciada. No se apagará el servidor automáticamente.",
                            SERVER_RESTART_WARNING_COLOR,
                            0,
                            0,
                            ws as CommandClient,
                        );
                    }
                    break;

                case "/ban": {
                    if (!hasAdminPrivileges(user)) {
                        break;
                    }

                    const splitText = nextText.split("@");
                    const name = splitText[0]?.trim();
                    const time = splitText.slice(1).join("@").trim();

                    if (!name) {
                        handleProtocol.console(
                            "[INFO] Usa /ban nombre@duracion. Ejemplos: /ban Pepito@30, /ban Pepito@12h, /ban Pepito@7d.",
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    const bannedUntil = parseBanUntil(time);

                    if (!bannedUntil) {
                        handleProtocol.console(
                            "[INFO] La duracion del ban es invalida. Usa minutos, h, d o una fecha ISO futura.",
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                        break;
                    }

                    try {
                        const result = (await funct.fetchUrl(`/internal/moderation/ban-character`, {
                            method: "POST",
                            body: JSON.stringify({
                                name,
                                bannedUntil: bannedUntil.toISOString(),
                            }),
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: vars.tokenAuth,
                            },
                        })) as BanCommandResult;

                        for (const idUser in vars.personajes as RuntimeCharacters) {
                            const target = (vars.personajes as RuntimeCharacters)[idUser] as
                                | CommandCharacter
                                | undefined;

                            if (!target || target._id !== result.characterId) {
                                continue;
                            }

                            target.banned = new Date(result.bannedUntil);
                            await disconnectCharacterWithMessage(idUser as EntityId, "Has sido baneado del servidor.");
                            break;
                        }

                        handleProtocol.console(
                            `[INFO] Has baneado a ${result.name} ${formatBanUntil(result.bannedUntil)}.`,
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                    } catch (err) {
                        const message = err instanceof Error ? err.message : "No se pudo banear al personaje.";

                        if (message === "Character not found") {
                            handleProtocol.console(
                                `[INFO] No existe ningun usuario con el nombre ${name}.`,
                                "#E69500",
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        throw err;
                    }

                    break;
                }

                case "/unban": {
                    if (!hasAdminPrivileges(user)) {
                        break;
                    }

                    const name = nextText.trim();

                    if (!name) {
                        handleProtocol.console("[INFO] Usa /unban nombre.", "#E69500", 0, 0, ws as CommandClient);
                        break;
                    }

                    try {
                        const result = (await funct.fetchUrl(`/internal/moderation/unban-character`, {
                            method: "POST",
                            body: JSON.stringify({ name }),
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: vars.tokenAuth,
                            },
                        })) as UnbanCommandResult;

                        for (const idUser in vars.personajes as RuntimeCharacters) {
                            const target = (vars.personajes as RuntimeCharacters)[idUser] as
                                | CommandCharacter
                                | undefined;

                            if (!target || target._id !== result.characterId) {
                                continue;
                            }

                            target.banned = null;
                            break;
                        }

                        handleProtocol.console(
                            `[INFO] Has desbaneado a ${result.name}.`,
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                    } catch (err) {
                        const message = err instanceof Error ? err.message : "No se pudo desbanear al personaje.";

                        if (message === "Character not found") {
                            handleProtocol.console(
                                `[INFO] No existe ningun usuario con el nombre ${name}.`,
                                "#E69500",
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        throw err;
                    }

                    break;
                }

                case "/banip": {
                    if (hasAdminPrivileges(user)) {
                        const splitText = nextText.split("@");
                        const name = splitText[0]?.trim();
                        const time = splitText.slice(1).join("@").trim();

                        if (!name) {
                            handleProtocol.console(
                                "[INFO] Usa /banip nombre o /banip nombre@duracion. Si omites la duracion, el ban es permanente.",
                                "#E69500",
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        const bannedUntil = parseBanUntil(time);

                        if (!bannedUntil) {
                            handleProtocol.console(
                                "[INFO] La duracion del ban de IP es invalida. Usa minutos, h, d o una fecha ISO futura.",
                                "#E69500",
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        try {
                            const result = (await funct.fetchUrl(`/internal/moderation/ban-ip`, {
                                method: "POST",
                                body: JSON.stringify({
                                    name,
                                    bannedUntil: bannedUntil.toISOString(),
                                }),
                                headers: {
                                    "Content-Type": "application/json",
                                    Authorization: vars.tokenAuth,
                                },
                            })) as BanIpCommandResult;

                            const onlineTargets = findOnlineCharactersByIp(result.ip);

                            for (const target of onlineTargets) {
                                target.user.banned = new Date(result.bannedUntil);
                                await disconnectCharacterWithMessage(target.id, "Has sido baneado del servidor.");
                            }

                            handleProtocol.console(
                                `[INFO] Has baneado la IP ${result.ip} asociada a ${result.name} ${formatBanUntil(result.bannedUntil)}. Personajes afectados: ${result.affectedCharacters}.`,
                                "#E69500",
                                0,
                                0,
                                ws as CommandClient,
                            );
                        } catch (err) {
                            const message = err instanceof Error ? err.message : "No se pudo banear la IP.";

                            if (message === "Character not found") {
                                handleProtocol.console(
                                    `[INFO] No existe ningun usuario con el nombre ${name}.`,
                                    "#E69500",
                                    0,
                                    0,
                                    ws as CommandClient,
                                );
                                break;
                            }

                            if (message === "El personaje no tiene una IP registrada.") {
                                handleProtocol.console(
                                    `[INFO] ${name} no tiene una IP registrada para banear.`,
                                    "#E69500",
                                    0,
                                    0,
                                    ws as CommandClient,
                                );
                                break;
                            }

                            throw err;
                        }
                    }
                    break;
                }

                case "/unbanip": {
                    if (!hasAdminPrivileges(user)) {
                        break;
                    }

                    const name = nextText.trim();

                    if (!name) {
                        handleProtocol.console("[INFO] Usa /unbanip nombre.", "#E69500", 0, 0, ws as CommandClient);
                        break;
                    }

                    try {
                        const result = (await funct.fetchUrl(`/internal/moderation/unban-ip`, {
                            method: "POST",
                            body: JSON.stringify({ name }),
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: vars.tokenAuth,
                            },
                        })) as UnbanIpCommandResult;

                        const onlineTargets = findOnlineCharactersByIp(result.ip);

                        for (const target of onlineTargets) {
                            target.user.banned = null;
                        }

                        handleProtocol.console(
                            `[INFO] Has desbaneado la IP ${result.ip} asociada a ${result.name}. Personajes afectados: ${result.affectedCharacters}.`,
                            "#E69500",
                            0,
                            0,
                            ws as CommandClient,
                        );
                    } catch (err) {
                        const message = err instanceof Error ? err.message : "No se pudo desbanear la IP.";

                        if (message === "Character not found") {
                            handleProtocol.console(
                                `[INFO] No existe ningun usuario con el nombre ${name}.`,
                                "#E69500",
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        if (message === "El personaje no tiene una IP registrada.") {
                            handleProtocol.console(
                                `[INFO] ${name} no tiene una IP registrada para desbanear.`,
                                "#E69500",
                                0,
                                0,
                                ws as CommandClient,
                            );
                            break;
                        }

                        throw err;
                    }

                    break;
                }
            }
        } catch (err) {
            if (err instanceof Error) {
                handleProtocol.console(err.message, "white", 0, 0, ws as CommandClient);
            }
            funct.dumpError(err);
        }
    },
};

module.exports = command;
