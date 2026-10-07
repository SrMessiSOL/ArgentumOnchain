import fs from "fs";
import path from "path";
import pool from "../db";
import type { CharacterRecord } from "../types";

const MIN_LEVEL_WITHOUT_NEWBIE_ITEMS = 13;

type ObjDataRecord = {
  newbie?: number;
};

type CharacterNewbieItemRow = {
  character_id: string;
  id_pos: number;
  id_item: number;
};

function loadNewbieItemIds(): number[] {
  const objsJsonPath = path.resolve(
    __dirname,
    "../jsons/objs.json",
  );
  const raw = fs.readFileSync(objsJsonPath, "utf8");
  const objData = JSON.parse(raw) as Record<string, ObjDataRecord>;

  return Object.entries(objData)
    .filter(([, item]) => Number(item?.newbie ?? 0) > 0)
    .map(([id]) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((left, right) => left - right);
}

function getNakedBody(idGenero: number, idRaza: number): number {
  if (idGenero === 1) {
    switch (idRaza) {
      case 1:
        return 21;
      case 2:
        return 210;
      case 3:
        return 32;
      case 4:
        return 53;
      case 5:
        return 222;
      default:
        return 0;
    }
  }

  if (idGenero === 2) {
    switch (idRaza) {
      case 1:
        return 39;
      case 2:
        return 259;
      case 3:
        return 40;
      case 4:
        return 60;
      case 5:
        return 260;
      default:
        return 0;
    }
  }

  return 0;
}

async function main() {
  const newbieItemIds = loadNewbieItemIds();

  if (newbieItemIds.length === 0) {
    throw new Error("No newbie items found in dist/jsons/objs.json");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const affectedCharactersResult = await client.query<CharacterRecord>(
      `
        SELECT DISTINCT c.*
        FROM characters c
        JOIN character_items ci ON ci.character_id = c.id
        WHERE c.level >= $1
          AND c.deleted_at IS NULL
          AND ci.id_item = ANY($2::int[])
        ORDER BY c.created_at ASC, c.id ASC
      `,
      [MIN_LEVEL_WITHOUT_NEWBIE_ITEMS, newbieItemIds],
    );

    const affectedCharacters = affectedCharactersResult.rows;

    if (affectedCharacters.length === 0) {
      await client.query("COMMIT");
      console.log("No level 13+ characters found with newbie items in their inventory.");
      return;
    }

    const characterIds = affectedCharacters.map((character) => character.id);

    const affectedItemsResult = await client.query<CharacterNewbieItemRow>(
      `
        SELECT character_id, id_pos, id_item
        FROM character_items
        WHERE character_id = ANY($1::uuid[])
          AND id_item = ANY($2::int[])
        ORDER BY character_id ASC, id_pos ASC
      `,
      [characterIds, newbieItemIds],
    );

    const affectedItemsByCharacter = new Map<string, CharacterNewbieItemRow[]>();

    for (const item of affectedItemsResult.rows) {
      const items = affectedItemsByCharacter.get(item.character_id) ?? [];
      items.push(item);
      affectedItemsByCharacter.set(item.character_id, items);
    }

    let updatedCharacters = 0;
    let deletedItems = 0;

    for (const character of affectedCharacters) {
      const removedItems = affectedItemsByCharacter.get(character.id) ?? [];

      if (removedItems.length === 0) {
        continue;
      }

      const removedSlots = new Set(removedItems.map((item) => item.id_pos));
      const updates: Array<{ column: string; value: number }> = [];

      if (removedSlots.has(character.id_item_body)) {
        updates.push({ column: "id_item_body", value: 0 });

        if (character.navegando) {
          updates.push({
            column: "id_last_body",
            value: getNakedBody(character.id_genero, character.id_raza),
          });
        } else if (!character.dead) {
          updates.push({
            column: "id_body",
            value: getNakedBody(character.id_genero, character.id_raza),
          });
        }
      }

      if (removedSlots.has(character.id_item_weapon)) {
        updates.push({ column: "id_item_weapon", value: 0 });

        if (character.navegando) {
          updates.push({ column: "id_last_weapon", value: 0 });
        } else {
          updates.push({ column: "id_weapon", value: 0 });
        }
      }

      if (removedSlots.has(character.id_item_shield)) {
        updates.push({ column: "id_item_shield", value: 0 });

        if (character.navegando) {
          updates.push({ column: "id_last_shield", value: 0 });
        } else {
          updates.push({ column: "id_shield", value: 0 });
        }
      }

      if (removedSlots.has(character.id_item_helmet)) {
        updates.push({ column: "id_item_helmet", value: 0 });

        if (character.navegando) {
          updates.push({ column: "id_last_helmet", value: 0 });
        } else {
          updates.push({ column: "id_helmet", value: 0 });
        }
      }

      if (removedSlots.has(character.id_item_arrow)) {
        updates.push({ column: "id_item_arrow", value: 0 });
      }

      if (updates.length > 0) {
        const uniqueUpdates = new Map<string, number>();

        for (const update of updates) {
          uniqueUpdates.set(update.column, update.value);
        }

        const setClauses = Array.from(uniqueUpdates.keys()).map(
          (column, index) => `${column} = $${index + 2}`,
        );

        await client.query(
          `
            UPDATE characters
            SET ${setClauses.join(", ")}, updated_at = NOW()
            WHERE id = $1
          `,
          [character.id, ...Array.from(uniqueUpdates.values())],
        );
      }

      await client.query(
        `
          DELETE FROM character_items
          WHERE character_id = $1
            AND id_pos = ANY($2::int[])
        `,
        [character.id, removedItems.map((item) => item.id_pos)],
      );

      updatedCharacters += 1;
      deletedItems += removedItems.length;
    }

    await client.query("COMMIT");

    console.log(`Newbie items removed: ${deletedItems}`);
    console.log(`Characters updated: ${updatedCharacters}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
