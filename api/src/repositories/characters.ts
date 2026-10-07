import {assertPlayableCharacter} from "../game-asset-policy";
import { z } from "zod";
import { createHash } from 'node:crypto';
import type { PoolClient } from "pg";
import pool from "../db";
import type {
    AccountRecord,
    CharacterApiResponse,
    CharacterBankItemRecord,
    CharacterItemRecord,
    CharacterLookupResponse,
    RankingCharacterRecord,
    RankingCharacterResponse,
    RankingListResponse,
    CharacterRecord,
    CharacterSpellRecord,
} from "../types";

const lookupSchema = z.object({
    idAccount: z.string().uuid(),
    idCharacter: z.string().uuid(),
    email: z.string().email(),
});

const moderationSchema = z.object({
    name: z.string().trim().min(1),
    bannedUntil: z.string().datetime(),
});

const moderationNameSchema = z.object({
    name: z.string().trim().min(1),
});

const jailCharacterSchema = z.object({
    name: z.string().trim().min(1),
    jailMinutes: z.coerce.number().int().positive(),
    jailReason: z.string().trim().min(1),
    map: z.coerce.number().int(),
    posX: z.coerce.number().int(),
    posY: z.coerce.number().int(),
});

const MAX_INVENTORY_SLOTS = 21;
const MAX_BANK_SLOTS = 100;

const itemSchema = z.object({
    idPos: z.coerce.number().int().min(1).max(MAX_INVENTORY_SLOTS),
    idItem: z.coerce.number().int().positive(),
    cant: z.coerce.number().int().positive(),
    equipped: z
        .union([z.boolean(), z.number().int()])
        .transform((value) => Boolean(value)),
});

const spellSchema = z.object({
    idPos: z.coerce.number().int(),
    idSpell: z.coerce.number().int(),
});

const bankItemSchema = z.object({
    idPos: z.coerce.number().int().min(1).max(MAX_BANK_SLOTS),
    idItem: z.coerce.number().int().positive(),
    cant: z.coerce.number().int().positive(),
});

type ParsedItem = z.infer<typeof itemSchema>;
type ParsedBankItem = z.infer<typeof bankItemSchema>;
type ParsedSpell = z.infer<typeof spellSchema>;

const storagePatchSchema = z.object({
    items: z.array(itemSchema),
    bankItems: z.array(bankItemSchema),
});

const characterPatchSchema = z
    .object({
        operationId: z.string().uuid().optional(),
        floorChanges: z.array(z.discriminatedUnion('action', [
            z.object({ action: z.literal('put'), dropId: z.string().uuid(), map: z.number().int().positive(), x: z.number().int().min(0), y: z.number().int().min(0), itemId: z.number().int().positive(), amount: z.number().int().positive() }),
            z.object({ action: z.literal('take'), dropId: z.string().uuid() }),
        ])).max(100).optional(),
        name: z.string().min(1).optional(),
        idClase: z.coerce.number().int().optional(),
        map: z.coerce.number().int().optional(),
        posX: z.coerce.number().int().optional(),
        posY: z.coerce.number().int().optional(),
        gold: z.coerce.number().int().optional(),
        idHead: z.coerce.number().int().optional(),
        idLastHead: z.coerce.number().int().optional(),
        idLastBody: z.coerce.number().int().optional(),
        idLastHelmet: z.coerce.number().int().optional(),
        idLastWeapon: z.coerce.number().int().optional(),
        idLastShield: z.coerce.number().int().optional(),
        idHelmet: z.coerce.number().int().optional(),
        idWeapon: z.coerce.number().int().optional(),
        idShield: z.coerce.number().int().optional(),
        idBody: z.coerce.number().int().optional(),
        idItemWeapon: z.coerce.number().int().optional(),
        idItemBody: z.coerce.number().int().optional(),
        idItemShield: z.coerce.number().int().optional(),
        idItemHelmet: z.coerce.number().int().optional(),
        idItemArrow: z.coerce.number().int().optional(),
        spellsAcertados: z.coerce.number().int().optional(),
        spellsErrados: z.coerce.number().int().optional(),
        hp: z.coerce.number().int().optional(),
        maxHp: z.coerce.number().int().optional(),
        mana: z.coerce.number().int().optional(),
        maxMana: z.coerce.number().int().optional(),
        idRaza: z.coerce.number().int().optional(),
        idGenero: z.coerce.number().int().optional(),
        muerto: z
            .union([z.boolean(), z.number().int()])
            .transform((value) => Boolean(value))
            .optional(),
        minHit: z.coerce.number().int().optional(),
        maxHit: z.coerce.number().int().optional(),
        attrFuerza: z.coerce.number().int().optional(),
        attrAgilidad: z.coerce.number().int().optional(),
        attrInteligencia: z.coerce.number().int().optional(),
        attrConstitucion: z.coerce.number().int().optional(),
        privileges: z.coerce.number().int().optional(),
        countKilled: z.coerce.number().int().optional(),
        countDie: z.coerce.number().int().optional(),
        exp: z.coerce.number().int().optional(),
        expNextLevel: z.coerce.number().int().optional(),
        level: z.coerce.number().int().optional(),
        ip: z.string().nullable().optional(),
        banned: z.union([z.string().datetime(), z.null()]).optional(),
        dead: z
            .union([z.boolean(), z.number().int()])
            .transform((value) => Boolean(value))
            .optional(),
        criminal: z
            .union([z.boolean(), z.number().int()])
            .transform((value) => Boolean(value))
            .optional(),
        faction: z.enum(["none", "armada", "caos"]).optional(),
        navegando: z
            .union([z.boolean(), z.number().int()])
            .transform((value) => Boolean(value))
            .optional(),
        npcMatados: z.coerce.number().int().optional(),
        ciudadanosMatados: z.coerce.number().int().optional(),
        criminalesMatados: z.coerce.number().int().optional(),
        fianza: z.coerce.number().int().optional(),
        homeMap: z.coerce.number().int().optional(),
        homeX: z.coerce.number().int().optional(),
        homeY: z.coerce.number().int().optional(),
        factionScoreArmada: z.coerce.number().int().optional(),
        factionScoreCaos: z.coerce.number().int().optional(),
        factionRankArmada: z.coerce.number().int().optional(),
        factionRankCaos: z.coerce.number().int().optional(),
        factionRewardsArmada: z.coerce.number().int().optional(),
        factionRewardsCaos: z.coerce.number().int().optional(),
        jailMinutes: z.coerce.number().int().optional(),
        jailReason: z.string().nullable().optional(),
        connected: z
            .union([z.boolean(), z.number().int()])
            .transform((value) => Boolean(value))
            .optional(),
        items: z.array(itemSchema).optional(),
        bankItems: z.array(bankItemSchema).optional(),
        spells: z.array(spellSchema).optional(),
    })
    .passthrough();

