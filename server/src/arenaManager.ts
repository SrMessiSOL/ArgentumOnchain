import type { GameApi } from "./game";
import type { RuntimeCharacter } from "./types/runtime";
import { loadMapNpcPlacements } from "./mapNpcStorage";

export {};

const vars = require("./vars");
const funct = require("./functions");
const _ = require("lodash");

type ArenaInstance = {
    roomId: string;
    baseMapId: number;
    mapId: number;
};

type ArenaNpcSource = {
    x: number;
    y: number;
    mapNum: number;
    npcIndex: number;
    movement?: number;
};

const ARENA_MAP_START = 1000;

function getGame() {
    return require("./game") as GameApi;
}

function createArenaNpc() {
    return {
        id: 0,
        nameCharacter: "",
        idClase: 1,
        idHead: 0,
        idHelmet: 0,
        idWeapon: 0,
        idBody: 0,
        idShield: 0,
        npcType: 0,
        hp: 0,
        maxHp: 0,
        minHit: 0,
        maxHit: 0,
        def: 0,
        poderAtaque: 0,
        poderEvasion: 0,
        movement: 1,
        color: "white",
        map: 0,
        pos: { x: 0, y: 0 },
        gold: 0,
        heading: 2,
        moveOffsetX: 0,
        moveOffsetY: 0,
        inmovilizado: 0,
        paralizado: 0,
        fxId: 0,
        frameFxCounter: 0,
        zonaSegura: 0,
        exp: 0,
        isNpc: true,
        drop: [],
        rute: [],
        clan: "",
        cooldownAtaque: 0,
        cooldownParalizado: 0,
        aguaValida: 0,
        tierraInvalida: 0,
        desc: "",
        nextThinkAt: 0,
    };
}

