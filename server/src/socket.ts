import type { EntityId, RuntimeCallback, RuntimeCharacter, RuntimeClient, RuntimeNpc } from "./types/runtime";
import type { GameApi } from "./game";
import { bankOperations } from './bankOperationGuard';
import type { PackageApi, PacketPayload } from "./package";

export {};

const funct = require("./functions");
const vars = require("./vars");
const pkg = require("./package") as PackageApi;
const arenaManager = require("./arenaManager");
const challengeManager = require("./challengeManager");
const mapInstanceManager = require("./mapInstanceManager");

const AREA_RANGE_X = vars.areaVisionRangeX as number;
const AREA_RANGE_Y = vars.areaVisionRangeY as number;
const FALLBACK_MAP_ID = 1;
const FALLBACK_POS_X = 50;
const FALLBACK_POS_Y = 50;
const OUTBOUND_BATCH_PACKET_LIMIT = 32;
const OUTBOUND_BATCH_BYTE_LIMIT = 48 * 1024;

type OutboundPolicy = "immediate" | "batchable" | "flushGroup";

function ensureCharacterHasValidMapPosition(user: RuntimeCharacter | undefined) {
    if (!user) {
        return;
    }

    if (vars.mapData[user.map]?.[user.pos.y]?.[user.pos.x]) {
        return;
    }

    user.map = FALLBACK_MAP_ID;
    user.pos = { x: FALLBACK_POS_X, y: FALLBACK_POS_Y };
    user.posX = FALLBACK_POS_X;
    user.posY = FALLBACK_POS_Y;
    user.challengeMatchId = null;
    user.challengeTeam = null;
    user.challengeLockedUntil = 0;
    user.inmovilizado = 0;
    user.paralizado = 0;
}

function normalizeIp(rawIp?: string): string | undefined {
    if (!rawIp) {
        return undefined;
    }

    const ip = rawIp.trim();

    if (!ip) {
        return undefined;
    }

    if (ip.startsWith("::ffff:")) {
        return ip.slice(7);
    }

    return ip;
}

type AreaTarget = RuntimeCharacter | RuntimeNpc;
type ClientMap = Record<string, RuntimeClient | undefined>;
type OutboundQueueEntry = {
    frame: Buffer;
    bytes: number;
};

function toBuffer(payload: PacketPayload): Buffer {
    if (Array.isArray(payload)) {
        return Buffer.concat(payload.map((chunk) => toBuffer(chunk as PacketPayload)));
    }

    if (Buffer.isBuffer(payload)) {
        return Buffer.from(payload);
    }

    if (payload instanceof ArrayBuffer) {
        return Buffer.from(payload);
    }

    if (ArrayBuffer.isView(payload)) {
        return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
    }

    return Buffer.from(String(payload), "utf8");
}

function ensureOutboundState(ws: RuntimeClient) {
    if (!Array.isArray(ws.outboundQueue)) {
        ws.outboundQueue = [];
    }

    ws.outboundQueueBytes = Math.max(0, Number(ws.outboundQueueBytes ?? 0));
    ws.outboundFlushTimerId = ws.outboundFlushTimerId ?? null;
    ws.outboundFlushGroupDepth = Math.max(0, Number(ws.outboundFlushGroupDepth ?? 0));
    ws.outboundPendingImmediateAfterGroup = Boolean(ws.outboundPendingImmediateAfterGroup);
}

function clearFlushTimer(ws: RuntimeClient) {
    if (ws.outboundFlushTimerId) {
        clearTimeout(ws.outboundFlushTimerId);
        ws.outboundFlushTimerId = null;
    }
}

function resetOutboundState(ws: RuntimeClient) {
    clearFlushTimer(ws);
    ws.outboundQueue = [];
    ws.outboundQueueBytes = 0;
    ws.outboundFlushGroupDepth = 0;
    ws.outboundPendingImmediateAfterGroup = false;
}

function getFramePacketId(frame: Buffer) {
    return frame.byteLength > 0 ? frame.readUInt8(0) : -1;
}

function flushClient(ws: RuntimeClient | undefined) {
    if (!ws) {
        return;
    }

    ensureOutboundState(ws);
    clearFlushTimer(ws);

    const queue = (ws.outboundQueue ?? []) as OutboundQueueEntry[];

    if (queue.length === 0) {
        ws.outboundQueueBytes = 0;
        ws.outboundPendingImmediateAfterGroup = false;
        return;
    }

    const payload = queue.length === 1 ? queue[0].frame : pkg.encodeBatchFrame(queue.map((entry) => entry.frame));

    ws.outboundQueue = [];
    ws.outboundQueueBytes = 0;
    ws.outboundPendingImmediateAfterGroup = false;

    if (ws.readyState !== ws.OPEN) {
        return;
    }

    ws.send(payload);
}

