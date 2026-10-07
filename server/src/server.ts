import {InboundBudget,MAX_INBOUND_BYTES} from './inboundBudget';
import { bankOperations } from './bankOperationGuard';
import { vaultRecovery } from './vaultRecovery';
import { characterRecovery } from './characterRecovery';
import { worldRecovery } from './worldRecovery';
import {CosmeticReplication, encodeCosmeticSnapshot} from './cosmeticReplication';
import type { GameApi } from "./game";
import type { HandleProtocolApi } from "./handleProtocol";
import type { NpcsApi } from "./npcs";
import type { PackageApi, PacketPayload } from "./package";
import type { ProtocolApi } from "./protocol";
import type { SocketApi } from "./socket";
import type {
    RuntimeCharacter,
    RuntimeCharacters,
    RuntimeClient,
    RuntimeConnectionRequest,
    RuntimeNpc,
    RuntimeNpcs,
} from "./types/runtime";
import { getClientById } from "./runtimeRegistry";
import * as safeZone from "./safeZone";

export {};
const config = require("./config");
const LOGOUT_CLOSING_MESSAGE = "[Servidor] Cerrando sesiÃ³n...";
const UNSAFE_LOGOUT_DELAY_MS = 10000;
const RECENT_PACKET_INTERVAL_LIMIT = 300;
const RECENT_PACKET_PPS_WINDOW_MS = 5000;
const RECENT_PACKET_PPS_WINDOW_60S_MS = 60000;
const JAIL_TICK_MS = 60000;
const JAIL_MAP = 66;
const JAIL_RELEASE_X = 75;
const JAIL_RELEASE_Y = 67;
const FLOOR_ITEM_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const FLOOR_ITEM_SWEEP_WARNING_MS = 60 * 1000;
const FLOOR_ITEM_SWEEP_CHECK_MS = 5000;
const DUPLICATE_IP_IDLE_TIMEOUT_MS = 60 * 1000;

function broadcastNpcSnapshot(game: GameApi, handleProtocol: HandleProtocolApi, npc: RuntimeNpc | undefined): void {
    if (!npc) {
        return;
    }

    game.loopAreaPos(npc.map, npc.pos, (target) => {
        const targetClient = getClientById(target.id);

        if (!targetClient) {
            return;
        }

        handleProtocol.sendNpc(npc as any);
        const socket = require("./socket") as SocketApi;
        socket.send(targetClient);
    });
}

function broadcastCharacterSnapshot(
    game: GameApi,
    handleProtocol: HandleProtocolApi,
    user: RuntimeCharacter | undefined,
): void {
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
        const socket = require("./socket") as SocketApi;
        socket.send(targetClient);
    });
}

type WSServer = {
    on: (event: "connection", listener: (client: RuntimeClient, request: RuntimeConnectionRequest) => void) => void;
};

type ServerCharacter = RuntimeCharacter & {
    meditar: boolean;
    mana: number;
    maxMana: number;
    cooldownFuerza: number;
    bkAttrFuerza: number;
    attrFuerza: number;
    cooldownAgilidad: number;
    bkAttrAgilidad: number;
    attrAgilidad: number;
    cooldownInvisibleSpell?: number;
    cerrado?: boolean;
    jailMinutes?: number;
};

type ServerNpc = RuntimeNpc & {
    movement: number;
    rute: unknown[];
};

let wsServer: WSServer | null = null;

function isInSafeZone(user: RuntimeCharacter | undefined) {
    if (!user) {
        return false;
    }

    return safeZone.isSafeZonePosition(user.map, user.pos);
}

function handleSocketClosed(ws: RuntimeClient) {
    if (typeof ws.id === "undefined") {
        return;
    }

    const user = (vars.personajes as RuntimeCharacters)[ws.id] as ServerCharacter | undefined;

    if (!user || user.cerrado) {
        socket.closePj(ws);
        return;
    }

    if (user.dead || isInSafeZone(user)) {
        socket.closePj(ws);
        return;
    }

    socket.detachClient(ws.id);

    if (user.disconnectOnDeath) {
        return;
    }

    if (!user.logoutRequestedAt || !user.logoutExpiresAt || user.logoutExpiresAt <= Date.now()) {
        user.logoutRequestedAt = Date.now();
        user.logoutExpiresAt = user.logoutRequestedAt + UNSAFE_LOGOUT_DELAY_MS;
    }
}