const fieldMap = [
    ["name", "name"],
    ["idClase", "id_clase"],
    ["map", "map_id"],
    ["posX", "pos_x"],
    ["posY", "pos_y"],
    ["gold", "gold"],
    ["idHead", "id_head"],
    ["idLastHead", "id_last_head"],
    ["idLastBody", "id_last_body"],
    ["idLastHelmet", "id_last_helmet"],
    ["idLastWeapon", "id_last_weapon"],
    ["idLastShield", "id_last_shield"],
    ["idHelmet", "id_helmet"],
    ["idWeapon", "id_weapon"],
    ["idShield", "id_shield"],
    ["idBody", "id_body"],
    ["idItemWeapon", "id_item_weapon"],
    ["idItemBody", "id_item_body"],
    ["idItemShield", "id_item_shield"],
    ["idItemHelmet", "id_item_helmet"],
    ["idItemArrow", "id_item_arrow"],
    ["spellsAcertados", "spells_acertados"],
    ["spellsErrados", "spells_errados"],
    ["hp", "hp"],
    ["maxHp", "max_hp"],
    ["mana", "mana"],
    ["maxMana", "max_mana"],
    ["idRaza", "id_raza"],
    ["idGenero", "id_genero"],
    ["muerto", "muerto"],
    ["minHit", "min_hit"],
    ["maxHit", "max_hit"],
    ["attrFuerza", "attr_fuerza"],
    ["attrAgilidad", "attr_agilidad"],
    ["attrInteligencia", "attr_inteligencia"],
    ["attrConstitucion", "attr_constitucion"],
    ["privileges", "privileges"],
    ["countKilled", "count_killed"],
    ["countDie", "count_die"],
    ["exp", "exp"],
    ["expNextLevel", "exp_next_level"],
    ["level", "level"],
    ["ip", "ip"],
    ["banned", "banned"],
    ["dead", "dead"],
    ["criminal", "criminal"],
    ["faction", "faction"],
    ["navegando", "navegando"],
    ["npcMatados", "npc_matados"],
    ["ciudadanosMatados", "ciudadanos_matados"],
    ["criminalesMatados", "criminales_matados"],
    ["fianza", "fianza"],
    ["homeMap", "home_map"],
    ["homeX", "home_x"],
    ["homeY", "home_y"],
    ["factionScoreArmada", "faction_score_armada"],
    ["factionScoreCaos", "faction_score_caos"],
    ["factionRankArmada", "faction_rank_armada"],
    ["factionRankCaos", "faction_rank_caos"],
    ["factionRewardsArmada", "faction_rewards_armada"],
    ["factionRewardsCaos", "faction_rewards_caos"],
    ["jailMinutes", "jail_minutes"],
    ["jailReason", "jail_reason"],
    ["connected", "connected"],
] as const;

