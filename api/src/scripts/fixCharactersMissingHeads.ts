import pool from "../db";
import {
    CHARACTER_GENDERS,
    CHARACTER_RACES,
    GENDER_ID_MAP,
    RACE_ID_MAP,
    getAllowedAppearance,
} from "../lib/characterCreation";

type AffectedCharacterRow = {
    id: string;
    name: string;
    id_raza: number;
    id_genero: number;
    id_head: number;
    id_last_head: number;
};

const KNOWN_INVALID_DEFAULT_HEAD_IDS = [150, 200, 250, 300, 350, 400, 450];

const raceKeyById = new Map(
    CHARACTER_RACES.map((raceKey) => [RACE_ID_MAP[raceKey], raceKey] as const),
);

const genderKeyById = new Map(
    CHARACTER_GENDERS.map(
        (genderKey) => [GENDER_ID_MAP[genderKey], genderKey] as const,
    ),
);

function resolveDefaultHeadId(idRaza: number, idGenero: number): number {
    const raceKey = raceKeyById.get(Number(idRaza));
    const genderKey = genderKeyById.get(Number(idGenero));

    if (!raceKey || !genderKey) {
        throw new Error(
            `Could not resolve default head for race ${idRaza} and gender ${idGenero}`,
        );
    }

    return getAllowedAppearance(raceKey, genderKey).startHeadId;
}

async function main() {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const affectedResult = await client.query<AffectedCharacterRow>(
            `
        SELECT id, name, id_raza, id_genero, id_head, id_last_head
        FROM characters
        WHERE deleted_at IS NULL
          AND (
            (COALESCE(id_head, 0) <= 0 AND COALESCE(id_last_head, 0) <= 0)
            OR (
              COALESCE(id_head, 0) = ANY($1::int[])
              AND COALESCE(id_last_head, 0) = ANY($1::int[])
            )
          )
        ORDER BY created_at ASC, id ASC
      `,
            [KNOWN_INVALID_DEFAULT_HEAD_IDS],
        );

        if (affectedResult.rows.length === 0) {
            await client.query("COMMIT");
            console.log(
                "No characters found with id_head = 0 and id_last_head = 0.",
            );
            return;
        }

        let updatedCount = 0;

        for (const character of affectedResult.rows) {
            const defaultHeadId = resolveDefaultHeadId(
                character.id_raza,
                character.id_genero,
            );

            await client.query(
                `
          UPDATE characters
          SET id_head = $2,
              id_last_head = $2,
              updated_at = NOW()
          WHERE id = $1
        `,
                [character.id, defaultHeadId],
            );

            updatedCount += 1;
            console.log(
                `Character repaired: ${character.name} (${character.id}) ${character.id_head}/${character.id_last_head} -> head ${defaultHeadId}`,
            );
        }

        await client.query("COMMIT");
        console.log(`Characters repaired: ${updatedCount}`);
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
