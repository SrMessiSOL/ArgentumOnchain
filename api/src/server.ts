import {settlementPause} from './settlementPause';
import {AuthBudget,authIdentity} from './authBudget';
import {isIP} from 'node:net';
import {isGameSessionActive} from './repositories/auth';
import {spawnFloorItem} from "./repositories/floorSpawns";
import fs from "node:fs";
import path from "node:path";
import {installGameAssetRoutes,startAssetRecovery} from "./game-asset-routes";
import express from "express";
import {installEconomyRoutes,startEconomyRecovery} from "./economy-routes";
import {installAchievementRoutes} from "./achievement-routes";
import config from "./config";
import pool from "./db";
import { installWalletRoutes } from "./wallet-routes";
import { installPreferencesRoutes } from "./preferences-routes";
import { installCosmeticRoutes } from "./cosmetic-routes";
import { requireAuth } from "./middleware/auth";
import {
    confirmPasswordReset,
    consumeGameTicket,
    createCharacterForSession,
    createGameTicket,
    deleteCharacterForSession,
    getPasswordResetStatus,
    getPublicSessionByToken,
    loginAccount,
    logoutSession,
    registerAccount,
    requestPasswordReset,
    selectSessionCharacter,
} from "./repositories/auth";
import {
    getCharacterSettingsBySessionToken,
    saveCharacterSettingsBySessionToken,
} from "./repositories/characterSettings";
import {
    acceptClanRequest,
    createClan,
    createClanRequest,
    deleteClan,
    getCharacterClanSummary,
    getClanDetailsForCharacter,
    kickClanMember,
    leaveClan,
    listClansForCharacter,
    rejectClanRequest,
    setClanMemberRole,
    transferClanLeadership,
} from "./repositories/clans";
import {
    connectArenaRoomByAccount,
    createArenaGameTicket,
    createArenaRoom,
    disconnectArenaRoomByAccount,
    getArenaRoom,
    joinArenaRoom,
    joinArenaRoomByLink,
    leaveArenaRoom,
    leaveArenaRoomByAccount,
    listPublicArenaRooms,
    resetAllArenaRoomMembersConnectedStatus,
} from "./repositories/arenas";
import {
    banCharacterByName,
    banIpByCharacterName,
    claimCharacterConnection,
    getCharacterByAccountAndEmail,
    jailCharacterByName,
    listCharacterRanking,
    patchCharacter,
    patchCharacterBankItems,
    patchCharacterItems,
    patchCharacterSpells,
    patchCharacterStorage,
    releaseCharacterConnection,
    resetAllCharactersConnectedStatus,
    unbanCharacterByName,
    unbanIpByCharacterName,
} from "./repositories/characters";
import {
    getAccountVault,
    getClanVault,
    syncAccountVault,
    syncClanVault,
} from "./repositories/vaults";
import {
    buyMarketListing,
    cancelMarketListing,
    claimMarket,
    createMarketListing,
    getMarketClaims,
    listMarketListings,
} from "./repositories/market";
import {
    getGameNpcById,
    listGameNpcChangesSince,
    listGameNpcs,
    upsertGameNpc,
} from "./repositories/gameNpcs";
import {
    getGameObjectById,
    listGameObjectChangesSince,
    listGameObjects,
    upsertGameObject,
} from "./repositories/gameObjects";
import {
    getGameBalance,
    listGameBalanceChangesSince,
    upsertGameBalance,
} from "./repositories/gameBalance";
import {
    getGameCraftingRecipeById,
    listGameCraftingRecipeChangesSince,
    deleteGameCraftingRecipe,
    listGameCraftingRecipes,
    upsertGameCraftingRecipe,
} from "./repositories/gameCraftingRecipes";
import {
    getGameSmeltingRecipeById,
    listGameSmeltingRecipeChangesSince,
    listGameSmeltingRecipes,
    upsertGameSmeltingRecipe,
} from "./repositories/gameSmeltingRecipes";
import {
    getRuntimeTimingConfig,
    updateRuntimeTimingValue,
} from "./repositories/runtimeSettings";
import { getPublicWiki } from "./repositories/wiki";
import {
    createUserOnlineStat,
    listUserOnlineStats,
} from "./repositories/userOnlineStats";
import { createChallengeHistory } from "./repositories/challenges";

const app = express();
const SLOW_REQUEST_LOG_THRESHOLD_MS = 2000;
const SLOW_CHARACTER_SAVE_LOG_THRESHOLD_MS = 1000;

function isAuthorizedGameDataAdmin(session: {
    account: { _id: string; email: string };
}): boolean {
    return Boolean(config.gameDataAdminAccountId && session.account._id === config.gameDataAdminAccountId);
}

function isCharacterSaveRoute(method: string, path: string): boolean {
    return (
        method === "PUT" &&
        /^\/character_save\/[^/]+(?:\/(?:items|bank|storage|spells))?$/.test(
            path,
        )
    );
}

function getBearerToken(request: express.Request): string {
    const authorization = request.header("Authorization") || "";
    return authorization.startsWith("Bearer ")
        ? authorization.slice(7).trim()
        : "";
}

function getGameDataAdminProxyHeader(request: express.Request): string {
    return request.header("x-game-data-admin-token")?.trim() || "";
}