function getConnectionIp(request: RuntimeConnectionRequest, ws: RuntimeClient): string | undefined {
    const realIp = request.headers?.["x-real-ip"];
    const realIpValue = Array.isArray(realIp) ? realIp[0] : realIp;

    if (realIpValue?.trim()) {
        return realIpValue.trim();
    }

    const cloudflareIp = request.headers?.["cf-connecting-ip"];
    const cloudflareIpValue = Array.isArray(cloudflareIp) ? cloudflareIp[0] : cloudflareIp;

    if (cloudflareIpValue?.trim()) {
        return cloudflareIpValue.trim();
    }

    const forwardedFor = request.headers?.["x-forwarded-for"];
    const forwardedValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const forwardedIp = forwardedValue?.split(",")[0]?.trim();

    if (forwardedIp) {
        return forwardedIp;
    }

    return request.socket?.remoteAddress ?? ws._socket?.remoteAddress;
}

const http = require("http");
const WebSocketServer = require("ws").Server;
const httpServer = http.createServer(handleHttpRequest);

httpServer.listen(config.port, process.env.HOST ?? "127.0.0.1");
wsServer = new WebSocketServer({
    server: httpServer,
    maxPayload: MAX_INBOUND_BYTES,
    perMessageDeflate: false,
}) as WSServer;

const loadMaps = require("./loadMaps");
const loadObjs = require("./loadObjs");
const loadBalance = require("./loadBalance");
const loadSpells = require("./loadSpells");
const loadCraftingRecipes = require("./loadCraftingRecipes");
const loadSmeltingRecipes = require("./loadSmeltingRecipes");
const funct = require("./functions");
const protocol = require("./protocol") as ProtocolApi;
const game = require("./game") as GameApi;
const fishing = require("./fishing");
const harvesting = require("./harvesting");
const smelting = require("./smelting");
const socket = require("./socket") as SocketApi;
const vars = require("./vars");
const pkg = require("./package") as PackageApi;
const npcs = require("./npcs") as NpcsApi;
const runtimeTiming = require("./runtimeTiming");
const handleProtocol = require("./handleProtocol") as HandleProtocolApi;

const cosmeticReplication = new CosmeticReplication(async characterId => {
    const result = await require('./functions').fetchUrl('/internal/characters/'+encodeURIComponent(characterId)+'/cosmetic-title', {headers:{Authorization:vars.tokenAuth}});
    return result.kind;
});
setInterval(() => {
    if(!vars.serverReady)return;
    const subjects = Object.values(vars.personajes).filter((user:any)=>user?.connected&&!user.cerrado) as RuntimeCharacter[];
    cosmeticReplication.refresh(subjects);
    for(const viewer of subjects){
        const client=getClientById(viewer.id);
        if(!client||client.readyState!==1)continue;
        const nearby:RuntimeCharacter[]=[];
        game.loopArea(client,target=>{if('_id' in target)nearby.push(target as RuntimeCharacter);});
        const entries=cosmeticReplication.snapshot(viewer.map,nearby);
        try{client.send(encodeCosmeticSnapshot(viewer.map,entries));}catch{/* A closed socket must not interrupt other players. */}
    }
},2000).unref();

function getWorldSaveIntervalMs() {
    // Database balance settings must not silently disable the operations save ceiling.
    return Math.max(10000,Math.min(Number(vars.timing.worldSaveMs)||60000,Number(process.env.AOWEB_AUTOSAVE_MS)||60000));
}
function handleHttpRequest(request: any, response: any) {
    if(request.method === 'GET' && request.url === '/health') {
        response.statusCode = vars.serverReady ? 200 : 503;
        response.setHeader('Content-Type','application/json');
        response.end(JSON.stringify({ready:vars.serverReady,players:Number(vars.usuariosOnline)+Number(vars.usuariosOnlinePvP),uptimeSeconds:Math.floor(process.uptime()),autosaveMs:getWorldSaveIntervalMs()}));
        return;
    }
    if(request.method === 'POST' && request.url === '/internal/save') {
        if(!config.tokenAuth || request.headers.authorization !== config.tokenAuth) {
            response.statusCode=401; response.end('Unauthorized'); return;
        }
        void game.worldSave(result => {
            response.statusCode=result?.ok ? 200 : 503;
            response.setHeader('Content-Type','application/json');
            response.end(JSON.stringify(result));
        });
        return;
    }

    response.statusCode = 404;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "Not found" }));
}