function toCharacterResponse(
    character: CharacterRecord,
    items: CharacterItemRecord[],
    bankItems: CharacterBankItemRecord[],
    spells: CharacterSpellRecord[],
): CharacterApiResponse {
    return {
        _id: character.id,
        idAccount: character.account_id,
        name: character.name,
        idClase: character.id_clase,
        map: character.map_id,
        posX: character.pos_x,
        posY: character.pos_y,
        gold: character.gold,
        idHead: character.id_head,
        idLastHead: character.id_last_head,
        idLastBody: character.id_last_body,
        idLastHelmet: character.id_last_helmet,
        idLastWeapon: character.id_last_weapon,
        idLastShield: character.id_last_shield,
        idHelmet: character.id_helmet,
        idWeapon: character.id_weapon,
        idShield: character.id_shield,
        idBody: character.id_body,
        idItemWeapon: character.id_item_weapon,
        idItemBody: character.id_item_body,
        idItemShield: character.id_item_shield,
        idItemHelmet: character.id_item_helmet,
        idItemArrow: character.id_item_arrow,
        spellsAcertados: character.spells_acertados,
        spellsErrados: character.spells_errados,
        hp: character.hp,
        maxHp: character.max_hp,
        mana: character.mana,
        maxMana: character.max_mana,
        idRaza: character.id_raza,
        idGenero: character.id_genero,
        muerto: character.muerto,
        minHit: character.min_hit,
        maxHit: character.max_hit,
        attrFuerza: character.attr_fuerza,
        attrAgilidad: character.attr_agilidad,
        attrInteligencia: character.attr_inteligencia,
        attrConstitucion: character.attr_constitucion,
        privileges: character.privileges,
        countKilled: character.count_killed,
        countDie: character.count_die,
        exp: character.exp,
        expNextLevel: character.exp_next_level,
        level: character.level,
        ip: character.ip,
        banned: character.banned,
        dead: character.dead,
        criminal: character.criminal,
        faction: character.faction,
        navegando: character.navegando,
        npcMatados: character.npc_matados,
        ciudadanosMatados: character.ciudadanos_matados,
        criminalesMatados: character.criminales_matados,
        fianza: character.fianza,
        homeMap: character.home_map,
        homeX: character.home_x,
        homeY: character.home_y,
        factionScoreArmada: character.faction_score_armada,
        factionScoreCaos: character.faction_score_caos,
        factionRankArmada: character.faction_rank_armada,
        factionRankCaos: character.faction_rank_caos,
        factionRewardsArmada: character.faction_rewards_armada,
        factionRewardsCaos: character.faction_rewards_caos,
        jailMinutes: character.jail_minutes,
        jailReason: character.jail_reason,
        connected: character.connected,
        clanId: character.clan_id,
        clanName: character.clan_name ?? null,
        clanAlignment: character.clan_alignment ?? null,
        clanMinJoinLevel: character.clan_min_join_level ?? null,
        clanRole: character.clan_role ?? null,
        items: items.map((item) => ({
            idPos: item.id_pos,
            idItem: item.id_item,
            cant: item.cant,
            equipped: item.equipped,
        })),
        bankItems: bankItems.map((item) => ({
            idPos: item.id_pos,
            idItem: item.id_item,
            cant: item.cant,
        })),
        spells: spells.map((spell) => ({
            idPos: spell.id_pos,
            idSpell: spell.id_spell,
        })),
        createdAt: character.created_at,
        updatedAt: character.updated_at,
    };
}

function toRankingCharacterResponse(
    character: RankingCharacterRecord,
): RankingCharacterResponse {
    return {
        id: character.id,
        name: character.name,
        level: character.level,
        exp: character.exp,
        expNextLevel: character.exp_next_level,
        kills: character.count_killed,
        idClase: character.id_clase,
        idRaza: character.id_raza,
        criminal: Boolean(character.criminal),
        faction: character.faction,
        clanName: character.clan_name ?? null,
        headId: character.id_head,
        bodyId: character.id_body,
        updatedAt: character.updated_at,
    };
}

async function getCharacterItems(
    client: PoolClient,
    characterId: string,
): Promise<CharacterItemRecord[]> {
    const result = await client.query<CharacterItemRecord>(
        `
      SELECT id_pos, id_item, cant, equipped
      FROM character_items
      WHERE character_id = $1
      ORDER BY id_pos ASC
    `,
        [characterId],
    );

    return result.rows;
}

async function getCharacterBankItems(
    client: PoolClient,
    characterId: string,
): Promise<CharacterBankItemRecord[]> {
    const result = await client.query<CharacterBankItemRecord>(
        `
      SELECT id_pos, id_item, cant
      FROM character_bank_items
      WHERE character_id = $1
      ORDER BY id_pos ASC
    `,
        [characterId],
    );

    return result.rows;
}

async function getCharacterSpells(
    client: PoolClient,
    characterId: string,
): Promise<CharacterSpellRecord[]> {
    const result = await client.query<CharacterSpellRecord>(
        `
      SELECT id_pos, id_spell
      FROM character_spells
      WHERE character_id = $1
      ORDER BY id_pos ASC
    `,
        [characterId],
    );

    return result.rows;
}

