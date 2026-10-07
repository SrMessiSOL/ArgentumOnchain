import type { DataObject, EntityId, Position, RuntimeCharacter, RuntimeClient } from "./types/runtime";
import type { GameApi } from "./game";
import { bankOperations } from './bankOperationGuard';
import type { HandleProtocolApi } from "./handleProtocol";
import { getCharacterById } from "./runtimeRegistry";
import { getCraftingRecipes, type CraftingProfession, type CraftingRecipe } from "./craftingRecipes";

export {};

const vars = require("./vars");
const handleProtocol = require("./handleProtocol") as HandleProtocolApi;

function getGameApi() {
    return require("./game") as GameApi;
}

type CraftingUser = RuntimeCharacter & {
    id: EntityId;
    dead?: number | boolean;
    level?: number;
    inv: Record<string, { idItem: number; cant: number }>;
    map: number;
    pos: Position;
    idItemWeapon?: number | string;
    craftingTarget?: {
        pendingTarget?: boolean;
        profession?: "blacksmith";
        slot?: number;
        itemId?: number;
    };
};

type CraftingApi = {
    isCarpentryTool: (idItem: number) => boolean;
    isTailoringTool: (idItem: number) => boolean;
    isBlacksmithTool: (idItem: number) => boolean;
    usesCraftingTool: (idItem: number) => boolean;
    handleToolUse: (ws: RuntimeClient, idPos: number | string) => boolean;
    handleMapClick: (ws: RuntimeClient, x: number, y: number) => boolean;
    handleCraftRequest: (
        ws: RuntimeClient,
        profession: CraftingProfession,
        itemId: number,
        amount: number,
    ) => Promise<void>;
    cancelPendingTarget: (idUser: EntityId) => void;
};

function getUser(idUser: EntityId) {
    return getCharacterById<CraftingUser>(idUser);
}

function getSimulatedSkill(user: CraftingUser) {
    return Math.min(100, Math.max(0, Number(user.level ?? 0) * 3));
}

function getProfessionForTool(idItem: number): CraftingProfession | null {
    if (crafting.isCarpentryTool(idItem)) {
        return "carpentry";
    }

    if (crafting.isTailoringTool(idItem)) {
        return "tailoring";
    }

    if (crafting.isBlacksmithTool(idItem)) {
        return "blacksmith";
    }

    return null;
}

function getProfessionLabel(profession: CraftingProfession) {
    if (profession === "carpentry") {
        return "Carpintería";
    }

    if (profession === "tailoring") {
        return "Sastrería";
    }

    return "Herrería";
}

function getProfessionRecipes(profession: CraftingProfession, skill: number) {
    return getCraftingRecipes()
        .filter((recipe) => recipe.profession === profession && recipe.skill <= skill)
        .sort(
            (left, right) =>
                Number(left.sortOrder ?? left.id) - Number(right.sortOrder ?? right.id) || left.id - right.id,
        );
}

function isWithinRange(origin: Position, target: Position, maxDistance: number) {
    return Math.abs(origin.x - target.x) <= maxDistance && Math.abs(origin.y - target.y) <= maxDistance;
}

function isValidAnvilTarget(user: CraftingUser, target: Position) {
    const objInfo = vars.mapa[user.map]?.[target.y]?.[target.x]?.objInfo;

    if (!objInfo?.objIndex) {
        return false;
    }

    const obj = vars.datObj[objInfo.objIndex] as DataObject | undefined;

    return Boolean(obj && obj.objType === vars.objType.yunque && isWithinRange(user.pos, target, 2));
}

function countInventoryItem(user: CraftingUser, itemId: number) {
    let total = 0;

    for (const item of Object.values(user.inv)) {
        if (item.idItem === itemId) {
            total += item.cant;
        }
    }

    return total;
}

function canReceiveCraftedItem(user: CraftingUser, itemId: number, amount: number) {
    for (const item of Object.values(user.inv)) {
        if (item.idItem === itemId && item.cant + amount <= 10000) {
            return true;
        }
    }

    return Object.keys(user.inv).length < 21;
}

function removeMaterial(user: CraftingUser, itemId: number, amount: number) {
    let remaining = amount;

    for (const [slot, item] of Object.entries(user.inv)) {
        if (remaining <= 0) {
            break;
        }

        if (item.idItem !== itemId) {
            continue;
        }

        const toRemove = Math.min(remaining, item.cant);
        getGameApi().quitarUserInvItem(user.id, slot, toRemove);
        remaining -= toRemove;
    }

    return remaining <= 0;
}