const PACKET_TYPE_NAMES: Record<number, string> = {
    [pkg.serverPacketID.changeHeading]: "heading",
    [pkg.serverPacketID.click]: "click",
    [pkg.serverPacketID.useItemClick]: "useItemClick",
    [pkg.serverPacketID.equiparItem]: "equipItem",
    [pkg.serverPacketID.connectCharacter]: "connect",
    [pkg.serverPacketID.position]: "move",
    [pkg.serverPacketID.dialog]: "dialog",
    [pkg.serverPacketID.attackMele]: "melee",
    [pkg.serverPacketID.attackRange]: "range",
    [pkg.serverPacketID.attackSpell]: "spell",
    [pkg.serverPacketID.tirarItem]: "dropItem",
    [pkg.serverPacketID.agarrarItem]: "pickItem",
    [pkg.serverPacketID.buyItem]: "buyItem",
    [pkg.serverPacketID.sellItem]: "sellItem",
    [pkg.serverPacketID.resyncPosition]: "resync",
    [pkg.serverPacketID.changeSeguro]: "seguro",
    [pkg.serverPacketID.reorderSpell]: "reorderSpell",
    [pkg.serverPacketID.reorderInventoryItem]: "reorderInventory",
    [pkg.serverPacketID.toggleHiddenSkill]: "hiddenSkill",
    [pkg.serverPacketID.useItemU]: "useItemU",
    [pkg.serverPacketID.changeClanSeguro]: "clanSeguro",
    [pkg.serverPacketID.reorderBankItem]: "reorderBank",
    [pkg.serverPacketID.marketAction]: "marketAction",
    [pkg.serverPacketID.retosAction]: "retosAction",
};
let nextPlayerStatusTickAt = Date.now() + vars.timing.playerStatusTickMs;
let nextFloorItemSweepAt = Date.now() + FLOOR_ITEM_SWEEP_INTERVAL_MS;
let floorItemSweepWarningSent = false;

type DynamicScheduler = {
    reschedule: () => void;
};

const dynamicSchedulers: DynamicScheduler[] = [];

function createDynamicScheduler(getDelayMs: () => number, callback: () => void | Promise<void>) {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
        timeoutId = setTimeout(run, Math.max(1, Number(getDelayMs()) || 1));
    };

    const run = () => {
        Promise.resolve(callback())
            .catch((err) => {
                funct.dumpError(err);
            })
            .finally(() => {
                scheduleNext();
            });
    };

    const scheduler: DynamicScheduler = {
        reschedule() {
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }

            scheduleNext();
        },
    };

    scheduler.reschedule();
    dynamicSchedulers.push(scheduler);
    return scheduler;
}

function rescheduleDynamicSchedulers() {
    nextPlayerStatusTickAt = Date.now() + vars.timing.playerStatusTickMs;

    for (const scheduler of dynamicSchedulers) {
        scheduler.reschedule();
    }
}

runtimeTiming.onRuntimeTimingChange(() => {
    rescheduleDynamicSchedulers();
});

function countActiveWorkerUsers() {
    let fishingUsers = 0;
    let miningUsers = 0;
    let woodcuttingUsers = 0;

    for (const idUser in vars.personajes as RuntimeCharacters) {
        const user = (vars.personajes as RuntimeCharacters)[idUser] as ServerCharacter | undefined;
        const client = vars.clients[idUser] as RuntimeClient | undefined;

        if (!user || user.cerrado || !client || socket.state(client) !== client.OPEN) {
            continue;
        }

        if (user.fishing?.active) {
            fishingUsers++;
        }

        if (user.harvesting?.active) {
            if (user.harvesting.skill === "mining") {
                miningUsers++;
            }

            if (user.harvesting.skill === "woodcutting") {
                woodcuttingUsers++;
            }
        }
    }

    return {
        fishingUsers,
        miningUsers,
        woodcuttingUsers,
    };
}

