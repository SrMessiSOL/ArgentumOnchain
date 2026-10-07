import { z } from "zod";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import pool from "../db";

const vaultItemSchema = z.object({
    idPos: z.coerce.number().int(),
    idItem: z.coerce.number().int().positive(),
    cant: z.coerce.number().int().positive(),
});

function ensureUniqueSlots<T extends { idPos: number }>(
    items: T[],
    label: string,
) {
    const seen = new Set<number>();

    for (const item of items) {
        if (seen.has(item.idPos)) {
            throw new Error(`${label} contiene slots repetidos`);
        }

        seen.add(item.idPos);
    }
}

const syncVaultSchema = z
    .object({
        operationId: z.string().uuid().optional(),
        characterId: z.string().uuid().optional(),
        characterGold: z.coerce
            .number()
            .int()
            .min(0)
            .max(2147483647)
            .optional(),
        characterItems: z
            .array(
                z.object({
                    idPos: z.coerce.number().int(),
                    idItem: z.coerce.number().int().positive(),
                    cant: z.coerce.number().int().positive(),
                    equipped: z
                        .union([z.boolean(), z.number().int()])
                        .transform((value) => Boolean(value)),
                }),
            )
            .optional(),
        gold: z.coerce.number().int().min(0).max(2147483647).optional(),
        items: z.array(vaultItemSchema).optional(),
    })
    .superRefine((payload, context) => {
        try {
            if (payload.items) {
                ensureUniqueSlots(payload.items, "items");
            }

            if (payload.characterItems) {
                ensureUniqueSlots(payload.characterItems, "characterItems");
            }
        } catch (error) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                    error instanceof Error ? error.message : "Payload invalido",
                path: [],
            });
        }
    });

type VaultItem = z.infer<typeof vaultItemSchema>;
type SyncVaultPayload = z.infer<typeof syncVaultSchema>;

type VaultScope = "account" | "clan";

type VaultStateResponse = {
    gold: number;
    items: VaultItem[];
};

const scopeConfig = {
    account: {
        idSchema: z.string().uuid(),
        ownerTable: "accounts",
        ownerColumn: "account_id",
        vaultTable: "account_vaults",
        itemsTable: "account_vault_items",
        characterRelationField: "account_id",
    },
    clan: {
        idSchema: z.string().uuid(),
        ownerTable: "clans",
        ownerColumn: "clan_id",
        vaultTable: "clan_vaults",
        itemsTable: "clan_vault_items",
        characterRelationField: "clan_id",
    },
} as const;

async function ensureOwnerExists(
    client: PoolClient,
    scope: VaultScope,
    ownerId: string,
): Promise<void> {
    const config = scopeConfig[scope];
    const result = await client.query(
        `
            SELECT id
            FROM ${config.ownerTable}
            WHERE id = $1
            LIMIT 1
        `,
        [ownerId],
    );

    if (!result.rowCount) {
        throw new Error(
            scope === "account" ? "Cuenta invalida" : "Clan invalido",
        );
    }
}

async function ensureVaultRow(
    client: PoolClient,
    scope: VaultScope,
    ownerId: string,
): Promise<void> {
    const config = scopeConfig[scope];
    await client.query(
        `
            INSERT INTO ${config.vaultTable} (${config.ownerColumn})
            VALUES ($1)
            ON CONFLICT (${config.ownerColumn}) DO NOTHING
        `,
        [ownerId],
    );
}

async function getVaultItems(
    client: PoolClient,
    scope: VaultScope,
    ownerId: string,
): Promise<VaultItem[]> {
    const config = scopeConfig[scope];
    const result = await client.query<{
        id_pos: number;
        id_item: number;
        cant: number;
    }>(
        `
            SELECT id_pos, id_item, cant
            FROM ${config.itemsTable}
            WHERE ${config.ownerColumn} = $1
            ORDER BY id_pos ASC
        `,
        [ownerId],
    );

    return result.rows.map((item) => ({
        idPos: item.id_pos,
        idItem: item.id_item,
        cant: item.cant,
    }));
}