const arenaManager = {
    nextMapId: ARENA_MAP_START,
    instances: {} as Record<string, ArenaInstance>,
    pendingHandovers: {} as Record<string, string>,

    createUniqueEntityId() {
        let unique = false;
        let id = 0;

        while (!unique) {
            id = Date.now();

            if (!vars.personajes[id] && !vars.npcs[id]) {
                unique = true;
            }
        }

        return id;
    },

    createUniqueMapId() {
        while (vars.mapa[this.nextMapId] || vars.mapData[this.nextMapId]) {
            this.nextMapId += 1;
        }

        const mapId = this.nextMapId;
        this.nextMapId += 1;
        return mapId;
    },

    cloneMap(baseMapId: number, targetMapId: number) {
        vars.mapa[targetMapId] = _.cloneDeep(vars.mapa[baseMapId]);

        vars.mapData[targetMapId] = [];

        for (let y = 1; y <= 100; y++) {
            vars.mapData[targetMapId][y] = [];

            for (let x = 1; x <= 100; x++) {
                vars.mapData[targetMapId][y][x] = {
                    id: 0,
                };
            }
        }

        vars.mapData[targetMapId].name = vars.mapData[baseMapId].name;
        vars.mapData[targetMapId].musicNum = vars.mapData[baseMapId].musicNum;
        vars.mapData[targetMapId].magiaSinEfecto = vars.mapData[baseMapId].magiaSinEfecto;
        vars.mapData[targetMapId].noEncriptarMp = vars.mapData[baseMapId].noEncriptarMp;
        vars.mapData[targetMapId].terreno = vars.mapData[baseMapId].terreno;
        vars.mapData[targetMapId].zona = vars.mapData[baseMapId].zona;
        vars.mapData[targetMapId].restringir = vars.mapData[baseMapId].restringir;
        vars.mapData[targetMapId].backup = vars.mapData[baseMapId].backup;
        vars.mapData[targetMapId].pk = vars.mapData[baseMapId].pk;
    },

    spawnMapNpcs(baseMapId: number, targetMapId: number) {
        const game = getGame();

        (loadMapNpcPlacements(baseMapId) as ArenaNpcSource[]).forEach((npcInMap) => {
            const datNpc = vars.datNpc[npcInMap.npcIndex];

            if (!datNpc) {
                return;
            }

            const tmpNpc = _.cloneDeep(createArenaNpc());

            tmpNpc.id = this.createUniqueEntityId();
            tmpNpc.templateNpcIndex = Number(npcInMap.npcIndex);
            tmpNpc.map = targetMapId;
            tmpNpc.pos.x = Number(npcInMap.x);
            tmpNpc.pos.y = Number(npcInMap.y);
            tmpNpc.nameCharacter = datNpc.name;
            tmpNpc.color = "white";
            tmpNpc.isNpc = true;
            tmpNpc.idBody = datNpc.idBody;
            tmpNpc.idHead = datNpc.idHead;
            tmpNpc.movement = Number.isInteger(Number(npcInMap.movement)) ? Number(npcInMap.movement) : datNpc.movement;
            tmpNpc.npcType = Number(datNpc.npcType);
            tmpNpc.exp = datNpc.exp;

            if (datNpc.gold) tmpNpc.gold = datNpc.gold;

            tmpNpc.hp = datNpc.hp;
            tmpNpc.maxHp = datNpc.maxHp;
            tmpNpc.minHit = datNpc.minHit;
            tmpNpc.maxHit = datNpc.maxHit;
            tmpNpc.def = datNpc.def;
            tmpNpc.poderAtaque = datNpc.poderAtaque;
            tmpNpc.poderEvasion = datNpc.poderEvasion;
            tmpNpc.snd1 = datNpc.snd1 ?? 0;
            tmpNpc.snd2 = datNpc.snd2 ?? 0;
            tmpNpc.soundClose = datNpc.soundClose ?? 0;

            if (datNpc.drop) tmpNpc.drop = datNpc.drop;
            if (datNpc.objs) tmpNpc.objs = datNpc.objs;
            if (datNpc.desc) tmpNpc.desc = datNpc.desc;

            tmpNpc.aguaValida = datNpc.aguaValida;
            tmpNpc.tierraInvalida = datNpc.tierraInvalida ?? 0;

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
        });
    },

    getOrCreateInstance(roomId: string, baseMapId = 272) {
        const existing = this.instances[roomId];

        if (existing) {
            return existing;
        }

        const mapId = this.createUniqueMapId();

        this.cloneMap(baseMapId, mapId);
        this.spawnMapNpcs(baseMapId, mapId);

        const instance = {
            roomId,
            baseMapId,
            mapId,
        };

        this.instances[roomId] = instance;
        funct.sendTelegramMessage(`[Server-PVP] Instance created for room ${roomId} on map ${mapId}.`);
        return instance;
    },

    getInstance(roomId: string) {
        return this.instances[roomId];
    },

    countPlayers(roomId: string) {
        let total = 0;

        for (const idUser in vars.personajes) {
            const user = vars.personajes[idUser] as RuntimeCharacter | undefined;

            if (user?.pvpChar && user.arenaRoomId === roomId && !user.cerrado) {
                total += 1;
            }
        }

        return total;
    },

    isAccountConnectedInRoom(roomId: string, accountId: string, excludeCharacterId?: string) {
        for (const idUser in vars.personajes) {
            const user = vars.personajes[idUser] as RuntimeCharacter | undefined;

            if (
                user?.pvpChar &&
                user.arenaRoomId === roomId &&
                String(user.idAccount) === accountId &&
                !user.cerrado &&
                idUser !== excludeCharacterId
            ) {
                return true;
            }
        }

        return false;
    },

    beginHandover(roomId: string, accountId: string) {
        this.pendingHandovers[accountId] = roomId;
    },

    endHandover(roomId: string, accountId: string) {
        if (this.pendingHandovers[accountId] === roomId) {
            delete this.pendingHandovers[accountId];
        }
    },

    hasPendingHandover(roomId: string, accountId: string) {
        return this.pendingHandovers[accountId] === roomId;
    },

    async connectRoom(roomId: string, accountId: string) {
        await funct.fetchUrl(`/internal/arenas/rooms/${roomId}/connect`, {
            method: "POST",
            headers: {
                Authorization: vars.tokenAuth,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ accountId }),
        });
    },

    async disconnectRoom(roomId: string, accountId: string) {
        try {
            await funct.fetchUrl(`/internal/arenas/rooms/${roomId}/disconnect`, {
                method: "POST",
                headers: {
                    Authorization: vars.tokenAuth,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ accountId }),
            });
        } catch (error) {
            funct.dumpError(error);
        }
    },

    destroyInstance(roomId: string) {
        const instance = this.instances[roomId];

        if (!instance) {
            return;
        }

        for (const idNpc in vars.npcs) {
            const npc = vars.npcs[idNpc];

            if (npc?.map === instance.mapId) {
                delete vars.npcs[idNpc];
                delete vars.areaNpc[idNpc];
            }
        }

        delete vars.mapData[instance.mapId];
        delete vars.mapa[instance.mapId];
        delete this.instances[roomId];
        funct.sendTelegramMessage(`[Server-PVP] Instance destroyed for room ${roomId}.`);
    },

    async onPlayerDisconnected(character: RuntimeCharacter | undefined) {
        if (!character?.pvpChar || !character.arenaRoomId || !character.idAccount) {
            return;
        }

        const roomId = String(character.arenaRoomId);
        const accountId = String(character.idAccount);
        const characterId = typeof character.id !== "undefined" ? String(character.id) : undefined;

        if (this.hasPendingHandover(roomId, accountId)) {
            return;
        }

        if (!this.isAccountConnectedInRoom(roomId, accountId, characterId)) {
            await this.disconnectRoom(roomId, accountId);
        }

        if (this.countPlayers(roomId) === 0) {
            this.destroyInstance(roomId);
        }
    },
};

module.exports = arenaManager;