async function saveOnlineStatsSnapshot() {
    try {
        const pveUsers = Math.max(0, Number(vars.usuariosOnline) || 0);
        const pvpUsers = Math.max(0, Number(vars.usuariosOnlinePvP) || 0);
        const totalUsers = pveUsers + pvpUsers;
        const { fishingUsers, miningUsers, woodcuttingUsers } = countActiveWorkerUsers();

        await funct.fetchUrl("/internal/user-online-stats", {
            method: "POST",
            body: JSON.stringify({
                sampledAt: new Date().toISOString(),
                totalUsers,
                pveUsers,
                pvpUsers,
                fishingUsers,
                miningUsers,
                woodcuttingUsers,
            }),
            headers: {
                "Content-Type": "application/json",
                Authorization: vars.tokenAuth,
            },
        });
    } catch (err) {
        funct.dumpError(err);
    }
}

async function processFloorItemSweepTick(now: number) {
    if (!floorItemSweepWarningSent && now >= nextFloorItemSweepAt - FLOOR_ITEM_SWEEP_WARNING_MS) {
        floorItemSweepWarningSent = true;
        handleProtocol.consoleToAll("[Servidor] En 1 minuto se limpiaran los items del piso.", "#E69500", 1, 0);
    }

    if (now < nextFloorItemSweepAt) {
        return;
    }

    await game.cleanupDroppedFloorItems();

    do {
        nextFloorItemSweepAt += FLOOR_ITEM_SWEEP_INTERVAL_MS;
    } while (nextFloorItemSweepAt <= now);

    floorItemSweepWarningSent = false;
}

function trackClientActivity(ws: RuntimeClient, packageID: number) {
    const now = Date.now();
    const isPingPacket = packageID === pkg.serverPacketID.ping;

    ws.packetCount = Number(ws.packetCount ?? 0) + 1;

    if (isPingPacket) {
        return;
    }

    const previousPacketAt = Number(ws.lastPacketAt ?? 0);
    const recentPacketTimestamps = Array.isArray(ws.recentPacketTimestamps) ? ws.recentPacketTimestamps : [];
    const recentPacketTimestamps60s = Array.isArray(ws.recentPacketTimestamps60s) ? ws.recentPacketTimestamps60s : [];
    const packetTypeCounts =
        typeof ws.packetTypeCounts === "object" && ws.packetTypeCounts !== null ? ws.packetTypeCounts : {};
    const packetTypeName = PACKET_TYPE_NAMES[packageID] ?? `packet-${packageID}`;

    ws.packetCountNonPing = Number(ws.packetCountNonPing ?? 0) + 1;
    recentPacketTimestamps.push(now);
    recentPacketTimestamps60s.push(now);
    packetTypeCounts[packetTypeName] = Number(packetTypeCounts[packetTypeName] ?? 0) + 1;

    while (recentPacketTimestamps.length > 0 && now - recentPacketTimestamps[0] > RECENT_PACKET_PPS_WINDOW_MS) {
        recentPacketTimestamps.shift();
    }

    ws.recentPacketTimestamps = recentPacketTimestamps;

    while (
        recentPacketTimestamps60s.length > 0 &&
        now - recentPacketTimestamps60s[0] > RECENT_PACKET_PPS_WINDOW_60S_MS
    ) {
        recentPacketTimestamps60s.shift();
    }

    ws.recentPacketTimestamps60s = recentPacketTimestamps60s;
    ws.packetTypeCounts = packetTypeCounts;

    if (previousPacketAt > 0) {
        const intervalMs = Math.max(0, now - previousPacketAt);
        const recentPacketIntervalsMs = Array.isArray(ws.recentPacketIntervalsMs) ? ws.recentPacketIntervalsMs : [];

        recentPacketIntervalsMs.push(intervalMs);

        while (recentPacketIntervalsMs.length > RECENT_PACKET_INTERVAL_LIMIT) {
            recentPacketIntervalsMs.shift();
        }

        ws.recentPacketIntervalsMs = recentPacketIntervalsMs;

        ws.lastPacketIntervalMs = intervalMs;
        ws.minPacketIntervalMs =
            typeof ws.minPacketIntervalMs === "number" ? Math.min(ws.minPacketIntervalMs, intervalMs) : intervalMs;
    }

    ws.lastPacketAt = now;
    ws.lastActivityAt = now;
}

