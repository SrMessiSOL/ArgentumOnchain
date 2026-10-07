import { createHash } from 'node:crypto';
import { z } from "zod";
import type { PoolClient } from "pg";
import pool from "../db";

const MARKET_MAX_ACTIVE_LISTINGS_PER_ACCOUNT = 20;

const characterItemSchema = z.object({
    idPos: z.coerce.number().int(),
    idItem: z.coerce.number().int().positive(),
    cant: z.coerce.number().int().positive(),
    equipped: z
        .union([z.boolean(), z.number().int()])
        .transform((value) => Boolean(value)),
});

const createMarketListingSchema = z.object({
    operationId: z.string().uuid(),
    sellerCharacterId: z.string().uuid(),
    sellerAccountId: z.string().uuid().optional(),
    sellerName: z.string().trim().min(1).max(50),
    itemId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int().positive(),
    price: z.coerce.number().int().positive().max(2147483647),
    publicationFee: z.coerce.number().int().min(0).max(2147483647),
    durationHours: z.coerce.number().int().min(1).max(72),
    characterGold: z.coerce.number().int().min(0).max(2147483647),
    characterItems: z.array(characterItemSchema),
});

const buyMarketListingSchema = z.object({
    operationId: z.string().uuid(),
    buyerCharacterId: z.string().uuid(),
    buyerName: z.string().trim().min(1).max(50),
    listingId: z.string().uuid(),
    expectedItemId: z.coerce.number().int().positive().optional(),
    expectedQuantity: z.coerce.number().int().positive().optional(),
    expectedPrice: z.coerce
        .number()
        .int()
        .positive()
        .max(2147483647)
        .optional(),
    characterGold: z.coerce.number().int().min(0).max(2147483647),
    characterItems: z.array(characterItemSchema),
});

const cancelMarketListingSchema = z.object({
    operationId: z.string().uuid(),
    sellerCharacterId: z.string().uuid(),
    listingId: z.string().uuid(),
});

const claimMarketSchema = z.object({
    claimIds: z.array(z.string().uuid()).min(1).max(1000).refine(ids => new Set(ids).size === ids.length, "Duplicate claims"),
    operationId: z.string().uuid(),
    characterId: z.string().uuid(),
    characterGold: z.coerce.number().int().min(0).max(2147483647),
    characterItems: z.array(characterItemSchema),
});

const listMarketListingsSchema = z.object({
    search: z.string().trim().max(80).optional(),
    sellerCharacterId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    sortPrice: z.enum(["recent", "asc", "desc"]).optional(),
    includeInactive: z
        .union([z.boolean(), z.string(), z.number().int()])
        .transform((value) => value === true || value === "true" || value === 1)
        .optional(),
});

type CharacterItem = z.infer<typeof characterItemSchema>;
type CreateMarketListingPayload = z.infer<typeof createMarketListingSchema>;
type BuyMarketListingPayload = z.infer<typeof buyMarketListingSchema>;
type CancelMarketListingPayload = z.infer<typeof cancelMarketListingSchema>;
type ClaimMarketPayload = z.infer<typeof claimMarketSchema>;
type ListMarketListingsInput = z.infer<typeof listMarketListingsSchema>;

export type MarketListingRecord = {
    id: string;
    sellerCharacterId: string;
    sellerName: string;
    buyerCharacterId: string | null;
    buyerName: string | null;
    itemId: number;
    quantity: number;
    price: number;
    publicationFee: number;
    status: "active" | "sold" | "expired" | "cancelled";
    expiresAt: string;
    soldAt: string | null;
    createdAt: string;
};

export type MarketClaimRecord = {
    id: string;
    ownerCharacterId: string;
    claimType: "gold" | "item";
    goldAmount: number;
    itemId: number | null;
    itemQuantity: number | null;
    sourceListingId: string | null;
    createdAt: string;
};

export type CancelForbiddenMarketListingsResult = {
    cancelledListings: number;
    refundedPublicationFees: number;
};

function ensureUniqueCharacterSlots(items: CharacterItem[]) {
    const seen = new Set<number>();

    for (const item of items) {
        if (seen.has(item.idPos)) {
            throw new Error("characterItems contiene slots repetidos");
        }

        seen.add(item.idPos);
    }
}

