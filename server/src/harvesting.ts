import {getCharacterSkill,trainCharacterSkill} from './characterSkills';
import type {
    DataObject,
    EntityId,
    HarvestingSkill,
    HarvestingState,
    Position,
    RuntimeCharacter,
    RuntimeClient,
} from "./types/runtime";
import type { HandleProtocolApi } from "./handleProtocol";
import type { SocketApi } from "./socket";
import { getCharacterById, getClientById } from "./runtimeRegistry";
import * as safeZone from "./safeZone";
import { bankOperations } from './bankOperationGuard';

export {};

const funct = require("./functions");
const vars = require("./vars");
const handleProtocol = require("./handleProtocol") as HandleProtocolApi;
const socket = require("./socket") as SocketApi;
const workingLock = require("./workingLock");

type HarvestingUser = RuntimeCharacter & {
    id: EntityId;
    map: number;
    pos: Position;
    dead?: number | boolean;
    idClase?: number;
    level?: number;
    inv: Record<string, { idItem: number; cant: number; equipped?: number | boolean }>;
    idItemWeapon?: number | string;
    harvesting?: HarvestingState;
};

type ToolState = {
    slot: number;
    itemId: number;
};

type HarvestingApi = {
    isWoodcuttingTool: (idItem: number) => boolean;
    isMiningTool: (idItem: number) => boolean;
    usesHarvestingTool: (idItem: number) => boolean;
    handleToolUse: (ws: RuntimeClient, idPos: number | string) => boolean;
    handleMapClick: (ws: RuntimeClient, x: number, y: number) => boolean;
    processTick: (now: number) => void;
    cancelHarvesting: (idUser: EntityId, reason?: string, keepTargeting?: boolean) => void;
};

const WOOD_ITEM_ID = 58;
const ELVEN_WOOD_ITEM_ID = 1006;
const IRON_ORE_ITEM_ID = 192;
const SILVER_ORE_ITEM_ID = 193;
const GOLD_ORE_ITEM_ID = 194;