(async () => {
    const startInitialize = Date.now();

    // Resolve crash-era transfers before resetting sessions or allowing characters to load.
    await vaultRecovery.recover();
    await characterRecovery.recover();
    await worldRecovery.recover();
    await runtimeTiming.loadRuntimeTimingConfig();

    if (config.resetConnectedCharactersOnStartup) {
        const resetCharactersResponse = (await funct.fetchUrl("/internal/characters/reset-connected", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: vars.tokenAuth,
            },
        })) as { updated: number };

        console.log(
            `[Server] Characters marked disconnected at startup: ${resetCharactersResponse.updated}.`,
        );
    }

    const LoadMaps = new loadMaps();
    const LoadObjs = new loadObjs();
    const LoadBalance = new loadBalance();
    const LoadSpells = new loadSpells();
    const LoadCraftingRecipes = new loadCraftingRecipes();
    const LoadSmeltingRecipes = new loadSmeltingRecipes();

    await Promise.all([
        LoadMaps.initialize(),
        LoadObjs.initialize(),
        LoadBalance.initialize(),
        LoadSpells.initialize(),
        LoadCraftingRecipes.initialize(),
        LoadSmeltingRecipes.initialize(),
    ]);

    await game.restoreDroppedFloorItems();
    vars.serverReady = true;
    const endInitialize = Date.now() - startInitialize;
    const textInitializeServer = `[Server] Started in ${endInitialize}ms.`;

    funct.sendTelegramMessage(textInitializeServer);

    console.log(textInitializeServer);
})();

wsServer?.on("connection", function (ws: RuntimeClient, request: RuntimeConnectionRequest) {
    ws.clientIp = getConnectionIp(request, ws);
    const inboundBudget = new InboundBudget();
    const authTimeout = setTimeout(() => {
        if (!ws.id || vars.clients[ws.id] !== ws) ws.close(1008, 'Login timed out');
    }, 30000);
    authTimeout.unref();

    ws.on("message", function (data: unknown) {
        try {
            if (ws.readyState !== ws.OPEN || !vars.serverReady) {
                return;
            }

            const size = Buffer.isBuffer(data) ? data.length : data instanceof ArrayBuffer ? data.byteLength : 0;
            if (!inboundBudget.allow(size)) {
                ws.close(1008, 'Packet budget exceeded');
                return;
            }
            // Do not allow another client inventory action or tab switch during a bank save.
            // Packet bytes are still budgeted above; nothing is queued for later replay.
            if (ws.id && bankOperations.isBusy(ws.id)) return;
            pkg.setData(data as PacketPayload);
            const packageID = pkg.getPackageID();

            trackClientActivity(ws, packageID);

            protocol.handleData(ws, packageID);
        } catch (err) {
            funct.dumpError(err);
        }
    });

    ws.on("error", () => { /* ws closes invalid/oversized frames; keep errors off the process event loop. */ });
    ws.on("close", function () {
        clearTimeout(authTimeout);
        try {
            handleSocketClosed(ws);
        } catch (err) {
            funct.dumpError(err);
        }
    });
});

