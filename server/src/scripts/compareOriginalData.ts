import fs from "fs";
import path from "path";

import { loadDefaultNpcsData } from "../npcData";
import { loadDefaultObjectsData } from "../objectData";

export {};

type RecordMap = Record<string, Record<string, unknown>>;

type DiffRow = {
    dataset: "objs" | "npcs";
    id: string;
    matchedOriginalId: string;
    nameCurrent: string;
    nameOriginal: string;
    matchType: string;
    matchScore: string;
    status: string;
    property: string;
    currentValue: string;
    originalValue: string;
};

type MatchedEntry = {
    currentId: string;
    originalId: string | null;
    currentEntry?: Record<string, unknown>;
    originalEntry?: Record<string, unknown>;
    matchType: "id" | "name" | "missing_in_current" | "missing_in_original";
    matchScore: number;
};

const BLACKLISTED_PROPERTIES: Record<"objs" | "npcs", Set<string>> = {
    objs: new Set([
        "grhIndex",
        "anim",
        "clasesNoPermitidas",
        "name",
        "cerrada",
        "objType",
        "agarrable",
        "llave",
        "spellIndex",
        "tipoPocion",
        "indexAbierta",
        "indexCerrada",
        "newbie",
        "noSeCae",
        "proyectil",
        "razaEnana",
        "apu",
        "valor",
    ]),
    npcs: new Set([]),
};

const OBJECT_DEFAULTS: Record<string, unknown> = {
    name: "",
    objType: 0,
    tipoPocion: 0,
    minModificador: 0,
    maxModificador: 0,
    grhIndex: 0,
    anim: 0,
    agarrable: 0,
    valor: 0,
    minHit: 0,
    maxHit: 0,
    minDef: 0,
    maxDef: 0,
    newbie: 0,
    proyectil: 0,
    noSeCae: 0,
    clasesNoPermitidas: [],
    indexAbierta: 0,
    indexCerrada: 0,
    llave: 0,
    cerrada: 0,
    spellIndex: 0,
    razaEnana: 0,
    apu: 0,
    porcentaje: 0,
    resistenciaMagica: 0,
    staffDamageBonus: 0,
    magicDamageBonus: 0,
    magicPenetration: 0,
    magicAbsoluteBonus: 0,
    improvedMeleeHitChance: 0,
    improvedRangedHitChance: 0,
    extraCritAndStabChance: 0,
    minDefMag: 0,
    maxDefMag: 0,
};

const NPC_DEFAULTS: Record<string, unknown> = {
    name: "",
    idHead: 0,
    idBody: 0,
    movement: 0,
    npcType: 0,
    exp: 0,
    gold: 0,
    hp: 0,
    maxHp: 0,
    minHit: 0,
    maxHit: 0,
    def: 0,
    poderAtaque: 0,
    poderEvasion: 0,
    magicResistance: 0,
    magicDef: 0,
    defM: 0,
    snd1: 0,
    snd2: 0,
    soundClose: 0,
    aguaValida: 0,
    tierraInvalida: 0,
    desc: "",
    drop: [],
    objs: [],
};

const NAME_MATCH_THRESHOLD = 40;

const ALLOWED_OBJECT_CATEGORIES = new Set<string>([
    "armas",
    "armaduras",
    "baculos",
    "pociones",
    "sombreros",
    "cascos",
    "flechas",
]);

const OBJECT_TYPE_IDS = {
    armas: 2,
    armaduras: 3,
    pociones: 11,
    cascos: 17,
    flechas: 32,
} as const;

const outputDir = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.resolve(process.cwd(), "reports", "original-compare");

const originalObjsPath = path.resolve(__dirname, "../../../../AOOriginal/originalRecursosAO/Dat/obj.dat");
const originalNpcsPath = path.resolve(__dirname, "../../../../AOOriginal/originalRecursosAO/Dat/npcs.dat");

function parseIntSafe(value: string | undefined): number | undefined {
    if (!value) {
        return undefined;
    }

    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
}

function readValue(line: string, key: string): string | undefined {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
        return undefined;
    }

    const rawKey = line.slice(0, separatorIndex).trim().toLowerCase();
    if (rawKey !== key.trim().toLowerCase()) {
        return undefined;
    }

    return line.slice(separatorIndex + 1).trim();
}

function ensureObjectRecord(target: RecordMap, id: string) {
    if (!target[id]) {
        target[id] = {};
    }

    return target[id];
}