function getRequestIp(request: express.Request): string | null {
    const peer=request.socket.remoteAddress?.trim()||'';
    // Only our loopback frontend may identify the original gateway client.
    const supplied=request.header('x-aochain-client-ip')?.trim();
    if(['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer)&&supplied&&isIP(supplied))return supplied;
    return peer||null;
}

async function getAuthorizedSession(request: express.Request) {
    const token = getBearerToken(request);

    if (!token) {
        return null;
    }

    const session = await getPublicSessionByToken(token);

    if (!session) {
        return null;
    }

    return { token, session };
}

async function requireAdminEmailSession(
    request: express.Request,
    response: express.Response,
): Promise<ReturnType<typeof getAuthorizedSession> | null> {
    if (!config.gameDataAdminAccountId) {
        response
            .status(403)
            .json({ error: "Admin de game-data deshabilitado." });
        return null;
    }

    if (
        !config.gameDataAdminProxyToken ||
        getGameDataAdminProxyHeader(request) !== config.gameDataAdminProxyToken
    ) {
        response.status(403).json({ error: "No autorizado." });
        return null;
    }

    const authorized = await getAuthorizedSession(request);

    if (!authorized) {
        response.status(401).json({ error: "Unauthorized" });
        return null;
    }

    if (!isAuthorizedGameDataAdmin(authorized.session)) {
        response.status(403).json({ error: "No autorizado." });
        return null;
    }

    return authorized;
}

async function ensurePgStatStatements(): Promise<void> {
    try {
        await pool.query("CREATE EXTENSION IF NOT EXISTS pg_stat_statements");
        await pool.query("SELECT 1 FROM pg_stat_statements LIMIT 1");
        console.log("pg_stat_statements ready");
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
            `[API] Could not enable pg_stat_statements automatically: ${message}`,
        );
    }
}

async function start(): Promise<void> {
    try {
        await pool.query("SELECT 1");
        console.log("PostgreSQL connected successfully");
        if (process.env.AOWEB_RUN_MIGRATIONS !== "0") await ensurePgStatStatements();

        if (process.env.AOWEB_RUN_MIGRATIONS !== "0") {
            await pool.query(fs.readFileSync(path.resolve(__dirname,"..","game-assets-schema.sql"),"utf8"));
            await pool.query(fs.readFileSync(path.resolve(__dirname,"..","vault-receipts-schema.sql"),"utf8"));
            await pool.query(fs.readFileSync(path.resolve(__dirname,"..","character-receipts-schema.sql"),"utf8"));
            await pool.query(fs.readFileSync(path.resolve(__dirname,"..","floor-items-schema.sql"),"utf8"));
            await pool.query(fs.readFileSync(path.resolve(__dirname,"..","floor-spawns-schema.sql"),"utf8"));
            await pool.query(fs.readFileSync(path.resolve(__dirname,"..","market-receipts-schema.sql"),"utf8"));
            await pool.query(fs.readFileSync(path.resolve(__dirname,"..","session-credentials-migration.sql"),"utf8"));
            await pool.query(fs.readFileSync(path.resolve(__dirname,"..","gold-ledger-integrity.sql"),"utf8"));
        } else {
            // Runtime credentials must not own or alter schema objects.
            await pool.query("SELECT 1 FROM game_asset_operations LIMIT 0");
            await pool.query("SELECT 1 FROM vault_operation_receipts LIMIT 0");
            await pool.query("SELECT 1 FROM character_save_receipts LIMIT 0");
            await pool.query("SELECT 1 FROM dropped_floor_items LIMIT 0");
            await pool.query("SELECT 1 FROM floor_spawn_receipts LIMIT 0");
            await pool.query("SELECT 1 FROM market_operation_receipts LIMIT 0");
        }
        startAssetRecovery();
        startEconomyRecovery();
        app.listen(config.port, process.env.HOST ?? "127.0.0.1", () => {
            console.log(`API listening on port ${config.port}`);
        });
    } catch (error) {
        console.error("Failed to connect to PostgreSQL", error);
        process.exit(1);
    }
}

app.use(express.json({ limit: "2mb" }));
app.use(settlementPause);
const authBudget=new AuthBudget();
app.use((request,response,next)=>{
    if(request.method!=='POST'||!['/auth/login','/auth/register','/auth/password-reset/request','/auth/password-reset/confirm'].includes(request.path)){next();return;}
    const ip=getRequestIp(request)||'unknown';
    const identity=String(request.body?.identifier||request.body?.email||'').slice(0,254);
    const windowMs=5*60*1000;
    const allowed=authBudget.allow('ip:'+authIdentity(ip),60,windowMs)&&
        (request.path!=='/auth/login'||authBudget.allow('login:'+authIdentity(identity),10,windowMs))&&
        (request.path!=='/auth/register'||authBudget.allow('register:'+authIdentity(ip),10,30*60*1000));
    if(!allowed){response.setHeader('Retry-After','300');response.status(429).json({error:'Too many authentication attempts. Please wait before trying again.'});return;}
    next();
});
app.use((request, response, next) => {
    const startedAt = Date.now();

    response.on("finish", () => {
        const durationMs = Date.now() - startedAt;
        const isCharacterSave = isCharacterSaveRoute(
            request.method,
            request.path,
        );

        if (
            isCharacterSave &&
            durationMs >= SLOW_CHARACTER_SAVE_LOG_THRESHOLD_MS
        ) {
            console.warn(
                `[API][character-save][slow] ${request.method} ${request.route?.path ?? "[unmatched route]"} -> ${response.statusCode} in ${durationMs}ms | pool total=${pool.totalCount} idle=${pool.idleCount} waiting=${pool.waitingCount}`,
            );
            return;
        }

        if (durationMs < SLOW_REQUEST_LOG_THRESHOLD_MS) {
            return;
        }

        console.warn(
            `[API][slow] ${request.method} ${request.route?.path ?? "[unmatched route]"} -> ${response.statusCode} in ${durationMs}ms | pool total=${pool.totalCount} idle=${pool.idleCount} waiting=${pool.waitingCount}`,
        );
    });

    next();
});

app.use((request, response, next) => {
    const origin = request.headers.origin;

    const allowedOrigin = config.corsOrigin === "*" ? new URL(config.siteUrl).origin : config.corsOrigin;
    if (origin && origin !== allowedOrigin) {
        response.status(403).json({ error: "Origin not allowed" });
        return;
    }
    if (origin) {
        response.header("Access-Control-Allow-Origin", allowedOrigin);
        response.vary("Origin");
    }

    response.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
    );
    response.header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");

    if (request.method === "OPTIONS") {
        response.sendStatus(204);
        return;
    }

    next();
});

app.get("/health", async (_request, response) => {
    await pool.query("SELECT 1");
    response.json({ ok: true });
});