function processPlayerStatusTick(now: number) {
    for (const idUser in vars.personajes as RuntimeCharacters) {
        const user = (vars.personajes as RuntimeCharacters)[idUser] as ServerCharacter | undefined;

        if (!user) {
            continue;
        }

        if (user.meditar && user.mana < user.maxMana) {
            game.meditar(idUser);
        }

        if (user.cooldownFuerza > 0 && now - user.cooldownFuerza > vars.timing.statusDurations.fuerzaAgilidadBuffMs) {
            user.attrFuerza = user.bkAttrFuerza;
            user.cooldownFuerza = 0;
            const client = getClientById(idUser);

            if (client) {
                handleProtocol.updateFuerza(user.attrFuerza, 0, client);
            }
        }

        if (
            user.cooldownAgilidad > 0 &&
            now - user.cooldownAgilidad > vars.timing.statusDurations.fuerzaAgilidadBuffMs
        ) {
            user.attrAgilidad = user.bkAttrAgilidad;
            user.cooldownAgilidad = 0;
            const client = getClientById(idUser);

            if (client) {
                handleProtocol.updateAgilidad(user.attrAgilidad, 0, client);
            }
        }

        if (
            user.invisibleSpell &&
            (user.cooldownInvisibleSpell ?? 0) > 0 &&
            now - (user.cooldownInvisibleSpell ?? 0) > vars.timing.statusDurations.invisibilitySpellMs
        ) {
            game.setSpellInvisibility(idUser, false);
        }

        if (user.hiddenSkill && (user.hiddenSkillExpiresAt ?? 0) > 0 && now >= (user.hiddenSkillExpiresAt ?? 0)) {
            game.setHiddenSkill(idUser, false);
        }

        const isNorthPoleMap = user.map === 286 || user.map === 287 || user.map === 288;
        const currentHp = Number(user.hp ?? 0);
        if (!isNorthPoleMap || user.dead || currentHp <= 0) {
            continue;
        }

        const equippedBodySlot = String(user.idItemBody ?? 0);
        const equippedInventory = Array.isArray(user.inv) ? undefined : user.inv;
        const equippedBodyItem = equippedBodySlot !== "0" ? equippedInventory?.[equippedBodySlot] : undefined;
        const equippedBodyObject = equippedBodyItem ? vars.datObj[equippedBodyItem.idItem] : undefined;
        const isProtectedFromCold = Number(equippedBodyObject?.abriga ?? 0) === 1;

        if (isProtectedFromCold) {
            continue;
        }

        const nextHp = Math.max(0, currentHp - 5);
        user.hp = nextHp;
        const client = getClientById(idUser);

        if (client) {
            handleProtocol.console(
                "El frio del Polo Norte te lastima. Necesitas equipo invernal.",
                "#9ED8FF",
                0,
                0,
                client,
            );
            handleProtocol.updateHP(user.hp, client);
        }

        if (nextHp <= 0) {
            user.hp = 0;
            game.putBodyAndHeadDead(idUser);
            void game.tirarItemsUser(idUser);
        }
    }
}

function processCrowdControlTick(now: number) {
    for (const idUser in vars.personajes as RuntimeCharacters) {
        const user = (vars.personajes as RuntimeCharacters)[idUser] as ServerCharacter | undefined;

        if (!user) {
            continue;
        }

        if (Number(user.challengeLockedUntil ?? 0) > now) {
            if (!user.inmovilizado || user.paralizado) {
                user.inmovilizado = 1;
                user.paralizado = 0;
                user.cooldownParalizado = now;

                const challengeClient = getClientById(idUser);

                if (challengeClient) {
                    handleProtocol.inmo(idUser, 1, challengeClient);
                }
                broadcastCharacterSnapshot(game, handleProtocol, user);
            }

            continue;
        }

        const cooldownParalizado = user?.cooldownParalizado;

        if (typeof cooldownParalizado !== "number" || (!user.inmovilizado && !user.paralizado)) {
            continue;
        }

        if (now - cooldownParalizado < vars.timing.statusDurations.crowdControlUserMs) {
            continue;
        }

        user.inmovilizado = 0;
        user.paralizado = 0;
        user.cooldownParalizado = 0;

        const client = getClientById(idUser);

        if (client) {
            handleProtocol.inmo(idUser, 0, client);
        }
        broadcastCharacterSnapshot(game, handleProtocol, user);
    }

    for (const idNpc in vars.npcs as RuntimeNpcs) {
        const npc = (vars.npcs as RuntimeNpcs)[idNpc] as ServerNpc | undefined;

        const cooldownParalizado = npc?.cooldownParalizado;

        if (!npc || typeof cooldownParalizado !== "number" || (!npc.inmovilizado && !npc.paralizado)) {
            continue;
        }

        if (now - cooldownParalizado < vars.timing.statusDurations.crowdControlNpcMs) {
            continue;
        }

        npc.inmovilizado = 0;
        npc.paralizado = 0;
        npc.cooldownParalizado = 0;
        broadcastNpcSnapshot(game, handleProtocol, npc);
    }
}

