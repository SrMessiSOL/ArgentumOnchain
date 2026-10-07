import {assertPlayableCharacter} from "../game-asset-policy";
import crypto from "crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import pool from "../db";
import config from "../config";
import {
    CHARACTER_CLASSES,
    CHARACTER_GENDERS,
    CHARACTER_RACES,
    CLASS_ID_MAP,
    GENDER_ID_MAP,
    getAllowedAppearance,
    getBaseStats,
    isValidHeadId,
    RACE_ID_MAP,
    type CharacterClassKey,
    type RaceKey,
} from "../lib/characterCreation";
import { sendPasswordResetEmail } from "../lib/email";
import { hashPassword, verifyPassword } from "../lib/passwords";
import {
    DISPLAY_NAME_MAX_LENGTH,
    isValidDisplayName,
    sanitizeName,
} from "../lib/text";
import { getCharactersByAccountId } from "./characters";
import type {
    AccountRecord,
    ArenaGameTicketConsumeResponse,
    AuthCharacterSummary,
    AuthResponse,
    AuthSessionRecord,
    GameTicketRecord,
    GameTicketResponse,
    PasswordResetTokenRecord,
    PublicAuthSessionWithSelection,
} from "../types";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const GAME_TICKET_TTL_MS = 1000 * 60;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 30;
const PASSWORD_RESET_EMAIL_COOLDOWN_MS = 1000 * 60;
const PASSWORD_RESET_EMAIL_WINDOW_MS = 1000 * 60 * 60;
const PASSWORD_RESET_EMAIL_MAX_PER_WINDOW = 3;
const PASSWORD_RESET_IP_WINDOW_MS = 1000 * 60 * 60;
const PASSWORD_RESET_IP_MAX_PER_WINDOW = 10;

const resetRequestMessage = {
    message:
        "Si existe una cuenta con ese email, te enviamos un link para recuperar la password.",
};

function normalizeIp(rawIp?: string | null): string | null {
    if (!rawIp) {
        return null;
    }

    const ip = rawIp.trim();

    if (!ip) {
        return null;
    }

    if (ip.startsWith("::ffff:")) {
        return ip.slice(7);
    }

    return ip;
}

async function hasActiveIpBan(
    client: PoolClient,
    rawIp?: string | null,
): Promise<boolean> {
    const ip = normalizeIp(rawIp);

    if (!ip) {
        return false;
    }

    const result = await client.query<{ id: string }>(
        `
      SELECT id
      FROM characters
      WHERE ip = $1
        AND ip_banned_until IS NOT NULL
        AND ip_banned_until > NOW()
      LIMIT 1
    `,
        [ip],
    );

    return (result.rowCount ?? 0) > 0;
}

function hasActiveCharacterBan(bannedUntil?: Date | null): boolean {
    return Boolean(bannedUntil && bannedUntil > new Date());
}

function hasActiveCharacterIpBan(ipBannedUntil?: Date | null): boolean {
    return Boolean(ipBannedUntil && ipBannedUntil > new Date());
}

const displayNameSchema = z
    .string()
    .trim()
    .min(3)
    .max(DISPLAY_NAME_MAX_LENGTH)
    .refine(isValidDisplayName, {
        message:
            "El nombre solo puede contener letras de la A a la Z y espacios",
    });

const loginSchema = z
    .object({
        identifier: z.string().trim().min(1).max(254).optional(),
        email: z.string().trim().min(1).max(254).optional(),
        password: z.string().min(1).max(100),
    })
    .transform(({ identifier, email, password }) => ({
        identifier: identifier?.trim() || email?.trim() || "",
        password,
    }))
    .refine((value) => value.identifier.length > 0, {
        message: "El email o nombre de usuario es obligatorio",
        path: ["identifier"],
    });

const registerSchema = z.object({
    name: displayNameSchema,
    email: z.string().email(),
    password: z.string().min(8).max(100),
});

const passwordResetRequestSchema = z.object({
    email: z.string().trim().email(),
});

const passwordResetConfirmSchema = z.object({
    token: z.string().trim().min(43).max(128),
    password: z.string().min(8).max(100),
});

const createCharacterSchema = z
    .object({
        name: displayNameSchema,
        class: z.enum(CHARACTER_CLASSES),
        race: z.enum(CHARACTER_RACES),
        gender: z.enum(CHARACTER_GENDERS),
        headId: z.coerce.number().int().positive(),
    })
    .strict();

