import type { EntityId, InventoryItem, RuntimeCharacter, RuntimeClient, SpellSlot } from "./types/runtime";
import type { SocketApi } from "./socket";
import { type CharacterFaction, getFactionColor } from "./factions";

export {};
const funct = require("./functions");
const vars = require("./vars");
const game = require("./game");
const socket = require("./socket") as SocketApi;
const handleProtocol = require("./handleProtocol");
const arenaManager = require("./arenaManager");
const mapInstanceManager = require("./mapInstanceManager");
const balance = require("./balance");
const safeZone = require("./safeZone");
const _ = require("lodash");

function normalizeFaction(value: unknown): CharacterFaction {
    return value === "armada" || value === "caos" ? value : "none";
}

type LoginAccount = {
    _id: string;
    name: string;
    email?: string;
};

type StoredInventoryItem = {
    idPos: string;
    idItem: number;
    cant: number;
    equipped: number | boolean;
};

type StoredSpellSlot = {
    idPos: string;
    idSpell: number;
};

type StoredBankItem = {
    idPos: string;
    idItem: number;
    cant: number;
};

type StoredCharacter = RuntimeCharacter & {
    _id: string;
    name: string;
    banned: Date | string | null;
    attrFuerza: number;
    attrAgilidad: number;
    posX: number;
    posY: number;
    items: StoredInventoryItem[];
    bankItems: StoredBankItem[];
    spells: StoredSpellSlot[] | Record<string, SpellSlot>;
    inv: Record<string, InventoryItem>;
    bank: Record<string, InventoryItem>;
    dead: number | boolean;
    navegando: number | boolean;
    clanId?: string | null;
    clanName?: string | null;
    clanAlignment?: "citizen" | "criminal" | null;
    clanMinJoinLevel?: number | null;
    clanRole?: "leader" | "co_leader" | "member" | null;
};

const JAIL_MAP = 66;
const JAIL_X = 68;
const JAIL_Y = 47;
const FALLBACK_MAP_ID = 1;
const FALLBACK_POS_X = 50;
const FALLBACK_POS_Y = 50;
const ULLA_MAP_ID = 1;
const ULLA_POS_X = 54;
const ULLA_POS_Y = 59;
const DRAGON_SLAYER_SWORD_ITEM_ID = 402;
const CLAN_RING_MAP_ID = 273;
const WELCOME_CONSOLE_MESSAGES = [
    "Bienvenido a AOWeb. Si quieres enterarte de las últimas actualizaciones del juego, puedes ingresar a nuestro Discord.",
    "- Si quieres reportar erorres o sugerir cambios, puedes hacerlo en: https://forms.gle/Df2cmGExTBjjJhAR8",
    "- Está completamente prohibido el uso de personajes cámara, cheats o cualquier programa externo que modifique el juego, como auto tomar pociones o auto removerse. El uso de los mismos terminará en un ban permanente, sin previo aviso.",
];

function resolveBoatBodyId(currentBodyId: number | undefined, dead: number | boolean) {
    if (dead) {
        return 87;
    }

    return currentBodyId === 85 || currentBodyId === 86 ? currentBodyId : 84;
}

type CharacterLookupResponse = {
    account: LoginAccount;
    character: StoredCharacter;
};

function parseBannedUntil(value: Date | string | null | undefined) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    const bannedUntil = new Date(value);

    return Number.isNaN(bannedUntil.getTime()) ? null : bannedUntil;
}

function sendWelcomeConsoleMessage(client: RuntimeClient) {
    for (const message of WELCOME_CONSOLE_MESSAGES) {
        handleProtocol.console(message, "#8be9fd", 1, 0, client);
    }
}

type MapLevelRestrictedCharacter = {
    level?: number;
    privileges?: number;
    inv?: Record<string, InventoryItem>;
    items?: StoredInventoryItem[];
    map: number;
    pos?: { x: number; y: number };
    posX?: number;
    posY?: number;
};

function hasDragonSlayerSwordInInventory(
    user: Pick<MapLevelRestrictedCharacter, "privileges" | "inv" | "items"> | undefined,
): boolean {
    if (Number(user?.privileges ?? 0) === 1) {
        return false;
    }

    if (Object.values(user?.inv ?? {}).some((item) => Number(item?.idItem ?? 0) === DRAGON_SLAYER_SWORD_ITEM_ID)) {
        return true;
    }

    return (user?.items ?? []).some((item) => Number(item?.idItem ?? 0) === DRAGON_SLAYER_SWORD_ITEM_ID);
}