function parseOriginalObjs(): RecordMap {
    const text = fs.readFileSync(originalObjsPath, "latin1");
    const lines = text.split(/\r?\n/);
    const result: RecordMap = {};
    let currentId = "";

    for (const line of lines) {
        const header = line.match(/^\[OBJ(\d+)\]/i);
        if (header) {
            currentId = header[1];
            result[currentId] = { ...OBJECT_DEFAULTS, clasesNoPermitidas: [] };
            continue;
        }

        if (!currentId) {
            continue;
        }

        const current = ensureObjectRecord(result, currentId);
        const mappings: Array<[string, string]> = [
            ["Name", "name"],
            ["ObjType", "objType"],
            ["TipoPocion", "tipoPocion"],
            ["MinModificador", "minModificador"],
            ["MaxModificador", "maxModificador"],
            ["GrhIndex", "grhIndex"],
            ["Anim", "anim"],
            ["NumRopaje", "anim"],
            ["Agarrable", "agarrable"],
            ["Valor", "valor"],
            ["MinHit", "minHit"],
            ["MaxHit", "maxHit"],
            ["MinDef", "minDef"],
            ["MaxDef", "maxDef"],
            ["Newbie", "newbie"],
            ["Proyectil", "proyectil"],
            ["NoSeCae", "noSeCae"],
            ["TieneLlave", "llave"],
            ["PuertaAbierta", "cerrada"],
            ["IndexCerrada", "indexCerrada"],
            ["IndexAbierta", "indexAbierta"],
            ["HechizoIndex", "spellIndex"],
            ["RazaEnana", "razaEnana"],
            ["Apuñala", "apu"],
            ["Porcentaje", "porcentaje"],
            ["ResistenciaMagica", "resistenciaMagica"],
            ["StaffDamageBonus", "staffDamageBonus"],
            ["DefensaMagicaMin", "minDefMag"],
            ["DefensaMagicaMax", "maxDefMag"],
            ["MagicDamageBonus", "magicDamageBonus"],
            ["MagicPenetration", "magicPenetration"],
            ["MagicAbsoluteBonus", "magicAbsoluteBonus"],
            ["ImprovedMeleeHitChance", "improvedMeleeHitChance"],
            ["ImprovedRangedHitChance", "improvedRangedHitChance"],
            ["ExtraCritAndStabChance", "extraCritAndStabChance"],
        ];

        for (const [datKey, jsonKey] of mappings) {
            const raw = readValue(line, datKey);
            if (typeof raw === "undefined") {
                continue;
            }
            if (jsonKey === "name") {
                current[jsonKey] = raw;
            } else {
                current[jsonKey] = parseIntSafe(raw) ?? 0;
            }
        }

        for (let i = 1; i <= 11; i += 1) {
            const className = readValue(line, `CP${i}`);
            if (className && className.toLowerCase() !== "bandido") {
                const list = current.clasesNoPermitidas as string[];
                list.push(className.trim().toLowerCase());
            }
        }
    }

    return result;
}

