export {};
import { getCharacterById, getClientById } from "./runtimeRegistry";
import { calculateBaseFactionScore, type CharacterFaction } from "./factions";
const game = require("./game");
const vars = require("./vars");
const npcs = require("./npcs");
const handleProtocol = require("./handleProtocol");
const balance = require("./balance");
const challengeManager = require("./challengeManager");
const funct = require("./functions");

const FACTION_REKILL_WINDOW_MS = 5 * 60 * 1000;
const recentFactionKills = new Map<string, number>();
let nextFactionRekillCleanupAt = 0;

function normalizeFaction(value: unknown): CharacterFaction {
    return value === "armada" || value === "caos" ? value : "none";
}

function getFactionKillKey(attackerId: unknown, victimId: unknown): string {
    return `${String(attackerId)}:${String(victimId)}`;
}

function clearExpiredFactionRekills(now: number): void {
    if (now < nextFactionRekillCleanupAt) {
        return;
    }

    nextFactionRekillCleanupAt = now + FACTION_REKILL_WINDOW_MS;

    for (const [key, lastKilledAt] of recentFactionKills.entries()) {
        if (now - lastKilledAt >= FACTION_REKILL_WINDOW_MS) {
            recentFactionKills.delete(key);
        }
    }
}

function shouldBlockFactionScoreByRekill(attackerId: unknown, victimId: unknown, now: number): boolean {
    clearExpiredFactionRekills(now);

    const key = getFactionKillKey(attackerId, victimId);
    const lastKilledAt = recentFactionKills.get(key) ?? 0;

    if (lastKilledAt > 0 && now - lastKilledAt < FACTION_REKILL_WINDOW_MS) {
        return true;
    }

    recentFactionKills.set(key, now);
    return false;
}

function shouldAwardArmadaScore(attacker: any, victim: any): boolean {
    const attackerFaction = normalizeFaction(attacker.faction);
    const victimFaction = normalizeFaction(victim.faction);
    const attackerIsCitizen = !attacker.criminal && attackerFaction === "none";
    const attackerIsArmada = attackerFaction === "armada";
    const victimIsEnemy = Boolean(victim.criminal) || victimFaction === "caos";
    return (attackerIsCitizen || attackerIsArmada) && victimIsEnemy;
}

function shouldAwardCaosScore(attacker: any, victim: any): boolean {
    const attackerFaction = normalizeFaction(attacker.faction);
    const attackerIsCriminal = Boolean(attacker.criminal) && attackerFaction === "none";
    const attackerIsCaos = attackerFaction === "caos";
    void victim;
    return attackerIsCriminal || attackerIsCaos;
}

function canCountFactionKill(attackerLevel: number, victimLevel: number, victimIsNewbie: boolean): boolean {
    if (victimIsNewbie) {
        return false;
    }

    return attackerLevel - victimLevel <= 10 || victimLevel >= 25;
}

const respawn = new (Respawn as any)();

