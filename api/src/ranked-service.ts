import {
    createHmac,
    createHash,
    randomUUID,
    timingSafeEqual,
} from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { assertCharacterAvailable } from "./economy-policy";
export type RankedRegion = { url: string; secret: string };
export type RankedClaims = {
    region: string;
    wallet: string;
    character: string;
    lockId: string;
    ticketId: string;
    revision: string;
    profile: Record<string, unknown>;
    expires: number;
};
function canonical(value: any): any {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, canonical(value[key])]),
        );
    return value;
}
export function regionConfiguration(
    raw = process.env.RANKED_REGIONS_JSON || "{}",
): Record<string, RankedRegion> {
    const result = JSON.parse(raw);
    for (const [id, r] of Object.entries(result) as [string, RankedRegion][]) {
        const url = new URL(r.url);
        if (
            !/^[a-z0-9-]{1,32}$/.test(id) ||
            !r.secret ||
            r.secret.length < 32 ||
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            (!["https:"].includes(url.protocol) &&
                !(url.protocol === "http:" && url.hostname === "127.0.0.1"))
        )
            throw Error("Invalid ranked region configuration");
    }
    return result;
}
export function admissionTicket(session: any, secret: string) {
    const claims: RankedClaims = {
        region: session.region,
        wallet: session.wallet,
        character: session.character_id,
        lockId: session.id,
        ticketId: session.ticket_id,
        revision: session.revision,
        profile: session.profile,
        expires: new Date(session.admission_expires_at).getTime(),
    };
    const encoded = Buffer.from(JSON.stringify(claims)).toString("base64url");
    return {
        ticket:
            encoded +
            "." +
            createHmac("sha256", secret).update(encoded).digest("hex"),
        expires: claims.expires,
        lockId: session.id,
    };
}
export function authenticateRegionalRequest(
    path: string,
    envelope: any,
    signature: unknown,
    regions: Record<string, RankedRegion>,
    now = Date.now(),
) {
    const r = regions[envelope?.region];
    if (
        !r ||
        typeof signature !== "string" ||
        !Number.isSafeInteger(envelope.timestamp) ||
        Math.abs(now - envelope.timestamp) > 30000 ||
        !/^[0-9a-f-]{36}$/i.test(envelope.nonce || "")
    )
        throw Error("Invalid regional authentication");
    const expected = createHmac("sha256", r.secret)
            .update(path + "\n" + JSON.stringify(envelope))
            .digest(),
        actual = Buffer.from(signature, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
        throw Error("Invalid regional authentication");
    return r;
}
export class RankedService {
    constructor(
        private db: Pick<Pool, "connect">,
        private verifyStake: (
            character: string,
            account: string,
            c: PoolClient,
        ) => Promise<string>,
        private snapshot: (
            c: PoolClient,
            character: any,
        ) => Promise<{ version: number; hash: string }>,
    ) {}
    async transaction<T>(fn: (c: PoolClient) => Promise<T>) {
        const c = await this.db.connect();
        try {
            await c.query("BEGIN");
            const result = await fn(c);
            await c.query("COMMIT");
            return result;
        } catch (error) {
            await c.query("ROLLBACK");
            throw error;
        } finally {
            c.release();
        }
    }
    async admit(account: string, character: string, region: string) {
        return this.transaction(async (c) => {
            const row = (
                await c.query(
                    "SELECT * FROM characters WHERE id=$1 AND account_id=$2 AND deleted_at IS NULL FOR UPDATE",
                    [character, account],
                )
            ).rows[0];
            if (!row) throw Error("Character not owned");
            if (row.economy_lock) {
                const queued = (
                    await c.query(
                        "SELECT * FROM ranked_sessions WHERE id=$1 AND account_id=$2 AND region=$3 AND state='queued'",
                        [row.economy_lock, account, region],
                    )
                ).rows[0];
                if (
                    queued &&
                    new Date(queued.admission_expires_at).getTime() > Date.now()
                )
                    return queued;
            }
            assertCharacterAvailable(row);
            const wallet = await this.verifyStake(character, account, c);
            if (
                ![1, 2, 3, 4, 6, 7, 8, 9].includes(row.id_clase) ||
                ![1, 2, 3, 4, 5].includes(row.id_raza)
            )
                throw Error("Character class or race is not supported");
            const snapshot = await this.snapshot(c, row),
                id = randomUUID(),
                ticket = randomUUID();
            const profile = {
                characterId: row.id,
                name: row.name,
                classId: row.id_clase,
                raceId: row.id_raza,
                genderId: row.id_genero,
                headId: row.id_head,
                level: 50,
                preset: "ranked-newbie-v1",
            };
            await c.query("UPDATE characters SET economy_lock=$2 WHERE id=$1", [
                character,
                id,
            ]);
            await c.query(
                "UPDATE game_tickets SET consumed_at=NOW() WHERE character_id=$1 AND consumed_at IS NULL",
                [character],
            );
            return (
                await c.query(
                    "INSERT INTO ranked_sessions(id,account_id,character_id,region,ticket_id,revision,wallet,profile,state,admission_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'queued',NOW()+INTERVAL '60 seconds') RETURNING *",
                    [
                        id,
                        account,
                        character,
                        region,
                        ticket,
                        `${snapshot.version}:${snapshot.hash}`,
                        wallet,
                        JSON.stringify(profile),
                    ],
                )
            ).rows[0];
        });
    }
    async cancel(account: string, lock: string) {
        return this.transaction(async (c) => {
            const char = (
                await c.query(
                    "SELECT c.* FROM characters c JOIN ranked_sessions s ON s.character_id=c.id WHERE s.id=$1 AND s.account_id=$2 FOR UPDATE OF c",
                    [lock, account],
                )
            ).rows[0];
            if (!char) throw Error("Ranked session not owned");
            const session = (
                await c.query(
                    "SELECT * FROM ranked_sessions WHERE id=$1 FOR UPDATE",
                    [lock],
                )
            ).rows[0];
            if (session.state === "playing")
                throw Error("Match is active; forfeit before leaving");
            if (session.state === "queued") {
                await c.query(
                    "UPDATE ranked_sessions SET state='cancelled',ended_at=NOW() WHERE id=$1",
                    [lock],
                );
                await c.query(
                    "UPDATE characters SET economy_lock=NULL WHERE id=$1 AND economy_lock=$2",
                    [char.id, lock],
                );
            }
            return { ok: true };
        });
    }
    async regional(path: string, envelope: any) {
        return this.transaction(async (c) => {
            await c.query(
                "INSERT INTO ranked_rpc_nonces(region,nonce) VALUES($1,$2)",
                [envelope.region, envelope.nonce],
            );
            const p = envelope.payload,
                region = envelope.region;
            if (path.endsWith("/renew")) {
                const row = (
                    await c.query(
                        "SELECT s.* FROM ranked_sessions s JOIN characters ch ON ch.id=s.character_id AND ch.economy_lock=s.id WHERE s.id=$1 AND s.region=$2 AND s.ticket_id=$3 AND s.revision=$4 AND s.state='queued' FOR UPDATE OF s,ch",
                        [p.lockId, region, p.ticketId, p.revision],
                    )
                ).rows[0];
                if (!row) throw Error("Ranked lock no longer available");
                return (
                    await c.query(
                        "UPDATE ranked_sessions SET heartbeat_at=NOW(),admission_expires_at=NOW()+INTERVAL '60 seconds' WHERE id=$1 RETURNING *",
                        [row.id],
                    )
                ).rows[0];
            }
            if (path.endsWith("/release")) {
                const row = (
                    await c.query(
                        "SELECT s.* FROM ranked_sessions s JOIN characters ch ON ch.id=s.character_id AND ch.economy_lock=s.id WHERE s.id=$1 AND s.region=$2 AND s.ticket_id=$3 FOR UPDATE OF ch,s",
                        [p.lockId, region, p.ticketId],
                    )
                ).rows[0];
                if (!row) return { ok: true };
                if (row.state !== "queued")
                    throw Error("Active match must settle before unlock");
                await c.query(
                    "UPDATE ranked_sessions SET state='cancelled',ended_at=NOW() WHERE id=$1",
                    [row.id],
                );
                await c.query(
                    "UPDATE characters SET economy_lock=NULL WHERE id=$1 AND economy_lock=$2",
                    [row.character_id, row.id],
                );
                return { ok: true };
            }
            if (path.endsWith("/start")) {
                if (
                    !Array.isArray(p.players) ||
                    p.players.length !== 2 ||
                    p.players[0].lockId === p.players[1].lockId
                )
                    throw Error("Two distinct locked characters required");
                const locks = p.players.map((x: any) => x.lockId);
                // Serializes start/retry/finish for one generated match ID, including the missing-row case.
                await c.query(
                    "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
                    [p.matchId],
                );
                const old = (
                    await c.query(
                        "SELECT * FROM ranked_matches WHERE id=$1 FOR UPDATE",
                        [p.matchId],
                    )
                ).rows[0];
                if (old) {
                    if (
                        old.region !== region ||
                        JSON.stringify(old.locks) !== JSON.stringify(locks)
                    )
                        throw Error(
                            "Match ID conflicts with another admission",
                        );
                    return { ok: true, state: old.state };
                }
                await c.query(
                    "SELECT id FROM characters WHERE id IN (SELECT character_id FROM ranked_sessions WHERE id=ANY($1::uuid[])) ORDER BY id FOR UPDATE",
                    [locks],
                );
                const rows = (
                    await c.query(
                        "SELECT * FROM ranked_sessions WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
                        [locks],
                    )
                ).rows;
                if (rows.length !== 2) throw Error("Missing ranked lock");
                for (const claim of p.players) {
                    const s = rows.find((r: any) => r.id === claim.lockId);
                    const ch = (
                        await c.query(
                            "SELECT economy_lock FROM characters WHERE id=$1",
                            [s.character_id],
                        )
                    ).rows[0];
                    if (
                        s.region !== region ||
                        s.state !== "queued" ||
                        s.ticket_id !== claim.ticketId ||
                        s.revision !== claim.revision ||
                        s.wallet !== claim.wallet ||
                        s.character_id !== claim.character ||
                        ch.economy_lock !== s.id ||
                        new Date(s.admission_expires_at).getTime() <= Date.now()
                    )
                        throw Error("Ranked lock is stale or invalid");
                }
                if (rows[0].wallet === rows[1].wallet)
                    throw Error("A wallet cannot play against itself");
                await c.query(
                    "INSERT INTO ranked_matches(id,region,locks,state) VALUES($1,$2,$3,'playing')",
                    [p.matchId, region, locks],
                );
                await c.query(
                    "UPDATE ranked_sessions SET state='playing',match_id=$2,heartbeat_at=NOW() WHERE id=ANY($1::uuid[])",
                    [locks, p.matchId],
                );
                return { ok: true, state: "playing" };
            }
            if (path.endsWith("/finish")) {
                const receipt = p.receipt;
                if (
                    receipt?.demo ||
                    receipt?.region !== region ||
                    !Array.isArray(receipt.players) ||
                    receipt.players.length !== 2 ||
                    ![0, 1, 2].includes(receipt.winner) ||
                    receipt.state?.phase !== 2 ||
                    receipt.state.winner !== receipt.winner
                )
                    throw Error("Invalid final result");
                const match = (
                    await c.query(
                        "SELECT * FROM ranked_matches WHERE id=$1 FOR UPDATE",
                        [receipt.matchId],
                    )
                ).rows[0];
                if (!match || match.region !== region)
                    throw Error("Unknown match");
                // JSONB may reorder object keys. Hash semantic content so recovery after a
                // lost response accepts the same result retrieved from durable storage.
                const hash = createHash("sha256")
                    .update(JSON.stringify(canonical(receipt)))
                    .digest("hex");
                if (match.state === "complete") {
                    if (match.result_hash !== hash)
                        throw Error("Conflicting duplicate result");
                    return { ok: true, duplicate: true };
                }
                if (
                    JSON.stringify(match.locks) !==
                    JSON.stringify(receipt.players.map((x: any) => x.lockId))
                )
                    throw Error("Result participants do not match");
                await c.query(
                    "SELECT id FROM characters WHERE id IN (SELECT character_id FROM ranked_sessions WHERE id=ANY($1::uuid[])) ORDER BY id FOR UPDATE",
                    [match.locks],
                );
                const rows = (
                    await c.query(
                        "SELECT * FROM ranked_sessions WHERE id=ANY($1::uuid[]) FOR UPDATE",
                        [match.locks],
                    )
                ).rows;
                for (const s of rows) {
                    const claim = receipt.players.find(
                            (x: any) => x.lockId === s.id,
                        ),
                        ch = (
                            await c.query(
                                "SELECT economy_lock FROM characters WHERE id=$1",
                                [s.character_id],
                            )
                        ).rows[0];
                    if (
                        s.state !== "playing" ||
                        s.match_id !== match.id ||
                        s.revision !== claim?.revision ||
                        s.ticket_id !== claim?.ticketId ||
                        s.character_id !== claim?.character ||
                        s.wallet !== claim?.wallet ||
                        ch.economy_lock !== s.id
                    )
                        throw Error("Result lock fence does not match");
                }
                if (rows.length !== 2)
                    throw Error("Incomplete match participants");
                await c.query(
                    "UPDATE ranked_matches SET state='complete',result_hash=$2,receipt=$3,completed_at=NOW() WHERE id=$1",
                    [match.id, hash, JSON.stringify(receipt)],
                );
                await c.query(
                    "UPDATE ranked_sessions SET state='complete',ended_at=NOW() WHERE id=ANY($1::uuid[])",
                    [match.locks],
                );
                for (const s of rows)
                    await c.query(
                        "UPDATE characters SET economy_lock=NULL WHERE id=$1 AND economy_lock=$2",
                        [s.character_id, s.id],
                    );
                return { ok: true, duplicate: false };
            }
            throw Error("Unknown ranked operation");
        });
    }
    async expireQueues() {
        return this.transaction(async (c) => {
            await c.query(
                "DELETE FROM ranked_rpc_nonces WHERE created_at<NOW()-INTERVAL '2 minutes'",
            );
            const rows = (
                await c.query(
                    "SELECT s.id,s.character_id FROM ranked_sessions s JOIN characters ch ON ch.id=s.character_id WHERE s.state='queued' AND s.admission_expires_at<NOW()-INTERVAL '30 seconds' ORDER BY ch.id FOR UPDATE OF ch,s SKIP LOCKED",
                )
            ).rows;
            for (const s of rows) {
                await c.query(
                    "UPDATE ranked_sessions SET state='cancelled',ended_at=NOW() WHERE id=$1 AND state='queued'",
                    [s.id],
                );
                await c.query(
                    "UPDATE characters SET economy_lock=NULL WHERE id=$1 AND economy_lock=$2",
                    [s.character_id, s.id],
                );
            }
            return rows.length;
        });
    }
}