function getMapEntryDeniedMessage(
    user: Pick<MapLevelRestrictedCharacter, "level" | "privileges" | "inv" | "items"> | undefined,
    mapId: number,
): string {
    if (Number(user?.privileges ?? 0) === 1) {
        return "";
    }

    if (mapId === CLAN_RING_MAP_ID) {
        if (hasDragonSlayerSwordInInventory(user)) {
            return `No puedes entrar a la arena con una Espada Mata Dragones en el inventario.`;
        }
    }

    const minLevel = Math.max(0, Number(vars.mapData[mapId]?.minLevel ?? 0));
    const maxLevel = Math.max(0, Number(vars.mapData[mapId]?.maxLevel ?? 0));
    const mapName = String(vars.mapData[mapId]?.name ?? "").trim() || "este lugar";
    const userLevel = Number(user?.level ?? 0);
    const hasMinLevel = minLevel > 0;
    const hasMaxLevel = maxLevel > 0;
    const hasLevelRange = hasMinLevel && hasMaxLevel;

    if (hasMinLevel && userLevel < minLevel) {
        if (hasLevelRange) {
            return `Solo los personajes desde nivel ${minLevel} hasta nivel ${maxLevel} pueden entrar a ${mapName}`;
        }

        return `Solo los personajes desde nivel ${minLevel} pueden entrar a ${mapName}`;
    }

    if (hasMaxLevel && userLevel > maxLevel) {
        if (hasLevelRange) {
            return `Solo los personajes desde nivel ${minLevel} hasta nivel ${maxLevel} pueden entrar a ${mapName}`;
        }

        return `Solo los personajes hasta nivel ${maxLevel} pueden entrar a ${mapName}`;
    }

    return "";
}

function relocateCharacterToUllaIfMapLevelDenied(user: MapLevelRestrictedCharacter | undefined): string {
    if (!user) {
        return "";
    }

    const deniedMessage = getMapEntryDeniedMessage(user, user.map);

    if (!deniedMessage) {
        return "";
    }

    user.map = ULLA_MAP_ID;
    user.posX = ULLA_POS_X;
    user.posY = ULLA_POS_Y;
    user.pos = { x: ULLA_POS_X, y: ULLA_POS_Y };

    return deniedMessage;
}

type ArenaTicketResponse = {
    mode: "arena";
    account: LoginAccount & {
        email: string;
    };
    arena: {
        roomId: string;
        roomName: string;
        mapId: number;
        pvpTemplateId: number;
    };
};

type PvPCharacterTemplate = {
    idClase: number;
    idHead: number;
    idHelmet: number;
    idWeapon: number;
    idShield: number;
    idBody: number;
    hp: number;
    mana: number;
    hit: number;
    idRaza: number;
    inv: Record<string, InventoryItem>;
    spells: Record<string, SpellSlot>;
    idItemWeapon?: number;
    idItemBody?: number;
    idItemShield?: number;
    idItemHelmet?: number;
    idItemArrow?: number;
    idItemRing?: number;
};

const PVP_TEMPLATE_LEVEL = balance.MAX_LEVEL;
const LOAD_BOT_HASTE_SPELL_ID = 18;
const LOAD_BOT_HASTE_SLOT = 10;
const LOAD_BOT_MIN_MANA = 2000;

export type LoginApi = {
    disconnectAllCharacters: (account: LoginAccount) => Promise<void>;
    connect: (ws: RuntimeClient, ticket: string, typeGame: number, idChar: number) => Promise<void>;
    connectCharacterPvP: (
        ws: RuntimeClient,
        nameCharacter: string,
        idAccount: string,
        idChar: number,
        arenaRoomId?: string,
        arenaMapId?: number,
        options?: {
            spawn?: {
                mapId: number;
                x: number;
                y: number;
            };
            markAsBot?: boolean;
            adminSummonedBot?: {
                ownerId: EntityId;
                level: number;
            };
            pvpChar?: boolean;
        },
    ) => Promise<void>;
    createId: () => number;
};

const login = {} as LoginApi;

Login.call(login);

function ensureCharacterHasValidMapPosition(user: RuntimeCharacter | StoredCharacter | undefined) {
    if (!user) {
        return;
    }

    if (vars.mapData[user.map]?.[user.pos.y]?.[user.pos.x]) {
        return;
    }

    user.map = FALLBACK_MAP_ID;
    user.posX = FALLBACK_POS_X;
    user.posY = FALLBACK_POS_Y;
    user.pos = { x: FALLBACK_POS_X, y: FALLBACK_POS_Y };
    user.challengeMatchId = null;
    user.challengeTeam = null;
    user.challengeLockedUntil = 0;
    user.inmovilizado = 0;
    user.paralizado = 0;
}

function isLocalConnectionIp(ip?: string): boolean {
    const normalized = String(ip || "")
        .trim()
        .toLowerCase();

    return (
        normalized === "127.0.0.1" ||
        normalized === "::1" ||
        normalized === "::ffff:127.0.0.1" ||
        normalized === "localhost"
    );
}

function relocateCharacterIfNeeded(ws: RuntimeClient) {
    const user = vars.personajes[ws.id!];

    if (!user) {
        return;
    }

    ensureCharacterHasValidMapPosition(user);

    const isOccupied = Boolean(vars.mapData[user.map]?.[user.pos.y]?.[user.pos.x]?.id);
    const isLegal = game.legalPos(user.pos.x, user.pos.y, user.map, Boolean(user.navegando));

    if (!isOccupied && isLegal) {
        return;
    }

    const pos = game.getFreeSpace(ws, user.map, user.pos.x, user.pos.y, "login.relocateCharacterIfNeeded");

    if (!pos) {
        return;
    }

    user.pos.y = pos.y;
    user.pos.x = pos.x;
}