function getRecipe(idItem: number, profession: CraftingProfession) {
    return getCraftingRecipes().find((recipe) => recipe.profession === profession && recipe.itemId === idItem) ?? null;
}

function getCraftedItemStats(obj: DataObject) {
    switch (obj.objType) {
        case vars.objType.armas: {
            const parts = [`Daño: ${obj.minHit ?? 0}/${obj.maxHit ?? 0}`];

            if (obj.apu) {
                parts.push("Apuñala");
            }

            if (obj.magicDamageBonus) {
                parts.push(`Bonus daño mágico: ${obj.magicDamageBonus}%`);
            }

            return parts.join(" | ");
        }

        case vars.objType.flechas:
            return `Daño: ${obj.minHit ?? 0}/${obj.maxHit ?? 0}`;

        case vars.objType.armaduras:
        case vars.objType.escudos:
        case vars.objType.cascos: {
            const parts = [`Defensa: ${obj.minDef ?? 0}/${obj.maxDef ?? 0}`];

            if (obj.objType === vars.objType.cascos && obj.minDefMag && obj.maxDefMag) {
                parts.push(`Defensa Mágica: ${obj.minDefMag}/${obj.maxDefMag}`);
            }

            if (obj.resistenciaMagica) {
                parts.push(`Resistencia mágica: ${obj.resistenciaMagica}%`);
            }

            return parts.join(" | ");
        }

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

            return parts.join(" | ");
        }

        default:
            return "";
    }
}

function serializeRecipe(user: CraftingUser, recipe: CraftingRecipe) {
    const obj = vars.datObj[recipe.itemId] as DataObject | undefined;

    if (!obj) {
        return null;
    }

    return {
        itemId: recipe.itemId,
        name: obj.name,
        grhIndex: Number(obj.grhIndex ?? 0),
        details: recipe.category,
        stats: getCraftedItemStats(obj),
        skill: recipe.skill,
        category: recipe.category,
        materials: recipe.materials
            .map((material) => {
                const materialObj = vars.datObj[material.itemId] as DataObject | undefined;

                if (!materialObj) {
                    return null;
                }

                return {
                    itemId: material.itemId,
                    name: materialObj.name,
                    amount: material.amount,
                    owned: countInventoryItem(user, material.itemId),
                };
            })
            .filter(
                (material): material is { itemId: number; name: string; amount: number; owned: number } =>
                    material !== null,
            ),
    };
}

