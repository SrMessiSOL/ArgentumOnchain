import type { RuntimeCharacter } from "./types/runtime";
import { loadMapNpcPlacements } from "./mapNpcStorage";

export {};

const vars = require("./vars");
const funct = require("./functions");
const _ = require("lodash");

const DYNAMIC_INSTANCE_MAP_START = 30_000;
const DYNAMIC_INSTANCE_MAP_STRIDE = 50;

function getGame() {
    return require("./game");
}

function getLogin() {
    return require("./login");
}

function getNpcs() {
    return require("./npcs");
}

function createRuntimeNpcTemplate() {
    return getNpcs().createNpc();
}

function getBaseMapIdFromInstanceMap(mapId: number): number | null {
    if (mapId < DYNAMIC_INSTANCE_MAP_START) {
        return null;
    }

    return Math.floor((mapId - DYNAMIC_INSTANCE_MAP_START) / DYNAMIC_INSTANCE_MAP_STRIDE);
}

function getExtraNpcEntries(baseMapId: number) {
    return baseMapId === 500
        ? [
              { mapNum: 500, x: 35, y: 35, npcIndex: 2 },
              { mapNum: 500, x: 59, y: 36, npcIndex: 9007 },
          ]
        : baseMapId === 505
          ? [{ mapNum: 505, x: 35, y: 35, npcIndex: 9005 }]
          : [];
}