function getUser(idUser: EntityId) {
    return getCharacterById<HarvestingUser>(idUser);
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

function clearHarvestingState(user: HarvestingUser, keepTargeting = false) {
    if (!keepTargeting) {
        user.harvesting = undefined;
        return;
    }

    const state = user.harvesting;

    if (!state) {
        return;
    }

    user.harvesting = {
        pendingTarget: true,
        skill: state.skill,
        slot: state.slot,
        itemId: state.itemId,
    };
}

function getEquippedTool(user: HarvestingUser, skill: HarvestingSkill): ToolState | null {
    const weaponSlot = Number(user.idItemWeapon ?? 0);

    if (!weaponSlot) {
        return null;
    }

    const item = user.inv?.[weaponSlot];

    if (!item || !item.equipped) {
        return null;
    }

    if (skill === "woodcutting" && !harvesting.isWoodcuttingTool(item.idItem)) {
        return null;
    }

    if (skill === "mining" && !harvesting.isMiningTool(item.idItem)) {
        return null;
    }

    return {
        slot: weaponSlot,
        itemId: item.idItem,
    };
}

function getTargetObject(user: HarvestingUser, target: Position) {
    return vars.mapa[user.map]?.[target.y]?.[target.x]?.objInfo ?? null;
}

function getTargetDataObject(user: HarvestingUser, target: Position) {
    const objInfo = getTargetObject(user, target);

    if (!objInfo?.objIndex) {
        return null;
    }

    return vars.datObj[objInfo.objIndex] as DataObject | undefined;
}

function isResourceTarget(user: HarvestingUser, target: Position, skill: HarvestingSkill) {
    const obj = getTargetDataObject(user, target);

    if (!obj) {
        return false;
    }

    if (skill === "woodcutting") {
        return obj.objType === vars.objType.arboles;
    }

    return obj.objType === vars.objType.yacimientos;
}

function isElvenTree(resourceObject: DataObject | null | undefined) {
    return Number(resourceObject?.elfico ?? 0) === 1 || /elfic/i.test(String(resourceObject?.name ?? ""));
}

function isElvenWoodcuttingTool(itemId: number) {
    return /hacha de leña elfica/i.test(String(vars.datObj?.[itemId]?.name ?? ""));
}

function resolveRewardItemId(skill: HarvestingSkill, resourceObject: DataObject | null | undefined) {
    const resourceName = String(resourceObject?.name ?? "");

    if (skill === "woodcutting") {
        if (isElvenTree(resourceObject)) {
            return ELVEN_WOOD_ITEM_ID;
        }

        return WOOD_ITEM_ID;
    }

    if (/oro/i.test(resourceName)) {
        return GOLD_ORE_ITEM_ID;
    }

    if (/plata/i.test(resourceName)) {
        return SILVER_ORE_ITEM_ID;
    }

    return IRON_ORE_ITEM_ID;
}

function getSimulatedSkill(user: HarvestingUser) {
    return Math.min(100, Math.max(0, Number(user.level ?? 0) * 3));
}

function isSafeHarvestingZone(user: HarvestingUser) {
    return safeZone.isSafeZonePosition(user.map, user.pos);
}

function getExtractResourceForLevel(level: number) {
    const lower = Math.max(1, Math.floor((level + 0.000001) / 3.6));
    const upper = Math.max(lower, Math.floor((level + 0.000001) / 2));

    return funct.randomIntFromInterval(lower, upper);
}

function rollHarvestSuccess(user: HarvestingUser, skill: HarvestingSkill) {
    const simulatedSkill = getCharacterSkill(user,skill);
    const luck = Math.max(1, Math.floor(-0.00125 * simulatedSkill * simulatedSkill - 0.3 * simulatedSkill + 49));
    const safeZoneBonus = skill === "woodcutting" ? 4 : 2;
    const rollMax = isSafeHarvestingZone(user) ? luck + safeZoneBonus : luck;
    const result = funct.randomIntFromInterval(1, Math.max(1, rollMax));

    return result <= 5;
}

function getHarvestAmount(user: HarvestingUser) {
    return getExtractResourceForLevel(Number(user.level ?? 0));
}

function addRewardToInventory(user: HarvestingUser, itemId: number, amount: number) {
    for (const [slot, item] of Object.entries(user.inv)) {
        if (item.idItem === itemId && item.cant + amount <= 10000) {
            item.cant += amount;
            withUserClient(user.id, (userClient) => {
                handleProtocol.agregarUserInvItem(user.id, slot, userClient);
            });
            return true;
        }
    }

    if (Object.keys(user.inv).length >= 21) {
        return false;
    }

    let nextSlot = 1;
    const usedSlots = Object.keys(user.inv)
        .map(Number)
        .sort((left, right) => left - right);

    while (usedSlots[nextSlot - 1] === nextSlot) {
        nextSlot++;
    }

    user.inv[nextSlot] = {
        idItem: itemId,
        cant: amount,
        equipped: 0,
    };
    withUserClient(user.id, (userClient) => {
        handleProtocol.agregarUserInvItem(user.id, nextSlot, userClient);
    });
    return true;
}

function validateHarvestingStart(user: HarvestingUser, target: Position, skill: HarvestingSkill) {
    const equippedTool = getEquippedTool(user, skill);

    if (!equippedTool) {
        return skill === "woodcutting"
            ? "Debes tener equipada un hacha de leñador."
            : "Debes tener equipado un piquete de minero.";
    }

    if (skill === "woodcutting" && isSafeHarvestingZone(user)) {
        return "Solo puedes talar en zona insegura.";
    }

    if (Math.abs(user.pos.x - target.x) > 1 || Math.abs(user.pos.y - target.y) > 1) {
        return skill === "woodcutting"
            ? "Debes seleccionar un árbol cercano para talar."
            : "Debes seleccionar un yacimiento cercano para minar.";
    }

    if (!isResourceTarget(user, target, skill)) {
        return skill === "woodcutting" ? "Debes hacer click sobre un árbol." : "Debes hacer click sobre un yacimiento.";
    }

    if (skill === "woodcutting") {
        const resourceObject = getTargetDataObject(user, target);

        if (isElvenTree(resourceObject) && !isElvenWoodcuttingTool(equippedTool.itemId)) {
            return "Necesitas un hacha de leña Elfica para talar este árbol.";
        }
    }

    return null;
}

function getSkillForItem(idItem: number): HarvestingSkill | null {
    if (harvesting.isWoodcuttingTool(idItem)) {
        return "woodcutting";
    }

    if (harvesting.isMiningTool(idItem)) {
        return "mining";
    }

    return null;
}

function getSkillName(skill: HarvestingSkill) {
    return skill === "woodcutting" ? "tala" : "minería";
}

function getStartMessage(skill: HarvestingSkill) {
    return skill === "woodcutting" ? "Comienzas a talar." : "Comienzas a minar.";
}

function getSelectMessage(skill: HarvestingSkill) {
    return skill === "woodcutting"
        ? "Selecciona un árbol cercano para talar."
        : "Selecciona un yacimiento cercano para minar.";
}

function getStopMessage(skill: HarvestingSkill) {
    return skill === "woodcutting" ? "Has dejado de talar." : "Has dejado de minar.";
}

function playHarvestingSound(idUser: EntityId, skill: HarvestingSkill) {
    const soundId = skill === "woodcutting" ? vars.arSounds.SND_TALAR : vars.arSounds.SND_MINERO;

    socket.loopArea(idUser, (target) => {
        if (!target.isNpc) {
            withUserClient(target.id, (targetClient) => {
                handleProtocol.playSound(idUser, soundId, targetClient);
            });
        }
    });
}

const harvesting: HarvestingApi = {
    isWoodcuttingTool(idItem) {
        const name = String(vars.datObj?.[idItem]?.name ?? "");
        return /hacha de leñador|hacha de leña/i.test(name);
    },

    isMiningTool(idItem) {
        const name = String(vars.datObj?.[idItem]?.name ?? "");
        return /piquete de minero|pico de minero|piqueta de minero/i.test(name);
    },

    usesHarvestingTool(idItem) {
        return this.isWoodcuttingTool(idItem) || this.isMiningTool(idItem);
    },

    handleToolUse(ws, idPos) {
        const user = getUser(ws.id!);

        if (!user) {
            return false;
        }

        const item = user.inv?.[idPos];
        const skill = item ? getSkillForItem(item.idItem) : null;

        if (!item || !skill) {
            return false;
        }

        if (!item.equipped || Number(user.idItemWeapon ?? 0) !== Number(idPos)) {
            handleProtocol.console(
                skill === "woodcutting"
                    ? "Debes equiparte el hacha de leñador para usarla."
                    : "Debes equiparte el piquete de minero para usarlo.",
                "white",
                0,
                0,
                ws,
            );
            return true;
        }

        if (user.harvesting?.active) {
            this.cancelHarvesting(user.id, getStopMessage(user.harvesting.skill ?? skill));
            return true;
        }

        user.harvesting = {
            pendingTarget: true,
            skill,
            slot: Number(idPos),
            itemId: item.idItem,
        };
        handleProtocol.console(getSelectMessage(skill), "#fcd34d", 0, 0, ws);
        return true;
    },

    handleMapClick(ws, x, y) {
        const user = getUser(ws.id!);
        const state = user?.harvesting;

        if (!user || !state?.pendingTarget || !state.skill) {
            return false;
        }

        const target = { x, y };
        const validationError = validateHarvestingStart(user, target, state.skill);

        if (validationError) {
            handleProtocol.console(validationError, "white", 0, 0, ws);
            return true;
        }

        if (workingLock.hasAnotherActiveWorkOnSameIp(user.id)) {
            handleProtocol.console("Ya tienes otro personaje trabajando desde esta IP.", "white", 0, 0, ws);
            return true;
        }

        const equippedTool = getEquippedTool(user, state.skill);

        if (!equippedTool) {
            clearHarvestingState(user);
            handleProtocol.console(
                state.skill === "woodcutting"
                    ? "Debes tener equipada un hacha de leñador."
                    : "Debes tener equipado un piquete de minero.",
                "white",
                0,
                0,
                ws,
            );
            return true;
        }

        user.harvesting = {
            active: true,
            pendingTarget: false,
            skill: state.skill,
            slot: equippedTool.slot,
            itemId: equippedTool.itemId,
            target,
            origin: clonePosition(user.pos),
            nextTickAt: Date.now() + vars.timing.fishingTickMs,
        };

        playHarvestingSound(user.id, state.skill);
        handleProtocol.console(getStartMessage(state.skill), "#86efac", 0, 0, ws);
        return true;
    },

    processTick(now) {
        for (const idUser in vars.personajes) {
            const user = getUser(idUser);
            const state = user?.harvesting;
            if (user && bankOperations.isBusy(user.id)) continue;

            if (!user || !state?.active || !state.skill || !state.nextTickAt || now < state.nextTickAt) {
                continue;
            }

            if (workingLock.shouldCancelForSameIpConflict(idUser)) {
                this.cancelHarvesting(
                    idUser,
                    "La recolección se canceló porque ya tienes otro personaje trabajando desde esta IP.",
                );
                continue;
            }

            if (
                user.dead ||
                !state.origin ||
                !state.target ||
                user.pos.x !== state.origin.x ||
                user.pos.y !== state.origin.y
            ) {
                this.cancelHarvesting(idUser, `La ${getSkillName(state.skill)} se canceló.`);
                continue;
            }

            const equippedTool = getEquippedTool(user, state.skill);

            if (!equippedTool || equippedTool.itemId !== state.itemId) {
                this.cancelHarvesting(
                    idUser,
                    state.skill === "woodcutting"
                        ? "La tala se canceló porque ya no tienes el hacha equipada."
                        : "La minería se canceló porque ya no tienes el piquete equipado.",
                );
                continue;
            }

            if (validateHarvestingStart(user, state.target, state.skill)) {
                this.cancelHarvesting(
                    idUser,
                    state.skill === "woodcutting"
                        ? "La tala se canceló porque ya no estás en una posición válida."
                        : "La minería se canceló porque ya no estás en una posición válida.",
                );
                continue;
            }

            state.nextTickAt = now + vars.timing.fishingTickMs;

            if (!rollHarvestSuccess(user, state.skill)) {
                continue;
            }

            const resourceObject = getTargetDataObject(user, state.target);
            const rewardItemId = resolveRewardItemId(state.skill, resourceObject);
            const rewardAmount = getHarvestAmount(user);

            if (!addRewardToInventory(user, rewardItemId, rewardAmount)) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console("Tienes el inventario lleno.", "white", 0, 0, userClient);
                });
                this.cancelHarvesting(
                    idUser,
                    state.skill === "woodcutting"
                        ? "La tala se detuvo porque no tienes espacio en el inventario."
                        : "La minería se detuvo porque no tienes espacio en el inventario.",
                );
                continue;
            }

            trainCharacterSkill(user,state.skill);
            playHarvestingSound(idUser, state.skill);

            withUserClient(idUser, (userClient) => {
                const rewardName = vars.datObj[rewardItemId]?.name ?? "el recurso";
                handleProtocol.console(
                    state.skill === "woodcutting"
                        ? `Has talado ${rewardAmount} ${rewardName}.`
                        : `Has extraído ${rewardAmount} ${rewardName}.`,
                    "#86efac",
                    0,
                    0,
                    userClient,
                );
            });
        }
    },

    cancelHarvesting(idUser, reason, keepTargeting = false) {
        const user = getUser(idUser);
        const wasActive = Boolean(user?.harvesting?.active);

        if (!user?.harvesting) {
            return;
        }

        clearHarvestingState(user, keepTargeting);

        if (reason && wasActive) {
            withUserClient(idUser, (userClient) => {
                handleProtocol.console(reason, "white", 0, 0, userClient);
            });
        }
    },
};

module.exports = harvesting;