async function getCharacterRecord(
    client: PoolClient,
    characterId: string,
): Promise<CharacterRecord | null> {
    const result = await client.query<CharacterRecord>(
        `
      SELECT c.*, cl.name AS clan_name, cl.alignment AS clan_alignment, cl.min_join_level AS clan_min_join_level, cm.role AS clan_role
      FROM characters c
      LEFT JOIN clans cl ON cl.id = c.clan_id
      LEFT JOIN clan_members cm ON cm.character_id = c.id AND cm.clan_id = c.clan_id
      WHERE c.id = $1
        AND c.deleted_at IS NULL
      LIMIT 1
    `,
        [characterId],
    );

    return result.rows[0] ?? null;
}

async function getCharacterRecordByName(
    client: PoolClient,
    name: string,
): Promise<CharacterRecord | null> {
    const result = await client.query<CharacterRecord>(
        `
      SELECT c.*, cl.name AS clan_name, cl.alignment AS clan_alignment, cl.min_join_level AS clan_min_join_level, cm.role AS clan_role
      FROM characters c
      LEFT JOIN clans cl ON cl.id = c.clan_id
      LEFT JOIN clan_members cm ON cm.character_id = c.id AND cm.clan_id = c.clan_id
      WHERE LOWER(TRIM(c.name)) = LOWER(TRIM($1))
        AND c.deleted_at IS NULL
      ORDER BY c.updated_at DESC, c.created_at DESC
      LIMIT 1
    `,
        [name],
    );

    return result.rows[0] ?? null;
}

async function getFullCharacter(
    client: PoolClient,
    characterId: string,
): Promise<CharacterApiResponse | null> {
    const character = await getCharacterRecord(client, characterId);

    if (!character) {
        return null;
    }

    const items = await getCharacterItems(client, characterId);
    const bankItems = await getCharacterBankItems(client, characterId);
    const spells = await getCharacterSpells(client, characterId);

    return toCharacterResponse(character, items, bankItems, spells);
}

export async function listCharacterRanking(options?: {
    sort?: "level" | "kills";
    classId?: number;
}): Promise<RankingListResponse> {
    const sort = options?.sort === "kills" ? "kills" : "level";
    const values: number[] = [];
    const classFilter =
        typeof options?.classId === "number" ? options.classId : null;
    const classClause =
        classFilter !== null
            ? `AND c.id_clase = $${values.push(classFilter)}`
            : "";
    const orderBy =
        sort === "kills"
            ? "count_killed DESC, c.level DESC, c.exp DESC, c.updated_at DESC, c.name ASC"
            : "c.level DESC, c.exp DESC, count_killed DESC, c.updated_at DESC, c.name ASC";

    const result = await pool.query<RankingCharacterRecord>(
        `
      SELECT
        c.id,
        c.name,
        c.level,
        c.exp,
        c.exp_next_level,
        (c.ciudadanos_matados + c.criminales_matados) AS count_killed,
        c.id_clase,
        c.id_raza,
        COALESCE(c.criminal, FALSE) AS criminal,
        COALESCE(c.faction, 'none') AS faction,
        cl.name AS clan_name,
        CASE
          WHEN (c.dead = TRUE OR c.muerto = TRUE OR c.navegando = TRUE) AND c.id_last_head > 0 THEN c.id_last_head
          ELSE c.id_head
        END AS id_head,
        c.id_body,
        c.updated_at
      FROM characters c
      LEFT JOIN clans cl ON cl.id = c.clan_id
      WHERE c.deleted_at IS NULL
        AND (c.banned IS NULL OR c.banned < NOW())
        AND COALESCE(c.privileges, 0) = 0
        ${classClause}
      ORDER BY ${orderBy}
      LIMIT 50
    `,
        values,
    );

    return {
        characters: result.rows.map(toRankingCharacterResponse),
    };
}

