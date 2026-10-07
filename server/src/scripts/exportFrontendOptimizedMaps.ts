import fs from "node:fs";
import path from "node:path";
import { loadMapNpcPlacements } from "../mapNpcStorage";

type TerrainTile = {
    blocked?: boolean;
    graphics?: number | Array<number | null>;
};

type TerrainMap = {
    id?: number;
    width?: number;
    height?: number;
    palette?: Record<string, TerrainTile>;
    rows?: number[][];
};

type SpecialsMap = {
    id?: number;
    exits?: Record<string, { map?: number; x?: number; y?: number }>;
    objects?: Record<string, { objIndex?: number; amount?: number }>;
    npcs?: Record<string, number>;
    triggers?: Record<string, number>;
};

type NpcPlacement = {
    mapNum?: number;
    x?: number;
    y?: number;
    npcIndex?: number;
};

type CompactTile = {
    b?: 1;
    g?: number | Array<number | null>;
    e?: { m: number; x: number; y: number };
    n?: number;
    t?: number;
    o?: { i: number; a: number };
};

type OptimizedMap = {
    id: number;
    w: number;
    h: number;
    d: number[];
    cx?: CompactTile[];
};

const DEFAULT_SOURCE_DIR = path.resolve(__dirname, "../../mapas_source");
const DEFAULT_OUTPUT_DIR = path.resolve(__dirname, "../../../frontend/public/maps_optimized");
const MAP_DIR_PATTERN = /^mapa_(\d+)$/i;

function parseCliArgs(argv: string[]) {
    const mapIds = new Set<number>();
    let sourceDir = DEFAULT_SOURCE_DIR;
    let outputDir = DEFAULT_OUTPUT_DIR;
    for (const arg of argv) {
        if (arg.startsWith("--source-dir=")) {
            sourceDir = path.resolve(process.cwd(), arg.slice("--source-dir=".length));
            continue;
        }

        if (arg.startsWith("--output-dir=")) {
            outputDir = path.resolve(process.cwd(), arg.slice("--output-dir=".length));
            continue;
        }

        if (arg.startsWith("--maps=")) {
            for (const rawId of arg.slice("--maps=".length).split(",")) {
                const mapId = Number.parseInt(rawId.trim(), 10);
                if (Number.isInteger(mapId) && mapId > 0) {
                    mapIds.add(mapId);
                }
            }
            continue;
        }

        const mapId = Number.parseInt(arg, 10);
        if (Number.isInteger(mapId) && mapId > 0) {
            mapIds.add(mapId);
        }
    }

    return {
        sourceDir,
        outputDir,
        mapIds: [...mapIds].sort((left, right) => left - right),
    };
}

function readJsonFile<T>(filePath: string): T {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function toFiniteNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }

    return undefined;
}

function getAvailableMapIds(sourceDir: string): number[] {
    return fs
        .readdirSync(sourceDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name.match(MAP_DIR_PATTERN))
        .filter((match): match is RegExpMatchArray => Boolean(match))
        .map((match) => Number.parseInt(match[1], 10))
        .filter((mapId) => Number.isInteger(mapId) && mapId > 0)
        .sort((left, right) => left - right);
}

function parseCoordinateKey(key: string): { x: number; y: number } | null {
    const [rawX, rawY] = key.split(",");
    const x = Number.parseInt(rawX ?? "", 10);
    const y = Number.parseInt(rawY ?? "", 10);

    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 1 || y < 1) {
        return null;
    }

    return { x, y };
}

function sortCompactTile(tile: CompactTile): CompactTile {
    const result: CompactTile = {};

    if (tile.b) {
        result.b = 1;
    }

    if (tile.g !== undefined) {
        result.g = tile.g;
    }

    if (tile.e) {
        result.e = tile.e;
    }

    if (tile.n !== undefined) {
        result.n = tile.n;
    }

    if (tile.t !== undefined) {
        result.t = tile.t;
    }

    if (tile.o) {
        result.o = tile.o;
    }

    return result;
}