function scheduleFlush(ws: RuntimeClient) {
    if (ws.outboundFlushTimerId || (ws.outboundFlushGroupDepth ?? 0) > 0) {
        return;
    }

    ws.outboundFlushTimerId = setTimeout(() => {
        ws.outboundFlushTimerId = null;

        try {
            flushClient(ws);
        } catch (err) {
            funct.dumpError(err);
        }
    }, 0);
    ws.outboundFlushTimerId.unref?.();
}

function deriveOutboundPolicy(packetId: number): OutboundPolicy {
    if (
        packetId === pkg.clientPacketID.pong ||
        packetId === pkg.clientPacketID.error ||
        packetId === pkg.clientPacketID.closeForce
    ) {
        return "immediate";
    }

    return "batchable";
}

function enqueueFrame(ws: RuntimeClient, frame: Buffer, policy: OutboundPolicy) {
    ensureOutboundState(ws);

    if (frame.byteLength === 0) {
        return;
    }

    if (ws.readyState !== ws.OPEN) {
        resetOutboundState(ws);
        return;
    }

    let queue = (ws.outboundQueue ?? []) as OutboundQueueEntry[];
    const nextQueueBytes = Number(ws.outboundQueueBytes ?? 0) + frame.byteLength;
    if (
        queue.length > 0 &&
        (queue.length >= OUTBOUND_BATCH_PACKET_LIMIT || nextQueueBytes > OUTBOUND_BATCH_BYTE_LIMIT)
    ) {
        flushClient(ws);
        queue = ws.outboundQueue ?? [];
    }

    if (policy === "immediate" && (ws.outboundFlushGroupDepth ?? 0) === 0) {
        flushClient(ws);
        ws.send(frame);
        return;
    }

    queue.push({
        frame,
        bytes: frame.byteLength,
    });
    ws.outboundQueue = queue;
    ws.outboundQueueBytes = Number(ws.outboundQueueBytes ?? 0) + frame.byteLength;

    if (policy === "immediate") {
        ws.outboundPendingImmediateAfterGroup = true;
    }

    if (policy !== "flushGroup") {
        scheduleFlush(ws);
    }
}

function beginFlushGroup(ws: RuntimeClient | undefined) {
    if (!ws) {
        return;
    }

    ensureOutboundState(ws);
    ws.outboundFlushGroupDepth = Number(ws.outboundFlushGroupDepth ?? 0) + 1;
}

function endFlushGroup(ws: RuntimeClient | undefined) {
    if (!ws) {
        return;
    }

    ensureOutboundState(ws);
    ws.outboundFlushGroupDepth = Math.max(0, Number(ws.outboundFlushGroupDepth ?? 0) - 1);

    if ((ws.outboundFlushGroupDepth ?? 0) === 0) {
        flushClient(ws);
    }
}

function withFlushGroup<T>(ws: RuntimeClient | undefined, callback: () => T): T {
    beginFlushGroup(ws);

    try {
        return callback();
    } finally {
        endFlushGroup(ws);
    }
}

export type SocketApi = {
    send: (ws?: RuntimeClient) => void;
    sendAll: (dataSend: PacketPayload, callback?: RuntimeCallback<string>) => void;
    sendAll2: (clients: ClientMap, callback: RuntimeCallback<RuntimeClient>) => void;
    flushClient: (ws?: RuntimeClient) => void;
    enqueueFrame: (ws: RuntimeClient, frame: Buffer, policy: OutboundPolicy) => void;
    beginFlushGroup: (ws?: RuntimeClient) => void;
    endFlushGroup: (ws?: RuntimeClient) => void;
    withFlushGroup: <T>(ws: RuntimeClient | undefined, callback: () => T) => T;
    getIp: (ws: RuntimeClient) => string | undefined;
    state: (ws: RuntimeClient) => number | undefined;
    close: (ws?: RuntimeClient) => Promise<void>;
    closePj: (ws?: RuntimeClient) => Promise<void>;
    closePjById: (idUser: EntityId) => Promise<void>;
    detachClient: (idUser: EntityId) => void;
    loopArea: (idUser: EntityId, callback: RuntimeCallback<AreaTarget>) => void;
    actOnline: (usersOnline: number) => void;
    deleteCharacter: (idUser: EntityId, client: RuntimeClient) => void;
    deleteUserToAllNpcs: (idUser: EntityId) => void;
};