type StarterInventoryItem = {
    idItem: number;
    amount: number;
    equipped?: boolean;
};

function getStarterLoadout(
    classKey: CharacterClassKey,
    raceKey: RaceKey,
): {
    items: StarterInventoryItem[];
    spells: number[];
} {
    const isLowRace = raceKey === "enano" || raceKey === "gnomo";
    const items: StarterInventoryItem[] = [
        { idItem: 857, amount: 500 },
        { idItem: 467, amount: 100 },
        { idItem: 468, amount: 50 },
    ];

    if (classKey !== "guerrero" && classKey !== "cazador") {
        items.push({ idItem: 856, amount: 250 });
    }

    if (classKey !== "mago") {
        items.push({ idItem: 855, amount: 100 });
        items.push({ idItem: 858, amount: 100 });
    }

    if (
        ["mago", "clerigo", "bardo", "druida", "paladin", "asesino"].includes(
            classKey,
        )
    ) {
        const spells = [2];

        switch (classKey) {
            case "mago":
                items.push({ idItem: 862, amount: 1 });
                items.push({ idItem: isLowRace ? 1045 : 1044, amount: 1 });
                return { items, spells };
            case "clerigo":
                items.push({ idItem: 861, amount: 1 });
                items.push({ idItem: 1048, amount: 1 });
                items.push({ idItem: 1051, amount: 1 });
                items.push({ idItem: isLowRace ? 1047 : 1046, amount: 1 });
                return { items, spells };
            case "bardo":
                items.push({ idItem: 864, amount: 1 });
                items.push({ idItem: 1051, amount: 1 });
                items.push({ idItem: isLowRace ? 1045 : 1044, amount: 1 });
                return { items, spells };
            case "druida":
                items.push({ idItem: 863, amount: 1 });
                items.push({ idItem: isLowRace ? 1045 : 1044, amount: 1 });
                return { items, spells };
            case "paladin":
                items.push({ idItem: 861, amount: 1 });
                items.push({ idItem: 1048, amount: 1 });
                items.push({ idItem: 1051, amount: 1 });
                items.push({ idItem: isLowRace ? 1047 : 1046, amount: 1 });
                return { items, spells };
            case "asesino":
                items.push({ idItem: 460, amount: 1 });
                items.push({ idItem: 861, amount: 1 });
                items.push({ idItem: 1048, amount: 1 });
                items.push({ idItem: 1051, amount: 1 });
                items.push({ idItem: isLowRace ? 1047 : 1046, amount: 1 });
                return { items, spells };
        }
    }

    switch (classKey) {
        case "guerrero":
            items.push({ idItem: 861, amount: 1 });
            items.push({ idItem: 1048, amount: 1 });
            items.push({ idItem: 1051, amount: 1 });
            items.push({ idItem: isLowRace ? 1047 : 1046, amount: 1 });
            return { items, spells: [] };
        case "cazador":
            items.push({ idItem: 859, amount: 1 });
            items.push({ idItem: 860, amount: 500 });
            items.push({ idItem: 1052, amount: 1 });
            items.push({ idItem: isLowRace ? 1047 : 1046, amount: 1 });
            return { items, spells: [] };
    }

    return { items, spells: [] };
}

function createSessionToken(): string {
    return crypto.randomBytes(32).toString("base64url");
}

function createOpaqueTicket(): string {
    return crypto.randomBytes(32).toString("base64url");
}

function hashOpaqueToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function getPasswordResetUrl(token: string): string {
    return `${config.siteUrl}/reset-password/${encodeURIComponent(token)}`;
}

function getPasswordResetTokenRecord(
    token: string,
): Promise<PasswordResetTokenRecord | null> {
    return pool
        .query<PasswordResetTokenRecord>(
            `
      SELECT id, account_id, token_hash, requested_ip, created_at, expires_at, consumed_at
      FROM password_reset_tokens
      WHERE token_hash = $1
      LIMIT 1
    `,
            [hashOpaqueToken(token)],
        )
        .then((result) => result.rows[0] ?? null);
}

