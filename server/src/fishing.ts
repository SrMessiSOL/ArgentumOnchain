import {getCharacterSkill,trainCharacterSkill} from './characterSkills';
import type { EntityId, FishingState, Position, RuntimeCharacter, RuntimeClient } from "./types/runtime";
import type { HandleProtocolApi } from "./handleProtocol";
import { bankOperations } from './bankOperationGuard';
import type { SocketApi } from "./socket";
import { getCharacterById, getClientById } from "./runtimeRegistry";

export {};

const vars = require("./vars");
const handleProtocol = require("./handleProtocol") as HandleProtocolApi;
const socket = require("./socket") as SocketApi;
const workingLock = require("./workingLock");

type FishingUser = RuntimeCharacter & {
    id: EntityId;
    nameCharacter: string;
    map: number;
    pos: Position;
    dead?: number | boolean;
    navegando?: number | boolean;
    level?: number;
    inv: Record<string, { idItem: number; cant: number; equipped?: number | boolean }>;
    idItemWeapon?: number | string;
    fishing?: FishingState;
};

type FishingReward = {
    itemId: number;
    weight: number;
};

export type FishingApi = {
    isFishingRod: (idItem: number) => boolean;
    getRodPower: (idItem: number) => number;
    handleRodUse: (ws: RuntimeClient, idPos: number | string) => boolean;
    handleMapClick: (ws: RuntimeClient, x: number, y: number) => boolean;
    processTick: (now: number) => void;
    cancelFishing: (idUser: EntityId, reason?: string, keepTargeting?: boolean) => void;
};

function clonePosition(pos: Position): Position {
    return { x: pos.x, y: pos.y };
}

function getUser(idUser: EntityId) {
    return getCharacterById<FishingUser>(idUser);
}

function withUserClient(idUser: EntityId | null | undefined, callback: (client: RuntimeClient) => void) {
    const client = getClientById(idUser);

    if (!client) {
        return;
    }

    callback(client);
}

function clearFishingState(user: FishingUser, keepTargeting = false) {
    if (!keepTargeting) {
        user.fishing = undefined;
        return;
    }

    const state = user.fishing;

    if (!state) {
        return;
    }

    user.fishing = {
        pendingTarget: true,
        slot: state.slot,
        itemId: state.itemId,
        power: state.power,
    };
}

function isWithinMapBounds(x: number, y: number) {
    return x >= 1 && x <= 100 && y >= 1 && y <= 100;
}

function isWaterGraphic(graphicLayer1: number) {
    return (
        (graphicLayer1 >= 1505 && graphicLayer1 <= 1520) ||
        (graphicLayer1 >= 5665 && graphicLayer1 <= 5680) ||
        (graphicLayer1 >= 13547 && graphicLayer1 <= 13562)
    );
}

function isWaterTile(idMap: number, pos: Position) {
    if (!isWithinMapBounds(pos.x, pos.y)) {
        return false;
    }

    const tile = vars.mapa[idMap]?.[pos.y]?.[pos.x];
    const graphicLayer1 = tile?.graphics?.[1] ?? 0;
    const graphicLayer2 = tile?.graphics?.[2] ?? 0;

    return isWaterGraphic(graphicLayer1) && !graphicLayer2;
}

function isAdjacentToWater(idMap: number, pos: Position) {
    return (
        isWaterTile(idMap, { x: pos.x + 1, y: pos.y }) ||
        isWaterTile(idMap, { x: pos.x - 1, y: pos.y }) ||
        isWaterTile(idMap, { x: pos.x, y: pos.y + 1 }) ||
        isWaterTile(idMap, { x: pos.x, y: pos.y - 1 })
    );
}

function hasInvalidFishingTrigger(idMap: number, pos: Position) {
    if (!isWithinMapBounds(pos.x, pos.y)) {
        return true;
    }

    return vars.mapa[idMap]?.[pos.y]?.[pos.x]?.trigger === vars.fishing.invalidTrigger;
}

function getEquippedFishingRod(user: FishingUser) {
    const weaponSlot = Number(user.idItemWeapon ?? 0);

    if (!weaponSlot) {
        return null;
    }

    const item = user.inv?.[weaponSlot];

    if (!item || !item.equipped || !fishing.isFishingRod(item.idItem)) {
        return null;
    }

    return {
        slot: weaponSlot,
        itemId: item.idItem,
        power: fishing.getRodPower(item.idItem),
    };
}