function processActionCooldownTick(now: number) {
    for (const idUser in vars.personajes as RuntimeCharacters) {
        const user = (vars.personajes as RuntimeCharacters)[idUser] as ServerCharacter | undefined;

        if (!user) {
            continue;
        }

        const nextDialogAt = user.nextDialogAt ?? 0;
        const nextMeleeAt = user.nextMeleeAt ?? 0;
        const nextSpellAt = user.nextSpellAt ?? 0;
        const nextSpellAfterMeleeAt = user.nextSpellAfterMeleeAt ?? 0;
        const nextMeleeAfterSpellAt = user.nextMeleeAfterSpellAt ?? 0;
        const nextUseItemAt = user.nextUseItemAt ?? 0;
        const nextUseItemAfterMeleeAt = user.nextUseItemAfterMeleeAt ?? 0;

        if (nextDialogAt > 0 && now >= nextDialogAt) {
            user.nextDialogAt = 0;
        }

        if (nextMeleeAt > 0 && now >= nextMeleeAt) {
            user.nextMeleeAt = 0;
        }

        if (nextSpellAt > 0 && now >= nextSpellAt) {
            user.nextSpellAt = 0;
        }

        if (nextSpellAfterMeleeAt > 0 && now >= nextSpellAfterMeleeAt) {
            user.nextSpellAfterMeleeAt = 0;
        }

        if (nextMeleeAfterSpellAt > 0 && now >= nextMeleeAfterSpellAt) {
            user.nextMeleeAfterSpellAt = 0;
        }

        if (nextUseItemAt > 0 && now >= nextUseItemAt) {
            user.nextUseItemAt = 0;
        }

        if (nextUseItemAfterMeleeAt > 0 && now >= nextUseItemAfterMeleeAt) {
            user.nextUseItemAfterMeleeAt = 0;
        }
    }
}

function processIdleCharactersTick(now: number) {
    const idleCharacterTimeoutMs = vars.timing.idleCharacterTimeoutMs as number;

    if (idleCharacterTimeoutMs <= 0) {
        return;
    }

    const penalizedClientIds = getDuplicateIpIdlePenalizedClientIds();

    for (const idUser in vars.clients) {
        const client = vars.clients[idUser] as RuntimeClient | undefined;
        const user = (vars.personajes as RuntimeCharacters)[idUser] as ServerCharacter | undefined;

        if (!client || !user || user.cerrado) {
            continue;
        }

        if (user.adminSummonedBot) {
            client.lastActivityAt = now;
            continue;
        }

        if (user.fishing?.active || user.harvesting?.active || user.smelting?.active) {
            client.lastActivityAt = now;
            continue;
        }

        if (typeof client.lastActivityAt !== "number") {
            client.lastActivityAt = now;
            continue;
        }

        const isDuplicateIpScout = penalizedClientIds.has(idUser);
        const effectiveIdleTimeoutMs = isDuplicateIpScout ? DUPLICATE_IP_IDLE_TIMEOUT_MS : idleCharacterTimeoutMs;
        const idleReferenceAt = isDuplicateIpScout
            ? getScoutIdleReferenceAt(client, user)
            : Number(client.lastActivityAt ?? now);

        if (now - idleReferenceAt < effectiveIdleTimeoutMs) {
            continue;
        }

        handleProtocol.console("Desconectado por inactividad.", "white", 0, 0, client);

        funct.sendTelegramMessage(`[Server] User ${user.nameCharacter} disconnected due to inactivity.`);

        game.closeForce(idUser);
    }
}

function getScoutIdleReferenceAt(client: RuntimeClient, user: ServerCharacter): number {
    const lastMovedAt = Number(user.lastMovementActivityAt ?? 0);
    const lastCombatActivityAt = Number(user.lastCombatActivityAt ?? 0);

    if (lastCombatActivityAt > 0 && lastCombatActivityAt > lastMovedAt) {
        return lastCombatActivityAt;
    }

    if (lastMovedAt > 0) {
        return lastMovedAt;
    }

    return Number(client.connectedAt ?? Date.now());
}

function getDuplicateIpIdlePenalizedClientIds(): Set<string> {
    const penalizedClientIds = new Set<string>();
    const clientsByIp = new Map<
        string,
        {
            idUser: string;
            connectedAt: number;
            miningActive: boolean;
        }[]
    >();

    for (const idUser in vars.clients) {
        const client = vars.clients[idUser] as RuntimeClient | undefined;
        const user = (vars.personajes as RuntimeCharacters)[idUser] as ServerCharacter | undefined;

        if (!client || !user || user.cerrado) {
            continue;
        }

        const clientIp = socket.getIp(client);

        if (!clientIp) {
            continue;
        }

        const clientsForIp = clientsByIp.get(clientIp) ?? [];

        clientsForIp.push({
            idUser,
            connectedAt: Number(client.connectedAt ?? 0),
            miningActive: Boolean(user.harvesting?.active && user.harvesting?.skill === "mining"),
        });
        clientsByIp.set(clientIp, clientsForIp);
    }

    for (const clientsForIp of clientsByIp.values()) {
        if (clientsForIp.length < 2) {
            continue;
        }

        const hasActiveMiner = clientsForIp.some((entry) => entry.miningActive);

        if (!hasActiveMiner) {
            continue;
        }

        for (const entry of clientsForIp) {
            if (!entry.miningActive) {
                penalizedClientIds.add(entry.idUser);
            }
        }
    }

    return penalizedClientIds;
}

