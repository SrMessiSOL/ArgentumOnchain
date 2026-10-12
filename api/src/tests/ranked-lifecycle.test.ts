import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { randomUUID, createHmac } from "node:crypto";
import {
    RankedService,
    admissionTicket,
    authenticateRegionalRequest,
} from "../ranked-service";
import http from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const db = new PGlite(),
    accounts = [randomUUID(), randomUUID()],
    characters = [randomUUID(), randomUUID()];
const secret = "ranked-test-only-secret-not-production".repeat(2);
let tail = Promise.resolve();
const pool = {
    async connect() {
        let release!: () => void;
        const next = new Promise<void>((r) => (release = r)),
            old = tail;
        tail = next;
        await old;
        return {
            query: (sql: string, params?: unknown[]) => db.query(sql, params),
            release,
        };
    },
};
const service = new RankedService(
    pool as any,
    async (id, account, c) => {
        const row = (
            await c.query(
                "SELECT * FROM characters WHERE id=$1 AND account_id=$2",
                [id, account],
            )
        ).rows[0];
        if (row.chain_state !== "staked") throw Error("Stake required");
        return "wallet-" + account;
    },
    async () => ({ version: 1, hash: "verified-test-snapshot" }),
);
const envelope = (payload: any) => ({
    region: "local",
    timestamp: Date.now(),
    nonce: randomUUID(),
    payload,
});
const claims = (s: any) => ({
    lockId: s.id,
    ticketId: s.ticket_id,
    revision: s.revision,
    character: s.character_id,
    wallet: s.wallet,
    region: s.region,
});
beforeAll(async () => {
    await db.exec(
        `CREATE TABLE accounts(id uuid PRIMARY KEY);CREATE TABLE characters(id uuid PRIMARY KEY,account_id uuid REFERENCES accounts(id),name text,id_clase int DEFAULT 1,id_raza int DEFAULT 1,id_genero int DEFAULT 1,id_head int DEFAULT 1,level int DEFAULT 7,gold int DEFAULT 123,inventory jsonb DEFAULT '[{"item":861,"quantity":1}]',chain_state text DEFAULT 'staked',connected boolean DEFAULT false,economy_lock uuid,economy_login_until timestamptz,privileges int DEFAULT 0,banned timestamptz,deleted_at timestamptz);CREATE TABLE game_tickets(character_id uuid,consumed_at timestamptz);`,
    );
    await db.exec(readFileSync("ranked-schema.sql", "utf8"));
    for (let i = 0; i < 2; i++) {
        await db.query("INSERT INTO accounts(id) VALUES($1)", [accounts[i]]);
        await db.query(
            "INSERT INTO characters(id,account_id,name) VALUES($1,$2,$3)",
            [characters[i], accounts[i], "Ranked" + i],
        );
    }
});
afterAll(() => db.close());
test("owned staked characters receive exclusive level-50 admission, without altering their bundle", async () => {
    await expect(
        service.admit(accounts[1], characters[0], "local"),
    ).rejects.toThrow("not owned");
    await db.query("UPDATE characters SET chain_state='unstaked' WHERE id=$1", [
        characters[0],
    ]);
    await expect(
        service.admit(accounts[0], characters[0], "local"),
    ).rejects.toThrow("Stake required");
    await db.query("UPDATE characters SET chain_state='staked' WHERE id=$1", [
        characters[0],
    ]);
    const a = await service.admit(accounts[0], characters[0], "local");
    expect(a.profile.level).toBe(50);
    const unchanged = (
        await db.query<any>("SELECT * FROM characters WHERE id=$1", [
            characters[0],
        ])
    ).rows[0];
    expect(unchanged.level).toBe(7);
    expect(unchanged.gold).toBe(123);
    expect(unchanged.inventory).toEqual([{ item: 861, quantity: 1 }]);
    expect(unchanged.economy_lock).toBe(a.id);
    expect((await service.admit(accounts[0], characters[0], "local")).id).toBe(
        a.id,
    );
    await expect(
        service.admit(accounts[0], characters[0], "eu"),
    ).rejects.toThrow();
    await service.cancel(accounts[0], a.id);
    expect(
        (
            await db.query<any>(
                "SELECT economy_lock FROM characters WHERE id=$1",
                [characters[0]],
            )
        ).rows[0].economy_lock,
    ).toBe(null);
});
test("match start is fenced; result, duplicate rejection and unlock are one SQL transaction", async () => {
    const a = await service.admit(accounts[0], characters[0], "local"),
        b = await service.admit(accounts[1], characters[1], "local");
    const players = [claims(a), claims(b)],
        matchId = randomUUID();
    await service.regional(
        "/internal/ranked/start",
        envelope({ matchId, players }),
    );
    await expect(service.cancel(accounts[0], a.id)).rejects.toThrow("active");
    const receipt = {
        matchId,
        region: "local",
        demo: false,
        players,
        winner: 0,
        state: { phase: 2, winner: 0 },
    };
    expect(
        (
            await service.regional(
                "/internal/ranked/finish",
                envelope({ receipt }),
            )
        ).duplicate,
    ).toBe(false);
    expect(
        (
            await service.regional(
                "/internal/ranked/finish",
                envelope({ receipt }),
            )
        ).duplicate,
    ).toBe(true);
    await expect(
        service.regional(
            "/internal/ranked/finish",
            envelope({
                receipt: {
                    ...receipt,
                    winner: 1,
                    state: { phase: 2, winner: 1 },
                },
            }),
        ),
    ).rejects.toThrow("Conflicting");
    expect(
        (
            await db.query<any>(
                "SELECT count(*)::int n FROM ranked_matches WHERE id=$1",
                [matchId],
            )
        ).rows[0].n,
    ).toBe(1);
    const newAdmission = await service.admit(
        accounts[0],
        characters[0],
        "local",
    );
    await service.regional("/internal/ranked/finish", envelope({ receipt }));
    expect(
        (
            await db.query<any>(
                "SELECT economy_lock FROM characters WHERE id=$1",
                [characters[0]],
            )
        ).rows[0].economy_lock,
    ).toBe(newAdmission.id);
    await service.cancel(accounts[0], newAdmission.id);
    expect(
        (await db.query<any>("SELECT gold,level FROM characters ORDER BY name"))
            .rows,
    ).toEqual([
        { gold: 123, level: 7 },
        { gold: 123, level: 7 },
    ]);
});
test("failed or mismatched results keep both locks; queued expiry cannot unlock an active match", async () => {
    const a = await service.admit(accounts[0], characters[0], "local"),
        b = await service.admit(accounts[1], characters[1], "local"),
        players = [claims(a), claims(b)],
        matchId = randomUUID();
    await service.regional(
        "/internal/ranked/start",
        envelope({ matchId, players }),
    );
    const receipt = {
        matchId,
        region: "local",
        demo: false,
        players: [{ ...players[0], revision: "changed" }, players[1]],
        winner: 2,
        state: { phase: 2, winner: 2 },
    };
    await expect(
        service.regional("/internal/ranked/finish", envelope({ receipt })),
    ).rejects.toThrow("fence");
    await db.query(
        "UPDATE ranked_sessions SET admission_expires_at=NOW()-INTERVAL '2 minutes'",
    );
    expect(await service.expireQueues()).toBe(0);
    expect(
        (
            await db.query<any>(
                "SELECT economy_lock FROM characters ORDER BY name",
            )
        ).rows.map((x) => x.economy_lock),
    ).toEqual([a.id, b.id]);
    await service.regional(
        "/internal/ranked/finish",
        envelope({ receipt: { ...receipt, players } }),
    );
});
test("regional signatures bind route and fresh timestamp; request replay cannot mutate twice", async () => {
    const request = envelope({}),
        path = "/internal/ranked/release";
    const signature = createHmac("sha256", secret)
        .update(path + "\n" + JSON.stringify(request))
        .digest("hex");
    expect(
        authenticateRegionalRequest(path, request, signature, {
            local: { url: "http://127.0.0.1:3210", secret },
        }).secret,
    ).toBe(secret);
    expect(() =>
        authenticateRegionalRequest(
            "/internal/ranked/finish",
            request,
            signature,
            { local: { url: "http://127.0.0.1:3210", secret } },
        ),
    ).toThrow();
    expect(() =>
        authenticateRegionalRequest(
            path,
            { ...request, timestamp: 0 },
            signature,
            { local: { url: "http://127.0.0.1:3210", secret } },
        ),
    ).toThrow();
    const a = await service.admit(accounts[0], characters[0], "local");
    expect(admissionTicket(a, secret).ticket).toContain(".");
    const release = envelope(claims(a));
    await service.regional(path, release);
    await expect(service.regional(path, release)).rejects.toThrow();
});