function getRewardsForPower(power: number): FishingReward[] {
    const rewardsByPower = vars.fishing.fishByPower?.[power] as FishingReward[] | undefined;

    return rewardsByPower ?? vars.fishing.fishByPower?.[1] ?? [];
}

function getSimulatedFishingSkill(user: FishingUser) {
    return Math.min(100, Math.max(0, Number(user.level ?? 0) * 3));
}

function getFishingChanceForSkill(skill: number) {
    if (skill < 20) {
        return 20;
    }

    if (skill < 40) {
        return 35;
    }

    if (skill < 70) {
        return 55;
    }

    if (skill < 100) {
        return 68;
    }

    return 80;
}

function isFishingNet(itemId: number) {
    return /red de pesca/i.test(String(vars.datObj?.[itemId]?.name ?? ""));
}

function getFishingRewardAmount(itemId: number) {
    return isFishingNet(itemId) ? Math.floor(Math.random() * 5) + 2 : Math.floor(Math.random() * 3) + 1;
}

function pickWeightedReward(power: number) {
    const rewards = getRewardsForPower(power);

    if (!rewards.length) {
        return null;
    }

    const totalWeight = rewards.reduce((sum, reward) => sum + reward.weight, 0);
    let roll = Math.floor(Math.random() * totalWeight) + 1;

    for (const reward of rewards) {
        roll -= reward.weight;

        if (roll <= 0) {
            return reward;
        }
    }

    return rewards[rewards.length - 1];
}

