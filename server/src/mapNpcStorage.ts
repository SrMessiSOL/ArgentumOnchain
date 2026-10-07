import fs from "node:fs";
import path from "node:path";

export type MapNpcPlacement = {
    mapNum: number;
    x: number;
    y: number;
    npcIndex: number;
    movement?: number;
};

const MAPS_SOURCE_DIR = path.resolve(__dirname, "../mapas_source");
const MAP_DIR_PATTERN = /^mapa_(\d+)$/i;

function getMapDir(mapNum: number): string {
    return path.join(MAPS_SOURCE_DIR, `mapa_${mapNum}`);
}

function getMapNpcsPath(mapNum: number): string {
    return process.env.AOWEB_MAP_NPC_STATE_DIR
        ? path.join(process.env.AOWEB_MAP_NPC_STATE_DIR, `mapa_${mapNum}`, "npcs.json")
        : path.join(getMapDir(mapNum), "npcs.json");
}

function toFiniteNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function normalizePlacement(value: unknown, fallbackMapNum?: number): MapNpcPlacement | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const candidate = value as Record<string, unknown>;
    const mapNum = toFiniteNumber(candidate.mapNum) ?? fallbackMapNum ?? null;
    const x = toFiniteNumber(candidate.x);
    const y = toFiniteNumber(candidate.y);
    const npcIndex = toFiniteNumber(candidate.npcIndex);
    const movement = toFiniteNumber(candidate.movement);

    if (
        mapNum === null ||
        !Number.isInteger(mapNum) ||
        mapNum <= 0 ||
        x === null ||
        !Number.isInteger(x) ||
        x <= 0 ||
        y === null ||
        !Number.isInteger(y) ||
        y <= 0 ||
        npcIndex === null ||
        !Number.isInteger(npcIndex) ||
        npcIndex <= 0
    ) {
        return null;
    }

    return movement !== null && Number.isInteger(movement)
        ? { mapNum, x, y, npcIndex, movement }
        : { mapNum, x, y, npcIndex };
}

function sortPlacements(placements: MapNpcPlacement[]): MapNpcPlacement[] {
    return [...placements].sort(
        (left, right) =>
            left.mapNum - right.mapNum || left.y - right.y || left.x - right.x || left.npcIndex - right.npcIndex,
    );
}

function readMapNpcFile(mapNum: number): MapNpcPlacement[] {
    const statePath = getMapNpcsPath(mapNum);
    const filePath = fs.existsSync(statePath) ? statePath : path.join(getMapDir(mapNum), "npcs.json");

    if (!fs.existsSync(filePath)) {
        return [];
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) {
        return [];
    }

    return parsed
        .map((entry) => normalizePlacement(entry, mapNum))
        .filter((entry): entry is MapNpcPlacement => Boolean(entry));
}

export function listAvailableMapIds(sourceDir = MAPS_SOURCE_DIR): number[] {
    if (!fs.existsSync(sourceDir)) {
        return [];
    }

    return fs
        .readdirSync(sourceDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name.match(MAP_DIR_PATTERN))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map((match) => Number.parseInt(match[1], 10))
        .filter((mapId) => Number.isInteger(mapId) && mapId > 0)
        .sort((left, right) => left - right);
}

export function loadAllMapNpcPlacements(): MapNpcPlacement[] {
    return sortPlacements(listAvailableMapIds().flatMap((mapId) => readMapNpcFile(mapId)));
}

export function loadMapNpcPlacements(mapNum: number): MapNpcPlacement[] {
    return sortPlacements(readMapNpcFile(mapNum));
}

export function writeMapNpcPlacements(mapNum: number, placements: MapNpcPlacement[]): void {
    const filePath = getMapNpcsPath(mapNum);
    const normalized = sortPlacements(
        placements
            .map((entry) => normalizePlacement(entry, mapNum))
            .filter((entry): entry is MapNpcPlacement => Boolean(entry)),
    );

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    if (normalized.length === 0 && !process.env.AOWEB_MAP_NPC_STATE_DIR) {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        return;
    }

    fs.writeFileSync(filePath, `${JSON.stringify(normalized)}\n`, "utf8");
}

export function appendMapNpcPlacement(placement: MapNpcPlacement): void {
    writeMapNpcPlacements(placement.mapNum, [...loadMapNpcPlacements(placement.mapNum), placement]);
}

export function replaceAllMapNpcPlacements(placements: MapNpcPlacement[]): void {
    const grouped = new Map<number, MapNpcPlacement[]>();

    for (const placement of placements) {
        const normalized = normalizePlacement(placement);
        if (!normalized) {
            continue;
        }

        const current = grouped.get(normalized.mapNum) ?? [];
        current.push(normalized);
        grouped.set(normalized.mapNum, current);
    }

    const knownMapIds = new Set([...listAvailableMapIds(), ...grouped.keys()]);

    for (const mapId of knownMapIds) {
        writeMapNpcPlacements(mapId, grouped.get(mapId) ?? []);
    }
}
