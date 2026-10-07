import type { DataObject, EntityId, Position, RuntimeCharacter, RuntimeClient, SmeltingState } from "./types/runtime";
import type { HandleProtocolApi } from "./handleProtocol";
import { bankOperations } from './bankOperationGuard';
import { getCharacterById, getClientById } from "./runtimeRegistry";
import { getSmeltingRecipesByMineral } from "./smeltingRecipes";

export {};

const funct = require("./functions");
const vars = require("./vars");
const handleProtocol = require("./handleProtocol") as HandleProtocolApi;

type SmeltingUser = RuntimeCharacter & {
    id: EntityId;
    dead?: number | boolean;
    level?: number;
    map: number;
    pos: Position;
    inv: Record<string, { idItem: number; cant: number }>;
    smelting?: SmeltingState;
};

type SmeltingApi = {
    isSmeltingMineral: (idItem: number) => boolean;
    handleMineralUse: (ws: RuntimeClient, idPos: number | string) => boolean;
    handleMapClick: (ws: RuntimeClient, x: number, y: number) => boolean;
    processTick: (now: number) => void;
    cancelSmelting: (idUser: EntityId, reason?: string) => void;
};

function getUser(idUser: EntityId) {
    return getCharacterById<SmeltingUser>(idUser);
}

function withUserClient(idUser: EntityId | null | undefined, callback: (client: RuntimeClient) => void) {
    const client = getClientById(idUser);

    if (!client) {
        return;
    }

    callback(client);
}

function clonePosition(pos: Position): Position {
    return { x: pos.x, y: pos.y };
}

function getSimulatedMiningSkill(user: SmeltingUser) {
    return Math.min(100, Math.max(0, Number(user.level ?? 0) * 3));
}

function getConfig(itemId: number) {
    return getSmeltingRecipesByMineral()[itemId] ?? null;
}

function getForgeObject(user: SmeltingUser, target: Position) {
    const objInfo = vars.mapa[user.map]?.[target.y]?.[target.x]?.objInfo;

    if (!objInfo?.objIndex) {
        return null;
    }

    return vars.datObj[objInfo.objIndex] as DataObject | undefined;
}

function isValidForgeTarget(user: SmeltingUser, target: Position) {
    const forge = getForgeObject(user, target);

    if (!forge) {
        return false;
    }

    if (Math.abs(user.pos.x - target.x) > 2 || Math.abs(user.pos.y - target.y) > 2) {
        return false;
    }

    return forge.objType === vars.objType.fraguas;
}

function addIngotsToInventory(user: SmeltingUser, itemId: number, amount: number) {
    const game = require("./game") as {
        putItemToInv: (idUser: EntityId, idItem: number, cant: number) => void;
    };

    game.putItemToInv(user.id, itemId, amount);
}

function canReceiveIngots(user: SmeltingUser, itemId: number, amount: number) {
    for (const item of Object.values(user.inv)) {
        if (item.idItem === itemId && item.cant + amount <= 10000) {
            return true;
        }
    }

    return Object.keys(user.inv).length < 21;
}