const crafting: CraftingApi = {
    isCarpentryTool(idItem) {
        const name = String(vars.datObj?.[idItem]?.name ?? "");
        return /serrucho/i.test(name);
    },

    isTailoringTool(idItem) {
        const name = String(vars.datObj?.[idItem]?.name ?? "");
        return /costurero/i.test(name);
    },

    isBlacksmithTool(idItem) {
        const name = String(vars.datObj?.[idItem]?.name ?? "");
        return /martillo de herrero/i.test(name);
    },

    usesCraftingTool(idItem) {
        return this.isCarpentryTool(idItem) || this.isTailoringTool(idItem) || this.isBlacksmithTool(idItem);
    },

    handleToolUse(ws, idPos) {
        const user = getUser(ws.id!);

        if (!user) {
            return false;
        }

        const inventoryItem = user.inv[String(idPos)];
        const profession = inventoryItem ? getProfessionForTool(inventoryItem.idItem) : null;

        if (!inventoryItem || !profession) {
            return false;
        }

        if (user.dead) {
            handleProtocol.console("Los muertos no pueden trabajar.", "white", 0, 0, ws);
            return true;
        }

        if (profession === "blacksmith") {
            user.craftingTarget = {
                pendingTarget: true,
                profession,
                slot: Number(idPos),
                itemId: inventoryItem.idItem,
            };
            handleProtocol.console("Haz click sobre un yunque cercano para trabajar herrería.", "#fcd34d", 0, 0, ws);
            return true;
        }

        const recipes = getProfessionRecipes(profession, getSimulatedSkill(user))
            .map((recipe) => serializeRecipe(user, recipe))
            .filter((recipe) => recipe !== null);

        handleProtocol.openCrafting(
            {
                profession,
                title: getProfessionLabel(profession),
                recipes,
            },
            ws,
        );

        return true;
    },

    handleMapClick(ws, x, y) {
        const user = getUser(ws.id!);
        const targetState = user?.craftingTarget;

        if (!user || !targetState?.pendingTarget || targetState.profession !== "blacksmith") {
            return false;
        }

        const weaponSlot = Number(user.idItemWeapon ?? 0);

        if (!weaponSlot || weaponSlot !== Number(targetState.slot ?? 0)) {
            handleProtocol.console(
                "Debes tener equipado un martillo de herrero para trabajar con el yunque.",
                "white",
                0,
                0,
                ws,
            );
            user.craftingTarget = undefined;
            return true;
        }

        if (!isValidAnvilTarget(user, { x, y })) {
            handleProtocol.console("Debes hacer click sobre un yunque cercano.", "white", 0, 0, ws);
            return true;
        }

        user.craftingTarget = undefined;

        const recipes = getProfessionRecipes("blacksmith", getSimulatedSkill(user))
            .map((recipe) => serializeRecipe(user, recipe))
            .filter((recipe) => recipe !== null);

        handleProtocol.openCrafting(
            {
                profession: "blacksmith",
                title: getProfessionLabel("blacksmith"),
                recipes,
            },
            ws,
        );

        return true;
    },

    async handleCraftRequest(ws, profession, itemId, amount) {
        const user = getUser(ws.id!);

        if (!user) {
            return;
        }

        if (user.dead) {
            handleProtocol.console("Los muertos no pueden trabajar.", "white", 0, 0, ws);
            return;
        }

        const safeAmount = Math.max(1, Math.min(9999, Math.floor(Number(amount) || 0)));
        const recipe = getRecipe(itemId, profession);

        if (!recipe) {
            return;
        }

        if (getSimulatedSkill(user) < recipe.skill) {
            handleProtocol.console("No tienes skill suficiente para fabricar ese objeto.", "white", 0, 0, ws);
            return;
        }

        const hasTool = Object.values(user.inv).some((item) => {
            if (profession === "carpentry") {
                return this.isCarpentryTool(item.idItem);
            }

            if (profession === "tailoring") {
                return this.isTailoringTool(item.idItem);
            }

            return this.isBlacksmithTool(item.idItem);
        });

        if (!hasTool) {
            handleProtocol.console(
                profession === "carpentry"
                    ? "Necesitas un serrucho para trabajar carpintería."
                    : profession === "tailoring"
                      ? "Necesitas un costurero para trabajar sastrería."
                      : "Necesitas un martillo de herrero para trabajar herrería.",
                "white",
                0,
                0,
                ws,
            );
            return;
        }

        const scaledMaterials = recipe.materials.map((material) => ({
            itemId: material.itemId,
            amount: material.amount * safeAmount,
        }));

        for (const material of scaledMaterials) {
            if (countInventoryItem(user, material.itemId) < material.amount) {
                const materialObj = vars.datObj[material.itemId] as DataObject | undefined;
                handleProtocol.console(`No tienes suficiente ${materialObj?.name ?? "material"}.`, "white", 0, 0, ws);
                return;
            }
        }

        if (!canReceiveCraftedItem(user, recipe.itemId, safeAmount)) {
            handleProtocol.console("Tienes el inventario lleno.", "white", 0, 0, ws);
            return;
        }

        for (const material of scaledMaterials) {
            removeMaterial(user, material.itemId, material.amount);
        }

        const game = getGameApi();

        game.putItemToInv(user.id, recipe.itemId, safeAmount);
        await game.persistCharacterItemsById(user.id);

        const craftedObj = vars.datObj[recipe.itemId] as DataObject | undefined;
        handleProtocol.console(`Has fabricado ${safeAmount} ${craftedObj?.name ?? "objeto"}.`, "#86efac", 0, 0, ws);
    },

    cancelPendingTarget(idUser) {
        const user = getUser(idUser);

        if (!user?.craftingTarget) {
            return;
        }

        user.craftingTarget = undefined;
    },
};

const rawCraftRequest = crafting.handleCraftRequest.bind(crafting);
crafting.handleCraftRequest = (ws, profession, itemId, amount) => {
    if (!ws.id || !Number.isSafeInteger(amount) || amount < 1 || amount > 9999) return Promise.resolve();
    return bankOperations.run(ws.id, () => rawCraftRequest(ws, profession, itemId, amount), undefined);
};
module.exports = crafting;