async function replaceVaultItems(
    client: PoolClient,
    scope: VaultScope,
    ownerId: string,
    items: VaultItem[],
): Promise<void> {
    const config = scopeConfig[scope];
    const currentItems = await getVaultItems(client, scope, ownerId);
    const currentByPos = new Map(
        currentItems.map((item) => [item.idPos, item]),
    );
    const nextByPos = new Map(items.map((item) => [item.idPos, item]));
    const slotsToDelete = currentItems
        .filter((item) => !nextByPos.has(item.idPos))
        .map((item) => item.idPos);

    if (slotsToDelete.length > 0) {
        await client.query(
            `
                DELETE FROM ${config.itemsTable}
                WHERE ${config.ownerColumn} = $1
                  AND id_pos = ANY($2::int[])
            `,
            [ownerId, slotsToDelete],
        );
    }

    const itemsToUpsert = items.filter((item) => {
        const current = currentByPos.get(item.idPos);
        return (
            !current ||
            current.idItem !== item.idItem ||
            current.cant !== item.cant
        );
    });

    if (!itemsToUpsert.length) {
        return;
    }

    const values: Array<number | string> = [];
    const placeholders = itemsToUpsert.map((item, index) => {
        const base = index * 4;
        values.push(ownerId, item.idPos, item.idItem, item.cant);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    });

    await client.query(
        `
            INSERT INTO ${config.itemsTable} (${config.ownerColumn}, id_pos, id_item, cant)
            VALUES ${placeholders.join(", ")}
            ON CONFLICT (${config.ownerColumn}, id_pos)
            DO UPDATE SET id_item = EXCLUDED.id_item,
                          cant = EXCLUDED.cant
        `,
        values,
    );
}

