export type PublicWikiResponse = {
    generatedAt: string;
    stats: {
        npcCount: number;
        combatNpcCount: number;
        equipmentCount: number;
        spellCount: number;
        trainingMapCount: number;
    };
    npcs: Array<{
        bodyId: number;
        headId: number;
        id: number;
        name: string;
        npcType: number;
        npcTypeLabel: string;
        description: string;
        maxHp: number;
        expReward: number;
        goldReward: number;
        minHit: number;
        maxHit: number;
        defense: number;
        expPerHp: number | null;
        isCombatNpc: boolean;
        maps: Array<{
            mapId: number;
            mapName: string;
            spawns: number;
        }>;
        sells: Array<{
            itemId: number;
            itemName: string;
            quantity: number;
        }>;
        drops: Array<{
            itemId: number;
            itemName: string;
            quantity: number;
        }>;
        totalSpawns: number;
        searchIndex: string;
    }>;
    equipment: Array<{
        id: number;
        name: string;
        grhIndex: number;
        objType: number;
        objTypeLabel: string;
        category: "weapon" | "armor" | "shield" | "helmet" | "magic_weapon";
        categoryLabel: string;
        value: number;
        minHit: number;
        maxHit: number;
        minDef: number;
        maxDef: number;
        tier: number;
        newbie: boolean;
        blockedClasses: number[];
        soldBy: Array<{
            npcId: number;
            npcName: string;
            quantity: number;
        }>;
        droppedBy: Array<{
            npcId: number;
            npcName: string;
            quantity: number;
        }>;
        searchIndex: string;
    }>;
    spells: Array<{
        id: number;
        name: string;
        description: string;
        type: number;
        typeLabel: string;
        minSkill: number;
        manaRequired: number;
        target: number;
        words: string;
        minPower: number;
        maxPower: number;
        sources: Array<{
            itemId: number;
            itemName: string;
            soldBy: Array<{
                npcId: number;
                npcName: string;
                quantity: number;
            }>;
            droppedBy: Array<{
                npcId: number;
                npcName: string;
                quantity: number;
            }>;
        }>;
        searchIndex: string;
    }>;
    trainingMaps: Array<{
        id: number;
        name: string;
        terreno: string;
        zona: string;
        restringir: string;
        minLevel: number;
        maxLevel: number;
        pk: boolean;
        totalNpcSpawns: number;
        totalCombatSpawns: number;
        uniqueCombatNpcs: number;
        topNpcs: Array<{
            npcId: number;
            npcName: string;
            spawns: number;
            expReward: number;
            maxHp: number;
        }>;
        searchIndex: string;
    }>;
};