async function enforcePasswordResetRateLimit(
    client: PoolClient,
    normalizedEmail: string,
    ip: string | null,
): Promise<void> {
    const emailHash = hashOpaqueToken(normalizedEmail);

    const [emailCooldownResult, emailCountResult, ipCountResult] =
        await Promise.all([
            client.query<{ created_at: Date }>(
                `
        SELECT created_at
        FROM password_reset_requests
        WHERE email_hash = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
                [emailHash],
            ),
            client.query<{ count: string }>(
                `
        SELECT COUNT(*)::text AS count
        FROM password_reset_requests
        WHERE email_hash = $1
          AND created_at > NOW() - ($2 * INTERVAL '1 millisecond')
      `,
                [emailHash, PASSWORD_RESET_EMAIL_WINDOW_MS],
            ),
            ip
                ? client.query<{ count: string }>(
                      `
            SELECT COUNT(*)::text AS count
            FROM password_reset_requests
            WHERE requested_ip = $1
              AND created_at > NOW() - ($2 * INTERVAL '1 millisecond')
          `,
                      [ip, PASSWORD_RESET_IP_WINDOW_MS],
                  )
                : Promise.resolve({ rows: [{ count: "0" }] }),
        ]);

    const lastEmailRequest =
        emailCooldownResult.rows[0]?.created_at?.getTime() ?? 0;

    if (Date.now() - lastEmailRequest < PASSWORD_RESET_EMAIL_COOLDOWN_MS) {
        throw new Error("RATE_LIMIT");
    }

    if (
        Number(emailCountResult.rows[0]?.count ?? 0) >=
        PASSWORD_RESET_EMAIL_MAX_PER_WINDOW
    ) {
        throw new Error("RATE_LIMIT");
    }

    if (
        Number(ipCountResult.rows[0]?.count ?? 0) >=
        PASSWORD_RESET_IP_MAX_PER_WINDOW
    ) {
        throw new Error("RATE_LIMIT");
    }

    await client.query(
        `
      INSERT INTO password_reset_requests (email_hash, requested_ip)
      VALUES ($1, $2)
    `,
        [emailHash, ip],
    );
}

function toAuthCharacterSummary(
    character: Awaited<ReturnType<typeof getCharactersByAccountId>>[number],
): AuthCharacterSummary {
    const useLastAppearance = character.navegando;
    const classNameById: Record<number, string> = {
        1: "Mago",
        2: "ClÃ©rigo",
        3: "Guerrero",
        4: "Asesino",
        6: "Bardo",
        7: "Druida",
        8: "PaladÃ­n",
        9: "Cazador",
    };
    const raceNameById: Record<number, string> = {
        1: "Humano",
        2: "Elfo",
        3: "Elfo Drow",
        4: "Enano",
        5: "Gnomo",
    };

    return {
        _id: character._id,
        name: character.name,
        level: character.level,
        map: character.map,
        className:
            classNameById[character.idClase] ?? `Clase ${character.idClase}`,
        raceName: raceNameById[character.idRaza] ?? `Raza ${character.idRaza}`,
        isAdministrator: character.privileges === 1,
        criminal: character.criminal,
        faction: character.faction,
        clanName: character.clanName ?? null,
        id_head:
            useLastAppearance && character.idLastHead > 0
                ? character.idLastHead
                : character.idHead,
        id_body:
            useLastAppearance && character.idLastBody > 0
                ? character.idLastBody
                : character.idBody,
        id_weapon:
            useLastAppearance && character.idLastWeapon > 0
                ? character.idLastWeapon
                : character.idWeapon,
        id_shield:
            useLastAppearance && character.idLastShield > 0
                ? character.idLastShield
                : character.idShield,
        id_helmet:
            useLastAppearance && character.idLastHelmet > 0
                ? character.idLastHelmet
                : character.idHelmet,
    };
}

function toPublicSession(
    account: AccountRecord,
    characters: Awaited<ReturnType<typeof getCharactersByAccountId>>,
    selectedCharacterId: string | null,
): PublicAuthSessionWithSelection {
    const normalizedSelectedCharacterId =
        selectedCharacterId &&
        characters.some((character) => character._id === selectedCharacterId)
            ? selectedCharacterId
            : null;

    return {
        account: {
            _id: account.id,
            name: account.name,
            email: account.email,
        },
        characters: characters.map(toAuthCharacterSummary),
        selectedCharacterId: normalizedSelectedCharacterId,
    };
}

async function createAuthSession(account: AccountRecord): Promise<string> {
    const token = createSessionToken();

    await pool.query(
        `
      INSERT INTO auth_sessions (token, account_id, expires_at)
      VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 millisecond'))
    `,
        [token, account.id, SESSION_TTL_MS],
    );

    return token;
}

async function buildAuthResponse(
    account: AccountRecord,
): Promise<AuthResponse> {
    const [characters, sessionToken] = await Promise.all([
        getCharactersByAccountId(account.id),
        createAuthSession(account),
    ]);

    return {
        sessionToken,
        ...toPublicSession(account, characters, null),
    };
}

async function getSessionRecord(
    token: string,
): Promise<AuthSessionRecord | null> {
    const sessionResult = await pool.query<AuthSessionRecord>(
        `
      UPDATE auth_sessions
      SET expires_at = NOW() + ($2 * INTERVAL '1 millisecond')
      WHERE token = $1
        AND expires_at > NOW()
      RETURNING token, account_id, selected_character_id, created_at, expires_at
    `,
        [token, SESSION_TTL_MS],
    );

    return sessionResult.rows[0] ?? null;
}

export async function createCharacterForSession(
    token: string,
    payload: unknown,
): Promise<PublicAuthSessionWithSelection | null> {
    const session = await getSessionRecord(token);

    if (!session) {
        return null;
    }

    const parsed = createCharacterSchema.parse(payload);
    const characterName = parsed.name.trim();

    const existingCharacter = await pool.query<{ id: string }>(
        `
      SELECT id
      FROM characters
      WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
        AND deleted_at IS NULL
      LIMIT 1
    `,
        [characterName],
    );

    if (existingCharacter.rowCount) {
        throw new Error("Ese nombre de personaje ya esta en uso");
    }

    const idClase = CLASS_ID_MAP[parsed.class];
    const idRaza = RACE_ID_MAP[parsed.race];
    const idGenero = GENDER_ID_MAP[parsed.gender];
    const appearance = getAllowedAppearance(parsed.race, parsed.gender);
    const baseStats = getBaseStats(parsed.class, parsed.race);
    const starterLoadout = getStarterLoadout(parsed.class, parsed.race);

    if (!isValidHeadId(parsed.race, parsed.gender, parsed.headId)) {
        throw new Error(
            "La cabeza seleccionada no corresponde a la raza y genero elegidos",
        );
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const characterResult = await client.query<{ id: string }>(
            `
      INSERT INTO characters (
        account_id,
        name,
        id_clase,
        map_id,
        pos_x,
        pos_y,
        gold,
        id_head,
        id_last_head,
        id_last_body,
        id_last_helmet,
        id_last_weapon,
        id_last_shield,
        id_helmet,
        id_weapon,
        id_shield,
        id_body,
        id_item_weapon,
        id_item_body,
        id_item_shield,
        id_item_helmet,
        id_item_arrow,
        spells_acertados,
        spells_errados,
        hp,
        max_hp,
        mana,
        max_mana,
        id_raza,
        id_genero,
        muerto,
        min_hit,
        max_hit,
        attr_fuerza,
        attr_agilidad,
        attr_inteligencia,
        attr_constitucion,
        privileges,
        count_killed,
        count_die,
        exp,
        exp_next_level,
        level,
        dead,
        criminal,
        navegando,
        npc_matados,
        ciudadanos_matados,
        criminales_matados,
        fianza,
        home_map,
        home_x,
        home_y,
        connected
      )
      VALUES (
        $1,
        $2,
        $3,
        1,
        50,
        60,
        0,
        $4,
        $4,
        $5,
        0,
        0,
        0,
        0,
        0,
        0,
        $5,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        $6,
        $6,
        $7,
        $7,
        $8,
        $9,
        FALSE,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15,
        0,
        0,
        0,
        0,
        $16,
        1,
        FALSE,
        FALSE,
        FALSE,
        0,
        0,
        0,
        0,
        1,
        54,
        60,
        FALSE
      )
      RETURNING id
    `,
            [
                session.account_id,
                characterName,
                idClase,
                parsed.headId,
                appearance.bodyId,
                baseStats.hp,
                baseStats.mana,
                idRaza,
                idGenero,
                baseStats.minHit,
                baseStats.maxHit,
                baseStats.fuerza,
                baseStats.agilidad,
                baseStats.inteligencia,
                baseStats.constitucion,
                baseStats.expNextLevel,
            ],
        );

        const characterId = characterResult.rows[0]?.id;

        if (!characterId) {
            throw new Error("No se pudo crear el personaje");
        }

        if (starterLoadout.items.length > 0) {
            const itemValues: Array<string | number | boolean> = [];
            const itemPlaceholders = starterLoadout.items.map((item, index) => {
                const base = index * 5;
                itemValues.push(
                    characterId,
                    index + 1,
                    item.idItem,
                    item.amount,
                    Boolean(item.equipped),
                );
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
            });

            await client.query(
                `
          INSERT INTO character_items (character_id, id_pos, id_item, cant, equipped)
          VALUES ${itemPlaceholders.join(", ")}
        `,
                itemValues,
            );
        }

        if (starterLoadout.spells.length > 0) {
            const spellValues: Array<string | number> = [];
            const spellPlaceholders = starterLoadout.spells.map(
                (spellId, index) => {
                    const base = index * 3;
                    spellValues.push(characterId, index, spellId);
                    return `($${base + 1}, $${base + 2}, $${base + 3})`;
                },
            );

            await client.query(
                `
          INSERT INTO character_spells (character_id, id_pos, id_spell)
          VALUES ${spellPlaceholders.join(", ")}
        `,
                spellValues,
            );
        }

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    return getPublicSessionByToken(token);
}

export async function loginAccount(payload: unknown): Promise<AuthResponse> {
    const { identifier, password } = loginSchema.parse(payload);
    const normalizedIdentifier = normalizeEmail(identifier);
    const sanitizedIdentifier = sanitizeName(identifier);

    const result = await pool.query<AccountRecord>(
        `
      SELECT *
      FROM accounts
      WHERE LOWER(email) = $1 OR name_sanitized = $2
      LIMIT 1
    `,
        [normalizedIdentifier, sanitizedIdentifier],
    );

    const account = result.rows[0];

    if (!account?.password) {
        throw new Error("Credenciales invalidas");
    }

    const isValid = await verifyPassword(password, account.password);

    if (!isValid) {
        throw new Error("Credenciales invalidas");
    }

    return buildAuthResponse(account);
}

export async function registerAccount(payload: unknown): Promise<AuthResponse> {
    const { name, email, password } = registerSchema.parse(payload);
    const nameSanitized = sanitizeName(name);
    const normalizedEmail = normalizeEmail(email);

    const existingAccount = await pool.query<{ id: string }>(
        `
      SELECT id
      FROM accounts
      WHERE LOWER(email) = $1 OR name_sanitized = $2
      LIMIT 1
    `,
        [normalizedEmail, nameSanitized],
    );

    if (existingAccount.rowCount) {
        throw new Error("Ya existe una cuenta con ese email o nombre");
    }

    const hashedPassword = await hashPassword(password);

    const accountResult = await pool.query<AccountRecord>(
        `
      INSERT INTO accounts (name, name_sanitized, email, password)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
        [name.trim(), nameSanitized, normalizedEmail, hashedPassword],
    );

    const account = accountResult.rows[0];

    return buildAuthResponse(account);
}

export async function requestPasswordReset(
    payload: unknown,
    rawIp?: string | null,
): Promise<{ message: string }> {
    const { email } = passwordResetRequestSchema.parse(payload);
    const normalizedEmail = normalizeEmail(email);
    const ip = normalizeIp(rawIp);
    const client = await pool.connect();

    let account: Pick<AccountRecord, "id" | "email" | "name"> | null = null;
    let resetToken: string | null = null;

    try {
        await client.query("BEGIN");
        await enforcePasswordResetRateLimit(client, normalizedEmail, ip);

        const accountResult = await client.query<
            Pick<AccountRecord, "id" | "email" | "name">
        >(
            `
        SELECT id, email, name
        FROM accounts
        WHERE LOWER(email) = $1
        LIMIT 1
      `,
            [normalizedEmail],
        );

        account = accountResult.rows[0] ?? null;

        if (account) {
            resetToken = createOpaqueTicket();

            await client.query(
                `
          UPDATE password_reset_tokens
          SET consumed_at = NOW()
          WHERE account_id = $1
            AND consumed_at IS NULL
        `,
                [account.id],
            );

            await client.query(
                `
          INSERT INTO password_reset_tokens (account_id, token_hash, requested_ip, expires_at)
          VALUES ($1, $2, $3, NOW() + ($4 * INTERVAL '1 millisecond'))
        `,
                [
                    account.id,
                    hashOpaqueToken(resetToken),
                    ip,
                    PASSWORD_RESET_TTL_MS,
                ],
            );
        }

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");

        if (error instanceof Error && error.message === "RATE_LIMIT") {
            return resetRequestMessage;
        }

        throw error;
    } finally {
        client.release();
    }

    if (account && resetToken) {
        try {
            const preference = await pool.query<{locale:string}>("SELECT locale FROM account_preferences WHERE account_id = $1", [account.id]);
            await sendPasswordResetEmail({
                locale: preference.rows[0]?.locale === 'es' ? 'es' : 'en',
                to: account.email,
                displayName: account.name,
                resetUrl: getPasswordResetUrl(resetToken),
            });
        } catch (error) {
            await pool.query(
                `
          DELETE FROM password_reset_tokens
          WHERE token_hash = $1
        `,
                [hashOpaqueToken(resetToken)],
            );

            throw error;
        }
    }

    return resetRequestMessage;
}

export async function getPasswordResetStatus(
    token: string,
): Promise<{ valid: boolean }> {
    const resetToken = await getPasswordResetTokenRecord(token.trim());

    if (!resetToken) {
        return { valid: false };
    }

    const isValid =
        !resetToken.consumed_at && resetToken.expires_at.getTime() > Date.now();
    return { valid: isValid };
}

export async function confirmPasswordReset(
    payload: unknown,
): Promise<{ message: string }> {
    const { token, password } = passwordResetConfirmSchema.parse(payload);
    const tokenHash = hashOpaqueToken(token);
    const nextPasswordHash = await hashPassword(password);
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const tokenResult = await client.query<PasswordResetTokenRecord>(
            `
        SELECT id, account_id, token_hash, requested_ip, created_at, expires_at, consumed_at
        FROM password_reset_tokens
        WHERE token_hash = $1
        LIMIT 1
        FOR UPDATE
      `,
            [tokenHash],
        );

        const resetToken = tokenResult.rows[0];

        if (
            !resetToken ||
            resetToken.consumed_at ||
            resetToken.expires_at.getTime() <= Date.now()
        ) {
            throw new Error("TOKEN_INVALIDO");
        }

        await client.query(
            `
        UPDATE accounts
        SET password = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
            [nextPasswordHash, resetToken.account_id],
        );

        await client.query(
            `
        UPDATE password_reset_tokens
        SET consumed_at = NOW()
        WHERE id = $1
      `,
            [resetToken.id],
        );

        await client.query(
            `
        DELETE FROM auth_sessions
        WHERE account_id = $1
      `,
            [resetToken.account_id],
        );

        await client.query(
            `
        DELETE FROM password_reset_tokens
        WHERE account_id = $1
          AND id <> $2
      `,
            [resetToken.account_id, resetToken.id],
        );

        await client.query("COMMIT");
        return {
            message:
                "La password se actualizo correctamente. Inicia sesion con tu nueva clave.",
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function getPublicSessionByToken(
    token: string,
): Promise<PublicAuthSessionWithSelection | null> {
    const session = await getSessionRecord(token);

    if (!session) {
        return null;
    }

    const accountResult = await pool.query<AccountRecord>(
        `
      SELECT *
      FROM accounts
      WHERE id = $1
      LIMIT 1
    `,
        [session.account_id],
    );

    const account = accountResult.rows[0];

    if (!account) {
        return null;
    }

    const characters = await getCharactersByAccountId(account.id);

    return toPublicSession(account, characters, session.selected_character_id);
}

export async function deleteCharacterForSession(
    token: string,
    characterId: string,
): Promise<PublicAuthSessionWithSelection | null> {
    const parsedCharacterId = z.string().uuid().safeParse(characterId.trim());

    if (!parsedCharacterId.success) {
        throw new Error("Personaje invalido");
    }

    const session = await getSessionRecord(token);

    if (!session) {
        return null;
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const characterResult = await client.query<{
            id: string;
            connected: boolean;
            banned: Date | null;
        }>(
            `
        SELECT id, connected, banned
        FROM characters
        WHERE id = $1
          AND account_id = $2
          AND economy_lock IS NULL
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
      `,
            [parsedCharacterId.data, session.account_id],
        );

        if (!characterResult.rowCount) {
            throw new Error("Personaje invalido");
        }

        if (characterResult.rows[0]?.connected) {
            throw new Error("No se puede borrar un personaje conectado");
        }

        if (hasActiveCharacterBan(characterResult.rows[0]?.banned)) {
            throw new Error("No se puede borrar un personaje baneado");
        }

        await client.query(
            `
        UPDATE characters
        SET deleted_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `,
            [parsedCharacterId.data],
        );

        await client.query(
            `
        DELETE FROM game_tickets
        WHERE character_id = $1
      `,
            [parsedCharacterId.data],
        );

        await client.query(
            `
        UPDATE auth_sessions
        SET selected_character_id = NULL
        WHERE account_id = $1
          AND selected_character_id = $2
      `,
            [session.account_id, parsedCharacterId.data],
        );

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    return getPublicSessionByToken(token);
}

export async function logoutSession(token: string): Promise<void> {
    await pool.query(
        `
      DELETE FROM game_tickets
      WHERE auth_token = $1
    `,
        [token],
    );

    await pool.query(
        `
      DELETE FROM auth_sessions
      WHERE token = $1
    `,
        [token],
    );
}

export async function createGameTicket(
    token: string,
): Promise<GameTicketResponse | null> {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const sessionResult = await client.query<AuthSessionRecord>(
            `
        SELECT token, account_id, selected_character_id, created_at, expires_at
        FROM auth_sessions
        WHERE token = $1
          AND expires_at > NOW()
        LIMIT 1
        FOR UPDATE
      `,
            [token],
        );

        const session = sessionResult.rows[0];

        if (!session || !session.selected_character_id) {
            await client.query("ROLLBACK");
            return null;
        }

        const characterResult = await client.query<{
            id: string;
            banned: Date | null;
            ip_banned_until: Date | null;
        }>(
            `
        SELECT id, banned, ip_banned_until
        FROM characters
        WHERE id = $1
          AND account_id = $2
          AND economy_lock IS NULL
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
      `,
            [session.selected_character_id, session.account_id],
        );

        if (characterResult.rowCount) await assertPlayableCharacter(session.selected_character_id!, session.account_id, client);
        if (!characterResult.rowCount) {
            await client.query("ROLLBACK");
            return null;
        }

        if (hasActiveCharacterBan(characterResult.rows[0]?.banned)) {
            await client.query("ROLLBACK");
            throw new Error("Tu personaje se encuentra baneado.");
        }

        if (hasActiveCharacterIpBan(characterResult.rows[0]?.ip_banned_until)) {
            await client.query("ROLLBACK");
            throw new Error("Tu personaje tiene un ban de IP activo.");
        }

        await client.query(
            `
        UPDATE game_tickets
        SET consumed_at = NOW()
        WHERE character_id = $1
          AND mode = 'world'
          AND consumed_at IS NULL
      `,
            [session.selected_character_id],
        );

        const ticket = createOpaqueTicket();
        const result = await client.query<{ expires_at: Date }>(
            `
        INSERT INTO game_tickets (ticket, auth_token, account_id, character_id, expires_at)
        VALUES ($1, $2, $3, $4, NOW() + ($5 * INTERVAL '1 millisecond'))
        RETURNING expires_at
      `,
            [
                ticket,
                token,
                session.account_id,
                session.selected_character_id,
                GAME_TICKET_TTL_MS,
            ],
        );

        await client.query("COMMIT");

        return {
            ticket,
            expiresAt: result.rows[0].expires_at,
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function consumeGameTicket(
    ticket: string,
    clientIp?: string | null,
): Promise<
    | {
          account: { _id: string; name: string; email: string };
          character: Awaited<
              ReturnType<typeof getCharactersByAccountId>
          >[number];
      }
    | ArenaGameTicketConsumeResponse
    | null
> {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const ticketResult = await client.query<GameTicketRecord>(
            `
        SELECT ticket, account_id, character_id, auth_token, mode, arena_room_id, pvp_template_id, created_at, expires_at, consumed_at
        FROM game_tickets
        WHERE ticket = $1
          AND consumed_at IS NULL
          AND expires_at > NOW()
        LIMIT 1
        FOR UPDATE
      `,
            [ticket],
        );

        const storedTicket = ticketResult.rows[0];

        if (!storedTicket || storedTicket.mode === "arena") {
            await client.query("ROLLBACK");
            return null;
        }

        if (await hasActiveIpBan(client, clientIp)) {
            await client.query("ROLLBACK");
            throw new Error("Tu IP se encuentra baneada.");
        }

        if (storedTicket.mode !== "arena") {
            const characterResult = await client.query<{
                id: string;
                banned: Date | null;
                ip_banned_until: Date | null;
            }>(
                `
          SELECT id, banned, ip_banned_until
          FROM characters
          WHERE id = $1
            AND account_id = $2
            AND economy_lock IS NULL
            AND deleted_at IS NULL
          LIMIT 1
          FOR UPDATE
        `,
                [storedTicket.character_id, storedTicket.account_id],
            );

            if (characterResult.rowCount) await assertPlayableCharacter(storedTicket.character_id!, storedTicket.account_id, client);
        if (!characterResult.rowCount) {
                await client.query("ROLLBACK");
                return null;
            }

            if (hasActiveCharacterBan(characterResult.rows[0]?.banned)) {
                await client.query("ROLLBACK");
                throw new Error("Tu personaje se encuentra baneado.");
            }

            if (
                hasActiveCharacterIpBan(
                    characterResult.rows[0]?.ip_banned_until,
                )
            ) {
                await client.query("ROLLBACK");
                throw new Error("Tu personaje tiene un ban de IP activo.");
            }
        }

        await client.query("UPDATE characters SET economy_login_until=NOW()+INTERVAL '30 seconds' WHERE id=$1 AND economy_lock IS NULL",[storedTicket.character_id]);
        await client.query(
            `
        UPDATE game_tickets
        SET consumed_at = NOW()
        WHERE ticket = $1
      `,
            [ticket],
        );

        const accountResult = await client.query<AccountRecord>(
            `
        SELECT *
        FROM accounts
        WHERE id = $1
        LIMIT 1
      `,
            [storedTicket.account_id],
        );

        const account = accountResult.rows[0];

        if (!account) {
            await client.query("ROLLBACK");
            return null;
        }

        await client.query("COMMIT");

        if (storedTicket.mode === "arena") {
            if (
                !storedTicket.arena_room_id ||
                storedTicket.pvp_template_id === null
            ) {
                return null;
            }

            const roomResult = await pool.query<{
                id: string;
                name: string;
                map_id: number;
            }>(
                `
          SELECT id, name, map_id
          FROM arena_rooms
          WHERE id = $1
          LIMIT 1
        `,
                [storedTicket.arena_room_id],
            );

            const room = roomResult.rows[0];

            if (!room) {
                return null;
            }

            return {
                mode: "arena",
                account: {
                    _id: account.id,
                    name: account.name,
                    email: account.email,
                },
                arena: {
                    roomId: room.id,
                    roomName: room.name,
                    mapId: room.map_id,
                    pvpTemplateId: storedTicket.pvp_template_id,
                },
            };
        }

        const characters = await getCharactersByAccountId(account.id);
        const character =
            characters.find(
                (entry) => entry._id === storedTicket.character_id,
            ) ?? null;

        if (!character) {
            return null;
        }

        return {
            account: {
                _id: account.id,
                name: account.name,
                email: account.email,
            },
            character,
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function selectSessionCharacter(
    token: string,
    characterId: string,
): Promise<PublicAuthSessionWithSelection | null> {
    const sessionResult = await pool.query<AuthSessionRecord>(
        `
      SELECT token, account_id, selected_character_id, created_at, expires_at
      FROM auth_sessions
      WHERE token = $1
        AND expires_at > NOW()
      LIMIT 1
    `,
        [token],
    );

    const session = sessionResult.rows[0];

    if (!session) {
        return null;
    }

    const characterMatch = await pool.query<{
        id: string;
        banned: Date | null;
        ip_banned_until: Date | null;
    }>(
        `
      SELECT id, banned, ip_banned_until
      FROM characters
      WHERE id = $1
        AND account_id = $2
        AND deleted_at IS NULL
      LIMIT 1
    `,
        [characterId, session.account_id],
    );

    if (characterMatch.rowCount) await assertPlayableCharacter(characterId,session.account_id);
    if (!characterMatch.rowCount) {
        throw new Error("Personaje invalido");
    }

    if (hasActiveCharacterBan(characterMatch.rows[0]?.banned)) {
        throw new Error("Tu personaje se encuentra baneado.");
    }

    if (hasActiveCharacterIpBan(characterMatch.rows[0]?.ip_banned_until)) {
        throw new Error("Tu personaje tiene un ban de IP activo.");
    }

    await pool.query(
        `
      UPDATE auth_sessions
      SET selected_character_id = $2
      WHERE token = $1
    `,
        [token, characterId],
    );

    return getPublicSessionByToken(token);
}