const mapInstanceManager = {
    isInstanceMap(mapId: number) {
        return getBaseMapIdFromInstanceMap(mapId) !== null;
    },

    getBaseMapId(mapId: number) {
        return getBaseMapIdFromInstanceMap(mapId);
    },

    cloneMap(baseMapId: number, targetMapId: number) {
        vars.mapa[targetMapId] = _.cloneDeep(vars.mapa[baseMapId]);
        vars.mapData[targetMapId] = _.cloneDeep(vars.mapData[baseMapId]);

        for (let y = 1; y <= 100; y += 1) {
            for (let x = 1; x <= 100; x += 1) {
                if (!vars.mapData[targetMapId][y]?.[x]) {
                    vars.mapData[targetMapId][y] ??= [];
                    vars.mapData[targetMapId][y][x] = {};
                }

                vars.mapData[targetMapId][y][x].id = 0;
            }
        }
    },

    spawnMapNpcs(baseMapId: number, targetMapId: number) {
        const game = getGame();
        const login = getLogin();
        const entries = [...loadMapNpcPlacements(baseMapId), ...getExtraNpcEntries(baseMapId)];

        for (const entry of entries) {
            const datNpc = vars.datNpc[entry.npcIndex];
            if (!datNpc) {
                continue;
            }

            const tmpNpc = _.cloneDeep(createRuntimeNpcTemplate());
            tmpNpc.id = login.createId();
            tmpNpc.templateNpcIndex = Number(entry.npcIndex);
            tmpNpc.map = targetMapId;
            tmpNpc.pos.x = Number(entry.x);
            tmpNpc.pos.y = Number(entry.y);
            tmpNpc.nameCharacter = datNpc.name;
            tmpNpc.color = "white";
            tmpNpc.isNpc = true;
            tmpNpc.idBody = datNpc.idBody;
            tmpNpc.idHead = datNpc.idHead;
            tmpNpc.movement = datNpc.movement;
            tmpNpc.npcType = Number(datNpc.npcType);
            tmpNpc.exp = datNpc.exp;
            tmpNpc.gold = datNpc.gold || 0;
            tmpNpc.hp = datNpc.hp;
            tmpNpc.maxHp = datNpc.maxHp;
            tmpNpc.minHit = datNpc.minHit;
            tmpNpc.maxHit = datNpc.maxHit;
            tmpNpc.def = datNpc.def;
            tmpNpc.defM = datNpc.defM ?? datNpc.magicDef ?? 0;
            tmpNpc.magicDef = datNpc.magicDef ?? datNpc.defM ?? 0;
            tmpNpc.magicResistance = datNpc.magicResistance ?? 0;
            tmpNpc.poderAtaque = datNpc.poderAtaque;
            tmpNpc.poderEvasion = datNpc.poderEvasion;
            tmpNpc.snd1 = datNpc.snd1 ?? 0;
            tmpNpc.snd2 = datNpc.snd2 ?? 0;
            tmpNpc.soundClose = datNpc.soundClose ?? 0;
            tmpNpc.drop = datNpc.drop;
            tmpNpc.objs = datNpc.objs;
            tmpNpc.aguaValida = datNpc.aguaValida;
            tmpNpc.tierraInvalida = datNpc.tierraInvalida ?? 0;
            tmpNpc.desc = datNpc.desc;

            if (
                !game.validInitialNpcSpawn(
                    tmpNpc.pos,
                    targetMapId,
                    Boolean(tmpNpc.aguaValida),
                    Number(tmpNpc.movement ?? 0),
                    Boolean(tmpNpc.tierraInvalida),
                )
            ) {
                const respawnPos = game.respawnNpc(
                    targetMapId,
                    Boolean(tmpNpc.aguaValida),
                    Boolean(tmpNpc.tierraInvalida),
                );
                tmpNpc.pos.x = respawnPos.posNewX;
                tmpNpc.pos.y = respawnPos.posNewY;
            }

            const clan = vars.clanNpc[tmpNpc.npcType];
            if (clan) {
                tmpNpc.clan = clan;
            }

            vars.npcs[tmpNpc.id] = tmpNpc;
            vars.npcs[tmpNpc.id].cooldownAtaque = Date.now() + 4000;
            vars.areaNpc[tmpNpc.id] = [];
            vars.mapData[targetMapId][tmpNpc.pos.y][tmpNpc.pos.x].id = tmpNpc.id;
        }
    },

    ensureInstance(mapId: number) {
        if (vars.mapa[mapId] && vars.mapData[mapId]) {
            return true;
        }

        const baseMapId = getBaseMapIdFromInstanceMap(mapId);
        if (!baseMapId || !vars.mapa[baseMapId] || !vars.mapData[baseMapId]) {
            return false;
        }

        this.cloneMap(baseMapId, mapId);
        this.spawnMapNpcs(baseMapId, mapId);
        funct.sendTelegramMessage(`[Server] Instance created for base map ${baseMapId} on map ${mapId}.`);
        return true;
    },

    resetMapNpcs(mapId: number) {
        const baseMapId = this.isInstanceMap(mapId) ? this.getBaseMapId(mapId) : mapId;

        if (!baseMapId || baseMapId < 500 || !vars.mapData[mapId]) {
            return false;
        }

        for (const npcId in vars.npcs) {
            const npc = vars.npcs[npcId];
            if (!npc || npc.map !== mapId) {
                continue;
            }

            const tile = vars.mapData[mapId]?.[npc.pos.y]?.[npc.pos.x];
            if (tile?.id === npc.id) {
                tile.id = 0;
            }

            delete vars.npcs[npcId];
            delete vars.areaNpc[npcId];
        }

        this.spawnMapNpcs(baseMapId, mapId);
        return true;
    },

    countPlayers(mapId: number) {
        let total = 0;

        for (const idUser in vars.personajes as Record<string, RuntimeCharacter | undefined>) {
            const user = (vars.personajes as Record<string, RuntimeCharacter | undefined>)[idUser];

            if (user?.map === mapId && !user.cerrado) {
                total += 1;
            }
        }

        return total;
    },

    destroyInstance(mapId: number) {
        if (!this.isInstanceMap(mapId) || !vars.mapa[mapId] || !vars.mapData[mapId]) {
            return;
        }

        for (const idNpc in vars.npcs) {
            const npc = vars.npcs[idNpc];
            if (npc?.map === mapId) {
                delete vars.npcs[idNpc];
                delete vars.areaNpc[idNpc];
            }
        }

        delete vars.mapData[mapId];
        delete vars.mapa[mapId];
        funct.sendTelegramMessage(`[Server] Instance destroyed on map ${mapId}.`);
    },

    onPlayerDisconnected(character: RuntimeCharacter | undefined) {
        const mapId = Number(character?.map ?? 0);

        if (!this.isInstanceMap(mapId)) {
            return;
        }

        if (this.countPlayers(mapId) === 0) {
            this.destroyInstance(mapId);
        }
    },
};

module.exports = mapInstanceManager;