function processPendingLogoutTick(now: number) {
    for (const idUser in vars.personajes as RuntimeCharacters) {
        const user = (vars.personajes as RuntimeCharacters)[idUser] as ServerCharacter | undefined;

        if (!user || user.cerrado) {
            continue;
        }

        if (!user.logoutExpiresAt || user.logoutExpiresAt > now) {
            continue;
        }

        user.logoutRequestedAt = 0;
        user.logoutExpiresAt = 0;

        const client = vars.clients[idUser] as RuntimeClient | undefined;

        if (client) {
            handleProtocol.console(LOGOUT_CLOSING_MESSAGE, "#E69500", 0, 0, client);
        }

        game.closeForce(idUser);
    }
}

async function processJailTick() {
    for (const idUser in vars.personajes as RuntimeCharacters) {
        const user = (vars.personajes as RuntimeCharacters)[idUser] as ServerCharacter | undefined;

        if (!user || user.cerrado || Number(user.jailMinutes ?? 0) <= 0 || user.dead) {
            continue;
        }

        const client = getClientById(idUser);

        if (!client || socket.state(client) !== client.OPEN) {
            continue;
        }

        user.jailMinutes = Math.max(0, Number(user.jailMinutes ?? 0) - 1);

        if (user.jailMinutes <= 0) {
            user.jailReason = null;
            game.forceDismount(idUser);
            game.telep(client, JAIL_MAP, JAIL_RELEASE_X, JAIL_RELEASE_Y, "jail.release");
            handleProtocol.console("Has sido liberado.", "#E69500", 1, 0, client);
        } else {
            handleProtocol.console(
                `Te restan ${user.jailMinutes} minuto${user.jailMinutes === 1 ? "" : "s"} de carcel.`,
                "white",
                0,
                0,
                client,
            );
        }

        await game.persistCharacterSnapshot(user, { connected: true });
    }
}

//Limpio los personajes cerrados
createDynamicScheduler(
    () => vars.timing.cleanupClosedCharactersMs,
    function () {
        for (const idUser in vars.personajes as RuntimeCharacters) {
            const user = (vars.personajes as RuntimeCharacters)[idUser] as ServerCharacter | undefined;

            if (user?.cerrado) {
                delete vars.personajes[idUser];
            }
        }
    },
);

//TaskManager 60 ticks por segundo

createDynamicScheduler(
    () => vars.timing.gameplayTickMs,
    function () {
        const now = Date.now();

        processCrowdControlTick(now);
        processActionCooldownTick(now);
        game.processAdminSummonedBotTick(now);

        if (now >= nextPlayerStatusTickAt) {
            processPlayerStatusTick(now);
            nextPlayerStatusTickAt = now + vars.timing.playerStatusTickMs;
        }

        fishing.processTick(now);
        harvesting.processTick(now);
        smelting.processTick(now);
        npcs.processPendingMovements();
        protocol.processPendingMovements();
        processPendingLogoutTick(now);
    },
);

createDynamicScheduler(
    () => getWorldSaveIntervalMs(),
    function () {
        game.worldSave(() => {});
    },
);

createDynamicScheduler(
    () => vars.timing.idleCharacterSweepMs,
    function () {
        processIdleCharactersTick(Date.now());
    },
);

createDynamicScheduler(
    () => vars.timing.onlineStatsSnapshotMs,
    function () {
        void saveOnlineStatsSnapshot();
    },
);

createDynamicScheduler(
    () => JAIL_TICK_MS,
    function () {
        return processJailTick();
    },
);

createDynamicScheduler(
    () => FLOOR_ITEM_SWEEP_CHECK_MS,
    function () {
        return processFloorItemSweepTick(Date.now());
    },
);

void saveOnlineStatsSnapshot();
