import fs from "fs";
import path from "path";

export type NpcRespawnEntry = {
    mapNum: number;
    x: number;
    y: number;
    npcIndex: number;
};

type PersistedNpcRespawnCooldown = NpcRespawnEntry & {
    respawnAt: number;
};

const NPC_RESPAWN_COOLDOWNS_PATH = process.env.AOWEB_NPC_RESPAWN_FILE || path.resolve(__dirname, "../jsons/npcRespawnCooldowns.json");
const persistedCooldowns = new Map<string, PersistedNpcRespawnCooldown>();
const scheduledRespawns = new Map<string, NodeJS.Timeout>();

export function buildNpcRespawnKey(entry: NpcRespawnEntry): string {
    return `${entry.mapNum}:${entry.x}:${entry.y}:${entry.npcIndex}`;
}

function persistNpcRespawnCooldowns(): void {
    const rows = [...persistedCooldowns.values()].sort((left, right) => left.respawnAt - right.respawnAt);
    fs.mkdirSync(path.dirname(NPC_RESPAWN_COOLDOWNS_PATH), { recursive: true });
    fs.writeFileSync(NPC_RESPAWN_COOLDOWNS_PATH, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
}

function clearScheduledRespawn(key: string): void {
    const timer = scheduledRespawns.get(key);

    if (!timer) {
        return;
    }

    clearTimeout(timer);
    scheduledRespawns.delete(key);
}

function scheduleNpcRespawn(cooldown: PersistedNpcRespawnCooldown, callback: (entry: NpcRespawnEntry) => void): void {
    const key = buildNpcRespawnKey(cooldown);
    const delayMs = Math.max(0, cooldown.respawnAt - Date.now());

    console.log(delayMs);

    clearScheduledRespawn(key);

    scheduledRespawns.set(
        key,
        setTimeout(() => {
            const activeCooldown = persistedCooldowns.get(key);

            if (!activeCooldown || activeCooldown.respawnAt !== cooldown.respawnAt) {
                return;
            }

            persistedCooldowns.delete(key);
            scheduledRespawns.delete(key);
            persistNpcRespawnCooldowns();
            callback({
                mapNum: cooldown.mapNum,
                x: cooldown.x,
                y: cooldown.y,
                npcIndex: cooldown.npcIndex,
            });
        }, delayMs),
    );
}

function loadPersistedNpcRespawnCooldowns(): void {
    persistedCooldowns.clear();

    if (!fs.existsSync(NPC_RESPAWN_COOLDOWNS_PATH)) {
        persistNpcRespawnCooldowns();
        return;
    }

    try {
        const raw = fs.readFileSync(NPC_RESPAWN_COOLDOWNS_PATH, "utf8");
        const parsed = JSON.parse(raw) as PersistedNpcRespawnCooldown[];

        for (const entry of Array.isArray(parsed) ? parsed : []) {
            const normalized = {
                mapNum: Number(entry.mapNum ?? 0),
                x: Number(entry.x ?? 0),
                y: Number(entry.y ?? 0),
                npcIndex: Number(entry.npcIndex ?? 0),
                respawnAt: Number(entry.respawnAt ?? 0),
            };

            if (
                normalized.mapNum <= 0 ||
                normalized.x <= 0 ||
                normalized.y <= 0 ||
                normalized.npcIndex <= 0 ||
                normalized.respawnAt <= 0
            ) {
                continue;
            }

            persistedCooldowns.set(buildNpcRespawnKey(normalized), normalized);
        }
    } catch (error) {
        console.warn(
            `[NPC RESPAWN] Could not read npcRespawnCooldowns.json: ${error instanceof Error ? error.message : "error desconocido"}.`,
        );
        persistedCooldowns.clear();
    }
}

export function initializeNpcRespawnCooldowns(callback: (entry: NpcRespawnEntry) => void): Set<string> {
    loadPersistedNpcRespawnCooldowns();
    const loadedKeys = new Set<string>(persistedCooldowns.keys());
    const now = Date.now();
    let removedExpired = false;

    for (const [key, cooldown] of persistedCooldowns.entries()) {
        if (cooldown.respawnAt > now) {
            scheduleNpcRespawn(cooldown, callback);
            continue;
        }

        callback({
            mapNum: cooldown.mapNum,
            x: cooldown.x,
            y: cooldown.y,
            npcIndex: cooldown.npcIndex,
        });
        persistedCooldowns.delete(key);
        removedExpired = true;
    }

    if (removedExpired) {
        persistNpcRespawnCooldowns();
    }

    return loadedKeys;
}

export function getNpcRespawnCooldown(entry: NpcRespawnEntry): PersistedNpcRespawnCooldown | null {
    return persistedCooldowns.get(buildNpcRespawnKey(entry)) ?? null;
}

export function setNpcRespawnCooldown(
    entry: NpcRespawnEntry,
    cooldownMs: number,
    callback: (respawnEntry: NpcRespawnEntry) => void,
): PersistedNpcRespawnCooldown {
    const normalizedCooldown = {
        mapNum: Number(entry.mapNum),
        x: Number(entry.x),
        y: Number(entry.y),
        npcIndex: Number(entry.npcIndex),
        respawnAt: Date.now() + Math.max(0, cooldownMs),
    };

    persistedCooldowns.set(buildNpcRespawnKey(normalizedCooldown), normalizedCooldown);
    persistNpcRespawnCooldowns();
    scheduleNpcRespawn(normalizedCooldown, callback);
    return normalizedCooldown;
}

export function clearNpcRespawnCooldown(entry: NpcRespawnEntry): void {
    const key = buildNpcRespawnKey(entry);

    if (!persistedCooldowns.has(key)) {
        return;
    }

    clearScheduledRespawn(key);
    persistedCooldowns.delete(key);
    persistNpcRespawnCooldowns();
}