app.get("/runtime-config", async (_request, response) => {
    try {
        const timing = await getRuntimeTimingConfig();
        response.json({
            timing: {
                walkStepMs: timing.walkStepMs,
                actionCooldowns: timing.actionCooldowns,
                visualEffects: timing.visualEffects,
            },
        });
    } catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.get("/ranking", async (request, response) => {
    try {
        const sort = request.query.sort === "kills" ? "kills" : "level";
        const rawClassId =
            typeof request.query.classId === "string"
                ? Number.parseInt(request.query.classId, 10)
                : Number.NaN;
        const classId =
            Number.isInteger(rawClassId) && rawClassId > 0
                ? rawClassId
                : undefined;
        const result = await listCharacterRanking({ sort, classId });
        response.json(result);
    } catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.get("/wiki", async (_request, response) => {
    try {
        const wiki = await getPublicWiki();
        response.json(wiki);
    } catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.get("/runtime-config/admin", async (_request, response) => {
    try {
        const timing = await getRuntimeTimingConfig();
        response.json({ timing });
    } catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.get("/internal/runtime-config", requireAuth, async (_request, response) => {
    try {
        const timing = await getRuntimeTimingConfig();
        response.json({ timing });
    } catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.put(
    "/internal/runtime-config/timing",
    requireAuth,
    async (request, response) => {
        try {
            const path =
                typeof request.body?.path === "string"
                    ? request.body.path.trim()
                    : "";

            if (!path) {
                response.status(400).json({ error: "path es requerido" });
                return;
            }

            const timing = await updateRuntimeTimingValue(
                path,
                request.body?.value,
            );
            response.json({ timing });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unexpected error";
            response
                .status(message === "Intervalo invalido" ? 400 : 500)
                .json({ error: message });
        }
    },
);

app.get("/admin/game-data/objects", async (request, response) => {
    try {
        const authorized = await requireAdminEmailSession(request, response);
        if (!authorized) {
            return;
        }

        response.json(await listGameObjects(request.query));
    } catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.get("/admin/game-data/objects/:id", async (request, response) => {
    try {
        const authorized = await requireAdminEmailSession(request, response);
        if (!authorized) {
            return;
        }

        const rawId = Array.isArray(request.params.id)
            ? request.params.id[0]
            : request.params.id;
        const id = Number.parseInt(rawId, 10);
        if (!Number.isInteger(id) || id <= 0) {
            response.status(400).json({ error: "id invalido" });
            return;
        }

        response.json(await getGameObjectById(id));
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        response
            .status(message === "Game object not found" ? 404 : 500)
            .json({ error: message });
    }
});

app.put("/admin/game-data/objects/:id", async (request, response) => {
    try {
        const authorized = await requireAdminEmailSession(request, response);
        if (!authorized) {
            return;
        }

        const rawId = Array.isArray(request.params.id)
            ? request.params.id[0]
            : request.params.id;
        const id = Number.parseInt(rawId, 10);
        if (!Number.isInteger(id) || id <= 0) {
            response.status(400).json({ error: "id invalido" });
            return;
        }

        response.json(
            await upsertGameObject(
                id,
                request.body,
                authorized.session.account._id,
            ),
        );
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        response.status(400).json({ error: message });
    }
});

app.get("/admin/game-data/npcs", async (request, response) => {
    try {
        const authorized = await requireAdminEmailSession(request, response);
        if (!authorized) {
            return;
        }

        response.json(await listGameNpcs(request.query));
    } catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.get("/admin/game-data/npcs/:id", async (request, response) => {
    try {
        const authorized = await requireAdminEmailSession(request, response);
        if (!authorized) {
            return;
        }

        const rawId = Array.isArray(request.params.id)
            ? request.params.id[0]
            : request.params.id;
        const id = Number.parseInt(rawId, 10);
        if (!Number.isInteger(id) || id <= 0) {
            response.status(400).json({ error: "id invalido" });
            return;
        }

        response.json(await getGameNpcById(id));
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        response
            .status(message === "Game npc not found" ? 404 : 500)
            .json({ error: message });
    }
});

app.put("/admin/game-data/npcs/:id", async (request, response) => {
    try {
        const authorized = await requireAdminEmailSession(request, response);
        if (!authorized) {
            return;
        }

        const rawId = Array.isArray(request.params.id)
            ? request.params.id[0]
            : request.params.id;
        const id = Number.parseInt(rawId, 10);
        if (!Number.isInteger(id) || id <= 0) {
            response.status(400).json({ error: "id invalido" });
            return;
        }

        response.json(
            await upsertGameNpc(
                id,
                request.body,
                authorized.session.account._id,
            ),
        );
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        response.status(400).json({ error: message });
    }
});

app.get("/admin/game-data/crafting-recipes", async (request, response) => {
    try {
        const authorized = await requireAdminEmailSession(request, response);
        if (!authorized) return;
        response.json(await listGameCraftingRecipes(request.query));
    } catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.get("/admin/game-data/crafting-recipes/:id", async (request, response) => {
    try {
        const authorized = await requireAdminEmailSession(request, response);
        if (!authorized) return;
        const rawId = Array.isArray(request.params.id)
            ? request.params.id[0]
            : request.params.id;
        const id = Number.parseInt(rawId, 10);
        if (!Number.isInteger(id) || id <= 0)
            return void response.status(400).json({ error: "id invalido" });
        response.json(await getGameCraftingRecipeById(id));
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        response
            .status(message === "Game crafting recipe not found" ? 404 : 500)
            .json({ error: message });
    }
});

app.put("/admin/game-data/crafting-recipes/:id", async (request, response) => {
    try {
        const authorized = await requireAdminEmailSession(request, response);
        if (!authorized) return;
        const rawId = Array.isArray(request.params.id)
            ? request.params.id[0]
            : request.params.id;
        const id = Number.parseInt(rawId, 10);
        if (!Number.isInteger(id) || id <= 0)
            return void response.status(400).json({ error: "id invalido" });
        response.json(
            await upsertGameCraftingRecipe(
                id,
                request.body,
                authorized.session.account._id,
            ),
        );
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        response.status(400).json({ error: message });
    }
});

app.delete(
    "/admin/game-data/crafting-recipes/:id",
    async (request, response) => {
        try {
            const authorized = await requireAdminEmailSession(
                request,
                response,
            );
            if (!authorized) return;
            const rawId = Array.isArray(request.params.id)
                ? request.params.id[0]
                : request.params.id;
            const id = Number.parseInt(rawId, 10);
            if (!Number.isInteger(id) || id <= 0)
                return void response.status(400).json({ error: "id invalido" });
            response.json(
                await deleteGameCraftingRecipe(
                    id,
                    authorized.session.account._id,
                ),
            );
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unexpected error";
            response
                .status(
                    message === "Game crafting recipe not found" ? 404 : 400,
                )
                .json({ error: message });
        }
    },
);

app.get("/admin/game-data/smelting-recipes", async (_request, response) => {
    try {
        const authorized = await requireAdminEmailSession(_request, response);
        if (!authorized) return;
        response.json(await listGameSmeltingRecipes());
    } catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.get("/admin/game-data/smelting-recipes/:id", async (request, response) => {
    try {
        const authorized = await requireAdminEmailSession(request, response);
        if (!authorized) return;
        const rawId = Array.isArray(request.params.id)
            ? request.params.id[0]
            : request.params.id;
        const id = Number.parseInt(rawId, 10);
        if (!Number.isInteger(id) || id <= 0)
            return void response.status(400).json({ error: "id invalido" });
        response.json(await getGameSmeltingRecipeById(id));
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        response
            .status(message === "Game smelting recipe not found" ? 404 : 500)
            .json({ error: message });
    }
});

app.put("/admin/game-data/smelting-recipes/:id", async (request, response) => {
    try {
        const authorized = await requireAdminEmailSession(request, response);
        if (!authorized) return;
        const rawId = Array.isArray(request.params.id)
            ? request.params.id[0]
            : request.params.id;
        const id = Number.parseInt(rawId, 10);
        if (!Number.isInteger(id) || id <= 0)
            return void response.status(400).json({ error: "id invalido" });
        response.json(
            await upsertGameSmeltingRecipe(
                id,
                request.body,
                authorized.session.account._id,
            ),
        );
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        response.status(400).json({ error: message });
    }
});

app.get("/admin/game-data/balance", async (request, response) => {
    try {
        const authorized = await requireAdminEmailSession(request, response);
        if (!authorized) return;
        response.json(await getGameBalance());
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        response
            .status(message === "Game balance not found" ? 404 : 500)
            .json({ error: message });
    }
});

app.put("/admin/game-data/balance", async (request, response) => {
    try {
        const authorized = await requireAdminEmailSession(request, response);
        if (!authorized) return;
        response.json(
            await upsertGameBalance(
                request.body,
                authorized.session.account._id,
            ),
        );
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        response.status(400).json({ error: message });
    }
});

app.get(
    "/internal/game-data/objects",
    requireAuth,
    async (request, response) => {
        try {
            response.json(await listGameObjects(request.query));
        } catch (error) {
            response.status(500).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.get(
    "/internal/game-data/objects/changes",
    requireAuth,
    async (request, response) => {
        try {
            const sinceValue = Array.isArray(request.query.sinceVersion)
                ? request.query.sinceVersion[0]
                : request.query.sinceVersion;
            const sinceVersion =
                typeof sinceValue === "string"
                    ? Number.parseInt(sinceValue, 10)
                    : 0;
            response.json(
                await listGameObjectChangesSince(
                    Number.isFinite(sinceVersion)
                        ? Math.max(0, sinceVersion)
                        : 0,
                ),
            );
        } catch (error) {
            response.status(500).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.get(
    "/internal/game-data/objects/:id",
    requireAuth,
    async (request, response) => {
        try {
            const rawId = Array.isArray(request.params.id)
                ? request.params.id[0]
                : request.params.id;
            const id = Number.parseInt(rawId, 10);
            if (!Number.isInteger(id) || id <= 0) {
                response.status(400).json({ error: "id invalido" });
                return;
            }

            response.json(await getGameObjectById(id));
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unexpected error";
            response
                .status(message === "Game object not found" ? 404 : 500)
                .json({ error: message });
        }
    },
);

app.put(
    "/internal/game-data/objects/:id",
    requireAuth,
    async (request, response) => {
        try {
            const rawId = Array.isArray(request.params.id)
                ? request.params.id[0]
                : request.params.id;
            const id = Number.parseInt(rawId, 10);
            if (!Number.isInteger(id) || id <= 0) {
                response.status(400).json({ error: "id invalido" });
                return;
            }

            response.json(await upsertGameObject(id, request.body));
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unexpected error";
            response.status(400).json({ error: message });
        }
    },
);

app.get("/internal/game-data/npcs", requireAuth, async (request, response) => {
    try {
        response.json(await listGameNpcs(request.query));
    } catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.get(
    "/internal/game-data/npcs/changes",
    requireAuth,
    async (request, response) => {
        try {
            const sinceValue = Array.isArray(request.query.sinceVersion)
                ? request.query.sinceVersion[0]
                : request.query.sinceVersion;
            const sinceVersion =
                typeof sinceValue === "string"
                    ? Number.parseInt(sinceValue, 10)
                    : 0;
            response.json(
                await listGameNpcChangesSince(
                    Number.isFinite(sinceVersion)
                        ? Math.max(0, sinceVersion)
                        : 0,
                ),
            );
        } catch (error) {
            response.status(500).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.get(
    "/internal/game-data/npcs/:id",
    requireAuth,
    async (request, response) => {
        try {
            const rawId = Array.isArray(request.params.id)
                ? request.params.id[0]
                : request.params.id;
            const id = Number.parseInt(rawId, 10);
            if (!Number.isInteger(id) || id <= 0) {
                response.status(400).json({ error: "id invalido" });
                return;
            }

            response.json(await getGameNpcById(id));
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unexpected error";
            response
                .status(message === "Game npc not found" ? 404 : 500)
                .json({ error: message });
        }
    },
);

app.put(
    "/internal/game-data/npcs/:id",
    requireAuth,
    async (request, response) => {
        try {
            const rawId = Array.isArray(request.params.id)
                ? request.params.id[0]
                : request.params.id;
            const id = Number.parseInt(rawId, 10);
            if (!Number.isInteger(id) || id <= 0) {
                response.status(400).json({ error: "id invalido" });
                return;
            }

            response.json(await upsertGameNpc(id, request.body));
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unexpected error";
            response.status(400).json({ error: message });
        }
    },
);

app.get(
    "/internal/game-data/crafting-recipes",
    requireAuth,
    async (request, response) => {
        try {
            response.json(await listGameCraftingRecipes(request.query));
        } catch (error) {
            response.status(500).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.get(
    "/internal/game-data/crafting-recipes/changes",
    requireAuth,
    async (request, response) => {
        try {
            const sinceValue = Array.isArray(request.query.sinceVersion)
                ? request.query.sinceVersion[0]
                : request.query.sinceVersion;
            const sinceVersion =
                typeof sinceValue === "string"
                    ? Number.parseInt(sinceValue, 10)
                    : 0;
            response.json(
                await listGameCraftingRecipeChangesSince(
                    Number.isFinite(sinceVersion)
                        ? Math.max(0, sinceVersion)
                        : 0,
                ),
            );
        } catch (error) {
            response.status(500).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.get(
    "/internal/game-data/balance",
    requireAuth,
    async (_request, response) => {
        try {
            response.json(await getGameBalance());
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unexpected error";
            response
                .status(message === "Game balance not found" ? 404 : 500)
                .json({ error: message });
        }
    },
);

app.get(
    "/internal/game-data/balance/changes",
    requireAuth,
    async (request, response) => {
        try {
            const sinceValue = Array.isArray(request.query.sinceVersion)
                ? request.query.sinceVersion[0]
                : request.query.sinceVersion;
            const sinceVersion =
                typeof sinceValue === "string"
                    ? Number.parseInt(sinceValue, 10)
                    : 0;
            response.json(
                await listGameBalanceChangesSince(
                    Number.isFinite(sinceVersion)
                        ? Math.max(0, sinceVersion)
                        : 0,
                ),
            );
        } catch (error) {
            response.status(500).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.put(
    "/internal/game-data/balance",
    requireAuth,
    async (request, response) => {
        try {
            response.json(await upsertGameBalance(request.body));
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unexpected error";
            response.status(400).json({ error: message });
        }
    },
);

app.get(
    "/internal/game-data/crafting-recipes/:id",
    requireAuth,
    async (request, response) => {
        try {
            const rawId = Array.isArray(request.params.id)
                ? request.params.id[0]
                : request.params.id;
            const id = Number.parseInt(rawId, 10);
            if (!Number.isInteger(id) || id <= 0)
                return void response.status(400).json({ error: "id invalido" });
            response.json(await getGameCraftingRecipeById(id));
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unexpected error";
            response
                .status(
                    message === "Game crafting recipe not found" ? 404 : 500,
                )
                .json({ error: message });
        }
    },
);

app.put(
    "/internal/game-data/crafting-recipes/:id",
    requireAuth,
    async (request, response) => {
        try {
            const rawId = Array.isArray(request.params.id)
                ? request.params.id[0]
                : request.params.id;
            const id = Number.parseInt(rawId, 10);
            if (!Number.isInteger(id) || id <= 0)
                return void response.status(400).json({ error: "id invalido" });
            response.json(await upsertGameCraftingRecipe(id, request.body));
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unexpected error";
            response.status(400).json({ error: message });
        }
    },
);

app.delete(
    "/internal/game-data/crafting-recipes/:id",
    requireAuth,
    async (request, response) => {
        try {
            const rawId = Array.isArray(request.params.id)
                ? request.params.id[0]
                : request.params.id;
            const id = Number.parseInt(rawId, 10);
            if (!Number.isInteger(id) || id <= 0)
                return void response.status(400).json({ error: "id invalido" });
            response.json(await deleteGameCraftingRecipe(id));
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unexpected error";
            response
                .status(
                    message === "Game crafting recipe not found" ? 404 : 400,
                )
                .json({ error: message });
        }
    },
);

app.get(
    "/internal/game-data/smelting-recipes",
    requireAuth,
    async (_request, response) => {
        try {
            response.json(await listGameSmeltingRecipes());
        } catch (error) {
            response.status(500).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.get(
    "/internal/game-data/smelting-recipes/changes",
    requireAuth,
    async (request, response) => {
        try {
            const sinceValue = Array.isArray(request.query.sinceVersion)
                ? request.query.sinceVersion[0]
                : request.query.sinceVersion;
            const sinceVersion =
                typeof sinceValue === "string"
                    ? Number.parseInt(sinceValue, 10)
                    : 0;
            response.json(
                await listGameSmeltingRecipeChangesSince(
                    Number.isFinite(sinceVersion)
                        ? Math.max(0, sinceVersion)
                        : 0,
                ),
            );
        } catch (error) {
            response.status(500).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.get(
    "/internal/game-data/smelting-recipes/:id",
    requireAuth,
    async (request, response) => {
        try {
            const rawId = Array.isArray(request.params.id)
                ? request.params.id[0]
                : request.params.id;
            const id = Number.parseInt(rawId, 10);
            if (!Number.isInteger(id) || id <= 0)
                return void response.status(400).json({ error: "id invalido" });
            response.json(await getGameSmeltingRecipeById(id));
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unexpected error";
            response
                .status(
                    message === "Game smelting recipe not found" ? 404 : 500,
                )
                .json({ error: message });
        }
    },
);

app.put(
    "/internal/game-data/smelting-recipes/:id",
    requireAuth,
    async (request, response) => {
        try {
            const rawId = Array.isArray(request.params.id)
                ? request.params.id[0]
                : request.params.id;
            const id = Number.parseInt(rawId, 10);
            if (!Number.isInteger(id) || id <= 0)
                return void response.status(400).json({ error: "id invalido" });
            response.json(await upsertGameSmeltingRecipe(id, request.body));
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unexpected error";
            response.status(400).json({ error: message });
        }
    },
);

app.post("/auth/register", async (request, response) => {
    try {
        const result = await registerAccount(request.body);
        response.status(201).json(result);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        const status = message.includes("Ya existe") ? 409 : 400;
        response.status(status).json({ error: message });
    }
});

app.post("/auth/login", async (request, response) => {
    try {
        const result = await loginAccount(request.body);
        response.json(result);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        const status = message === "Credenciales invalidas" ? 401 : 400;
        response.status(status).json({ error: message });
    }
});

app.post("/auth/password-reset/request", async (request, response) => {
    try {
        const result = await requestPasswordReset(
            request.body,
            getRequestIp(request),
        );
        response.json(result);
    } catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.get("/auth/password-reset/:token", async (request, response) => {
    try {
        const token =
            typeof request.params.token === "string"
                ? request.params.token.trim()
                : "";

        if (!token) {
            response.status(400).json({ error: "Token invalido" });
            return;
        }

        const result = await getPasswordResetStatus(token);
        response.json(result);
    } catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.post("/auth/password-reset/confirm", async (request, response) => {
    try {
        const result = await confirmPasswordReset(request.body);
        response.json(result);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        const status = message === "TOKEN_INVALIDO" ? 400 : 400;
        response.status(status).json({
            error:
                message === "TOKEN_INVALIDO"
                    ? "El link de recuperacion es invalido o ya vencio"
                    : message,
        });
    }
});

const handleAuthSession = async (
    request: express.Request,
    response: express.Response,
) => {
    try {
        const token = getBearerToken(request);

        if (!token) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        const session = await getPublicSessionByToken(token);

        if (!session) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        response.json(session);
    } catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
};

app.get("/auth/session", handleAuthSession);
app.get("/auth/me", handleAuthSession);

app.post("/auth/logout", async (request, response) => {
    try {
        const token = getBearerToken(request);

        if (token) {
            await logoutSession(token);
        }

        response.json({ ok: true });
    } catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.post("/auth/select-character", async (request, response) => {
    try {
        const token = getBearerToken(request);

        if (!token) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        const characterId =
            typeof request.body?.characterId === "string"
                ? request.body.characterId.trim()
                : "";

        if (!characterId) {
            response.status(400).json({ error: "characterId es requerido" });
            return;
        }

        const session = await selectSessionCharacter(token, characterId);

        if (!session) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        response.json(session);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        const status =
            message === "Personaje invalido"
                ? 400
                : message === "Tu personaje se encuentra baneado." ||
                    message === "Tu personaje tiene un ban de IP activo."
                  ? 403
                  : 500;
        response.status(status).json({ error: message });
    }
});

app.post("/auth/create-character", async (request, response) => {
    try {
        const authorization = request.header("Authorization") || "";
        const token = authorization.startsWith("Bearer ")
            ? authorization.slice(7).trim()
            : "";

        if (!token) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        const session = await createCharacterForSession(token, request.body);

        if (!session) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        response.status(201).json(session);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        const status =
            message === "Ese nombre de personaje ya esta en uso" ? 409 : 400;
        response.status(status).json({ error: message });
    }
});

app.delete("/auth/characters/:characterId", async (request, response) => {
    try {
        const token = getBearerToken(request);

        if (!token) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        const characterId =
            typeof request.params.characterId === "string"
                ? request.params.characterId.trim()
                : "";

        if (!characterId) {
            response.status(400).json({ error: "characterId es requerido" });
            return;
        }

        const session = await deleteCharacterForSession(token, characterId);

        if (!session) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        response.json(session);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        const status =
            message === "Personaje invalido"
                ? 400
                : message === "No se puede borrar un personaje conectado"
                  ? 409
                  : message === "No se puede borrar un personaje baneado"
                    ? 403
                    : 500;
        response.status(status).json({ error: message });
    }
});

app.post("/auth/game-ticket", async (request, response) => {
    try {
        const authorization = request.header("Authorization") || "";
        const token = authorization.startsWith("Bearer ")
            ? authorization.slice(7).trim()
            : "";

        if (!token) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        const gameTicket = await createGameTicket(token);

        if (!gameTicket) {
            response
                .status(400)
                .json({ error: "No hay un personaje seleccionado" });
            return;
        }

        response.json(gameTicket);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        const status =
            message === "Tu personaje se encuentra baneado." ||
            message === "Tu personaje tiene un ban de IP activo."
                ? 403
                : 500;
        response.status(status).json({ error: message });
    }
});

app.get("/auth/character-settings", async (request, response) => {
    try {
        const token = getBearerToken(request);

        if (!token) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        const settings = await getCharacterSettingsBySessionToken(token);

        if (!settings) {
            response
                .status(400)
                .json({ error: "No hay un personaje seleccionado" });
            return;
        }

        response.json(settings);
    } catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.put("/auth/character-settings", async (request, response) => {
    try {
        const token = getBearerToken(request);

        if (!token) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        const settings = await saveCharacterSettingsBySessionToken(
            token,
            request.body,
        );

        if (!settings) {
            response
                .status(400)
                .json({ error: "No hay un personaje seleccionado" });
            return;
        }

        response.json(settings);
    } catch (error) {
        const status =
            error instanceof Error && error.name === "ZodError" ? 400 : 500;
        response.status(status).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.get("/auth/clans", async (request, response) => {
    try {
        const authorized = await getAuthorizedSession(request);

        if (!authorized) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        const characterId =
            authorized.session.selectedCharacterId?.trim() || "";

        if (!characterId) {
            response.status(409).json({
                error: "No hay un personaje seleccionado en la sesion.",
            });
            return;
        }

        response.json(
            await listClansForCharacter(
                authorized.session.account._id,
                characterId,
            ),
        );
    } catch (error) {
        response.status(400).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.get("/auth/clans/:clanId", async (request, response) => {
    try {
        const authorized = await getAuthorizedSession(request);

        if (!authorized) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        const characterId =
            authorized.session.selectedCharacterId?.trim() || "";
        const clanId = Array.isArray(request.params.clanId)
            ? request.params.clanId[0]
            : request.params.clanId;

        if (!characterId || !clanId) {
            response.status(characterId ? 400 : 409).json({
                error: characterId
                    ? "clanId es requerido"
                    : "No hay un personaje seleccionado en la sesion.",
            });
            return;
        }

        response.json(
            await getClanDetailsForCharacter(
                authorized.session.account._id,
                characterId,
                clanId,
            ),
        );
    } catch (error) {
        response.status(400).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

// This fork runs one shared world; keep upstream arena code dormant.
app.use(["/arenas", "/internal/arenas"], (_request, response) => {
    response.status(404).json({ error: "Las salas no estÃƒÂ¡n habilitadas en este servidor." });
});

app.get("/arenas/rooms", async (request, response) => {
    try {
        const authorization = request.header("Authorization") || "";
        const token = authorization.startsWith("Bearer ")
            ? authorization.slice(7).trim()
            : "";

        if (!token) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        const rooms = await listPublicArenaRooms(token);

        if (!rooms) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        response.json({ rooms });
    } catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.post("/arenas/rooms", async (request, response) => {
    try {
        const authorization = request.header("Authorization") || "";
        const token = authorization.startsWith("Bearer ")
            ? authorization.slice(7).trim()
            : "";

        if (!token) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        const room = await createArenaRoom(token, request.body);

        if (!room) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        response.status(201).json(room);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        response.status(400).json({ error: message });
    }
});

app.get("/arenas/rooms/:roomId", async (request, response) => {
    try {
        const authorization = request.header("Authorization") || "";
        const token = authorization.startsWith("Bearer ")
            ? authorization.slice(7).trim()
            : "";

        if (!token) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        const room = await getArenaRoom(token, request.params.roomId);

        if (!room) {
            response.status(404).json({ error: "Sala no encontrada" });
            return;
        }

        response.json(room);
    } catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.post("/arenas/rooms/:roomId/join", async (request, response) => {
    try {
        const authorization = request.header("Authorization") || "";
        const token = authorization.startsWith("Bearer ")
            ? authorization.slice(7).trim()
            : "";

        if (!token) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        const room = await joinArenaRoom(
            token,
            request.params.roomId,
            request.body,
        );

        if (!room) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        response.json(room);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        const status = message === "Sala no encontrada" ? 404 : 400;
        response.status(status).json({ error: message });
    }
});

app.post("/arenas/join/:joinToken", async (request, response) => {
    try {
        const authorization = request.header("Authorization") || "";
        const token = authorization.startsWith("Bearer ")
            ? authorization.slice(7).trim()
            : "";

        if (!token) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        const room = await joinArenaRoomByLink(token, request.params.joinToken);

        if (!room) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        response.json(room);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        const status = message === "Sala no encontrada" ? 404 : 400;
        response.status(status).json({ error: message });
    }
});

app.post("/arenas/rooms/:roomId/leave", async (request, response) => {
    try {
        const authorization = request.header("Authorization") || "";
        const token = authorization.startsWith("Bearer ")
            ? authorization.slice(7).trim()
            : "";

        if (!token) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        const result = await leaveArenaRoom(token, request.params.roomId);

        if (!result) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        response.json(result);
    } catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.post("/arenas/rooms/:roomId/select-template", async (request, response) => {
    try {
        const authorization = request.header("Authorization") || "";
        const token = authorization.startsWith("Bearer ")
            ? authorization.slice(7).trim()
            : "";

        if (!token) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        const result = await createArenaGameTicket(
            token,
            request.params.roomId,
            request.body,
        );

        if (!result) {
            response.status(401).json({ error: "Unauthorized" });
            return;
        }

        response.json(result);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        const status = message === "Sala no encontrada" ? 404 : 400;
        response.status(status).json({ error: message });
    }
});

app.post('/internal/game-session/check',requireAuth,async(request,response,next)=>{
    try {response.json({ok:true,active:await isGameSessionActive(String(request.body?.sessionCredentialHash??''),String(request.body?.characterId??''))});}
    catch(error){next(error);}
});

app.post("/game-ticket/consume", requireAuth, async (request, response) => {
    try {
        const ticket =
            typeof request.body?.ticket === "string"
                ? request.body.ticket.trim()
                : "";
        const clientIp =
            typeof request.body?.clientIp === "string"
                ? request.body.clientIp.trim()
                : "";

        if (!ticket) {
            response.status(400).json({ error: "ticket es requerido" });
            return;
        }

        const result = await consumeGameTicket(ticket, clientIp);

        if (!result) {
            response.status(404).json({ error: "Game ticket invalido" });
            return;
        }

        response.json(result);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unexpected error";
        const status =
            message === "Tu IP se encuentra baneada." ||
            message === "Tu personaje tiene un ban de IP activo."
                ? 403
                : 500;
        response.status(status).json({ error: message });
    }
});

app.post(
    "/internal/moderation/ban-character",
    requireAuth,
    async (request, response) => {
        try {
            const result = await banCharacterByName(request.body);

            if (!result) {
                response.status(404).json({ error: "Character not found" });
                return;
            }

            response.json(result);
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.post(
    "/internal/moderation/ban-ip",
    requireAuth,
    async (request, response) => {
        try {
            const result = await banIpByCharacterName(request.body);

            if (!result) {
                response.status(404).json({ error: "Character not found" });
                return;
            }

            response.json(result);
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.post(
    "/internal/moderation/unban-character",
    requireAuth,
    async (request, response) => {
        try {
            const result = await unbanCharacterByName(request.body);

            if (!result) {
                response.status(404).json({ error: "Character not found" });
                return;
            }

            response.json(result);
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.post(
    "/internal/moderation/unban-ip",
    requireAuth,
    async (request, response) => {
        try {
            const result = await unbanIpByCharacterName(request.body);

            if (!result) {
                response.status(404).json({ error: "Character not found" });
                return;
            }

            response.json(result);
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.post(
    "/internal/moderation/jail-character",
    requireAuth,
    async (request, response) => {
        try {
            const result = await jailCharacterByName(request.body);

            if (!result) {
                response.status(404).json({ error: "Character not found" });
                return;
            }

            response.json(result);
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.post(
    "/internal/arenas/rooms/:roomId/disconnect",
    requireAuth,
    async (request, response) => {
        try {
            const roomId = Array.isArray(request.params.roomId)
                ? request.params.roomId[0]
                : request.params.roomId;
            const accountId =
                typeof request.body?.accountId === "string"
                    ? request.body.accountId.trim()
                    : "";

            if (!roomId || !accountId) {
                response.status(400).json({ error: "accountId es requerido" });
                return;
            }

            await disconnectArenaRoomByAccount(roomId, accountId);
            response.json({ ok: true });
        } catch (error) {
            response.status(500).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.post(
    "/internal/arenas/rooms/:roomId/connect",
    requireAuth,
    async (request, response) => {
        try {
            const roomId = Array.isArray(request.params.roomId)
                ? request.params.roomId[0]
                : request.params.roomId;
            const accountId =
                typeof request.body?.accountId === "string"
                    ? request.body.accountId.trim()
                    : "";

            if (!roomId || !accountId) {
                response.status(400).json({ error: "accountId es requerido" });
                return;
            }

            await connectArenaRoomByAccount(roomId, accountId);
            response.json({ ok: true });
        } catch (error) {
            response.status(500).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.get("/character", requireAuth, async (request, response) => {
    try {
        const result = await getCharacterByAccountAndEmail(request.query);

        if (!result) {
            response.status(404).json({
                account: {},
                character: {},
            });
            return;
        }

        response.json(result);
    } catch (error) {
        const statusCode =
            error instanceof Error && error.name === "ZodError" ? 400 : 500;
        response.status(statusCode).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.put('/internal/floor-spawns', requireAuth, async (request,response)=>{
 try {response.json(await spawnFloorItem(request.body));}
 catch {response.status(409).json({error:'World drop could not be committed'});}
});
app.get('/internal/floor-items', requireAuth, async (_request,response) => {
    try { response.json({items:(await pool.query('SELECT drop_id AS "dropId",map_id AS map,x,y,item_id AS "itemId",amount FROM dropped_floor_items ORDER BY map_id,y,x')).rows}); }
    catch { response.status(503).json({error:'Ground storage unavailable'}); }
});
app.delete('/internal/floor-items/:dropId', requireAuth, async (request,response) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(request.params.dropId))) {response.status(400).json({error:'Invalid ground item ID'});return;}
    try {await pool.query('DELETE FROM dropped_floor_items WHERE drop_id=$1',[request.params.dropId]);response.json({ok:true});}
    catch {response.status(503).json({error:'Ground storage unavailable'});}
});

app.put("/character_save/:id", requireAuth, async (request, response) => {
    try {
        const characterId = Array.isArray(request.params.id)
            ? request.params.id[0]
            : request.params.id;

        const result = await patchCharacter(characterId ?? "", request.body);

        if (!result) {
            response.status(404).json({ error: "Character not found" });
            return;
        }

        response.json(result);
    } catch (error) {
        response.status(400).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.put("/character_save/:id/items", requireAuth, async (request, response) => {
    try {
        const characterId = Array.isArray(request.params.id)
            ? request.params.id[0]
            : request.params.id;
        const result = await patchCharacterItems(
            characterId ?? "",
            request.body?.items ?? [],
        );

        if (!result) {
            response.status(404).json({ error: "Character not found" });
            return;
        }

        response.json(result);
    } catch (error) {
        response.status(400).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.put("/character_save/:id/bank", requireAuth, async (request, response) => {
    try {
        const characterId = Array.isArray(request.params.id)
            ? request.params.id[0]
            : request.params.id;
        const result = await patchCharacterBankItems(
            characterId ?? "",
            request.body?.bankItems ?? [],
        );

        if (!result) {
            response.status(404).json({ error: "Character not found" });
            return;
        }

        response.json(result);
    } catch (error) {
        response.status(400).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.put(
    "/character_save/:id/storage",
    requireAuth,
    async (request, response) => {
        try {
            const characterId = Array.isArray(request.params.id)
                ? request.params.id[0]
                : request.params.id;
            const result = await patchCharacterStorage(
                characterId ?? "",
                request.body ?? {},
            );

            if (!result) {
                response.status(404).json({ error: "Character not found" });
                return;
            }

            response.json(result);
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.put(
    "/character_save/:id/spells",
    requireAuth,
    async (request, response) => {
        try {
            const characterId = Array.isArray(request.params.id)
                ? request.params.id[0]
                : request.params.id;
            const result = await patchCharacterSpells(
                characterId ?? "",
                request.body?.spells ?? [],
            );

            if (!result) {
                response.status(404).json({ error: "Character not found" });
                return;
            }

            response.json(result);
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.post(
    "/internal/characters/:characterId/connect",
    requireAuth,
    async (request, response) => {
        try {
            const characterId = Array.isArray(request.params.characterId)
                ? request.params.characterId[0]
                : request.params.characterId;
            if(process.env.AOWEB_CHARACTER_ACHIEVEMENTS==='1'&&!/^[0-9a-f-]{36}$/i.test(request.body?.accountId??'')){response.status(400).json({error:"Character account is required"});return;}
            const result = await claimCharacterConnection(characterId ?? "",request.body?.accountId);

            if (!result.ok) {
                const status =
                    result.reason === "already_connected" ? 409 : 404;
                const error =
                    result.reason === "already_connected"
                        ? "Character already connected"
                        : "Character not found";
                response.status(status).json({ error });
                return;
            }

            response.json(result);
        } catch (error) {
            response.status(500).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.post(
    "/internal/characters/:characterId/disconnect",
    requireAuth,
    async (request, response) => {
        try {
            const characterId = Array.isArray(request.params.characterId)
                ? request.params.characterId[0]
                : request.params.characterId;
            const result = await releaseCharacterConnection(characterId ?? "");

            if (!result) {
                response.status(404).json({ error: "Character not found" });
                return;
            }

            response.json(result);
        } catch (error) {
            response.status(500).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.post(
    "/internal/characters/reset-connected",
    requireAuth,
    async (_request, response) => {
        try {
            const [updatedCharacters, updatedArenaMembers] = await Promise.all([
                resetAllCharactersConnectedStatus(),
                resetAllArenaRoomMembersConnectedStatus(),
            ]);

            response.json({
                ok: true,
                updated: updatedCharacters + updatedArenaMembers,
                updatedCharacters,
                updatedArenaMembers,
            });
        } catch (error) {
            response.status(500).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.get(
    "/internal/vaults/account/:accountId",
    requireAuth,
    async (request, response) => {
        try {
            const accountId = Array.isArray(request.params.accountId)
                ? request.params.accountId[0]
                : request.params.accountId;
            response.json(await getAccountVault(accountId ?? ""));
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.put(
    "/internal/vaults/account/:accountId",
    requireAuth,
    async (request, response) => {
        try {
            const accountId = Array.isArray(request.params.accountId)
                ? request.params.accountId[0]
                : request.params.accountId;
            response.json(
                await syncAccountVault(accountId ?? "", request.body ?? {}),
            );
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.get(
    "/internal/vaults/clan/:clanId",
    requireAuth,
    async (request, response) => {
        try {
            const clanId = Array.isArray(request.params.clanId)
                ? request.params.clanId[0]
                : request.params.clanId;
            response.json(await getClanVault(clanId ?? ""));
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.put(
    "/internal/vaults/clan/:clanId",
    requireAuth,
    async (request, response) => {
        try {
            const clanId = Array.isArray(request.params.clanId)
                ? request.params.clanId[0]
                : request.params.clanId;
            response.json(
                await syncClanVault(clanId ?? "", request.body ?? {}),
            );
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.get("/internal/market/listings", requireAuth, async (request, response) => {
    try {
        response.json(
            await listMarketListings({
                search:
                    typeof request.query.search === "string"
                        ? request.query.search
                        : undefined,
                sellerCharacterId:
                    typeof request.query.sellerCharacterId === "string"
                        ? request.query.sellerCharacterId
                        : undefined,
                limit:
                    typeof request.query.limit === "string"
                        ? Number.parseInt(request.query.limit, 10)
                        : undefined,
                sortPrice:
                    request.query.sortPrice === "desc"
                        ? "desc"
                        : request.query.sortPrice === "asc"
                          ? "asc"
                          : request.query.sortPrice === "recent"
                            ? "recent"
                            : undefined,
                includeInactive:
                    typeof request.query.includeInactive === "string"
                        ? request.query.includeInactive === "true"
                        : undefined,
            }),
        );
    } catch (error) {
        response.status(400).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.post(
    "/internal/market/listings",
    requireAuth,
    async (request, response) => {
        try {
            response
                .status(201)
                .json(await createMarketListing(request.body ?? {}));
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.post("/internal/market/buy", requireAuth, async (request, response) => {
    try {
        response.json(await buyMarketListing(request.body ?? {}));
    } catch (error) {
        response.status(400).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.post(
    "/internal/market/listings/:listingId/cancel",
    requireAuth,
    async (request, response) => {
        try {
            const listingId = Array.isArray(request.params.listingId)
                ? request.params.listingId[0]
                : request.params.listingId;
            response.json(
                await cancelMarketListing({
                    operationId: request.body?.operationId,
                    sellerCharacterId: request.body?.sellerCharacterId,
                    listingId: listingId ?? "",
                }),
            );
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.get(
    "/internal/market/claims/:characterId",
    requireAuth,
    async (request, response) => {
        try {
            const characterId = Array.isArray(request.params.characterId)
                ? request.params.characterId[0]
                : request.params.characterId;
            response.json(await getMarketClaims(characterId ?? ""));
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.post(
    "/internal/market/claims/:characterId/claim",
    requireAuth,
    async (request, response) => {
        try {
            const characterId = Array.isArray(request.params.characterId)
                ? request.params.characterId[0]
                : request.params.characterId;
            response.json(
                await claimMarket({
                    claimIds: request.body?.claimIds,
                    operationId: request.body?.operationId,
                    characterId: characterId ?? "",
                    characterGold: request.body?.characterGold,
                    characterItems: request.body?.characterItems ?? [],
                }),
            );
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.get(
    "/internal/clans/character/:characterId/summary",
    requireAuth,
    async (request, response) => {
        try {
            const characterId = Array.isArray(request.params.characterId)
                ? request.params.characterId[0]
                : request.params.characterId;
            response.json(await getCharacterClanSummary(characterId ?? ""));
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.post("/internal/clans", requireAuth, async (request, response) => {
    try {
        response.status(201).json(await createClan(request.body));
    } catch (error) {
        response.status(400).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.post("/internal/clans/requests", requireAuth, async (request, response) => {
    try {
        response.status(201).json(await createClanRequest(request.body));
    } catch (error) {
        response.status(400).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.post(
    "/internal/clans/requests/:requestId/accept",
    requireAuth,
    async (request, response) => {
        try {
            const requestId = Array.isArray(request.params.requestId)
                ? request.params.requestId[0]
                : request.params.requestId;
            response.json(
                await acceptClanRequest({ ...request.body, requestId }),
            );
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.post("/internal/clans/delete", requireAuth, async (request, response) => {
    try {
        response.json(await deleteClan(request.body));
    } catch (error) {
        response.status(400).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.post(
    "/internal/clans/member-role",
    requireAuth,
    async (request, response) => {
        try {
            response.json(await setClanMemberRole(request.body));
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.post(
    "/internal/clans/transfer-leadership",
    requireAuth,
    async (request, response) => {
        try {
            response.json(await transferClanLeadership(request.body));
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.post(
    "/internal/clans/requests/:requestId/reject",
    requireAuth,
    async (request, response) => {
        try {
            const requestId = Array.isArray(request.params.requestId)
                ? request.params.requestId[0]
                : request.params.requestId;
            response.json(
                await rejectClanRequest({ ...request.body, requestId }),
            );
        } catch (error) {
            response.status(400).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.post("/internal/clans/leave", requireAuth, async (request, response) => {
    try {
        response.json(await leaveClan(request.body));
    } catch (error) {
        response.status(400).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.post("/internal/clans/kick", requireAuth, async (request, response) => {
    try {
        response.json(await kickClanMember(request.body));
    } catch (error) {
        response.status(400).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

app.post(
    "/internal/challenges/history",
    requireAuth,
    async (request, response) => {
        try {
            const result = await createChallengeHistory(request.body);
            response.status(201).json(result);
        } catch (error) {
            const status =
                error instanceof Error && error.name === "ZodError" ? 400 : 500;
            response.status(status).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.post(
    "/internal/user-online-stats",
    requireAuth,
    async (request, response) => {
        try {
            const result = await createUserOnlineStat(request.body);
            response.status(201).json(result);
        } catch (error) {
            const status =
                error instanceof Error && error.name === "ZodError" ? 400 : 500;
            response.status(status).json({
                error:
                    error instanceof Error ? error.message : "Unexpected error",
            });
        }
    },
);

app.get("/user-online-stats", async (request, response) => {
    try {
        const hoursParam =
            typeof request.query.hours === "string"
                ? Number(request.query.hours)
                : 24;
        const result = await listUserOnlineStats(hoursParam);
        response.json(result);
    } catch (error) {
        response.status(500).json({
            error: error instanceof Error ? error.message : "Unexpected error",
        });
    }
});

installWalletRoutes(app);
installPreferencesRoutes(app);
installAchievementRoutes(app);
installGameAssetRoutes(app);
installEconomyRoutes(app);
installCosmeticRoutes(app);
void start();