function addRewardToInventory(user: FishingUser, itemId: number, amount: number) {
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

function validateFishingStart(user: FishingUser, target: Position) {
    if (!getEquippedFishingRod(user)) {
        return "Debes tener equipada una caña de pescar.";
    }

    if (!isWaterTile(user.map, target)) {
        return "Zona de pesca no autorizada. Busca otro lugar para hacerlo.";
    }

    if (user.navegando) {
        if (!isWaterTile(user.map, user.pos)) {
            return "Debes estar navegando sobre el agua para pescar desde la barca.";
        }
    } else if (isWaterTile(user.map, user.pos) || !isAdjacentToWater(user.map, user.pos)) {
        return "Acércate a la costa para pescar.";
    }

    if (hasInvalidFishingTrigger(user.map, user.pos) || hasInvalidFishingTrigger(user.map, target)) {
        return "Zona de pesca no autorizada. Busca otro lugar para hacerlo.";
    }

    if (Math.abs(user.pos.x - target.x) > 1 || Math.abs(user.pos.y - target.y) > 1) {
        return "Debes seleccionar una casilla de agua cercana para pescar.";
    }

    return null;
}

const fishing: FishingApi = {
    isFishingRod(idItem) {
        return Boolean(vars.fishing.rods?.[idItem]);
    },

    getRodPower(idItem) {
        return vars.fishing.rods?.[idItem]?.power ?? 1;
    },

    handleRodUse(ws, idPos) {
        const user = getUser(ws.id!);

        if (!user) {
            return false;
        }

        const item = user.inv?.[idPos];

        if (!item || !this.isFishingRod(item.idItem)) {
            return false;
        }

        if (!item.equipped || Number(user.idItemWeapon ?? 0) !== Number(idPos)) {
            handleProtocol.console("Debes equiparte la caña de pescar para usarla.", "white", 0, 0, ws);
            return true;
        }

        if (user.fishing?.active) {
            this.cancelFishing(user.id, "Has dejado de pescar.");
            return true;
        }

        user.fishing = {
            pendingTarget: true,
            slot: Number(idPos),
            itemId: item.idItem,
            power: this.getRodPower(item.idItem),
        };
        handleProtocol.console("Selecciona una casilla de agua cercana para pescar.", "#fcd34d", 0, 0, ws);
        return true;
    },

    handleMapClick(ws, x, y) {
        const user = getUser(ws.id!);
        const state = user?.fishing;

        if (!user || !state?.pendingTarget) {
            return false;
        }

        const validationError = validateFishingStart(user, { x, y });

        if (validationError) {
            handleProtocol.console(validationError, "white", 0, 0, ws);
            return true;
        }

        const equippedRod = getEquippedFishingRod(user);

        if (!equippedRod) {
            clearFishingState(user);
            handleProtocol.console("Debes tener equipada una caña de pescar.", "white", 0, 0, ws);
            return true;
        }

        if (workingLock.hasAnotherActiveWorkOnSameIp(user.id)) {
            handleProtocol.console("Ya tienes otro personaje trabajando desde esta IP.", "white", 0, 0, ws);
            return true;
        }

        const startedAt = Date.now();

        user.fishing = {
            active: true,
            pendingTarget: false,
            slot: equippedRod.slot,
            itemId: equippedRod.itemId,
            power: equippedRod.power,
            target: { x, y },
            origin: clonePosition(user.pos),
            startedAt,
            nextTickAt: startedAt + vars.timing.fishingTickMs,
        };

        socket.loopArea(user.id, (target) => {
            if (!target.isNpc) {
                withUserClient(target.id, (targetClient) => {
                    handleProtocol.playSound(user.id, vars.arSounds.SND_PESCAR, targetClient);
                });
            }
        });

        handleProtocol.console("Comienzas a pescar.", "#7dd3fc", 0, 0, ws);
        return true;
    },

    processTick(now) {
        for (const idUser in vars.personajes) {
            const user = getUser(idUser);
            const state = user?.fishing;
            if (user && bankOperations.isBusy(user.id)) continue;

            if (!user || !state?.active || !state.nextTickAt || now < state.nextTickAt) {
                continue;
            }

            if (workingLock.shouldCancelForSameIpConflict(idUser)) {
                this.cancelFishing(
                    idUser,
                    "La pesca se canceló porque ya tienes otro personaje trabajando desde esta IP.",
                );
                continue;
            }

            if (
                user.dead ||
                !state.origin ||
                user.pos.x !== state.origin.x ||
                user.pos.y !== state.origin.y ||
                !state.target
            ) {
                this.cancelFishing(idUser, "La pesca se canceló.");
                continue;
            }

            const equippedRod = getEquippedFishingRod(user);

            if (!equippedRod || equippedRod.itemId !== state.itemId) {
                this.cancelFishing(idUser, "La pesca se canceló porque ya no tienes la caña equipada.");
                continue;
            }

            if (validateFishingStart(user, state.target)) {
                this.cancelFishing(idUser, "La pesca se canceló porque ya no estás en una posición válida.");
                continue;
            }

            state.nextTickAt = now + vars.timing.fishingTickMs;

            const fishingChance = getFishingChanceForSkill(getCharacterSkill(user,'fishing'));

            if (Math.floor(Math.random() * 100) + 1 > fishingChance) {
                continue;
            }

            const reward = pickWeightedReward(equippedRod.power);

            if (!reward) {
                continue;
            }

            const rewardAmount = getFishingRewardAmount(equippedRod.itemId);

            if (!addRewardToInventory(user, reward.itemId, rewardAmount)) {
                withUserClient(idUser, (userClient) => {
                    handleProtocol.console("Tienes el inventario lleno.", "white", 0, 0, userClient);
                });
                this.cancelFishing(idUser, "La pesca se detuvo porque no tienes espacio en el inventario.");
                continue;
            }

            trainCharacterSkill(user,'fishing');
            withUserClient(idUser, (userClient) => {
                handleProtocol.console(
                    `Has pescado ${rewardAmount} ${vars.datObj[reward.itemId].name}.`,
                    "#86efac",
                    0,
                    0,
                    userClient,
                );
            });
            socket.loopArea(idUser, (target) => {
                if (!target.isNpc) {
                    withUserClient(target.id, (targetClient) => {
                        handleProtocol.playSound(idUser, vars.arSounds.SND_PESCAR, targetClient);
                    });
                }
            });
        }
    },

    cancelFishing(idUser, reason, keepTargeting = false) {
        const user = getUser(idUser);
        const wasActive = Boolean(user?.fishing?.active);

        if (!user?.fishing) {
            return;
        }

        clearFishingState(user, keepTargeting);

        if (reason && wasActive) {
            withUserClient(idUser, (userClient) => {
                handleProtocol.console(reason, "white", 0, 0, userClient);
            });
        }
    },
};

module.exports = fishing;