function parseOriginalNpcs(): RecordMap {
    const text = fs.readFileSync(originalNpcsPath, "latin1");
    const lines = text.split(/\r?\n/);
    const result: RecordMap = {};
    let currentId = "";
    let currentDropCount = 0;

    for (const line of lines) {
        const header = line.match(/^\[NPC(\d+)\]/i);
        if (header) {
            currentId = header[1];
            currentDropCount = 0;
            result[currentId] = { ...NPC_DEFAULTS, drop: [], objs: [] };
            continue;
        }

        if (!currentId) {
            continue;
        }

        const current = ensureObjectRecord(result, currentId);
        const mappings: Array<[string, string]> = [
            ["Name", "name"],
            ["Head", "idHead"],
            ["Body", "idBody"],
            ["Movement", "movement"],
            ["NpcType", "npcType"],
            ["GiveEXP", "exp"],
            ["GiveGLD", "gold"],
            ["MinHP", "hp"],
            ["MaxHP", "maxHp"],
            ["MinHIT", "minHit"],
            ["MaxHIT", "maxHit"],
            ["DEF", "def"],
            ["PoderAtaque", "poderAtaque"],
            ["PoderEvasion", "poderEvasion"],
            ["MagicResistance", "magicResistance"],
            ["MagicDef", "magicDef"],
            ["Snd1", "snd1"],
            ["Snd2", "snd2"],
            ["SoundClose", "soundClose"],
            ["AguaValida", "aguaValida"],
            ["TierraInvalida", "tierraInvalida"],
            ["Desc", "desc"],
        ];

        for (const [datKey, jsonKey] of mappings) {
            const raw = readValue(line, datKey);
            if (typeof raw === "undefined") {
                continue;
            }
            if (jsonKey === "name" || jsonKey === "desc") {
                current[jsonKey] = raw;
            } else {
                current[jsonKey] = parseIntSafe(raw) ?? 0;
                if (jsonKey === "magicDef") {
                    current.defM = current[jsonKey];
                }
            }
        }

        const comercia = parseIntSafe(readValue(line, "Comercia"));
        if (comercia === 1) {
            current.npcType = 10;
        }

        const nroItems = parseIntSafe(readValue(line, "NROITEMS"));
        if (typeof nroItems === "number") {
            currentDropCount = nroItems;
        }

        if (currentDropCount > 0) {
            for (let i = 1; i <= currentDropCount; i += 1) {
                const drop = readValue(line, `Drop${i}`);
                if (typeof drop !== "undefined") {
                    const [item, cant] = drop.split("-");
                    current.drop = current.drop || [];
                    (current.drop as Array<Record<string, number>>).push({
                        item: Number.parseInt(item, 10),
                        cant: Number.parseInt(cant, 10),
                    });
                }

                const obj = readValue(line, `Obj${i}`);
                if (typeof obj !== "undefined") {
                    const [item, cant] = obj.split("-");
                    current.objs = current.objs || [];
                    (current.objs as Array<Record<string, number>>).push({
                        item: Number.parseInt(item, 10),
                        cant: Number.parseInt(cant, 10),
                    });
                }
            }
        }
    }

    return result;
}

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
        return JSON.stringify(
            value
                .map((item) => JSON.parse(stableStringify(item)))
                .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        );
    }

    if (value && typeof value === "object") {
        const sortedEntries = Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, entryValue]) => [key, JSON.parse(stableStringify(entryValue))]);
        return JSON.stringify(Object.fromEntries(sortedEntries));
    }

    return JSON.stringify(value);
}

function normalizeValue(value: unknown): string {
    if (typeof value === "undefined") {
        return "";
    }
    if (value === null) {
        return "null";
    }
    if (typeof value === "string") {
        return value.trim();
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    return stableStringify(value);
}

function normalizeName(value: unknown): string {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function isAllowedObjectEntry(entry: Record<string, unknown> | undefined): boolean {
    if (!entry) {
        return true;
    }

    const objType = Number(entry.objType ?? 0);
    const normalizedName = normalizeName(entry.name ?? "");

    if (ALLOWED_OBJECT_CATEGORIES.has("armas") && objType === OBJECT_TYPE_IDS.armas) {
        return true;
    }

    if (ALLOWED_OBJECT_CATEGORIES.has("armaduras") && objType === OBJECT_TYPE_IDS.armaduras) {
        return true;
    }

    if (ALLOWED_OBJECT_CATEGORIES.has("pociones") && objType === OBJECT_TYPE_IDS.pociones) {
        return true;
    }

    if (ALLOWED_OBJECT_CATEGORIES.has("cascos") && objType === OBJECT_TYPE_IDS.cascos) {
        return true;
    }

    if (ALLOWED_OBJECT_CATEGORIES.has("flechas") && objType === OBJECT_TYPE_IDS.flechas) {
        return true;
    }

    if (ALLOWED_OBJECT_CATEGORIES.has("baculos") && objType === OBJECT_TYPE_IDS.armas) {
        if (
            normalizedName.includes("baculo") ||
            normalizedName.includes("baston") ||
            normalizedName.includes("staff")
        ) {
            return true;
        }
    }

    if (ALLOWED_OBJECT_CATEGORIES.has("sombreros") && objType === OBJECT_TYPE_IDS.cascos) {
        if (
            normalizedName.includes("sombrero") ||
            normalizedName.includes("gorro") ||
            normalizedName.includes("galera") ||
            normalizedName.includes("capucha")
        ) {
            return true;
        }
    }

    return false;
}

function levenshtein(a: string, b: string): number {
    const matrix = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));

    for (let i = 0; i <= a.length; i += 1) {
        matrix[i][0] = i;
    }

    for (let j = 0; j <= b.length; j += 1) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
        }
    }

    return matrix[a.length][b.length];
}