test.skipIf(!process.env.AOCHAIN_ARENA_ROOT)(
    "owned character -> signed admission -> real WebSocket duel -> one result and unlock",
    async () => {
        const root = resolve(process.env.AOCHAIN_ARENA_ROOT!),
            { WebSocket } = createRequire(resolve(root, "arena/package.json"))(
                "ws",
            );
        const regions = { local: { url: "http://127.0.0.1:3210", secret } };
        const bridge = http.createServer(async (req, res) => {
            try {
                let body = "";
                for await (const chunk of req) body += chunk;
                const envelope = JSON.parse(body),
                    path = req.url!;
                authenticateRegionalRequest(
                    path,
                    envelope,
                    req.headers["x-aochain-signature"],
                    regions,
                );
                const result = await service.regional(path, envelope);
                res.setHeader("content-type", "application/json");
                res.end(
                    JSON.stringify(
                        path.endsWith("/renew")
                            ? admissionTicket(result, secret)
                            : result,
                    ),
                );
            } catch {
                res.writeHead(409);
                res.end("{}");
            }
        });
        await new Promise<void>((r) => bridge.listen(0, "127.0.0.1", r));
        const bridgePort = (bridge.address() as any).port;
        const allocation = http.createServer();
        await new Promise<void>((r) => allocation.listen(0, "127.0.0.1", r));
        const port = (allocation.address() as any).port;
        await new Promise<void>((r) => allocation.close(() => r()));
        const launch = () =>
            spawn(
                process.execPath,
                [resolve(root, "arena/regional/server.mjs")],
                {
                    cwd: root,
                    windowsHide: true,
                    env: {
                        ...process.env,
                        PORT: String(port),
                        HOST: "127.0.0.1",
                        REGION_ID: "local",
                        PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
                        AOCHAIN_DEMO: "0",
                        RANKED_RECOVERY_MS: "1000",
                        ASSET_ADMISSION_SECRET: secret,
                        ASSET_SERVICE_URL: `http://127.0.0.1:${bridgePort}/internal/ranked`,
                    },
                    stdio: "pipe",
                },
            );
        let child = launch();
        let logs = "";
        child.stdout.on("data", (d) => (logs += d));
        child.stderr.on("data", (d) => (logs += d));
        const sockets: any[] = [],
            messages: any[][] = [[], []];
        const wait = async (check: () => unknown) => {
            const end = Date.now() + 10000;
            while (Date.now() < end) {
                if (check()) return;
                await delay(15);
            }
            throw Error("Arena wait timed out: " + logs);
        };
        try {
            await wait(() => logs.includes("Regional ranked"));
            const admissions = [];
            for (let i = 0; i < 2; i++)
                admissions.push(
                    await service.admit(accounts[i], characters[i], "local"),
                );
            for (let i = 0; i < 2; i++) {
                const ws = new WebSocket(`ws://127.0.0.1:${port}/realtime`, {
                    origin: `http://127.0.0.1:${port}`,
                });
                sockets.push(ws);
                ws.on("message", (raw: any) =>
                    messages[i].push(JSON.parse(raw)),
                );
                ws.on("error", () => {});
                await wait(() => ws.readyState === 1);
                ws.send(
                    JSON.stringify({
                        type: "ranked",
                        ticket: admissionTicket(admissions[i], secret).ticket,
                    }),
                );
            }
            const state = (i: number) =>
                messages[i].filter((m) => m.type === "state").at(-1);
            await wait(
                () =>
                    state(0)?.state.phase === 1 && state(1)?.state.phase === 1,
            );
            const match = state(0),
                f = match.state.fighters[0];
            expect(f.level).toBe(50);
            expect(f.name).toBe("Ranked0");
            expect(f.equipment).toEqual([862, 1044]);
            expect(f.spellIds).toContain(25);
            await expect(
                service.cancel(accounts[0], admissions[0].id),
            ).rejects.toThrow("active");
            sockets[0].send(
                JSON.stringify({
                    type: "action",
                    id: 1,
                    generation: match.generation,
                    kind: "forfeit",
                    value: 0,
                    nonce: f.nonce + 1,
                }),
            );
            await wait(() =>
                messages.every((list) =>
                    list.some(
                        (m) => m.type === "result" && m.unlocked === true,
                    ),
                ),
            );
            const stored = (
                await db.query<any>(
                    "SELECT * FROM ranked_matches WHERE id=$1",
                    [match.generation],
                )
            ).rows;
            expect(stored).toHaveLength(1);
            expect(stored[0].state).toBe("complete");
            expect(stored[0].receipt.winner).toBe(1);
            expect(
                (
                    await db.query<any>(
                        "SELECT economy_lock,gold,level FROM characters ORDER BY name",
                    )
                ).rows,
            ).toEqual([
                { economy_lock: null, gold: 123, level: 7 },
                { economy_lock: null, gold: 123, level: 7 },
            ]);
            const receipt = stored[0].receipt;
            expect(
                (
                    await service.regional(
                        "/internal/ranked/finish",
                        envelope({ receipt }),
                    )
                ).duplicate,
            ).toBe(true);
            // Interrupt a second live match, then restart the same worker with
            // its durable journal. It must resolve as a draw and unlock once.
            for (const ws of sockets) ws.terminate();
            sockets.length = 0;
            messages[0] = [];
            messages[1] = [];
            for (let i = 0; i < 2; i++) {
                const admission = await service.admit(
                    accounts[i],
                    characters[i],
                    "local",
                );
                const ws = new WebSocket(`ws://127.0.0.1:${port}/realtime`, {
                    origin: `http://127.0.0.1:${port}`,
                });
                sockets.push(ws);
                ws.on("message", (raw: any) =>
                    messages[i].push(JSON.parse(raw)),
                );
                ws.on("error", () => {});
                await wait(() => ws.readyState === 1);
                ws.send(
                    JSON.stringify({
                        type: "ranked",
                        ticket: admissionTicket(admission, secret).ticket,
                    }),
                );
            }
            await wait(
                () =>
                    state(0)?.state.phase === 1 && state(1)?.state.phase === 1,
            );
            const interrupted = state(0).generation;
            const exited = new Promise<void>((r) =>
                child.once("exit", () => r()),
            );
            child.kill();
            await exited;
            logs = "";
            child = launch();
            child.stdout.on("data", (d) => (logs += d));
            child.stderr.on("data", (d) => (logs += d));
            await wait(() => logs.includes("Regional ranked"));
            let recovered: any;
            const end = Date.now() + 10000;
            while (Date.now() < end) {
                recovered = (
                    await db.query<any>(
                        "SELECT * FROM ranked_matches WHERE id=$1",
                        [interrupted],
                    )
                ).rows[0];
                if (recovered?.state === "complete") break;
                await delay(30);
            }
            expect(recovered.state).toBe("complete");
            expect(recovered.receipt.outcome).toBe("interrupted");
            expect(recovered.receipt.winner).toBe(2);
            expect(
                (
                    await db.query<any>("SELECT economy_lock FROM characters")
                ).rows.every((x) => x.economy_lock === null),
            ).toBe(true);
        } finally {
            for (const ws of sockets) ws.terminate();
            child.kill();
            await new Promise<void>((r) => bridge.close(() => r()));
        }
    },
    40000,
);