const smelting: SmeltingApi = {
    isSmeltingMineral(idItem) {
        return Boolean(getConfig(idItem));
    },

    handleMineralUse(ws, idPos) {
        const user = getUser(ws.id!);

        if (!user) {
            return false;
        }

        const item = user.inv[String(idPos)];
        const config = item ? getConfig(item.idItem) : null;

        if (!item || !config) {
            return false;
        }

        if (user.dead) {
            handleProtocol.console("Los muertos no pueden trabajar minerales.", "white", 0, 0, ws);
            return true;
        }

        if (user.smelting?.active) {
            this.cancelSmelting(user.id, "Has dejado de fundir minerales.");
            return true;
        }

        user.smelting = {
            pendingTarget: true,
            slot: Number(idPos),
            itemId: item.idItem,
        };
        handleProtocol.console("Haz click sobre una fragua para fundir el mineral.", "#fcd34d", 0, 0, ws);
        return true;
    },

    handleMapClick(ws, x, y) {
        const user = getUser(ws.id!);
        const state = user?.smelting;

        if (!user || !state?.pendingTarget || !state.itemId) {
            return false;
        }

        const config = getConfig(state.itemId);

        if (!config) {
            user.smelting = undefined;
            return true;
        }

        if (getSimulatedMiningSkill(user) < config.requiredSkill) {
            handleProtocol.console(
                `No tienes conocimientos de minería suficientes para trabajar este mineral. Necesitas ${config.requiredSkill} puntos en minería.`,
                "white",
                0,
                0,
                ws,
            );
            user.smelting = undefined;
            return true;
        }

        const target = { x, y };

        if (!isValidForgeTarget(user, target)) {
            handleProtocol.console("Debes seleccionar una fragua cercana para fundir minerales.", "white", 0, 0, ws);
            return true;
        }

        user.smelting = {
            active: true,
            pendingTarget: false,
            slot: state.slot,
            itemId: state.itemId,
            target,
            origin: clonePosition(user.pos),
            nextTickAt: Date.now() + vars.timing.fishingTickMs,
        };
        handleProtocol.console("Comienzas a fundir minerales.", "#86efac", 0, 0, ws);
        return true;
    },

    processTick(now) {
        for (const idUser in vars.personajes) {
            const user = getUser(idUser);
            const state = user?.smelting;
            if (user && bankOperations.isBusy(user.id)) continue;

            if (!user || !state?.active || !state.itemId || !state.target || !state.origin || !state.nextTickAt) {
                continue;
            }

            if (now < state.nextTickAt) {
                continue;
            }

            if (user.dead || user.pos.x !== state.origin.x || user.pos.y !== state.origin.y) {
                this.cancelSmelting(idUser, "La fundición se canceló.");
                continue;
            }

            if (!isValidForgeTarget(user, state.target)) {
                this.cancelSmelting(idUser, "La fundición se canceló porque ya no estás frente a una fragua válida.");
                continue;
            }

            const slotKey = String(state.slot ?? 0);
            const inventoryItem = user.inv[slotKey];
            const config = getConfig(state.itemId);

            if (!inventoryItem || inventoryItem.idItem !== state.itemId || !config) {
                this.cancelSmelting(idUser, "La fundición se canceló porque ya no tienes el mineral seleccionado.");
                continue;
            }

            state.nextTickAt = now + vars.timing.fishingTickMs;

            const maxCraftableIngots = Math.floor(inventoryItem.cant / config.mineralsPerIngot);

            if (maxCraftableIngots < 1) {
                this.cancelSmelting(idUser, "No tienes suficientes minerales para hacer un lingote.");
                continue;
            }

            const ingotAmount = Math.min(funct.randomIntFromInterval(10, 20), maxCraftableIngots);
            const requiredMinerals = config.mineralsPerIngot * ingotAmount;

            if (!canReceiveIngots(user, config.ingotItemId, ingotAmount)) {
                this.cancelSmelting(idUser, "La fundición se detuvo porque no tienes espacio en el inventario.");
                continue;
            }

            const game = require("./game") as {
                quitarUserInvItem: (idUser: EntityId, idPos: number | string, cant: number) => void;
                persistCharacterItemsById: (idUser: EntityId) => Promise<void>;
            };

            void bankOperations.run(user.id, async () => {
                if (getUser(idUser) !== user || user.dead || user.smelting !== state) return;
                game.quitarUserInvItem(user.id, slotKey, requiredMinerals);
                addIngotsToInventory(user, config.ingotItemId, ingotAmount);
                await game.persistCharacterItemsById(user.id);
                withUserClient(idUser, (userClient) => {
                    const ingotName = vars.datObj[config.ingotItemId]?.name ?? "lingotes";
                    handleProtocol.console(`Has fundido ${ingotAmount} ${ingotName}.`, "#86efac", 0, 0, userClient);
                });
            }, undefined).catch((error: unknown) => console.error(error));
        }
    },

    cancelSmelting(idUser, reason) {
        const user = getUser(idUser);
        const wasActive = Boolean(user?.smelting?.active);

        if (!user?.smelting) {
            return;
        }

        user.smelting = undefined;

        if (reason && wasActive) {
            withUserClient(idUser, (userClient) => {
                handleProtocol.console(reason, "white", 0, 0, userClient);
            });
        }
    },
};

module.exports = smelting;