function getMatchScore(currentName: string, originalName: string): number {
    const left = normalizeName(currentName);
    const right = normalizeName(originalName);

    if (!left || !right) {
        return 0;
    }

    if (left === right) {
        return 100;
    }

    const distance = levenshtein(left, right);
    const maxLength = Math.max(left.length, right.length, 1);
    const charScore = (1 - distance / maxLength) * 100;

    const leftTokens = new Set(left.split(" ").filter(Boolean));
    const rightTokens = new Set(right.split(" ").filter(Boolean));
    const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
    const union = new Set([...leftTokens, ...rightTokens]).size || 1;
    const tokenScore = (intersection / union) * 100;

    return Math.round(charScore * 0.7 + tokenScore * 0.3);
}

function buildMatches(dataset: "objs" | "npcs", current: RecordMap, original: RecordMap): MatchedEntry[] {
    const currentIds = Object.keys(current).sort((a, b) => Number(a) - Number(b));
    const originalIds = new Set(Object.keys(original));
    const usedOriginalIds = new Set<string>();
    const matches: MatchedEntry[] = [];

    for (const currentId of currentIds) {
        const currentEntry = current[currentId];
        if (dataset === "objs" && !isAllowedObjectEntry(currentEntry)) {
            continue;
        }

        const currentName = String(currentEntry?.name ?? "");
        const sameIdOriginal = original[currentId];
        const sameIdScore = sameIdOriginal ? getMatchScore(currentName, String(sameIdOriginal.name ?? "")) : 0;

        let selectedOriginalId: string | null = null;
        let selectedMatchType: MatchedEntry["matchType"] = "missing_in_original";
        let selectedScore = 0;

        if (sameIdOriginal && !usedOriginalIds.has(currentId) && sameIdScore >= NAME_MATCH_THRESHOLD) {
            selectedOriginalId = currentId;
            selectedMatchType = "id";
            selectedScore = sameIdScore;
        } else {
            let bestOriginalId: string | null = null;
            let bestScore = -1;

            for (const originalId of originalIds) {
                if (usedOriginalIds.has(originalId)) {
                    continue;
                }

                const score = getMatchScore(currentName, String(original[originalId]?.name ?? ""));
                if (score > bestScore) {
                    bestScore = score;
                    bestOriginalId = originalId;
                }
            }

            if (bestOriginalId && bestScore >= NAME_MATCH_THRESHOLD) {
                selectedOriginalId = bestOriginalId;
                selectedMatchType = bestOriginalId === currentId ? "id" : "name";
                selectedScore = bestScore;
            } else if (sameIdOriginal && !usedOriginalIds.has(currentId)) {
                selectedOriginalId = currentId;
                selectedMatchType = "id";
                selectedScore = sameIdScore;
            }
        }

        if (selectedOriginalId) {
            usedOriginalIds.add(selectedOriginalId);
        }

        matches.push({
            currentId,
            originalId: selectedOriginalId,
            currentEntry,
            originalEntry: selectedOriginalId ? original[selectedOriginalId] : undefined,
            matchType: selectedMatchType,
            matchScore: selectedScore,
        });
    }

    for (const originalId of originalIds) {
        if (usedOriginalIds.has(originalId)) {
            continue;
        }

        if (dataset === "objs" && !isAllowedObjectEntry(original[originalId])) {
            continue;
        }

        matches.push({
            currentId: "",
            originalId,
            originalEntry: original[originalId],
            matchType: "missing_in_current",
            matchScore: 0,
        });
    }

    return matches.sort((a, b) => Number(a.currentId || a.originalId || 0) - Number(b.currentId || b.originalId || 0));
}

