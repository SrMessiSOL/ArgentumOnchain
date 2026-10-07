import path from "path";

import pool from "../db";
import {
  loadCraftingRecipesJsonFromFile,
  loadNpcsJsonFromFile,
  loadObjectsJsonFromFile,
  loadSeedCraftingRecipesJson,
  loadSeedNpcsJson,
  loadSeedObjectsJson,
  loadSeedSmeltingRecipesJson,
  loadSmeltingRecipesJsonFromFile,
} from "../lib/gameData";
import { upsertGameCraftingRecipe } from "../repositories/gameCraftingRecipes";
import { upsertGameNpc } from "../repositories/gameNpcs";
import { upsertGameObject } from "../repositories/gameObjects";
import { upsertGameSmeltingRecipe } from "../repositories/gameSmeltingRecipes";

function getOptionValue(name: string): string | null {
  const index = process.argv.findIndex((argument) => argument === `--${name}`);
  if (index < 0) {
    return null;
  }

  const nextValue = process.argv[index + 1];
  return nextValue?.trim() ? nextValue.trim() : null;
}

function resolveOptionalPath(value: string | null): string | null {
  return value ? path.resolve(process.cwd(), value) : null;
}

async function importObjects(filePath?: string | null): Promise<{ total: number; changed: number; unchanged: number }> {
  const rows = filePath ? loadObjectsJsonFromFile(filePath) : loadSeedObjectsJson();
  let changed = 0;
  let unchanged = 0;

  for (const row of rows) {
    const result = await upsertGameObject(row.id, row.data);
    if (result.unchanged) {
      unchanged += 1;
    } else {
      changed += 1;
    }
  }

  return { total: rows.length, changed, unchanged };
}

async function importNpcs(filePath?: string | null): Promise<{ total: number; changed: number; unchanged: number }> {
  const rows = filePath ? loadNpcsJsonFromFile(filePath) : loadSeedNpcsJson();
  let changed = 0;
  let unchanged = 0;

  for (const row of rows) {
    const result = await upsertGameNpc(row.id, row.data);
    if (result.unchanged) {
      unchanged += 1;
    } else {
      changed += 1;
    }
  }

  return { total: rows.length, changed, unchanged };
}

async function importCraftingRecipes(filePath?: string | null): Promise<{ total: number; changed: number; unchanged: number }> {
  const rows = filePath ? loadCraftingRecipesJsonFromFile(filePath) : loadSeedCraftingRecipesJson();
  let changed = 0;
  let unchanged = 0;

  for (const row of rows) {
    const result = await upsertGameCraftingRecipe(row.id, row.data);
    if (result.unchanged) unchanged += 1;
    else changed += 1;
  }

  return { total: rows.length, changed, unchanged };
}

async function importSmeltingRecipes(filePath?: string | null): Promise<{ total: number; changed: number; unchanged: number }> {
  const rows = filePath ? loadSmeltingRecipesJsonFromFile(filePath) : loadSeedSmeltingRecipesJson();
  let changed = 0;
  let unchanged = 0;

  for (const row of rows) {
    const result = await upsertGameSmeltingRecipe(row.id, row.data);
    if (result.unchanged) unchanged += 1;
    else changed += 1;
  }

  return { total: rows.length, changed, unchanged };
}

async function main(): Promise<void> {
  const positionalArgs = process.argv.slice(2).filter((argument) => argument !== "--");
  const mode = (positionalArgs[0] ?? "all").trim().toLowerCase();
  const objectsPath = resolveOptionalPath(getOptionValue("objects-path"));
  const npcsPath = resolveOptionalPath(getOptionValue("npcs-path"));
  const craftingPath = resolveOptionalPath(getOptionValue("crafting-path"));
  const smeltingPath = resolveOptionalPath(getOptionValue("smelting-path"));

  if (!["all", "objs", "npcs", "crafting", "smelting"].includes(mode)) {
    throw new Error(
      "Usage: pnpm import-game-data [all|objs|npcs|crafting|smelting] [--objects-path path] [--npcs-path path] [--crafting-path path] [--smelting-path path]",
    );
  }

  if (mode === "all" || mode === "objs") {
    const objects = await importObjects(objectsPath);
    console.log(
      `Objects imported. Total: ${objects.total}. New/updated: ${objects.changed}. Unchanged: ${objects.unchanged}.`,
    );
  }

  if (mode === "all" || mode === "npcs") {
    const npcs = await importNpcs(npcsPath);
    console.log(
      `NPCs imported. Total: ${npcs.total}. New/updated: ${npcs.changed}. Unchanged: ${npcs.unchanged}.`,
    );
  }

  if (mode === "all" || mode === "crafting") {
    const crafting = await importCraftingRecipes(craftingPath);
    console.log(
      `Crafting imported. Total: ${crafting.total}. New/updated: ${crafting.changed}. Unchanged: ${crafting.unchanged}.`,
    );
  }

  if (mode === "all" || mode === "smelting") {
    const smelting = await importSmeltingRecipes(smeltingPath);
    console.log(
      `Smelting imported. Total: ${smelting.total}. New/updated: ${smelting.changed}. Unchanged: ${smelting.unchanged}.`,
    );
  }
}

void main()
  .catch((error) => {
    console.error("Could not import game data", error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