function buildCompactMap(mapId: number, terrain: TerrainMap, specials: SpecialsMap): OptimizedMap {
    const width = Math.max(1, toFiniteNumber(terrain.width) ?? 100);
    const height = Math.max(1, toFiniteNumber(terrain.height) ?? 100);
    const palette = terrain.palette ?? {};
    const rows = Array.isArray(terrain.rows) ? terrain.rows : [];
    const exitByCoordinate = new Map<string, { map: number; x: number; y: number }>();
    const objectByCoordinate = new Map<string, { objIndex: number; amount: number }>();
    const triggerByCoordinate = new Map<string, number>();
    const complexIndexBySignature = new Map<string, number>();
    const complexTiles: CompactTile[] = [];
    const data: number[] = [];

    for (const [coordinateKey, exit] of Object.entries(specials.exits ?? {})) {
        const coordinates = parseCoordinateKey(coordinateKey);
        if (!coordinates) {
            continue;
        }

        const map = toFiniteNumber(exit.map);
        const x = toFiniteNumber(exit.x);
        const y = toFiniteNumber(exit.y);
        if (map === undefined || x === undefined || y === undefined) {
            continue;
        }

        exitByCoordinate.set(`${coordinates.x},${coordinates.y}`, { map, x, y });
    }

    for (const [coordinateKey, objectInfo] of Object.entries(specials.objects ?? {})) {
        const coordinates = parseCoordinateKey(coordinateKey);
        if (!coordinates) {
            continue;
        }

        const objIndex = toFiniteNumber(objectInfo.objIndex);
        const amount = toFiniteNumber(objectInfo.amount);
        if (objIndex === undefined || amount === undefined) {
            continue;
        }

        objectByCoordinate.set(`${coordinates.x},${coordinates.y}`, { objIndex, amount });
    }

    for (const [coordinateKey, trigger] of Object.entries(specials.triggers ?? {})) {
        const coordinates = parseCoordinateKey(coordinateKey);
        if (!coordinates) {
            continue;
        }

        const normalizedTrigger = toFiniteNumber(trigger);
        if (normalizedTrigger === undefined) {
            continue;
        }

        triggerByCoordinate.set(`${coordinates.x},${coordinates.y}`, normalizedTrigger);
    }

    for (let y = 1; y <= height; y++) {
        for (let x = 1; x <= width; x++) {
            const paletteId = rows[y - 1]?.[x - 1] ?? 0;
            const terrainTile = paletteId > 0 ? palette[String(paletteId)] : undefined;
            const coordinateKey = `${x},${y}`;
            const compactTile: CompactTile = {};

            if (terrainTile?.blocked) {
                compactTile.b = 1;
            }

            if (terrainTile?.graphics !== undefined) {
                compactTile.g = terrainTile.graphics;
            }

            const exit = exitByCoordinate.get(coordinateKey);
            if (exit) {
                compactTile.e = {
                    m: exit.map,
                    x: exit.x,
                    y: exit.y,
                };
            }

            const objectInfo = objectByCoordinate.get(coordinateKey);
            if (objectInfo) {
                compactTile.o = {
                    i: objectInfo.objIndex,
                    a: objectInfo.amount,
                };
            }

            const trigger = triggerByCoordinate.get(coordinateKey);
            if (trigger !== undefined) {
                compactTile.t = trigger;
            }

            const npcIndex = toFiniteNumber((specials.npcs ?? {})[coordinateKey]);
            if (npcIndex !== undefined) {
                compactTile.n = npcIndex;
            }

            const normalizedTile = sortCompactTile(compactTile);
            const tileKeys = Object.keys(normalizedTile);
            if (tileKeys.length === 0) {
                data.push(0);
                continue;
            }

            if (tileKeys.length === 1 && normalizedTile.g !== undefined) {
                if (typeof normalizedTile.g === "number") {
                    data.push(normalizedTile.g);
                    continue;
                }
            }

            if (tileKeys.length === 2 && normalizedTile.b === 1 && typeof normalizedTile.g === "number") {
                data.push(100000 + normalizedTile.g);
                continue;
            }

            const signature = JSON.stringify(normalizedTile);
            let complexIndex = complexIndexBySignature.get(signature);

            if (complexIndex === undefined) {
                complexIndex = complexTiles.length;
                complexIndexBySignature.set(signature, complexIndex);
                complexTiles.push(normalizedTile);
            }

            data.push(-(complexIndex + 1));
        }
    }

    return complexTiles.length > 0
        ? { id: mapId, w: width, h: height, d: data, cx: complexTiles }
        : { id: mapId, w: width, h: height, d: data };
}

function mergeNpcPlacements(specials: SpecialsMap, npcPlacements: NpcPlacement[]): SpecialsMap {
    const mergedNpcs = { ...(specials.npcs ?? {}) };

    for (const placement of npcPlacements) {
        const x = toFiniteNumber(placement.x);
        const y = toFiniteNumber(placement.y);
        const npcIndex = toFiniteNumber(placement.npcIndex);
        if (x === undefined || y === undefined || npcIndex === undefined) {
            continue;
        }

        mergedNpcs[`${x},${y}`] = npcIndex;
    }

    return {
        ...specials,
        npcs: mergedNpcs,
    };
}

function writeJsonFile(filePath: string, value: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
}

function exportMap(mapId: number, sourceDir: string, outputDir: string): void {
    const mapDir = path.join(sourceDir, `mapa_${mapId}`);
    const terrainPath = path.join(mapDir, "terrain.json");
    const specialsPath = path.join(mapDir, "specials.json");

    if (!fs.existsSync(terrainPath)) {
        throw new Error(`Map ${mapId}: ${terrainPath} does not exist`);
    }

    const terrain = readJsonFile<TerrainMap>(terrainPath);
    const specials = fs.existsSync(specialsPath)
        ? readJsonFile<SpecialsMap>(specialsPath)
        : ({ id: mapId, exits: {}, objects: {}, npcs: {}, triggers: {} } as SpecialsMap);
    const optimizedMap = buildCompactMap(mapId, terrain, mergeNpcPlacements(specials, loadMapNpcPlacements(mapId)));
    const fileName = `mapa_${mapId}.json`;

    writeJsonFile(path.join(outputDir, fileName), optimizedMap);

    console.log(
        `Exported optimized map ${mapId} -> ${path.relative(process.cwd(), path.join(outputDir, fileName))} ` +
            `(cells=${optimizedMap.d.length}, complex=${optimizedMap.cx?.length ?? 0})`,
    );
}

function main(): void {
    const { sourceDir, outputDir, mapIds } = parseCliArgs(process.argv.slice(2));
    const resolvedMapIds = mapIds.length > 0 ? mapIds : getAvailableMapIds(sourceDir);

    if (resolvedMapIds.length === 0) {
        throw new Error("No maps found to export.");
    }

    for (const mapId of resolvedMapIds) {
        exportMap(mapId, sourceDir, outputDir);
    }

    console.log(`Done. Optimized maps exported: ${resolvedMapIds.length}`);
}

main();