async function replaceCharacterItems(
    client: PoolClient,
    characterId: string,
    items: NonNullable<SyncVaultPayload["characterItems"]>,
): Promise<void> {
    const currentItemsResult = await client.query<{
        id_pos: number;
        id_item: number;
        cant: number;
        equipped: boolean;
    }>(
        `
            SELECT id_pos, id_item, cant, equipped
            FROM character_items
            WHERE character_id = $1
            ORDER BY id_pos ASC
        `,
        [characterId],
    );
    const currentItems = currentItemsResult.rows;
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

    if (!itemsToUpsert.length) {
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

async function getVaultState(
    client: PoolClient,
    scope: VaultScope,
    ownerId: string,
): Promise<VaultStateResponse> {
    const config = scopeConfig[scope];
    await ensureOwnerExists(client, scope, ownerId);
    await ensureVaultRow(client, scope, ownerId);
    const goldResult = await client.query<{ gold: number }>(
        `
            SELECT gold
            FROM ${config.vaultTable}
            WHERE ${config.ownerColumn} = $1
            LIMIT 1
        `,
        [ownerId],
    );

    return {
        gold: goldResult.rows[0]?.gold ?? 0,
        items: await getVaultItems(client, scope, ownerId),
    };
}

async function syncVault(
    scope: VaultScope,
    ownerId: string,
    payload: unknown,
): Promise<{ ok: true; updatedAt: string }> {
    const parsedOwnerId = scopeConfig[scope].idSchema.parse(ownerId);
    const parsed = syncVaultSchema.parse(payload);
    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        if (parsed.operationId) {
            const hash = createHash('sha256').update(JSON.stringify(parsed)).digest('hex');
            const inserted = await client.query(
                `INSERT INTO vault_operation_receipts(operation_id, scope, owner_id, payload_hash)
                 VALUES ($1,$2,$3,$4) ON CONFLICT (operation_id) DO NOTHING RETURNING operation_id`,
                [parsed.operationId, scope, parsedOwnerId, hash],
            );
            if (!inserted.rowCount) {
                const receipt = (await client.query<{
                    scope: string; owner_id: string; payload_hash: string;
                    response: { ok: true; updatedAt: string } | null;
                }>('SELECT scope, owner_id, payload_hash, response FROM vault_operation_receipts WHERE operation_id=$1 FOR UPDATE', [parsed.operationId])).rows[0];
                if (!receipt || receipt.scope !== scope || receipt.owner_id !== parsedOwnerId || receipt.payload_hash !== hash || !receipt.response) {
                    throw new Error('Vault operation ID does not match its original transfer');
                }
                await client.query('COMMIT');
                return receipt.response;
            }
        }
        await ensureOwnerExists(client, scope, parsedOwnerId);
        await ensureVaultRow(client, scope, parsedOwnerId);

        if (parsed.characterId) {
            const characterResult = await client.query<{
                id: string;
                account_id: string;
                clan_id: string | null;
            }>(
                `
                    SELECT id, account_id, clan_id
                    FROM characters
                    WHERE id = $1
                      AND deleted_at IS NULL
                    LIMIT 1
                    FOR UPDATE
                `,
                [parsed.characterId],
            );
            const character = characterResult.rows[0];

            if (!character) {
                throw new Error("Personaje invalido");
            }

            const relationValue =
                scope === "account" ? character.account_id : character.clan_id;

            if (relationValue !== parsedOwnerId) {
                throw new Error(
                    scope === "account"
                        ? "El personaje no pertenece a esa cuenta"
                        : "El personaje no pertenece a ese clan",
                );
            }

            if (typeof parsed.characterGold === "number") {
                await client.query(
                    `
                        UPDATE characters
                        SET gold = $2,
                            updated_at = NOW()
                        WHERE id = $1
                    `,
                    [parsed.characterId, parsed.characterGold],
                );
            }

            if (parsed.characterItems) {
                await replaceCharacterItems(
                    client,
                    parsed.characterId,
                    parsed.characterItems,
                );
            }
        }

        if (typeof parsed.gold === "number") {
            const config = scopeConfig[scope];
            await client.query(
                `
                    UPDATE ${config.vaultTable}
                    SET gold = $2,
                        updated_at = NOW()
                    WHERE ${config.ownerColumn} = $1
                `,
                [parsedOwnerId, parsed.gold],
            );
        }

        if (parsed.items) {
            await replaceVaultItems(client, scope, parsedOwnerId, parsed.items);
            const config = scopeConfig[scope];
            await client.query(
                `
                    UPDATE ${config.vaultTable}
                    SET updated_at = NOW()
                    WHERE ${config.ownerColumn} = $1
                `,
                [parsedOwnerId],
            );
        }

        const config = scopeConfig[scope];
        const updatedResult = await client.query<{ updated_at: Date }>(
            `
                SELECT updated_at
                FROM ${config.vaultTable}
                WHERE ${config.ownerColumn} = $1
                LIMIT 1
            `,
            [parsedOwnerId],
        );

        const result = {
            ok: true as const,
            updatedAt:
                updatedResult.rows[0]?.updated_at.toISOString() ??
                new Date().toISOString(),
        };
        if (parsed.operationId) {
            await client.query('UPDATE vault_operation_receipts SET response=$2::jsonb WHERE operation_id=$1', [parsed.operationId, JSON.stringify(result)]);
        }
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function getAccountVault(
    accountId: string,
): Promise<VaultStateResponse> {
    const client = await pool.connect();

    try {
        return await getVaultState(client, "account", accountId);
    } finally {
        client.release();
    }
}

export async function getClanVault(
    clanId: string,
): Promise<VaultStateResponse> {
    const client = await pool.connect();

    try {
        return await getVaultState(client, "clan", clanId);
    } finally {
        client.release();
    }
}

export async function syncAccountVault(accountId: string, payload: unknown) {
    return syncVault("account", accountId, payload);
}

export async function syncClanVault(clanId: string, payload: unknown) {
    return syncVault("clan", clanId, payload);
}