const socket: SocketApi = {
    send(ws) {
        try {
            if (!ws) {
                return;
            }

            if (this.state(ws) === ws.OPEN) {
                const frame = Buffer.from(pkg.dataSend());

                if (frame.byteLength === 0) {
                    return;
                }

                const packetId = getFramePacketId(frame);
                const basePolicy = deriveOutboundPolicy(packetId);
                const effectivePolicy =
                    basePolicy === "immediate"
                        ? "immediate"
                        : (ws.outboundFlushGroupDepth ?? 0) > 0
                          ? "flushGroup"
                          : "batchable";

                this.enqueueFrame(ws, frame, effectivePolicy);
            }
        } catch (err) {
            funct.dumpError(err);
        }
    },

    sendAll(dataSend, callback) {
        try {
            const clients = vars.clients as ClientMap;
            const frame = toBuffer(dataSend);
            const packetId = getFramePacketId(frame);
            const basePolicy = deriveOutboundPolicy(packetId);

            for (const [clientId, client] of Object.entries(clients)) {
                if (client && !client.bot && this.state(client) === client.OPEN) {
                    const effectivePolicy =
                        basePolicy === "immediate"
                            ? "immediate"
                            : (client.outboundFlushGroupDepth ?? 0) > 0
                              ? "flushGroup"
                              : "batchable";

                    this.enqueueFrame(client, frame, effectivePolicy);

                    if (callback) {
                        callback(clientId);
                    }
                }
            }
        } catch (err) {
            funct.dumpError(err);
        }
    },

    sendAll2(clients, callback) {
        try {
            for (const client of Object.values(clients)) {
                if (client && this.state(client) === client.OPEN) {
                    callback(client);
                }
            }
        } catch (err) {
            funct.dumpError(err);
        }
    },

    flushClient(ws) {
        try {
            flushClient(ws);
        } catch (err) {
            funct.dumpError(err);
        }
    },

    enqueueFrame(ws, frame, policy) {
        try {
            enqueueFrame(ws, frame, policy);
        } catch (err) {
            funct.dumpError(err);
        }
    },

    beginFlushGroup(ws) {
        try {
            beginFlushGroup(ws);
        } catch (err) {
            funct.dumpError(err);
        }
    },

    endFlushGroup(ws) {
        try {
            endFlushGroup(ws);
        } catch (err) {
            funct.dumpError(err);
        }
    },

    withFlushGroup(ws, callback) {
        try {
            return withFlushGroup(ws, callback);
        } catch (err) {
            funct.dumpError(err);
            throw err;
        }
    },

    getIp(ws) {
        try {
            return normalizeIp(ws.clientIp ?? ws._socket?.remoteAddress);
        } catch (err) {
            funct.dumpError(err);
        }
    },

    state(ws) {
        try {
            return ws.readyState;
        } catch (err) {
            funct.dumpError(err);
        }
    },

    async close(ws) {
        try {
            if (!ws) {
                return;
            }

            await this.closePj(ws);
            this.flushClient(ws);
            ws.close();
            resetOutboundState(ws);
        } catch (err) {
            funct.dumpError(err);
        }
    },

    async closePj(ws) {
        try {
            if (!ws) {
                return;
            }

            if (typeof ws.id === "undefined") {
                return;
            }

            await this.closePjById(ws.id);
        } catch (err) {
            funct.dumpError(err);
        }
    },

    detachClient(idUser) {
        try {
            const existingClient = vars.clients[idUser] as RuntimeClient | undefined;

            if (existingClient) {
                resetOutboundState(existingClient);
            }

            if (vars.clients[idUser]) {
                delete vars.clients[idUser];
            }
        } catch (err) {
            funct.dumpError(err);
        }
    },

    async closePjById(idUser) {
        try {
            await bankOperations.wait(idUser);
            const ws = vars.clients[idUser] as RuntimeClient | undefined;
            const personajeWS = vars.personajes[idUser] as RuntimeCharacter | undefined;
            const npcApi = require("./npcs") as {
                removeOwnerSummons: (ownerId: EntityId) => void;
            };

            npcApi.removeOwnerSummons(idUser);
            this.deleteUserToAllNpcs(idUser);
            this.detachClient(idUser);

            if (personajeWS && !personajeWS.cerrado) {
                ensureCharacterHasValidMapPosition(personajeWS);
                personajeWS.cerrado = true;
                personajeWS.logoutRequestedAt = 0;
                personajeWS.logoutExpiresAt = 0;
                personajeWS.disconnectOnDeath = false;

                const currentTile = vars.mapData[personajeWS.map]?.[personajeWS.pos.y]?.[personajeWS.pos.x];

                if (currentTile) {
                    currentTile.id = 0;
                }

                this.loopArea(idUser, (target) => {
                    if (!target.isNpc && target.id !== idUser) {
                        this.deleteCharacter(idUser, vars.clients[target.id]);
                    }
                });

                if (!personajeWS.pvpChar) {
                    personajeWS.posX = personajeWS.pos.x;
                    personajeWS.posY = personajeWS.pos.y;
                    personajeWS.connected = false;

                    const game = require("./game") as GameApi;
                    game.closeTradeSession(idUser);
                    game.refreshRelationshipIndexesForMember(idUser, personajeWS.partyId, personajeWS.clanId);
                    game.syncClanStateForMember(idUser);
                    game.leaveParty(idUser);
                    game.clearRelationshipStateCache(idUser);
                    await game.persistCharacterSnapshot(personajeWS, { connected: false });

                    funct.logCharacterActivity({
                        observedAt: new Date().toISOString(),
                        accountId: personajeWS.idAccount ?? null,
                        characterId: personajeWS._id ?? null,
                        characterName: personajeWS.nameCharacter,
                        clientIp: ws ? (socket.getIp(ws) ?? null) : null,
                        category: "session",
                        action: "character_disconnect",
                        goldDelta: 0,
                        details: {
                            map: personajeWS.map,
                            posX: personajeWS.pos.x,
                            posY: personajeWS.pos.y,
                        },
                    });

                    funct.sendTelegramMessage(`[Server] User ${personajeWS.nameCharacter} disconnected.`);

                    vars.usuariosOnline--;

                    funct.sendTelegramMessage(`[Server] Users online: ${vars.usuariosOnline}`);

                    this.actOnline(vars.usuariosOnline);
                    mapInstanceManager.onPlayerDisconnected(personajeWS);
                } else {
                    const game = require("./game") as GameApi;
                    game.leaveParty(idUser);
                    if (!personajeWS.botLoad) {
                        vars.usuariosOnlinePvP--;

                        funct.sendTelegramMessage(`[Server-PVP] User ${personajeWS.nameCharacter} disconnected.`);

                        funct.sendTelegramMessage(`[Server-PVP] Users online: ${vars.usuariosOnlinePvP}`);
                    }

                    await arenaManager.onPlayerDisconnected(personajeWS);
                }

                challengeManager.onPlayerDisconnected(personajeWS);
            }
        } catch (err) {
            funct.dumpError(err);
        }
    },

    loopArea(idUser, callback) {
        try {
            const user = vars.personajes[idUser] as RuntimeCharacter | undefined;

            if (!user) {
                return;
            }

            const posXStart = user.pos.x - AREA_RANGE_X;
            const posYStart = user.pos.y - AREA_RANGE_Y;
            const posXEnd = user.pos.x + AREA_RANGE_X;
            const posYEnd = user.pos.y + AREA_RANGE_Y;

            for (let y = posYStart; y <= posYEnd; y++) {
                for (let x = posXStart; x <= posXEnd; x++) {
                    if (x >= 1 && y >= 1 && x <= 100 && y <= 100) {
                        const mapData = vars.mapData[user.map]?.[y]?.[x];

                        if (!mapData) {
                            continue;
                        }

                        if (mapData.id) {
                            const target = (vars.npcs[mapData.id] ?? vars.personajes[mapData.id]) as
                                | AreaTarget
                                | undefined;

                            if (target) {
                                callback(target);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            funct.dumpError(err);
        }
    },

    actOnline(usersOnline) {
        try {
            pkg.setPackageID(pkg.clientPacketID.actOnline);
            pkg.writeShort(usersOnline);
            this.sendAll(pkg.dataSend());
        } catch (err) {
            funct.dumpError(err);
        }
    },

    deleteCharacter(idUser, client) {
        try {
            pkg.setPackageID(pkg.clientPacketID.deleteCharacter);
            pkg.writeDouble(idUser);
            this.send(client);
        } catch (err) {
            funct.dumpError(err);
        }
    },

    deleteUserToAllNpcs(idUser) {
        try {
            this.loopArea(idUser, (target) => {
                if (target.isNpc && target.movement === 3) {
                    const areaNpc = vars.areaNpc[target.id] as EntityId[] | undefined;
                    const index = areaNpc?.indexOf(idUser) ?? -1;

                    if (areaNpc && index > -1) {
                        areaNpc.splice(index, 1);
                    }
                }
            });
        } catch (err) {
            funct.dumpError(err);
        }
    },
};

module.exports = socket;