function emitLoginWarpSound(ws: RuntimeClient) {
    const user = vars.personajes[ws.id!];

    if (!user) {
        return;
    }

    game.loopAreaPos(user.map, user.pos, function (target: RuntimeCharacter) {
        handleProtocol.playSound(ws.id!, vars.arSounds.SND_WARP, vars.clients[target.id]);
    });
}

function relocateToJailIfNeeded(character: StoredCharacter) {
    if (Number(character.jailMinutes ?? 0) <= 0) {
        return;
    }

    character.map = JAIL_MAP;
    character.posX = JAIL_X;
    character.posY = JAIL_Y;
    character.pos = { x: JAIL_X, y: JAIL_Y };
}

async function claimPersistedCharacterConnection(characterId: string,accountId:string): Promise<boolean> {
    try {
        await funct.fetchUrl(`/internal/characters/${encodeURIComponent(characterId)}/connect`, {
            method: "POST",
            headers: {
                Authorization: vars.tokenAuth,
                "Content-Type":"application/json",
            },
            body:JSON.stringify({accountId}),
        });

        return true;
    } catch (error) {
        if (error instanceof Error && error.message === "Character already connected") {
            return false;
        }

        throw error;
    }
}

async function releasePersistedCharacterConnection(characterId?: string): Promise<void> {
    if (!characterId) {
        return;
    }

    try {
        await funct.fetchUrl(`/internal/characters/${encodeURIComponent(characterId)}/disconnect`, {
            method: "POST",
            headers: {
                Authorization: vars.tokenAuth,
            },
        });
    } catch (error) {
        funct.dumpError(error);
    }
}