async function replaceCharacterItems(
    client: PoolClient,
    characterId: string,
    items: CharacterItem[],
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

async function ensureCharacterExists(
    client: PoolClient,
    characterId: string,
): Promise<void> {
    const result = await client.query(
        `
            SELECT id
            FROM characters
            WHERE id = $1
              AND deleted_at IS NULL
            LIMIT 1
        `,
        [characterId],
    );

    if (!result.rowCount) {
        throw new Error("Personaje invalido");
    }
}

async function countActiveMarketListingsByAccount(
    client: PoolClient,
    characterId: string,
    accountId?: string,
): Promise<number> {
    const result = accountId
        ? await client.query<{ count: string }>(
              `
                  SELECT COUNT(*)::text AS count
                  FROM market_listings ml
                  INNER JOIN characters seller ON seller.id = ml.seller_character_id
                  WHERE seller.account_id = $1
                    AND ml.status = 'active'
              `,
              [accountId],
          )
        : await client.query<{ count: string }>(
              `
                  SELECT COUNT(*)::text AS count
                  FROM market_listings ml
                  INNER JOIN characters seller ON seller.id = ml.seller_character_id
                  WHERE seller.account_id = (
                      SELECT account_id
                      FROM characters
                      WHERE id = $1
                      LIMIT 1
                  )
                    AND ml.status = 'active'
              `,
              [characterId],
          );

    return Number(result.rows[0]?.count ?? 0);
}

async function expireMarketListings(client: PoolClient): Promise<void> {
    await client.query(
        `
            WITH expired AS (
                UPDATE market_listings
                SET status = 'expired',
                    updated_at = NOW()
                WHERE status = 'active'
                  AND expires_at <= NOW()
                RETURNING id, seller_character_id, item_id, quantity
            )
            INSERT INTO market_claims (
                owner_character_id,
                claim_type,
                gold_amount,
                item_id,
                item_quantity,
                source_listing_id
            )
            SELECT seller_character_id,
                   'item',
                   0,
                   item_id,
                   quantity,
                   id
            FROM expired
        `,
    );
}

function mapMarketListing(row: {
    id: string;
    seller_character_id: string;
    seller_name: string;
    buyer_character_id: string | null;
    buyer_name: string | null;
    item_id: number;
    quantity: number;
    price: number;
    publication_fee: number;
    status: MarketListingRecord["status"];
    expires_at: Date;
    sold_at: Date | null;
    created_at: Date;
}): MarketListingRecord {
    return {
        id: row.id,
        sellerCharacterId: row.seller_character_id,
        sellerName: row.seller_name,
        buyerCharacterId: row.buyer_character_id,
        buyerName: row.buyer_name,
        itemId: row.item_id,
        quantity: row.quantity,
        price: row.price,
        publicationFee: row.publication_fee,
        status: row.status,
        expiresAt: row.expires_at.toISOString(),
        soldAt: row.sold_at ? row.sold_at.toISOString() : null,
        createdAt: row.created_at.toISOString(),
    };
}

function mapMarketClaim(row: {
    id: string;
    owner_character_id: string;
    claim_type: MarketClaimRecord["claimType"];
    gold_amount: number;
    item_id: number | null;
    item_quantity: number | null;
    source_listing_id: string | null;
    created_at: Date;
}): MarketClaimRecord {
    return {
        id: row.id,
        ownerCharacterId: row.owner_character_id,
        claimType: row.claim_type,
        goldAmount: row.gold_amount,
        itemId: row.item_id,
        itemQuantity: row.item_quantity,
        sourceListingId: row.source_listing_id,
        createdAt: row.created_at.toISOString(),
    };
}

export async function listMarketListings(input: ListMarketListingsInput) {
    const parsed = listMarketListingsSchema.parse(input);
    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        await expireMarketListings(client);

        const values: Array<string | number> = [];
        const whereClauses: string[] = [];

        if (!parsed.includeInactive) {
            values.push("active");
            whereClauses.push(`status = $${values.length}`);
        }

        if (parsed.sellerCharacterId) {
            values.push(parsed.sellerCharacterId);
            whereClauses.push(`seller_character_id = $${values.length}`);
        }

        if (parsed.search) {
            values.push(`%${parsed.search.toLowerCase()}%`);
            whereClauses.push(`LOWER(seller_name) LIKE $${values.length}`);
        }

        values.push(parsed.limit ?? 20);
        const whereSql = whereClauses.length
            ? `WHERE ${whereClauses.join(" AND ")}`
            : "";
        const orderBySql =
            parsed.sortPrice === "asc"
                ? "price ASC, created_at ASC"
                : parsed.sortPrice === "desc"
                  ? "price DESC, created_at ASC"
                  : "created_at DESC";
        const result = await client.query<{
            id: string;
            seller_character_id: string;
            seller_name: string;
            buyer_character_id: string | null;
            buyer_name: string | null;
            item_id: number;
            quantity: number;
            price: number;
            publication_fee: number;
            status: MarketListingRecord["status"];
            expires_at: Date;
            sold_at: Date | null;
            created_at: Date;
        }>(
            `
                SELECT id,
                       seller_character_id,
                       seller_name,
                       buyer_character_id,
                       buyer_name,
                       item_id,
                       quantity,
                       price,
                       publication_fee,
                       status,
                       expires_at,
                       sold_at,
                       created_at
                FROM market_listings
                ${whereSql}
                ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END,
                         ${orderBySql}
                LIMIT $${values.length}
            `,
            values,
        );

        await client.query("COMMIT");
        return { listings: result.rows.map(mapMarketListing) };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function getMarketClaims(characterId: string) {
    const parsedCharacterId = z.string().uuid().parse(characterId);
    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        await ensureCharacterExists(client, parsedCharacterId);
        await expireMarketListings(client);

        const result = await client.query<{
            id: string;
            owner_character_id: string;
            claim_type: MarketClaimRecord["claimType"];
            gold_amount: number;
            item_id: number | null;
            item_quantity: number | null;
            source_listing_id: string | null;
            created_at: Date;
        }>(
            `
                SELECT market_claims.id,
                       market_claims.owner_character_id,
                       market_claims.claim_type,
                       market_claims.gold_amount,
                       COALESCE(market_claims.item_id, market_listings.item_id) AS item_id,
                       COALESCE(market_claims.item_quantity, market_listings.quantity) AS item_quantity,
                       market_claims.source_listing_id,
                       market_claims.created_at
                FROM market_claims
                LEFT JOIN market_listings ON market_listings.id = market_claims.source_listing_id
                WHERE market_claims.owner_character_id = $1
                ORDER BY market_claims.created_at ASC, market_claims.id ASC
            `,
            [parsedCharacterId],
        );

        await client.query("COMMIT");
        return { claims: result.rows.map(mapMarketClaim) };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

async function marketReplay<T>(client:PoolClient,operationId:string|undefined,action:string,payload:unknown):Promise<T|null>{
 if(!operationId)return null;
 const hash=createHash('sha256').update(JSON.stringify({action,payload})).digest('hex');
 const inserted=await client.query('INSERT INTO market_operation_receipts(operation_id,payload_hash) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING operation_id',[operationId,hash]);
 if(inserted.rowCount)return null;
 const row=(await client.query('SELECT payload_hash,response FROM market_operation_receipts WHERE operation_id=$1 FOR UPDATE',[operationId])).rows[0];
 if(!row||row.payload_hash!==hash||!row.response)throw Error('Market operation ID does not match original request');
 return row.response as T;
}
async function recordMarketReceipt(client:PoolClient,operationId:string|undefined,response:unknown){
 if(operationId)await client.query('UPDATE market_operation_receipts SET response=$2::jsonb WHERE operation_id=$1',[operationId,JSON.stringify(response)]);
}

export async function createMarketListing(payload: CreateMarketListingPayload) {
    const parsed = createMarketListingSchema.parse(payload);
    ensureUniqueCharacterSlots(parsed.characterItems);
    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        const replay=await marketReplay<{ok:true;listing:MarketListingRecord}>(client,parsed.operationId,"createMarketListing",parsed);
        if(replay){await client.query("COMMIT");return replay;}
        await ensureCharacterExists(client, parsed.sellerCharacterId);
        await expireMarketListings(client);

        const activeListingsCount = await countActiveMarketListingsByAccount(
            client,
            parsed.sellerCharacterId,
            parsed.sellerAccountId,
        );

        if (activeListingsCount >= MARKET_MAX_ACTIVE_LISTINGS_PER_ACCOUNT) {
            throw new Error(
                `La cuenta ya tiene ${MARKET_MAX_ACTIVE_LISTINGS_PER_ACCOUNT} publicaciones activas en simultáneo.`,
            );
        }

        await replaceCharacterItems(
            client,
            parsed.sellerCharacterId,
            parsed.characterItems,
        );
        await client.query(
            `
                UPDATE characters
                SET gold = $2,
                    updated_at = NOW()
                WHERE id = $1
            `,
            [parsed.sellerCharacterId, parsed.characterGold],
        );

        const result = await client.query<{
            id: string;
            seller_character_id: string;
            seller_name: string;
            buyer_character_id: string | null;
            buyer_name: string | null;
            item_id: number;
            quantity: number;
            price: number;
            publication_fee: number;
            status: MarketListingRecord["status"];
            expires_at: Date;
            sold_at: Date | null;
            created_at: Date;
        }>(
            `
                INSERT INTO market_listings (
                    seller_character_id,
                    seller_name,
                    item_id,
                    quantity,
                    price,
                    publication_fee,
                    expires_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($7::text || ' hours')::interval)
                RETURNING id,
                          seller_character_id,
                          seller_name,
                          buyer_character_id,
                          buyer_name,
                          item_id,
                          quantity,
                          price,
                          publication_fee,
                          status,
                          expires_at,
                          sold_at,
                          created_at
            `,
            [
                parsed.sellerCharacterId,
                parsed.sellerName,
                parsed.itemId,
                parsed.quantity,
                parsed.price,
                parsed.publicationFee,
                parsed.durationHours,
            ],
        );

        const response = {ok:true as const,...{ listing: mapMarketListing(result.rows[0]) }};
        await recordMarketReceipt(client,parsed.operationId,response);
        await client.query("COMMIT");
        return response;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function buyMarketListing(payload: BuyMarketListingPayload) {
    const parsed = buyMarketListingSchema.parse(payload);
    ensureUniqueCharacterSlots(parsed.characterItems);
    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        const replay=await marketReplay<{ok:true;listing:MarketListingRecord}>(client,parsed.operationId,"buyMarketListing",parsed);
        if(replay){await client.query("COMMIT");return replay;}
        await ensureCharacterExists(client, parsed.buyerCharacterId);
        await expireMarketListings(client);

        const listingResult = await client.query<{
            id: string;
            seller_character_id: string;
            seller_name: string;
            buyer_character_id: string | null;
            buyer_name: string | null;
            item_id: number;
            quantity: number;
            price: number;
            publication_fee: number;
            status: MarketListingRecord["status"];
            expires_at: Date;
            sold_at: Date | null;
            created_at: Date;
        }>(
            `
                SELECT id,
                       seller_character_id,
                       seller_name,
                       buyer_character_id,
                       buyer_name,
                       item_id,
                       quantity,
                       price,
                       publication_fee,
                       status,
                       expires_at,
                       sold_at,
                       created_at
                FROM market_listings
                WHERE id = $1
                FOR UPDATE
            `,
            [parsed.listingId],
        );

        const listing = listingResult.rows[0];

        if (!listing) {
            throw new Error("La publicación no existe.");
        }

        if (listing.status !== "active") {
            throw new Error("La publicación ya no está disponible.");
        }

        if (listing.seller_character_id === parsed.buyerCharacterId) {
            throw new Error("No puedes comprar tu propia publicación.");
        }

        if (
            (parsed.expectedItemId !== undefined &&
                listing.item_id !== parsed.expectedItemId) ||
            (parsed.expectedQuantity !== undefined &&
                listing.quantity !== parsed.expectedQuantity) ||
            (parsed.expectedPrice !== undefined &&
                listing.price !== parsed.expectedPrice)
        ) {
            throw new Error(
                "La publicación cambió. Actualiza el mercado antes de comprar.",
            );
        }

        await replaceCharacterItems(
            client,
            parsed.buyerCharacterId,
            parsed.characterItems,
        );
        await client.query(
            `
                UPDATE characters
                SET gold = $2,
                    updated_at = NOW()
                WHERE id = $1
            `,
            [parsed.buyerCharacterId, parsed.characterGold],
        );
        await client.query(
            `
                UPDATE market_listings
                SET status = 'sold',
                    buyer_character_id = $2,
                    buyer_name = $3,
                    sold_at = NOW(),
                    updated_at = NOW()
                WHERE id = $1
            `,
            [parsed.listingId, parsed.buyerCharacterId, parsed.buyerName],
        );
        await client.query(
            `
                INSERT INTO market_claims (
                    owner_character_id,
                    claim_type,
                    gold_amount,
                    source_listing_id
                )
                VALUES ($1, 'gold', $2, $3)
            `,
            [listing.seller_character_id, listing.price, parsed.listingId],
        );
        await client.query(
            `
                INSERT INTO market_claims (
                    owner_character_id,
                    claim_type,
                    gold_amount,
                    item_id,
                    item_quantity,
                    source_listing_id
                )
                VALUES ($1, 'item', 0, $2, $3, $4)
            `,
            [
                parsed.buyerCharacterId,
                listing.item_id,
                listing.quantity,
                parsed.listingId,
            ],
        );

        const response = {ok:true as const,...{ listing: mapMarketListing(listing) }};
        await recordMarketReceipt(client,parsed.operationId,response);
        await client.query("COMMIT");
        return response;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function cancelMarketListing(payload: CancelMarketListingPayload) {
    const parsed = cancelMarketListingSchema.parse(payload);
    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        const replay=await marketReplay<{ok:true;listing:MarketListingRecord}>(client,parsed.operationId,"cancelMarketListing",parsed);
        if(replay){await client.query("COMMIT");return replay;}
        await ensureCharacterExists(client, parsed.sellerCharacterId);
        await expireMarketListings(client);

        const listingResult = await client.query<{
            id: string;
            seller_character_id: string;
            seller_name: string;
            buyer_character_id: string | null;
            buyer_name: string | null;
            item_id: number;
            quantity: number;
            price: number;
            publication_fee: number;
            status: MarketListingRecord["status"];
            expires_at: Date;
            sold_at: Date | null;
            created_at: Date;
        }>(
            `
                SELECT id,
                       seller_character_id,
                       seller_name,
                       buyer_character_id,
                       buyer_name,
                       item_id,
                       quantity,
                       price,
                       publication_fee,
                       status,
                       expires_at,
                       sold_at,
                       created_at
                FROM market_listings
                WHERE id = $1
                FOR UPDATE
            `,
            [parsed.listingId],
        );

        const listing = listingResult.rows[0];

        if (!listing) {
            throw new Error("La publicación no existe.");
        }

        if (listing.seller_character_id !== parsed.sellerCharacterId) {
            throw new Error("La publicación no te pertenece.");
        }

        if (listing.status !== "active") {
            throw new Error("Solo puedes cancelar publicaciones activas.");
        }

        await client.query(
            `
                UPDATE market_listings
                SET status = 'cancelled',
                    updated_at = NOW()
                WHERE id = $1
            `,
            [parsed.listingId],
        );
        await client.query(
            `
                INSERT INTO market_claims (
                    owner_character_id,
                    claim_type,
                    gold_amount,
                    item_id,
                    item_quantity,
                    source_listing_id
                )
                VALUES ($1, 'item', 0, $2, $3, $4)
            `,
            [
                parsed.sellerCharacterId,
                listing.item_id,
                listing.quantity,
                parsed.listingId,
            ],
        );

        const response = {ok:true as const,...{ listing: mapMarketListing(listing) }};
        await recordMarketReceipt(client,parsed.operationId,response);
        await client.query("COMMIT");
        return response;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function cancelForbiddenMarketListings(
    itemIds: number[],
): Promise<CancelForbiddenMarketListingsResult> {
    const sanitizedItemIds = Array.from(
        new Set(
            itemIds.filter((itemId) => Number.isInteger(itemId) && itemId > 0),
        ),
    ).sort((left, right) => left - right);

    if (!sanitizedItemIds.length) {
        return { cancelledListings: 0, refundedPublicationFees: 0 };
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        await expireMarketListings(client);

        const cancelledResult = await client.query<{
            id: string;
            seller_character_id: string;
            item_id: number;
            quantity: number;
            publication_fee: number;
        }>(
            `
                WITH cancelled AS (
                    UPDATE market_listings
                    SET status = 'cancelled',
                        updated_at = NOW()
                    WHERE status = 'active'
                      AND item_id = ANY($1::int[])
                    RETURNING id, seller_character_id, item_id, quantity, publication_fee
                ),
                item_claims AS (
                    INSERT INTO market_claims (
                        owner_character_id,
                        claim_type,
                        gold_amount,
                        item_id,
                        item_quantity,
                        source_listing_id
                    )
                    SELECT seller_character_id,
                           'item',
                           0,
                           item_id,
                           quantity,
                           id
                    FROM cancelled
                ),
                gold_claims AS (
                    INSERT INTO market_claims (
                        owner_character_id,
                        claim_type,
                        gold_amount,
                        source_listing_id
                    )
                    SELECT seller_character_id,
                           'gold',
                           publication_fee,
                           id
                    FROM cancelled
                    WHERE publication_fee > 0
                )
                SELECT id, seller_character_id, item_id, quantity, publication_fee
                FROM cancelled
            `,
            [sanitizedItemIds],
        );

        await client.query("COMMIT");

        return {
            cancelledListings: cancelledResult.rows.length,
            refundedPublicationFees: cancelledResult.rows.reduce(
                (total, row) =>
                    total + Math.max(0, Number(row.publication_fee ?? 0)),
                0,
            ),
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function claimMarket(payload: ClaimMarketPayload) {
    const parsed = claimMarketSchema.parse(payload);
    ensureUniqueCharacterSlots(parsed.characterItems);
    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        const replay=await marketReplay<{ok:true;claims:MarketClaimRecord[]}>(client,parsed.operationId,"claimMarket",parsed);
        if(replay){await client.query("COMMIT");return replay;}
        await ensureCharacterExists(client, parsed.characterId);
        await expireMarketListings(client);

        const claimsResult = await client.query<{
            id: string;
            owner_character_id: string;
            claim_type: MarketClaimRecord["claimType"];
            gold_amount: number;
            item_id: number | null;
            item_quantity: number | null;
            source_listing_id: string | null;
            created_at: Date;
        }>(
            `
                SELECT market_claims.id,
                       market_claims.owner_character_id,
                       market_claims.claim_type,
                       market_claims.gold_amount,
                       COALESCE(market_claims.item_id, market_listings.item_id) AS item_id,
                       COALESCE(market_claims.item_quantity, market_listings.quantity) AS item_quantity,
                       market_claims.source_listing_id,
                       market_claims.created_at
                FROM market_claims
                LEFT JOIN market_listings ON market_listings.id = market_claims.source_listing_id
                WHERE market_claims.owner_character_id = $1 AND market_claims.id = ANY($2::uuid[])
                ORDER BY market_claims.created_at ASC, market_claims.id ASC
                FOR UPDATE OF market_claims
            `,
            [parsed.characterId, parsed.claimIds],
        );

        if (claimsResult.rows.length !== parsed.claimIds.length) {
            throw new Error("No tienes reclamos pendientes.");
        }

        await replaceCharacterItems(
            client,
            parsed.characterId,
            parsed.characterItems,
        );
        await client.query(
            `
                UPDATE characters
                SET gold = $2,
                    updated_at = NOW()
                WHERE id = $1
            `,
            [parsed.characterId, parsed.characterGold],
        );
        await client.query(
            `
                DELETE FROM market_claims
                WHERE owner_character_id = $1 AND id = ANY($2::uuid[])
            `,
            [parsed.characterId, parsed.claimIds],
        );

        const response = {ok:true as const,...{ claims: claimsResult.rows.map(mapMarketClaim) }};
        await recordMarketReceipt(client,parsed.operationId,response);
        await client.query("COMMIT");
        return response;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}
