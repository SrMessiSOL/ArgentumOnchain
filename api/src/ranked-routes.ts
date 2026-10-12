import type { Express, Request } from "express";
import { z } from "zod";
import pool from "./db";
import { getPublicSessionByToken } from "./repositories/auth";
import { assertPlayableCharacter, saveSnapshot } from "./game-asset-policy";
import {
    RankedService,
    regionConfiguration,
    admissionTicket,
    authenticateRegionalRequest,
} from "./ranked-service";
const service = new RankedService(
    pool,
    async (id, account, c) => {
        await assertPlayableCharacter(id, account, c);
        const row = (
            await c.query(
                "SELECT wallet FROM (SELECT wallet,completed_at,id FROM game_asset_operations WHERE character_id=$1 AND kind IN ('mint','stake') AND state='complete' UNION ALL SELECT wallet,completed_at,id FROM economy_intents WHERE character_id=$1 AND kind='purchase' AND state='complete') custody ORDER BY completed_at DESC,id DESC LIMIT 1",
                [id],
            )
        ).rows[0];
        if (!row?.wallet) throw Error("Verified custody wallet unavailable");
        return row.wallet as string;
    },
    saveSnapshot,
);
async function identity(req: Request) {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1],
        session = token ? await getPublicSessionByToken(token) : null;
    if (!session) throw Error("Sign in to play ranked");
    return session.account._id;
}
function publicError(error:unknown,fallback:string){
 const message=error instanceof Error?error.message:'';
 const messages:Record<string,string>={
  'economy.logout':'This character is already playing or reserved. Finish that session first.',
  'economy.restricted':'This character cannot enter ranked.',
  'assets.notOwned':'This character does not belong to your account.',
  'Character not owned':'This character does not belong to your account.',
  'Ranked session not owned':'This ranked session does not belong to your account.',
  'Match is active; forfeit before leaving':'Forfeit your active duel before leaving.',
  'Sign in to play ranked':'Sign in to play ranked.',
  'Character class or race is not supported':'This character class or race is not supported in ranked.',
  'Mint and stake this character from your profile before entering the realm.':'Mint and stake this character from your profile before entering ranked.',
  'The character stake could not be verified. Check your linked wallet and retry.':'The character stake could not be verified. Check your linked wallet and retry.',
 };
 return Object.hasOwn(messages,message)?messages[message]:fallback;
}
export function installRankedRoutes(app: Express) {
    app.get("/auth/ranked/characters", async (req, res) => {
        try {
            const account = await identity(req);
            const regions = regionConfiguration();
            const characters = (
                await pool.query(
                    "SELECT id,name,id_clase,id_raza,id_genero,id_head,connected,economy_lock,chain_state,asset_address FROM characters WHERE account_id=$1 AND deleted_at IS NULL ORDER BY name",
                    [account],
                )
            ).rows;
            res.json({
                characters,
                regions: Object.entries(regions).map(([id, r]) => ({
                    id,
                    url: r.url,
                })),
                preset: "ranked-newbie-v1",
                level: 50,
            });
        } catch {
            res.status(401).json({
                error: "Sign in to view ranked characters",
            });
        }
    });
    app.post("/auth/ranked/admit", async (req, res) => {
        try {
            const account = await identity(req),
                input = z
                    .object({
                        characterId: z.string().uuid(),
                        region: z.string().regex(/^[a-z0-9-]{1,32}$/),
                    })
                    .strict()
                    .parse(req.body),
                region = regionConfiguration()[input.region];
            if (!region || !Object.hasOwn(regionConfiguration(), input.region))
                return res
                    .status(503)
                    .json({ error: "This ranked region is not configured" });
            const session = await service.admit(
                account,
                input.characterId,
                input.region,
            );
            res.json({
                ...admissionTicket(session, region.secret),
                url: region.url,
                profile: session.profile,
            });
        } catch (error) {
            res.status(409).json({
                error:publicError(error,"Could not verify ranked admission. Check your character and try again."),
            });
        }
    });
    app.post("/auth/ranked/cancel", async (req, res) => {
        try {
            const account = await identity(req),
                input = z
                    .object({ lockId: z.string().uuid() })
                    .strict()
                    .parse(req.body);
            res.json(await service.cancel(account, input.lockId));
        } catch (error) {
            res.status(409).json({
                error:publicError(error,"Could not cancel ranked session. Check its status before retrying."),
            });
        }
    });
    for (const action of ["start", "renew", "release", "finish"])
        app.post("/internal/ranked/" + action, async (req, res) => {
            try {
                const path = "/internal/ranked/" + action,
                    regions = regionConfiguration(),
                    region = authenticateRegionalRequest(
                        path,
                        req.body,
                        req.headers["x-aochain-signature"],
                        regions,
                    );
                const result = await service.regional(path, req.body);
                res.json(
                    action === "renew"
                        ? admissionTicket(result, region.secret)
                        : result,
                );
            } catch (error) {
                console.warn(
                    "[RANKED]",
                    action,
                    error instanceof Error ? error.message : "failed",
                );
                res.status(409).json({
                    error: "Ranked operation rejected; preserve the existing lock and inspect its status",
                });
            }
        });
    const timer = setInterval(() => {
        void service
            .expireQueues()
            .catch(() => console.warn("[RANKED] Queued-lock expiry failed"));
    }, 15000);
    timer.unref();
}
