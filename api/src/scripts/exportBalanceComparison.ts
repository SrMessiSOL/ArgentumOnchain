import fs from "fs";
import path from "path";
import pool from "../db";
import type { CharacterRecord } from "../types";
import {
  MAX_LEVEL,
  clampLevel,
  getLegacyExpNextLevelForLevel,
  getMaxHitForLevel,
  getMaxHpForLevel,
  getMaxManaForLevel,
  getMinHitForLevel,
} from "../lib/characterCreation";

const CLASS_NAMES: Record<number, string> = {
  1: "Mago",
  2: "Clerigo",
  3: "Guerrero",
  4: "Asesino",
  5: "Ladron",
  6: "Bardo",
  7: "Druida",
  8: "Paladin",
  9: "Cazador",
  10: "Trabajador",
  11: "Pirata",
};

const RACE_BASE_STATS: Record<
  number,
  {
    fuerza: number;
    agilidad: number;
    inteligencia: number;
    constitucion: number;
  }
> = {
  1: { fuerza: 19, agilidad: 19, inteligencia: 18, constitucion: 20 },
  2: { fuerza: 18, agilidad: 20, inteligencia: 20, constitucion: 19 },
  3: { fuerza: 20, agilidad: 19, inteligencia: 19, constitucion: 19 },
  4: { fuerza: 21, agilidad: 18, inteligencia: 15, constitucion: 21 },
  5: { fuerza: 16, agilidad: 21, inteligencia: 22, constitucion: 18 },
};

const RACE_NAMES: Record<number, string> = {
  1: "Humano",
  2: "Elfo",
  3: "Elfo Drow",
  4: "Enano",
  5: "Gnomo",
};

const outputPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(process.cwd(), "balance-comparison.csv");

const headers = [
  "id",
  "name",
  "classId",
  "className",
  "raceId",
  "raceName",
  "levelCurrent",
  "levelNormalized",
  "levelClampedByNewMax",
  "expNextLevelCurrent",
  "expNextLevelNew",
  "attrFuerzaCurrent",
  "attrFuerzaNew",
  "attrAgilidadCurrent",
  "attrAgilidadNew",
  "attrInteligenciaCurrent",
  "attrInteligenciaNew",
  "attrConstitucionCurrent",
  "attrConstitucionNew",
  "maxHpCurrent",
  "maxHpNew",
  "deltaMaxHp",
  "hpCurrent",
  "hpClampedToNewMax",
  "maxManaCurrent",
  "maxManaNew",
  "deltaMaxMana",
  "manaCurrent",
  "manaClampedToNewMax",
  "minHitCurrent",
  "minHitNew",
  "deltaMinHit",
  "maxHitCurrent",
  "maxHitNew",
  "deltaMaxHit",
  "dead",
  "connected",
];

function escapeCsv(value: unknown): string {
  if (value === null || typeof value === "undefined") {
    return "";
  }

  const text = String(value);
  return text.includes(",") || text.includes("\n") || text.includes('"')
    ? `"${text.replace(/\"/g, '""')}"`
    : text;
}

function getExpectedStats(character: CharacterRecord) {
  const base = RACE_BASE_STATS[character.id_raza];
  const levelNormalized = Math.max(1, Math.floor(character.level || 1));
  const levelClampedByNewMax = clampLevel(levelNormalized);

  return {
    levelNormalized,
    levelClampedByNewMax,
    expNextLevel: getLegacyExpNextLevelForLevel(levelClampedByNewMax),
    attrFuerza: base.fuerza,
    attrAgilidad: base.agilidad,
    attrInteligencia: base.inteligencia,
    attrConstitucion: base.constitucion,
    maxHp: getMaxHpForLevel(
      character.id_clase,
      base.constitucion,
      levelClampedByNewMax,
    ),
    maxMana: getMaxManaForLevel(
      character.id_clase,
      base.inteligencia,
      levelClampedByNewMax,
    ),
    minHit: getMinHitForLevel(character.id_clase, levelClampedByNewMax),
    maxHit: getMaxHitForLevel(character.id_clase, levelClampedByNewMax),
  };
}

async function main() {
  const result = await pool.query<CharacterRecord>(
    "SELECT * FROM characters ORDER BY created_at ASC, id ASC",
  );
  const lines = [headers.join(",")];

  for (const character of result.rows) {
    const expected = getExpectedStats(character);
    const hpCurrent = Number(character.hp ?? character.max_hp ?? 0);
    const manaCurrent = Number(character.mana ?? character.max_mana ?? 0);
    const hpClampedToNewMax = character.dead
      ? 0
      : Math.min(Math.max(hpCurrent, 0), expected.maxHp);
    const manaClampedToNewMax = Math.min(
      Math.max(manaCurrent, 0),
      expected.maxMana,
    );

    const row = [
      character.id,
      character.name,
      character.id_clase,
      CLASS_NAMES[character.id_clase] ?? `Clase ${character.id_clase}`,
      character.id_raza,
      RACE_NAMES[character.id_raza] ?? `Raza ${character.id_raza}`,
      character.level,
      expected.levelNormalized,
      expected.levelClampedByNewMax,
      character.exp_next_level,
      expected.expNextLevel,
      character.attr_fuerza,
      expected.attrFuerza,
      character.attr_agilidad,
      expected.attrAgilidad,
      character.attr_inteligencia,
      expected.attrInteligencia,
      character.attr_constitucion,
      expected.attrConstitucion,
      character.max_hp,
      expected.maxHp,
      expected.maxHp - Number(character.max_hp ?? 0),
      hpCurrent,
      hpClampedToNewMax,
      character.max_mana,
      expected.maxMana,
      expected.maxMana - Number(character.max_mana ?? 0),
      manaCurrent,
      manaClampedToNewMax,
      character.min_hit,
      expected.minHit,
      expected.minHit - Number(character.min_hit ?? 0),
      character.max_hit,
      expected.maxHit,
      expected.maxHit - Number(character.max_hit ?? 0),
      character.dead,
      character.connected,
    ];

    lines.push(row.map(escapeCsv).join(","));
  }

  fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
  await pool.end();

  console.log(`CSV generated: ${outputPath}`);
  console.log(
    `Characters analyzed: ${result.rowCount ?? result.rows.length}`,
  );
  console.log(`New maximum level used for comparison: ${MAX_LEVEL}`);
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