function compareDataset(dataset: "objs" | "npcs", current: RecordMap, original: RecordMap): DiffRow[] {
    const defaults = dataset === "objs" ? OBJECT_DEFAULTS : NPC_DEFAULTS;
    const blacklistedProperties = BLACKLISTED_PROPERTIES[dataset];
    const rows: DiffRow[] = [];
    const matches = buildMatches(dataset, current, original);

    for (const match of matches) {
        const id = match.currentId || match.originalId || "";
        const currentEntry = match.currentEntry ? { ...defaults, ...match.currentEntry } : undefined;
        const originalEntry = match.originalEntry ? { ...defaults, ...match.originalEntry } : undefined;
        const nameCurrent = String(currentEntry?.name ?? "");
        const nameOriginal = String(originalEntry?.name ?? "");

        if (!currentEntry) {
            rows.push({
                dataset,
                id,
                matchedOriginalId: match.originalId ?? "",
                nameCurrent: "",
                nameOriginal,
                matchType: match.matchType,
                matchScore: String(match.matchScore),
                status: "missing_in_current",
                property: "(entry)",
                currentValue: "",
                originalValue: "exists",
            });
            continue;
        }

        if (!originalEntry) {
            rows.push({
                dataset,
                id,
                matchedOriginalId: "",
                nameCurrent,
                nameOriginal: "",
                matchType: match.matchType,
                matchScore: String(match.matchScore),
                status: "missing_in_original",
                property: "(entry)",
                currentValue: "exists",
                originalValue: "",
            });
            continue;
        }

        const properties = Array.from(new Set([...Object.keys(currentEntry), ...Object.keys(originalEntry)])).sort(
            (a, b) => a.localeCompare(b),
        );

        for (const property of properties) {
            if (blacklistedProperties.has(property)) {
                continue;
            }

            const currentValue = normalizeValue(currentEntry[property]);
            const originalValue = normalizeValue(originalEntry[property]);

            if (currentValue === originalValue) {
                continue;
            }

            const status =
                currentValue === ""
                    ? "property_missing_in_current"
                    : originalValue === ""
                      ? "property_missing_in_original"
                      : "value_diff";

            rows.push({
                dataset,
                id,
                matchedOriginalId: match.originalId ?? "",
                nameCurrent,
                nameOriginal,
                matchType: match.matchType,
                matchScore: String(match.matchScore),
                status,
                property,
                currentValue,
                originalValue,
            });
        }
    }

    return rows;
}

function escapeCsv(value: string): string {
    if (value.includes(",") || value.includes("\n") || value.includes('"')) {
        return `"${value.replace(/\"/g, '""')}"`;
    }
    return value;
}

function writeCsv(filePath: string, rows: DiffRow[]) {
    const headers = [
        "dataset",
        "id",
        "matchedOriginalId",
        "nameCurrent",
        "nameOriginal",
        "matchType",
        "matchScore",
        "status",
        "property",
        "currentValue",
        "originalValue",
    ];
    const content = [
        headers.join(","),
        ...rows.map((row) => headers.map((header) => escapeCsv(String(row[header as keyof DiffRow] ?? ""))).join(",")),
    ].join("\n");
    fs.writeFileSync(filePath, `${content}\n`, "utf8");
}

function collectProperties(dataset: "objs" | "npcs", current: RecordMap, original: RecordMap): string[] {
    const blacklistedProperties = BLACKLISTED_PROPERTIES[dataset];
    const properties = new Set<string>();

    for (const entry of [...Object.values(current), ...Object.values(original)]) {
        if (dataset === "objs" && !isAllowedObjectEntry(entry)) {
            continue;
        }

        for (const property of Object.keys(entry)) {
            if (!blacklistedProperties.has(property)) {
                properties.add(property);
            }
        }
    }

    return Array.from(properties).sort((a, b) => a.localeCompare(b));
}

function main() {
    fs.mkdirSync(outputDir, { recursive: true });

    const currentObjs = loadDefaultObjectsData() as RecordMap;
    const currentNpcs = loadDefaultNpcsData() as RecordMap;
    const originalObjs = parseOriginalObjs();
    const originalNpcs = parseOriginalNpcs();

    const objRows = compareDataset("objs", currentObjs, originalObjs);
    const npcRows = compareDataset("npcs", currentNpcs, originalNpcs);
    const objProperties = collectProperties("objs", currentObjs, originalObjs);
    const npcProperties = collectProperties("npcs", currentNpcs, originalNpcs);

    writeCsv(path.join(outputDir, "objs-diff.csv"), objRows);
    writeCsv(path.join(outputDir, "npcs-diff.csv"), npcRows);
    fs.writeFileSync(path.join(outputDir, "objs-properties.json"), JSON.stringify(objProperties, null, 2), "utf8");
    fs.writeFileSync(path.join(outputDir, "npcs-properties.json"), JSON.stringify(npcProperties, null, 2), "utf8");

    const summary = {
        generatedAt: new Date().toISOString(),
        outputDir,
        objs: {
            currentCount: Object.keys(currentObjs).length,
            originalCount: Object.keys(originalObjs).length,
            diffRows: objRows.length,
            properties: objProperties.length,
            allowedCategories: Array.from(ALLOWED_OBJECT_CATEGORIES),
        },
        npcs: {
            currentCount: Object.keys(currentNpcs).length,
            originalCount: Object.keys(originalNpcs).length,
            diffRows: npcRows.length,
            properties: npcProperties.length,
        },
    };

    fs.writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");

    console.log(`Comparison generated at: ${outputDir}`);
    console.log(`Objects with differences: ${objRows.length}`);
    console.log(`NPCs with differences: ${npcRows.length}`);
}

main();