function Respawn(this: any) {
    this.muere = function (this: any, ws: any, idPersonaje: any) {
        const nameWs = game.getName(ws.id);
        const recibeName = game.getName(idPersonaje);

        let pjSelected = getCharacterById(idPersonaje) as any;

        const user = getCharacterById(ws.id) as any;
        const clientPersonaje = getClientById(idPersonaje);

        if (!user) {
            return;
        }

        if (!pjSelected) {
            pjSelected = vars.npcs[idPersonaje];
        }

        if (!pjSelected) {
            return;
        }

        //Compruebo si el personaje muere
        if (pjSelected.hp <= 0) {
            try {
                if (pjSelected.isNpc && pjSelected.deathProcessed) {
                    return;
                }

                if (pjSelected.isNpc) {
                    pjSelected.deathProcessed = true;
                }

                const challengeCombatDeath = Boolean(challengeManager.getBusyMatchByCharacter(pjSelected));

                if (!pjSelected.isNpc) {
                    game.putBodyAndHeadDead(idPersonaje);
                    npcs.deleteUserToAllNpcs(idPersonaje);
                    npcs.removeOwnerSummons(idPersonaje);
                    pjSelected.hp = 0;
                    if (
                        !challengeCombatDeath &&
                        vars.mapa[pjSelected.map][pjSelected.pos.y][pjSelected.pos.x].trigger != 6
                    ) {
                        void game.tirarItemsUser(idPersonaje);
                    }
                }

                let expGanada = 0;
                let goldGanado = 0;

                if (pjSelected.isNpc) {
                    goldGanado = pjSelected.gold * vars.multiplicadorGold;
                } else {
                    if (
                        !challengeCombatDeath &&
                        vars.mapa[pjSelected.map][pjSelected.pos.y][pjSelected.pos.x].trigger != 6
                    ) {
                        const now = Date.now();
                        const attackerLevel = Number(user.level ?? 0);
                        const victimLevel = Number(pjSelected.level ?? 0);
                        const victimIsNewbie = game.isNewbieCharacter(pjSelected);
                        const isRekillBlocked = shouldBlockFactionScoreByRekill(user.id, pjSelected.id, now);

                        if (!victimIsNewbie && !isRekillBlocked) {
                            if (pjSelected.criminal) {
                                user.criminalesMatados++;
                            } else {
                                user.ciudadanosMatados++;
                            }
                        }

                        expGanada = vars.exp * vars.multiplicadorExp;
                        goldGanado = vars.gold * vars.multiplicadorGold;

                        if (vars.dobleExp) {
                            expGanada *= 2;
                        }

                        if (vars.dobleGold) {
                            goldGanado *= 2;
                        }

                        if (canCountFactionKill(attackerLevel, victimLevel, victimIsNewbie) && !isRekillBlocked) {
                            const factionScore = calculateBaseFactionScore(attackerLevel, victimLevel);

                            if (factionScore > 0) {
                                let awardedFactionScore = false;

                                if (shouldAwardArmadaScore(user, pjSelected)) {
                                    game.addFactionScore(ws.id, "armada", factionScore);
                                    awardedFactionScore = true;
                                }

                                if (shouldAwardCaosScore(user, pjSelected)) {
                                    game.addFactionScore(ws.id, "caos", factionScore);
                                    awardedFactionScore = true;
                                }

                                if (awardedFactionScore) {
                                    handleProtocol.console(
                                        "¡Has ganado " + factionScore + " puntos de faccion!",
                                        "red",
                                        1,
                                        0,
                                        ws,
                                    );
                                }
                            }
                        }
                    }
                }

                if (expGanada > 0) {
                    user.exp += expGanada;
                    handleProtocol.console("¡Has ganado " + expGanada + " puntos de experiencia!", "red", 1, 0, ws);
                }

                if (goldGanado > 0 && !pjSelected.isNpc) {
                    user.gold = balance.clampGold(user.gold + goldGanado);

                    handleProtocol.console("¡Has ganado " + goldGanado + " monedas de oro!", "red", 1, 0, ws);

                    handleProtocol.actGold(user.gold, ws);
                }

                if (pjSelected.isNpc) {
                    game.logCharacterActivity(user, {
                        category: "combat",
                        action: "npc_kill",
                        details: {
                            map: pjSelected.map,
                            posX: pjSelected.pos.x,
                            posY: pjSelected.pos.y,
                            npcId: Number(idPersonaje),
                            npcName: pjSelected.nameCharacter,
                        },
                    });

                    game.distribuirExpRestanteNpc(ws.id, idPersonaje);

                    if (goldGanado > 0) {
                        game.distribuirOroNpc(ws.id, idPersonaje, goldGanado);
                    }

                    game.clearSummonTargetNpc(ws.id);
                    handleProtocol.console(
                        "¡Has matado a " + vars.npcs[idPersonaje].nameCharacter + "!",
                        "red",
                        1,
                        0,
                        ws, undefined, undefined, vars.npcs[idPersonaje].nameCharacter,
                    );
                    user.npcMatados++;
                    npcs.tirarItems(idPersonaje, ws);
                    npcs.muereNpc(idPersonaje);
                    return;
                }

                game.checkUserLevel(ws.id);

                if (pjSelected.inmovilizado || pjSelected.paralizado) {
                    if (clientPersonaje) {
                        handleProtocol.inmo(idPersonaje, 0, clientPersonaje);
                    }
                }

                pjSelected.inmovilizado = 0;
                pjSelected.paralizado = 0;
                pjSelected.cooldownParalizado = 0;

                game.resetFuerzaAgilidadBuffs(idPersonaje);

                game.logCharacterActivity(pjSelected, {
                    category: "combat",
                    action: "character_death",
                    details: {
                        map: pjSelected.map,
                        posX: pjSelected.pos.x,
                        posY: pjSelected.pos.y,
                        killerType: "user",
                        killerId: user._id ?? String(user.id),
                        killerName: user.nameCharacter,
                    },
                });

                if (clientPersonaje) {
                    handleProtocol.console(nameWs + " te ha matado!", "red", 1, 0, clientPersonaje);
                    handleProtocol.console(
                        "En 15 segundos entraras al mundo de los muertos.",
                        "gray",
                        1,
                        0,
                        clientPersonaje,
                    );
                }

                handleProtocol.console("¡Has matado a " + recibeName + "!", "red", 1, 0, ws);

                challengeManager.onCharacterDeath(pjSelected);

                if (pjSelected.disconnectOnDeath && !getClientById(idPersonaje)) {
                    game.closeForce(idPersonaje);
                }
            } catch (err) {
                if (pjSelected.isNpc) {
                    pjSelected.deathProcessed = false;
                }

                funct.dumpError(err);
            }
        }

        if (!pjSelected.isNpc) {
            if (user.meditar) {
                user.meditar = false;

                handleProtocol.console("Terminas de meditar.", "gray", 0, 0, ws);

                game.loopArea(ws, function (this: any, client: any) {
                    if (!client.isNpc) {
                        const targetClient = getClientById(client.id);

                        if (targetClient) {
                            handleProtocol.animFX(ws.id, 0, targetClient);
                        }
                    }
                });
            }

            if (clientPersonaje) {
                handleProtocol.updateHP(pjSelected.hp, clientPersonaje);
            }
        }
    };
}

module.exports = respawn;
