export {};
import { buildNpcRespawnKey, getNpcRespawnCooldown, initializeNpcRespawnCooldowns } from "./npcRespawnCooldowns";
import { loadAllMapNpcPlacements, replaceAllMapNpcPlacements } from "./mapNpcStorage";
const { initializeNpcTemplatesFromApi } = require("./gameDataSync");
const game = require("./game");
const vars = require("./vars");
const npcs = require("./npcs");
const login = require("./login");

const _ = require("lodash");

class LoadNpcs {
    constructor() {}

    async initialize() {
        await this.load();

        console.log("NPCs loaded.");
    }

    load() {
        return new Promise(async (resolve: any, reject: any) => {
            vars.datNpc = {};

            try {
                const result = await initializeNpcTemplatesFromApi();
                console.log(
                    `[GAME DATA] NPC templates loaded from DB: ${result.loadedTemplates}. Applied version: ${result.currentVersion}.`,
                );
                if (result.loadedTemplates <= 0) {
                    reject(new Error("Could not load NPCs from the API."));
                    return;
                }
            } catch (error) {
                reject(error);
                return;
            }

            const cooldownKeys = initializeNpcRespawnCooldowns((npc: any) => {
                this.createNpcInMap(npc, true, true);
            });

            const npcsInMap = loadAllMapNpcPlacements();

            npcsInMap.map((npc: any) => {
                if (cooldownKeys.has(buildNpcRespawnKey(npc))) {
                    return;
                }

                this.createNpcInMap(npc, true);
            });

            resolve(true);
        });
    }

    createNpcInMap(npc: any, skipRespawnCooldownCheck = false, forceRandomSpawn = false) {
        const { x, y, mapNum, npcIndex } = npc;

        if (!vars.mapData[mapNum]) return;

        if (!skipRespawnCooldownCheck && getNpcRespawnCooldown({ mapNum, x, y, npcIndex })) {
            return;
        }

        let tmpNPC = _.cloneDeep(npcs.createNpc());

        tmpNPC.id = login.createId();
        tmpNPC.templateNpcIndex = Number(npcIndex);
        tmpNPC.spawnMapNum = Number(mapNum);
        tmpNPC.spawnOrigin = {
            x: parseInt(x),
            y: parseInt(y),
        };
        tmpNPC.map = mapNum;

        const datNpc = vars.datNpc[npcIndex];

        tmpNPC.pos.x = parseInt(x);
        tmpNPC.pos.y = parseInt(y);
        tmpNPC.nameCharacter = datNpc.name;
        tmpNPC.color = "white";
        tmpNPC.isNpc = true;
        tmpNPC.idBody = datNpc.idBody;
        tmpNPC.idHead = datNpc.idHead;
        tmpNPC.movement = Number.isInteger(Number(npc.movement)) ? Number(npc.movement) : datNpc.movement;
        tmpNPC.npcType = parseInt(datNpc.npcType);
        tmpNPC.exp = datNpc.exp;
        if (datNpc.gold) tmpNPC.gold = datNpc.gold;
        tmpNPC.hp = datNpc.hp;
        tmpNPC.maxHp = datNpc.maxHp;
        tmpNPC.minHit = datNpc.minHit;
        tmpNPC.maxHit = datNpc.maxHit;
        tmpNPC.def = datNpc.def;
        tmpNPC.defM = datNpc.defM ?? datNpc.magicDef ?? 0;
        tmpNPC.magicDef = datNpc.magicDef ?? datNpc.defM ?? 0;
        tmpNPC.magicResistance = datNpc.magicResistance ?? 0;
        tmpNPC.poderAtaque = datNpc.poderAtaque;
        tmpNPC.poderEvasion = datNpc.poderEvasion;
        tmpNPC.snd1 = datNpc.snd1 ?? 0;
        tmpNPC.snd2 = datNpc.snd2 ?? 0;
        tmpNPC.soundClose = datNpc.soundClose ?? 0;
        tmpNPC.spellCastIntervalMs = datNpc.spellCastIntervalMs ?? 0;
        tmpNPC.spellRange = datNpc.spellRange ?? 0;
        tmpNPC.spells = Array.isArray(datNpc.spells)
            ? datNpc.spells
                  .filter((spell: any) => Number(spell?.idSpell ?? 0) > 0)
                  .map((spell: any) => ({
                      idSpell: Number(spell.idSpell),
                      cooldownSeconds: Math.max(0, Number(spell.cooldownSeconds ?? 0)),
                      lastUsedAt: 0,
                  }))
            : [];
        if (datNpc.drop) tmpNPC.drop = datNpc.drop;
        if (datNpc.objs) tmpNPC.objs = datNpc.objs;
        tmpNPC.aguaValida = datNpc.aguaValida;
        tmpNPC.tierraInvalida = datNpc.tierraInvalida ?? 0;
        if (datNpc.desc) tmpNPC.desc = datNpc.desc;

        if (forceRandomSpawn) {
            const respawnPos = game.respawnNpc(mapNum, Boolean(tmpNPC.aguaValida), Boolean(tmpNPC.tierraInvalida));
            tmpNPC.pos.x = respawnPos.posNewX;
            tmpNPC.pos.y = respawnPos.posNewY;
        } else if (
            !game.validInitialNpcSpawn(
                tmpNPC.pos,
                mapNum,
                Boolean(tmpNPC.aguaValida),
                Number(tmpNPC.movement ?? 0),
                Boolean(tmpNPC.tierraInvalida),
            )
        ) {
            const respawnPos = game.respawnNpc(mapNum, Boolean(tmpNPC.aguaValida), Boolean(tmpNPC.tierraInvalida));
            tmpNPC.pos.x = respawnPos.posNewX;
            tmpNPC.pos.y = respawnPos.posNewY;
        }

        const clan = vars.clanNpc[tmpNPC.npcType];

        if (clan) {
            tmpNPC.clan = clan;
        }

        vars.npcs[tmpNPC.id] = tmpNPC;
        vars.npcs[tmpNPC.id].cooldownAtaque = +Date.now() + 4000;
        vars.areaNpc[tmpNPC.id] = [];

        vars.mapData[mapNum][tmpNPC.pos.y][tmpNPC.pos.x].id = tmpNPC.id;
    }

    createJsonNpcsInMap() {
        return new Promise((resolve: any) => {
            const arNpcInMap: Array<{ mapNum: number; y: number; x: number; npcIndex: number }> = [];

            for (let mapNum = 1; mapNum < 291; mapNum++) {
                for (let mapaY = 1; mapaY <= 100; mapaY++) {
                    for (let mapaX = 1; mapaX <= 100; mapaX++) {
                        if (!vars.mapa[mapNum]) break;

                        const npcIndex = vars.mapa[mapNum][mapaY][mapaX].npcIndex;

                        if (npcIndex) {
                            arNpcInMap.push({
                                mapNum: mapNum,
                                y: mapaY,
                                x: mapaX,
                                npcIndex: npcIndex,
                            });
                        }
                    }
                }
            }

            replaceAllMapNpcPlacements(arNpcInMap);

            resolve(true);
        });
    }
}

module.exports = LoadNpcs;