function Login(this: LoginApi) {
    this.disconnectAllCharacters = async function (account: LoginAccount) {
        const disconnections: Promise<void>[] = [];

        for (let i in vars.personajes) {
            if (vars.personajes[i].idAccount == account._id) {
                disconnections.push(game.closeForce(i));
            }
        }

        await Promise.all(disconnections);
    };

    this.connect = async function (ws: RuntimeClient, ticket: string, typeGame: number, idChar: number) {
        let claimedCharacterId: string | null = null;

        try {
            if (typeGame === 3) {
                const botPayload = JSON.parse(ticket || "{}") as {
                    kind?: string;
                    secret?: string;
                    name?: string;
                    templateId?: number;
                    mapId?: number;
                    x?: number;
                    y?: number;
                };
                const botTemplateId = Number(botPayload.templateId ?? idChar);
                const spawnMapId = Number(botPayload.mapId ?? 0);
                const spawnX = Number(botPayload.x ?? 0);
                const spawnY = Number(botPayload.y ?? 0);

                if (
                    botPayload.kind !== "loadbot" ||
                    botPayload.secret !== vars.tokenAuth ||
                    !isLocalConnectionIp(socket.getIp(ws))
                ) {
                    handleProtocol.error("Conexion de bot invalida.", ws);
                    ws.close();
                    return;
                }

                await this.connectCharacterPvP(
                    ws,
                    String(botPayload.name || `LoadBot-${Date.now()}`),
                    `bot:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
                    botTemplateId,
                    undefined,
                    undefined,
                    {
                        spawn:
                            spawnMapId > 0 && spawnX > 0 && spawnY > 0
                                ? {
                                      mapId: spawnMapId,
                                      x: spawnX,
                                      y: spawnY,
                                  }
                                : undefined,
                        markAsBot: true,
                    },
                );
                return;
            }

            if (ticket) {
                const result = (await funct.fetchUrl(`/game-ticket/consume`, {
                    method: "POST",
                    headers: {
                        Authorization: vars.tokenAuth,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        ticket,
                        clientIp: socket.getIp(ws),
                    }),
                })) as CharacterLookupResponse;

                ws.sessionCredentialHash = (result as CharacterLookupResponse & {sessionCredentialHash?:string}).sessionCredentialHash;
                const arenaResult = result as unknown as ArenaTicketResponse;
                const { account, character } = result as CharacterLookupResponse;

                if (!account || !account._id || (typeGame == 1 && (!character || !character._id))) {
                    ws.close();
                    return;
                }

                if (typeGame == 2) {
                    const templateId = arenaResult.arena?.pvpTemplateId ?? idChar;
                    const baseMapId = arenaResult.arena?.mapId ?? 272;
                    const arenaRoomId = arenaResult.arena?.roomId;
                    const arenaMapId = arenaRoomId
                        ? arenaManager.getOrCreateInstance(arenaRoomId, baseMapId).mapId
                        : baseMapId;

                    if (arenaRoomId) {
                        arenaManager.beginHandover(arenaRoomId, account._id);
                    }

                    await login.disconnectAllCharacters(account);

                    try {
                        return await this.connectCharacterPvP(
                            ws,
                            account.name,
                            account._id,
                            templateId,
                            arenaRoomId,
                            arenaMapId,
                        );
                    } catch (error) {
                        if (arenaRoomId) {
                            arenaManager.endHandover(arenaRoomId, account._id);
                            await arenaManager.disconnectRoom(arenaRoomId, account._id);
                        }

                        throw error;
                    }
                }

                await login.disconnectAllCharacters(account);
                const claimedConnection = await claimPersistedCharacterConnection(character._id,account._id);

                if (!claimedConnection) {
                    handleProtocol.error("Tu personaje ya se está conectando o ya está conectado.", ws);
                    ws.close();
                    return;
                }

                claimedCharacterId = character._id;
                await game.waitForCharacterPersistence(character._id);

                const refreshedCharacterLookup = (await funct.fetchUrl(
                    `/character?idAccount=${encodeURIComponent(account._id)}&idCharacter=${encodeURIComponent(character._id)}&email=${encodeURIComponent(account.email ?? "")}`,
                    {
                        method: "GET",
                        headers: {
                            Authorization: vars.tokenAuth,
                        },
                    },
                )) as CharacterLookupResponse;

                const persistedCharacter = refreshedCharacterLookup?.character;

                if (!persistedCharacter?._id) {
                    await releasePersistedCharacterConnection(claimedCharacterId);
                    claimedCharacterId = null;
                    ws.close();
                    return;
                }

                const date = new Date();

                const personaje = _.cloneDeep(persistedCharacter) as StoredCharacter;

                personaje.banned = parseBannedUntil(personaje.banned);

                if (personaje.banned && personaje.banned > date) {
                    await releasePersistedCharacterConnection(claimedCharacterId);
                    claimedCharacterId = null;
                    handleProtocol.error("Tu personaje se encuentra baneado.", ws);
                    return;
                }

                ws.id = login.createId();

                personaje.id = String(ws.id);
                personaje.nameCharacter = personaje.name;
                personaje.faction = normalizeFaction(personaje.faction);
                personaje.factionScoreArmada = Number(personaje.factionScoreArmada ?? 0);
                personaje.factionScoreCaos = Number(personaje.factionScoreCaos ?? 0);
                personaje.factionRankArmada = Number(personaje.factionRankArmada ?? 0);
                personaje.factionRankCaos = Number(personaje.factionRankCaos ?? 0);
                personaje.factionRewardsArmada = Number(personaje.factionRewardsArmada ?? 0);
                personaje.factionRewardsCaos = Number(personaje.factionRewardsCaos ?? 0);
                personaje.clanId = personaje.clanId ?? null;
                personaje.clanAlignment = personaje.clanAlignment ?? null;
                personaje.clanMinJoinLevel = personaje.clanMinJoinLevel ?? null;
                personaje.clanRole = personaje.clanRole ?? null;
                personaje.clan = personaje.clanName ? `<${personaje.clanName}>` : "";

                if (!personaje.posX) {
                    personaje.posX = 50;
                }

                if (!personaje.posY) {
                    personaje.posY = 50;
                }

                if (!personaje.map) {
                    personaje.map = 1;
                }

                if (mapInstanceManager.isInstanceMap(personaje.map)) {
                    const instanceReady = mapInstanceManager.ensureInstance(personaje.map);

                    if (!instanceReady) {
                        await releasePersistedCharacterConnection(claimedCharacterId);
                        claimedCharacterId = null;
                        handleProtocol.error("No se pudo inicializar la instancia del mapa.", ws);
                        return;
                    }
                }

                personaje.pos = {
                    x: personaje.posX,
                    y: personaje.posY,
                };

                const isWaterSpawn = game.hayAgua(personaje.map, personaje.pos);

                if (personaje.navegando && isWaterSpawn) {
                    personaje.idBody = resolveBoatBodyId(personaje.idBody, personaje.dead);
                    personaje.idHead = 0;
                    personaje.idWeapon = 0;
                    personaje.idHelmet = 0;
                    personaje.idShield = 0;
                } else if (!personaje.navegando && isWaterSpawn) {
                    console.log(
                        `[login] User in water without sailing: ${personaje.nameCharacter} at ${personaje.map}@${personaje.pos.x},${personaje.pos.y}`,
                    );
                }

                personaje.heading = 2;
                personaje.pendingMoveQueue = [];
                personaje.pendingMoveTimerId = null;
                personaje.lastProcessedMoveId = 0;
                personaje.stateVersion = 0;
                personaje.ignoreMovementUntil = 0;
                personaje.nextWalkAt = 0;
                personaje.pvpMapChangeBlockedUntil = 0;

                personaje.moveOffsetX = 0;
                personaje.moveOffsetY = 0;

                personaje.nextDialogAt = 0;
                personaje.nextMeleeAt = 0;
                personaje.nextSpellAt = 0;
                personaje.nextSpellAfterMeleeAt = 0;
                personaje.nextMeleeAfterSpellAt = 0;
                personaje.nextUseItemAt = 0;
                personaje.nextUseItemAfterMeleeAt = 0;
                personaje.nextResyncPositionAt = 0;

                const raceBalance =
                    typeof personaje.idRaza !== "undefined" ? vars.balanceRazas[personaje.idRaza] : null;
                const baseAttrFuerza = raceBalance ? 18 + raceBalance.fuerza : personaje.attrFuerza;
                const baseAttrAgilidad = raceBalance ? 18 + raceBalance.agilidad : personaje.attrAgilidad;
                const baseAttrInteligencia = raceBalance ? 18 + raceBalance.inteligencia : personaje.attrInteligencia;
                const baseAttrConstitucion = raceBalance ? 18 + raceBalance.constitucion : personaje.attrConstitucion;

                personaje.cooldownFuerza = 0;
                personaje.cooldownAgilidad = 0;
                personaje.cooldownInvisibleSpell = 0;
                personaje.invisibleSpell = false;

                personaje.attrFuerza = baseAttrFuerza;
                personaje.attrAgilidad = baseAttrAgilidad;
                personaje.attrInteligencia = baseAttrInteligencia;
                personaje.attrConstitucion = baseAttrConstitucion;
                personaje.bkAttrFuerza = baseAttrFuerza;
                personaje.bkAttrAgilidad = baseAttrAgilidad;

                personaje.level = balance.clampLevel(personaje.level || 1);
                personaje.expNextLevel = balance.getLegacyExpNextLevelForLevel(personaje.level);
                personaje.maxHp = balance.getMaxHpForLevel(
                    personaje.idClase,
                    personaje.attrConstitucion,
                    personaje.level,
                );
                personaje.maxMana = balance.getMaxManaForLevel(
                    personaje.idClase,
                    personaje.attrInteligencia,
                    personaje.level,
                );
                personaje.minHit = balance.getMinHitForLevel(personaje.idClase, personaje.level);
                personaje.maxHit = balance.getMaxHitForLevel(personaje.idClase, personaje.level);
                const normalizedMaxHp = personaje.maxHp ?? 1;
                const normalizedMaxMana = personaje.maxMana ?? 0;
                personaje.hp = personaje.dead
                    ? 0
                    : Math.min(Math.max(personaje.hp ?? normalizedMaxHp, 0), normalizedMaxHp);
                personaje.mana = Math.min(Math.max(personaje.mana ?? normalizedMaxMana, 0), normalizedMaxMana);

                personaje.seguroActivado = true;
                personaje.seguroClanActivado = Boolean(personaje.clanId);
                personaje.partyId = null;
                personaje.partyLeaderId = null;
                personaje.partyInvitationFrom = null;
                personaje.partyInvitationExpiresAt = 0;
                personaje.logoutRequestedAt = 0;
                personaje.logoutExpiresAt = 0;
                personaje.disconnectOnDeath = false;
                personaje.deadWorldActive = Boolean(personaje.dead);
                personaje.deadWorldTransitionEndsAt = 0;
                personaje.deadWorldTimeoutId = null;

                personaje.cerrado = false;

                personaje.meditar = false;

                personaje.inmovilizado = 0;

                personaje.fxId = 0;
                personaje.frameFxCounter = 0;

                personaje.zonaSegura = safeZone.getSafeZoneFlag(personaje.map, personaje.pos);

                personaje.spell = {
                    lanzados: 0,
                    tiempoTotal: 0,
                    startTimer: 0,
                };

                personaje.hit = {
                    hits: 0,
                    tiempoTotal: 0,
                    startTimer: 0,
                };

                personaje.walk = {
                    pasos: 0,
                    tiempoTotal: 0,
                    startTimer: 0,
                };

                personaje.useObj = {
                    startTimer: 0,
                    usos: 0,
                    tiempoTotal: 0,
                    adv: 0,
                };


                personaje.inv = {};
                personaje.bank = {};

                personaje.items.map((item) => {
                    const idPos = item.idPos;

                    personaje.inv[idPos] = {
                        idItem: item.idItem,
                        cant: item.cant,
                        equipped: Boolean(item.equipped),
                    };

                    const obj = vars.datObj[item.idItem];

                    if (!obj) {
                        delete personaje.inv[idPos];
                        return;
                    }

                    if (!personaje.dead && item.equipped) {
                        if (obj.objType == vars.objType.armaduras) {
                            if (!personaje.navegando) {
                                personaje.idBody = obj.anim;
                            }
                            personaje.idItemBody = idPos;
                        } else if (obj.objType == vars.objType.armas) {
                            if (!personaje.navegando) {
                                personaje.idWeapon = obj.anim;
                            }
                            personaje.idItemWeapon = idPos;
                        } else if (obj.objType == vars.objType.anillos) {
                            personaje.idItemRing = idPos;
                        } else if (obj.objType == vars.objType.escudos) {
                            if (!personaje.navegando) {
                                personaje.idShield = obj.anim;
                            }
                            personaje.idItemShield = idPos;
                        } else if (obj.objType == vars.objType.cascos) {
                            if (!personaje.navegando) {
                                personaje.idHelmet = obj.anim;
                            }
                            personaje.idItemHelmet = idPos;
                        } else if (obj.objType == vars.objType.flechas) {
                            personaje.idItemArrow = idPos;
                        }
                    }
                });

                (personaje.bankItems ?? []).map((item) => {
                    const idPos = item.idPos;

                    personaje.bank[idPos] = {
                        idItem: item.idItem,
                        cant: item.cant,
                        equipped: 0,
                    };
                });

                personaje.pasosGenerales = 0;

                const spells: Record<string, { idSpell: number }> = {};

                (personaje.spells as StoredSpellSlot[]).map((spell) => {
                    spells[spell.idPos] = {
                        idSpell: spell.idSpell,
                    };
                });

                personaje.spells = spells;

                const classCannotUseMagic =
                    personaje.idClase === vars.clases.guerrero || personaje.idClase === vars.clases.cazador;

                if (classCannotUseMagic) {
                    personaje.mana = 0;
                    personaje.maxMana = 0;
                    personaje.spells = {};
                }

                personaje.gold = balance.clampGold(personaje.gold || 0);
                relocateToJailIfNeeded(personaje);
                ensureCharacterHasValidMapPosition(personaje);
                const mapLevelDeniedMessage = relocateCharacterToUllaIfMapLevelDenied(personaje);

                personaje.connected = true;
                personaje.invisibleAdmin = personaje.privileges === 1;
                personaje.summons = [];
                personaje.summonTargetNpcId = 0;
                vars.personajes[ws.id] = personaje;

                vars.clients[ws.id] = ws;
                ws.connectedAt = Date.now();
                ws.packetCount = 0;
                ws.packetCountNonPing = 0;
                ws.recentPacketIntervalsMs = [];
                ws.recentPacketTimestamps = [];
                ws.recentPacketTimestamps60s = [];
                ws.packetTypeCounts = {};
                ws.lastPacketAt = 0;
                ws.lastPacketIntervalMs = 0;
                ws.minPacketIntervalMs = 0;

                relocateCharacterIfNeeded(ws);

                vars.mapData[vars.personajes[ws.id].map][vars.personajes[ws.id].pos.y][
                    vars.personajes[ws.id].pos.x
                ].id = ws.id;

                personaje.ip = socket.getIp(ws);

                await game.persistCharacterSnapshot(personaje, { connected: true });

                const personajeWS = vars.personajes[ws.id];

                if (personajeWS.privileges == 1 || personajeWS.privileges == 2) {
                    personajeWS.color = "#419900";
                    personajeWS.clan = "<AOWeb Staff>";
                } else {
                    personajeWS.color =
                        getFactionColor(personajeWS.faction) ?? (personajeWS.criminal ? "red" : "#3333ff");
                }

                socket.withFlushGroup(ws, () => {
                    handleProtocol.sendMyCharacter(personajeWS);
                    socket.send(ws);
                    sendWelcomeConsoleMessage(ws);

                    if (mapLevelDeniedMessage) {
                        handleProtocol.console(mapLevelDeniedMessage, "white", 1, 0, ws);
                    }

                    if (Number(personajeWS.jailMinutes ?? 0) > 0) {
                        const jailReason = personajeWS.jailReason?.trim();
                        const jailReasonSuffix = jailReason ? ` Motivo: ${jailReason}.` : "";

                        handleProtocol.console(
                            `Sigues en la carcel por ${personajeWS.jailMinutes} minuto${personajeWS.jailMinutes === 1 ? "" : "s"}.${jailReasonSuffix}`,
                            "white",
                            1,
                            0,
                            ws,
                        );
                    }

                    game.setNewAreas(ws);
                });

                funct.sendTelegramMessage(
                    `[Server] User ${personajeWS.nameCharacter} connected on map ${vars.personajes[ws.id].map}.`,
                );

                vars.usuariosOnline++;

                funct.sendTelegramMessage(`[Server] Users online: ${vars.usuariosOnline}`);

                funct.logOnlineRecord();

                handleProtocol.actOnline(vars.usuariosOnline);
                emitLoginWarpSound(ws);
                funct.logCharacterActivity({
                    observedAt: new Date().toISOString(),
                    accountId: personajeWS.idAccount ?? null,
                    characterId: personajeWS._id ?? null,
                    characterName: personajeWS.nameCharacter,
                    clientIp: socket.getIp(ws) ?? null,
                    category: "session",
                    action: "character_connect",
                    goldDelta: 0,
                    details: {
                        map: personajeWS.map,
                        posX: personajeWS.pos.x,
                        posY: personajeWS.pos.y,
                    },
                });
                claimedCharacterId = null;
            }
        } catch (err) {
            await releasePersistedCharacterConnection(claimedCharacterId ?? undefined);

            if (err instanceof Error && err.message === "Game ticket invalido") {
                ws.close();
                return;
            }

            if (
                err instanceof Error &&
                (err.message === "Tu IP se encuentra baneada." ||
                    err.message === "Tu personaje tiene un ban de IP activo.")
            ) {
                handleProtocol.error(err.message, ws);
                return;
            }

            if (
                typeGame == 2 &&
                err instanceof Error &&
                (err.message === "Sala no encontrada" ||
                    err.message === "Primero debes unirte a la sala" ||
                    err.message === "La sala alcanzo su capacidad maxima")
            ) {
                handleProtocol.error(err.message, ws);
                return;
            }

            funct.dumpError(err);
            ws.close();
        }
    };

    this.connectCharacterPvP = async (
        ws: RuntimeClient,
        nameCharacter: string,
        idAccount: string,
        idChar: number,
        arenaRoomId?: string,
        arenaMapId?: number,
        options?: {
            spawn?: {
                mapId: number;
                x: number;
                y: number;
            };
            markAsBot?: boolean;
            adminSummonedBot?: {
                ownerId: EntityId;
                level: number;
            };
            pvpChar?: boolean;
        },
    ) => {
        const character = _.cloneDeep(vars.charactersPvP[idChar]) as PvPCharacterTemplate | undefined;

        if (!character) {
            throw new Error(`Plantilla PvP invalida: ${idChar}`);
        }

        const isAdminSummonedBot = Boolean(options?.adminSummonedBot);
        const targetLevel = Math.max(
            1,
            Math.min(
                balance.MAX_LEVEL,
                Math.floor(Number(options?.adminSummonedBot?.level ?? PVP_TEMPLATE_LEVEL) || PVP_TEMPLATE_LEVEL),
            ),
        );
        const isSyntheticBot = Boolean(options?.markAsBot || isAdminSummonedBot);
        const isPvpCharacter = options?.pvpChar ?? true;

        const baseAttrFuerza = 18 + vars.balanceRazas[character.idRaza].fuerza;
        const baseAttrAgilidad = 18 + vars.balanceRazas[character.idRaza].agilidad;
        const baseAttrInteligencia = 18 + vars.balanceRazas[character.idRaza].inteligencia;
        const baseAttrConstitucion = 18 + vars.balanceRazas[character.idRaza].constitucion;
        const maxHp = balance.getMaxHpForLevel(character.idClase, baseAttrConstitucion, targetLevel);
        const baseMaxMana = balance.getMaxManaForLevel(character.idClase, baseAttrInteligencia, targetLevel);
        const maxMana = options?.markAsBot ? Math.max(baseMaxMana, LOAD_BOT_MIN_MANA) : baseMaxMana;
        const minHit = balance.getMinHitForLevel(character.idClase, targetLevel);
        const maxHit = balance.getMaxHitForLevel(character.idClase, targetLevel);

        const mapId = options?.spawn?.mapId || arenaMapId || 272;
        const spawnX = options?.spawn?.x || 77;
        const spawnY = options?.spawn?.y || 48;

        ws.id = login.createId();

        if (options?.markAsBot) {
            if (!character.spells || typeof character.spells !== "object") {
                character.spells = {};
            }

            character.spells[LOAD_BOT_HASTE_SLOT] = {
                idSpell: LOAD_BOT_HASTE_SPELL_ID,
            };
        }

        const initialStrength = isAdminSummonedBot ? baseAttrFuerza * 2 : baseAttrFuerza;
        const initialAgility = isAdminSummonedBot ? baseAttrAgilidad * 2 : baseAttrAgilidad;
        const initialBuffStartedAt = isAdminSummonedBot ? Date.now() : 0;

        const newCharacter = {
            idAccount: idAccount,
            arenaRoomId: arenaRoomId || null,
            pvpChar: isPvpCharacter,
            botLoad: isSyntheticBot,
            adminSummonedBot: isAdminSummonedBot,
            adminSummonedBotOwnerId: options?.adminSummonedBot?.ownerId,
            nameCharacter: nameCharacter,
            spawnMap: mapId,
            spawnPos: { x: spawnX, y: spawnY },
            idClase: character.idClase,
            map: mapId,
            posX: spawnX,
            posY: spawnY,
            gold: 0,
            idHead: character.idHead,
            idLastHead: 0,
            idLastBody: 0,
            idLastHelmet: 0,
            idLastWeapon: 0,
            idLastShield: 0,
            idHelmet: character.idHelmet,
            idWeapon: character.idWeapon,
            idShield: character.idShield,
            idBody: character.idBody,
            spellsAcertados: 0,
            spellsErrados: 0,
            hp: maxHp,
            maxHp,
            mana: maxMana,
            maxMana,
            idRaza: character.idRaza,
            idGenero: 1,
            muerto: 0,
            minHit,
            maxHit,
            attrFuerza: initialStrength,
            attrAgilidad: initialAgility,
            attrInteligencia: baseAttrInteligencia,
            attrConstitucion: baseAttrConstitucion,
            privileges: 0,
            countKilled: 0,
            countDie: 0,
            exp: 1,
            expNextLevel: balance.getLegacyExpNextLevelForLevel(targetLevel),
            level: targetLevel,
            ip: socket.getIp(ws),
            banned: null,
            dead: 0,
            criminal: 0,
            faction: "none",
            navegando: 0,
            npcMatados: 0,
            ciudadanosMatados: 0,
            criminalesMatados: 0,
            fianza: 0,
            homeMap: ULLA_MAP_ID,
            homeX: ULLA_POS_X,
            homeY: ULLA_POS_Y,
            factionScoreArmada: 0,
            factionScoreCaos: 0,
            factionRankArmada: 0,
            factionRankCaos: 0,
            factionRewardsArmada: 0,
            factionRewardsCaos: 0,
            connected: true,
            id: ws.id,
            pos: { x: spawnX, y: spawnY },
            heading: 2,
            pendingMoveQueue: [],
            pendingMoveTimerId: null,
            lastProcessedMoveId: 0,
            stateVersion: 0,
            ignoreMovementUntil: 0,
            nextWalkAt: 0,
            moveOffsetX: 0,
            moveOffsetY: 0,
            nextDialogAt: 0,
            nextMeleeAt: 0,
            nextSpellAt: 0,
            nextSpellAfterMeleeAt: 0,
            nextMeleeAfterSpellAt: 0,
            nextUseItemAt: 0,
            nextUseItemAfterMeleeAt: 0,
            nextResyncPositionAt: 0,
            cooldownFuerza: initialBuffStartedAt,
            cooldownAgilidad: initialBuffStartedAt,
            cooldownInvisibleSpell: 0,
            invisibleSpell: false,
            hiddenSkill: false,
            hiddenSkillStartedAt: 0,
            hiddenSkillExpiresAt: 0,
            hiddenSkillCooldownUntil: 0,
            bkAttrFuerza: baseAttrFuerza,
            bkAttrAgilidad: baseAttrAgilidad,
            seguroActivado: true,
            seguroClanActivado: false,
            partyId: null,
            partyLeaderId: null,
            partyInvitationFrom: null,
            partyInvitationExpiresAt: 0,
            logoutRequestedAt: 0,
            logoutExpiresAt: 0,
            pvpMapChangeBlockedUntil: 0,
            disconnectOnDeath: false,
            cerrado: false,
            meditar: false,
            inmovilizado: 0,
            paralizado: 0,
            fxId: 0,
            frameFxCounter: 0,
            zonaSegura: 0,
            color: getFactionColor("none") ?? "#3333ff",
            clan: "",
            spell: { lanzados: 0, tiempoTotal: 0, startTimer: 0 },
            hit: { hits: 0, tiempoTotal: 0, startTimer: 0 },
            walk: { pasos: 0, tiempoTotal: 0, startTimer: 0 },
            useObj: { startTimer: 0, usos: 0, tiempoTotal: 0, adv: 0 },
            inv: character.inv,
            pasosGenerales: 0,
            spells: character.spells,
            summons: [],
            summonTargetNpcId: 0,
            idItemWeapon: character.idItemWeapon || 0,
            idItemBody: character.idItemBody || 0,
            idItemShield: character.idItemShield || 0,
            idItemHelmet: character.idItemHelmet || 0,
            idItemArrow: character.idItemArrow || 0,
            idItemRing: character.idItemRing || 0,
        };

        vars.personajes[ws.id] = newCharacter;

        vars.clients[ws.id] = ws;
        ws.bot = isSyntheticBot;
        ws.connectedAt = Date.now();
        ws.packetCount = 0;
        ws.packetCountNonPing = 0;
        ws.recentPacketIntervalsMs = [];
        ws.recentPacketTimestamps = [];
        ws.recentPacketTimestamps60s = [];
        ws.packetTypeCounts = {};
        ws.lastPacketAt = 0;
        ws.lastPacketIntervalMs = 0;
        ws.minPacketIntervalMs = 0;

        const mapLevelDeniedMessage = isAdminSummonedBot ? "" : relocateCharacterToUllaIfMapLevelDenied(newCharacter);

        relocateCharacterIfNeeded(ws);

        vars.mapData[vars.personajes[ws.id].map][vars.personajes[ws.id].pos.y][vars.personajes[ws.id].pos.x].id = ws.id;

        socket.withFlushGroup(ws, () => {
            handleProtocol.sendMyCharacter(newCharacter);
            socket.send(ws);
            sendWelcomeConsoleMessage(ws);

            if (mapLevelDeniedMessage) {
                handleProtocol.console(mapLevelDeniedMessage, "white", 1, 0, ws);
            }

            game.setNewAreas(ws);
        });
        emitLoginWarpSound(ws);

        if (!isSyntheticBot) {
            funct.sendTelegramMessage(
                `[Server-PVP] User ${newCharacter.nameCharacter} connected on map ${vars.personajes[ws.id].map}.`,
            );

            vars.usuariosOnlinePvP++;

            funct.sendTelegramMessage(`[Server-PVP] Users online: ${vars.usuariosOnlinePvP}`);
        }

        if (arenaRoomId) {
            await arenaManager.connectRoom(arenaRoomId, idAccount);
            arenaManager.endHandover(arenaRoomId, idAccount);
        }

        funct.logOnlineRecord();
    };

    this.createId = function () {
        let unica = true;
        let id = 0;

        while (unica) {
            id = new Date().getTime();

            if (!vars.personajes[id] && !vars.npcs[id]) {
                unica = false;
            }
        }

        return id;
    };
}

module.exports = login;