async function replaceItems(
    client: PoolClient,
    characterId: string,
    items: ParsedItem[],
): Promise<void> {
    const currentItems = await getCharacterItems(client, characterId);
    const currentByPos = new Map(
        currentItems.map((item) => [item.id_pos, item]),
    );
    const nextByPos = new Map(items.map((item) => [item.idPos, item]));
    const slotsToDelete = currentItems
        .filter((item) => !nextByPos.has(item.id_pos))
        .map((item) => item.id_pos);

    if (slotsToDelete.length > 0) {
        await client.query(
            `
        DELETE FROM character_items
        WHERE character_id = $1
          AND id_pos = ANY($2::int[])
      `,
            [characterId, slotsToDelete],
        );
    }

    const itemsToUpsert = items.filter((item) => {
        const current = currentByPos.get(item.idPos);
        return (
            !current ||
            current.id_item !== item.idItem ||
            current.cant !== item.cant ||
            current.equipped !== item.equipped
        );
    });

    if (itemsToUpsert.length === 0) {
        return;
    }

    const values: Array<number | boolean | string> = [];
    const placeholders = itemsToUpsert.map((item, index) => {
        const base = index * 5;
        values.push(
            characterId,
            item.idPos,
            item.idItem,
            item.cant,
            item.equipped,
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    });

    await client.query(
        `
      INSERT INTO character_items (character_id, id_pos, id_item, cant, equipped)
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (character_id, id_pos)
      DO UPDATE SET id_item = EXCLUDED.id_item,
                    cant = EXCLUDED.cant,
                    equipped = EXCLUDED.equipped
    `,
        values,
    );
}

async function replaceBankItems(
    client: PoolClient,
    characterId: string,
    items: ParsedBankItem[],
): Promise<void> {
    const currentItems = await getCharacterBankItems(client, characterId);
    const currentByPos = new Map(
        currentItems.map((item) => [item.id_pos, item]),
    );
    const nextByPos = new Map(items.map((item) => [item.idPos, item]));
    const slotsToDelete = currentItems
        .filter((item) => !nextByPos.has(item.id_pos))
        .map((item) => item.id_pos);

    if (slotsToDelete.length > 0) {
        await client.query(
            `
        DELETE FROM character_bank_items
        WHERE character_id = $1
          AND id_pos = ANY($2::int[])
      `,
            [characterId, slotsToDelete],
        );
    }

    const itemsToUpsert = items.filter((item) => {
        const current = currentByPos.get(item.idPos);
        return (
            !current ||
            current.id_item !== item.idItem ||
            current.cant !== item.cant
        );
    });

    if (itemsToUpsert.length === 0) {
        return;
    }

    const values: Array<number | string> = [];
    const placeholders = itemsToUpsert.map((item, index) => {
        const base = index * 4;
        values.push(characterId, item.idPos, item.idItem, item.cant);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    });

    await client.query(
        `
      INSERT INTO character_bank_items (character_id, id_pos, id_item, cant)
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (character_id, id_pos)
      DO UPDATE SET id_item = EXCLUDED.id_item,
                    cant = EXCLUDED.cant
    `,
        values,
    );
}

async function replaceSpells(
    client: PoolClient,
    characterId: string,
    spells: ParsedSpell[],
): Promise<void> {
    const currentSpells = await getCharacterSpells(client, characterId);
    const currentByPos = new Map(
        currentSpells.map((spell) => [spell.id_pos, spell]),
    );
    const nextByPos = new Map(spells.map((spell) => [spell.idPos, spell]));
    const slotsToDelete = currentSpells
        .filter((spell) => !nextByPos.has(spell.id_pos))
        .map((spell) => spell.id_pos);

    if (slotsToDelete.length > 0) {
        await client.query(
            `
        DELETE FROM character_spells
        WHERE character_id = $1
          AND id_pos = ANY($2::int[])
      `,
            [characterId, slotsToDelete],
        );
    }

    const spellsToUpsert = spells.filter((spell) => {
        const current = currentByPos.get(spell.idPos);
        return !current || current.id_spell !== spell.idSpell;
    });

    if (spellsToUpsert.length === 0) {
        return;
    }

    const values: Array<number | string> = [];
    const placeholders = spellsToUpsert.map((spell, index) => {
        const base = index * 3;
        values.push(characterId, spell.idPos, spell.idSpell);
        return `($${base + 1}, $${base + 2}, $${base + 3})`;
    });

    await client.query(
        `
      INSERT INTO character_spells (character_id, id_pos, id_spell)
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (character_id, id_pos)
      DO UPDATE SET id_spell = EXCLUDED.id_spell
    `,
        values,
    );
}

async function touchCharacterUpdatedAt(
    client: PoolClient,
    characterId: string,
): Promise<Date | null> {
    const result = await client.query<{ updated_at: Date }>(
        `
      UPDATE characters
      SET updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING updated_at
    `,
        [characterId],
    );

    return result.rows[0]?.updated_at ?? null;
}

async function patchCharacterCollection(
    characterId: string,
    callback: (client: PoolClient) => Promise<void>,
): Promise<{
    ok: true;
    updatedAt: string;
} | null> {
    if (!z.string().uuid().safeParse(characterId).success) {
        return null;
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const updatedAt = await touchCharacterUpdatedAt(client, characterId);

        if (!updatedAt) {
            await client.query("ROLLBACK");
            return null;
        }

        await callback(client);
        await client.query("COMMIT");

        return {
            ok: true,
            updatedAt: updatedAt.toISOString(),
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function getCharacterByAccountAndEmail(
    query: unknown,
): Promise<CharacterLookupResponse | null> {
    const { idAccount, idCharacter, email } = lookupSchema.parse(query);
    const client = await pool.connect();

    try {
        const accountResult = await client.query<AccountRecord>(
            `
        SELECT *
        FROM accounts
        WHERE id = $1
          AND email = $2
        LIMIT 1
      `,
            [idAccount, email],
        );

        const account = accountResult.rows[0];

        if (!account) {
            return null;
        }

        const characterResult = await client.query<CharacterRecord>(
            `
      SELECT c.*, cl.name AS clan_name, cl.alignment AS clan_alignment, cl.min_join_level AS clan_min_join_level, cm.role AS clan_role
      FROM characters c
      LEFT JOIN clans cl ON cl.id = c.clan_id
      LEFT JOIN clan_members cm ON cm.character_id = c.id AND cm.clan_id = c.clan_id
      WHERE c.id = $1
          AND c.account_id = $2
          AND c.deleted_at IS NULL
        LIMIT 1
      `,
            [idCharacter, idAccount],
        );

        const character = characterResult.rows[0];

        if (!character) {
            return null;
        }

        const items = await getCharacterItems(client, idCharacter);
        const bankItems = await getCharacterBankItems(client, idCharacter);
        const spells = await getCharacterSpells(client, idCharacter);

        return {
            account: {
                _id: account.id,
                name: account.name,
            },
            character: toCharacterResponse(character, items, bankItems, spells),
        };
    } finally {
        client.release();
    }
}

export async function banCharacterByName(payload: unknown): Promise<{
    characterId: string;
    name: string;
    bannedUntil: Date;
} | null> {
    const { name, bannedUntil } = moderationSchema.parse(payload);
    const client = await pool.connect();

    try {
        const character = await getCharacterRecordByName(client, name);

        if (!character) {
            return null;
        }

        const result = await client.query<{
            id: string;
            name: string;
            banned: Date | null;
        }>(
            `
        UPDATE characters
        SET banned = $2,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, banned
      `,
            [character.id, bannedUntil],
        );

        const updatedCharacter = result.rows[0];

        if (!updatedCharacter?.banned) {
            return null;
        }

        return {
            characterId: updatedCharacter.id,
            name: updatedCharacter.name,
            bannedUntil: updatedCharacter.banned,
        };
    } finally {
        client.release();
    }
}

export async function banIpByCharacterName(payload: unknown): Promise<{
    ip: string;
    name: string;
    bannedUntil: Date;
    affectedCharacters: number;
} | null> {
    const { name, bannedUntil } = moderationSchema.parse(payload);
    const client = await pool.connect();

    try {
        const character = await getCharacterRecordByName(client, name);

        if (!character) {
            return null;
        }

        if (!character.ip) {
            throw new Error("El personaje no tiene una IP registrada.");
        }

        const result = await client.query(
            `
        UPDATE characters
        SET ip_banned_until = $2,
            updated_at = NOW()
        WHERE ip = $1
      `,
            [character.ip, bannedUntil],
        );

        return {
            ip: character.ip,
            name: character.name,
            bannedUntil: new Date(bannedUntil),
            affectedCharacters: result.rowCount ?? 0,
        };
    } finally {
        client.release();
    }
}

export async function unbanCharacterByName(payload: unknown): Promise<{
    characterId: string;
    name: string;
} | null> {
    const { name } = moderationNameSchema.parse(payload);
    const client = await pool.connect();

    try {
        const character = await getCharacterRecordByName(client, name);

        if (!character) {
            return null;
        }

        const result = await client.query<{ id: string; name: string }>(
            `
        UPDATE characters
        SET banned = NULL,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, name
      `,
            [character.id],
        );

        const updatedCharacter = result.rows[0];

        if (!updatedCharacter) {
            return null;
        }

        return {
            characterId: updatedCharacter.id,
            name: updatedCharacter.name,
        };
    } finally {
        client.release();
    }
}

export async function unbanIpByCharacterName(payload: unknown): Promise<{
    ip: string;
    name: string;
    affectedCharacters: number;
} | null> {
    const { name } = moderationNameSchema.parse(payload);
    const client = await pool.connect();

    try {
        const character = await getCharacterRecordByName(client, name);

        if (!character) {
            return null;
        }

        if (!character.ip) {
            throw new Error("El personaje no tiene una IP registrada.");
        }

        const result = await client.query(
            `
        UPDATE characters
        SET ip_banned_until = NULL,
            updated_at = NOW()
        WHERE ip = $1
      `,
            [character.ip],
        );

        return {
            ip: character.ip,
            name: character.name,
            affectedCharacters: result.rowCount ?? 0,
        };
    } finally {
        client.release();
    }
}

export async function jailCharacterByName(payload: unknown): Promise<{
    characterId: string;
    name: string;
    jailMinutes: number;
    jailReason: string;
} | null> {
    const { name, jailMinutes, jailReason, map, posX, posY } =
        jailCharacterSchema.parse(payload);
    const client = await pool.connect();

    try {
        const character = await getCharacterRecordByName(client, name);

        if (!character) {
            return null;
        }

        if (Number(character.privileges ?? 0) > 0) {
            throw new Error("Cannot jail staff member");
        }

        const result = await client.query<{
            id: string;
            name: string;
            jail_minutes: number;
            jail_reason: string | null;
        }>(
            `
        UPDATE characters
        SET jail_minutes = $2,
            jail_reason = $3,
            map_id = $4,
            pos_x = $5,
            pos_y = $6,
            navegando = FALSE,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, jail_minutes, jail_reason
      `,
            [character.id, jailMinutes, jailReason, map, posX, posY],
        );

        const updatedCharacter = result.rows[0];

        if (!updatedCharacter?.jail_reason) {
            return null;
        }

        return {
            characterId: updatedCharacter.id,
            name: updatedCharacter.name,
            jailMinutes: updatedCharacter.jail_minutes,
            jailReason: updatedCharacter.jail_reason,
        };
    } finally {
        client.release();
    }
}

export async function getCharactersByAccountId(
    accountId: string,
): Promise<CharacterApiResponse[]> {
    const client = await pool.connect();

    try {
        const characterResult = await client.query<CharacterRecord>(
            `
        SELECT c.*, cl.name AS clan_name, cl.alignment AS clan_alignment, cl.min_join_level AS clan_min_join_level, cm.role AS clan_role
        FROM characters c
        LEFT JOIN clans cl ON cl.id = c.clan_id
        LEFT JOIN clan_members cm ON cm.character_id = c.id AND cm.clan_id = c.clan_id
        WHERE c.account_id = $1
          AND c.deleted_at IS NULL
        ORDER BY c.created_at ASC, c.name ASC
      `,
            [accountId],
        );

        const characters: CharacterApiResponse[] = [];

        for (const character of characterResult.rows) {
            const items = await getCharacterItems(client, character.id);
            const bankItems = await getCharacterBankItems(client, character.id);
            const spells = await getCharacterSpells(client, character.id);
            characters.push(
                toCharacterResponse(character, items, bankItems, spells),
            );
        }

        return characters;
    } finally {
        client.release();
    }
}

export async function resetAllCharactersConnectedStatus(): Promise<number> {
    const result = await pool.query(
        `
      UPDATE characters
      SET connected = FALSE,
          updated_at = NOW()
      WHERE connected = TRUE
        AND deleted_at IS NULL
    `,
    );

    return result.rowCount ?? 0;
}

export async function patchCharacter(
    characterId: string,
    patch: unknown,
): Promise<{
    ok: true;
    updatedAt: string;
} | null> {
    if (!z.string().uuid().safeParse(characterId).success) {
        return null;
    }

    const parsed = characterPatchSchema.parse(patch);
    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        if (parsed.operationId) {
            const hash = createHash('sha256').update(JSON.stringify(parsed)).digest('hex');
            const inserted = await client.query(
                `INSERT INTO character_save_receipts(operation_id,character_id,payload_hash)
                 VALUES($1,$2,$3) ON CONFLICT(operation_id) DO NOTHING RETURNING operation_id`,
                [parsed.operationId, characterId, hash],
            );
            if (!inserted.rowCount) {
                const receipt = (await client.query<{ character_id: string; payload_hash: string; response: {ok:true;updatedAt:string}|null }>(
                    'SELECT character_id,payload_hash,response FROM character_save_receipts WHERE operation_id=$1 FOR UPDATE', [parsed.operationId],
                )).rows[0];
                if (!receipt || receipt.character_id !== characterId.toLowerCase() || receipt.payload_hash !== hash || !receipt.response) {
                    throw new Error('Character save ID does not match its original operation');
                }
                await client.query('COMMIT');
                return receipt.response;
            }
        }

        const assignments: string[] = [];
        const values: unknown[] = [characterId];

        for (const [apiField, dbField] of fieldMap) {
            if (parsed[apiField] === undefined) {
                continue;
            }

            values.push(parsed[apiField]);
            assignments.push(`${dbField} = $${values.length}`);
        }

        assignments.push("updated_at = NOW()");

        const updateResult = await client.query<{ updated_at: Date }>(
            `
        UPDATE characters
        SET ${assignments.join(", ")}
        WHERE id = $1
          AND deleted_at IS NULL
        RETURNING updated_at
      `,
            values,
        );

        const updatedCharacter = updateResult.rows[0];

        if (!updatedCharacter) {
            await client.query("ROLLBACK");
            return null;
        }

        if (parsed.items) {
            await replaceItems(client, characterId, parsed.items);
        }

        if (parsed.bankItems) {
            await replaceBankItems(client, characterId, parsed.bankItems);
        }

        if (parsed.spells) {
            await replaceSpells(client, characterId, parsed.spells);
        }

        if (parsed.floorChanges?.length && !parsed.operationId) throw new Error('Ground transfer requires a durable operation ID');
        for (const change of parsed.floorChanges ?? []) {
            if (change.action === 'put') {
                await client.query(`INSERT INTO dropped_floor_items(drop_id,map_id,x,y,item_id,amount) VALUES($1,$2,$3,$4,$5,$6)
                    ON CONFLICT(map_id,x,y) DO UPDATE SET drop_id=EXCLUDED.drop_id,item_id=EXCLUDED.item_id,amount=EXCLUDED.amount`,
                    [change.dropId,change.map,change.x,change.y,change.itemId,change.amount]);
            } else {
                const removed = await client.query('DELETE FROM dropped_floor_items WHERE drop_id=$1 RETURNING drop_id',[change.dropId]);
                if (!removed.rowCount) throw new Error('Ground item is no longer available');
            }
        }

        const response = { ok: true as const, updatedAt: updateResult.rows[0].updated_at.toISOString() };
        if (parsed.operationId) {
            await client.query('UPDATE character_save_receipts SET response=$2::jsonb WHERE operation_id=$1', [parsed.operationId, JSON.stringify(response)]);
        }
        await client.query("COMMIT");
        return response;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function patchCharacterItems(
    characterId: string,
    items: unknown,
): Promise<{
    ok: true;
    updatedAt: string;
} | null> {
    const parsedItems = z.array(itemSchema).parse(items);

    return patchCharacterCollection(characterId, async (client) => {
        await replaceItems(client, characterId, parsedItems);
    });
}

export async function patchCharacterBankItems(
    characterId: string,
    bankItems: unknown,
): Promise<{
    ok: true;
    updatedAt: string;
} | null> {
    const parsedBankItems = z.array(bankItemSchema).parse(bankItems);

    return patchCharacterCollection(characterId, async (client) => {
        await replaceBankItems(client, characterId, parsedBankItems);
    });
}

export async function patchCharacterStorage(
    characterId: string,
    payload: unknown,
): Promise<{
    ok: true;
    updatedAt: string;
} | null> {
    const parsedStorage = storagePatchSchema.parse(payload);

    return patchCharacterCollection(characterId, async (client) => {
        await replaceItems(client, characterId, parsedStorage.items);
        await replaceBankItems(client, characterId, parsedStorage.bankItems);
    });
}

export async function patchCharacterSpells(
    characterId: string,
    spells: unknown,
): Promise<{
    ok: true;
    updatedAt: string;
} | null> {
    const parsedSpells = z.array(spellSchema).parse(spells);

    return patchCharacterCollection(characterId, async (client) => {
        await replaceSpells(client, characterId, parsedSpells);
    });
}

export async function claimCharacterConnection(characterId: string, accountId?: string): Promise<
    | {
          ok: true;
          updatedAt: string;
      }
    | {
          ok: false;
          reason: "not_found" | "already_connected";
      }
> {
    if (!z.string().uuid().safeParse(characterId).success) {
        return {
            ok: false,
            reason: "not_found",
        };
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        const owner=(await client.query("SELECT account_id FROM characters WHERE id=$1 FOR UPDATE",[characterId])).rows[0];
        if(owner&&(!accountId||owner.account_id===accountId)) await assertPlayableCharacter(characterId,accountId??owner.account_id,client);

        const claimedResult = await client.query<{ updated_at: Date }>(
            `
        UPDATE characters
        SET connected = TRUE,
            updated_at = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
          AND connected = FALSE
          AND economy_lock IS NULL
          AND ($2::uuid IS NULL OR account_id=$2)
        RETURNING updated_at
      `,
            [characterId,accountId??null],
        );

        const updatedCharacter = claimedResult.rows[0];

        if (!updatedCharacter) {
            const characterResult = await client.query<{ connected: boolean }>(
                `
          SELECT connected
          FROM characters
          WHERE id = $1
            AND deleted_at IS NULL
          LIMIT 1
        `,
                [characterId],
            );

            await client.query("ROLLBACK");

            if (!characterResult.rowCount) {
                return {
                    ok: false,
                    reason: "not_found",
                };
            }

            return {
                ok: false,
                reason: "already_connected",
            };
        }

        await client.query(
            `
        UPDATE game_tickets
        SET consumed_at = NOW()
        WHERE character_id = $1
          AND mode = 'world'
          AND consumed_at IS NULL
      `,
            [characterId],
        );

        await client.query("COMMIT");

        return {
            ok: true,
            updatedAt: updatedCharacter.updated_at.toISOString(),
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function releaseCharacterConnection(characterId: string): Promise<{
    ok: true;
    updatedAt: string;
} | null> {
    if (!z.string().uuid().safeParse(characterId).success) {
        return null;
    }

    const result = await pool.query<{ updated_at: Date }>(
        `
      UPDATE characters
      SET connected = FALSE,
          updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING updated_at
    `,
        [characterId],
    );

    const updatedCharacter = result.rows[0];

    if (!updatedCharacter) {
        return null;
    }

    return {
        ok: true,
        updatedAt: updatedCharacter.updated_at.toISOString(),
    };
}

