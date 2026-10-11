import {ownerWalletSql} from './linked-wallet';
import {AuthBudget} from './authBudget';
import {credentialHash} from './lib/sessionTokens';
import { createHash, createPublicKey, randomUUID, verify } from "node:crypto";
import type { Express, Request, Response } from "express";
import bs58 from "bs58";
import { z } from "zod";
import pool from "./db";
import config from "./config";
import { getPublicSessionByToken } from "./repositories/auth";

const walletBudget = new AuthBudget();
const proofSchema = z.string().regex(/^[A-Za-z0-9+/]{86}==$/);
function validSignature(address:string,message:string,signature:string):boolean {
    const key=createPublicKey({key:Buffer.concat([Buffer.from("302a300506032b6570032100","hex"),Buffer.from(bs58.decode(address))]),format:"der",type:"spki"});
    return verify(null,Buffer.from(message),key,Buffer.from(signature,"base64"));
}
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const addressSchema = z.string().min(32).max(44).refine((address) => {
    try { return bs58.decode(address).length === 32; } catch { return false; }
});

async function session(req: Request, res: Response) {
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    const auth = token ? await getPublicSessionByToken(token) : null;
    if (!auth || !token) { res.status(401).json({ error: "wallet.signIn" }); return null; }
    return { accountId: auth.account._id, sessionHash: hash(token), credentialHash:credentialHash(token) };
}

export function installWalletRoutes(app: Express) {
    // Origin comes from trusted server configuration, never a request Host header.
    const origin = new URL(config.siteUrl).origin;
    app.get("/auth/wallet", async (req, res) => {
        const auth = await session(req, res); if (!auth) return;
        const result = await pool.query("SELECT address, linked_at FROM account_wallets WHERE account_id = $1", [auth.accountId]);
        const wallets = await pool.query(`SELECT w.address,w.linked_at,EXISTS(SELECT 1 FROM characters c WHERE c.account_id=w.account_id AND c.asset_address IS NOT NULL AND (${ownerWalletSql}=w.address OR ${ownerWalletSql} IS NULL)) AS owns_character FROM account_linked_wallets w WHERE w.account_id=$1 ORDER BY w.linked_at,w.address`, [auth.accountId]);
        res.json({ wallet: result.rows[0] ?? null, wallets: wallets.rows, limit: 5, capabilities: {unlink:true} });
    });
    app.post("/auth/wallet/unlink", async (req,res)=>{
        const auth=await session(req,res);if(!auth)return;
        if(!walletBudget.allow(req.path+":"+auth.accountId,10,60_000)){res.status(429).json({error:'wallet.tooManyAttempts'});return;}
        const parsed=z.object({address:addressSchema}).strict().safeParse(req.body);
        if(!parsed.success){res.status(400).json({error:'wallet.invalidAddress'});return;}
        const client=await pool.connect();
        try{
            await client.query('BEGIN');
            await client.query('SELECT 1 FROM accounts WHERE id=$1 FOR UPDATE',[auth.accountId]);
            const active=(await client.query("SELECT 1 FROM auth_sessions WHERE token=$1 AND account_id=$2 AND expires_at>NOW() AND created_at>NOW()-INTERVAL '10 minutes' FOR UPDATE",[auth.credentialHash,auth.accountId])).rowCount;
            if(!active)throw Error('wallet.reauthenticate');
            const member=(await client.query('SELECT address FROM account_linked_wallets WHERE account_id=$1 AND address=$2 FOR UPDATE',[auth.accountId,parsed.data.address])).rowCount;
            if(!member)throw Error('wallet.notLinked');
            // Membership lock serializes with prepare/list operations using selectedWallet.
            const pending=(await client.query(`SELECT 1 WHERE
                EXISTS(SELECT 1 FROM game_asset_operations WHERE wallet=$2 AND state IN ('prepared','signed')) OR
                EXISTS(SELECT 1 FROM economy_intents WHERE wallet=$2 AND state IN ('prepared','signed')) OR
                EXISTS(SELECT 1 FROM character_sales WHERE seller_id=$1 AND seller_wallet=$2 AND state IN ('listed','reserved')) OR
                EXISTS(SELECT 1 FROM item_sales WHERE seller_id=$1 AND seller_wallet=$2 AND state IN ('listed','reserved'))`,[auth.accountId,parsed.data.address])).rowCount;
            if(pending)throw Error('wallet.pendingOperations');
            const owned=(await client.query(`SELECT 1 FROM characters c WHERE c.account_id=$1 AND c.asset_address IS NOT NULL AND (${ownerWalletSql}=$2 OR ${ownerWalletSql} IS NULL) LIMIT 1`,[auth.accountId,parsed.data.address])).rowCount;
            if(owned)throw Error('wallet.ownsCharacter');
            await client.query('DELETE FROM account_linked_wallets WHERE account_id=$1 AND address=$2',[auth.accountId,parsed.data.address]);
            const fallback=(await client.query('SELECT address FROM account_linked_wallets WHERE account_id=$1 ORDER BY linked_at,address LIMIT 1',[auth.accountId])).rows[0];
            if(fallback)await client.query('UPDATE account_wallets SET address=$3,linked_at=NOW() WHERE account_id=$1 AND address=$2',[auth.accountId,parsed.data.address,fallback.address]);
            else await client.query('DELETE FROM account_wallets WHERE account_id=$1 AND address=$2',[auth.accountId,parsed.data.address]);
            await client.query('DELETE FROM wallet_link_challenges WHERE account_id=$1 AND address=$2',[auth.accountId,parsed.data.address]);
            await client.query('COMMIT');res.json({unlinked:parsed.data.address});
        }catch(error){await client.query('ROLLBACK');const key=error instanceof Error&&error.message.startsWith('wallet.')?error.message:'wallet.failed';res.status(key==='wallet.reauthenticate'?403:409).json({error:key});}
        finally{client.release();}
    });
    app.post("/auth/wallet/challenge", async (req, res) => {
        const auth = await session(req, res); if (!auth) return;
        if(!walletBudget.allow(req.path+":"+auth.accountId,10,60_000)){res.setHeader("Retry-After","60");res.status(429).json({error:"wallet.tooManyAttempts"});return;}
        const parsed = z.object({ address: addressSchema, mode: z.enum(["add", "activate"]).optional() }).strict().safeParse(req.body);
        if (!parsed.success) { res.status(400).json({ error: "wallet.invalidAddress" }); return; }
        const linked=(await pool.query("SELECT address FROM account_wallets WHERE account_id=$1",[auth.accountId])).rows[0];
        const replacing=linked && linked.address!==parsed.data.address;
        const adding=parsed.data.mode==="add";
        const expiresAt = new Date(Date.now() + 120_000);
        const message = [
            adding ? "AOCHAIN: add a linked Solana wallet without changing the active wallet" : replacing ? "AOCHAIN: authorize replacing your linked Solana wallet" : "AOCHAIN: link your Solana wallet",
            `Origin: ${origin}`, `Account: ${auth.accountId}`,
            `Session: ${auth.sessionHash}`, `Wallet: ${parsed.data.address}`,
            ...(replacing && !adding ? [`Previous wallet: ${linked.address}`] : []),
            `Nonce: ${randomUUID()}`, `Expires: ${expiresAt.toISOString()}`,
            "This proves wallet control for this game account only. No transaction, payment, asset transfer or on-chain ownership is authorized.",
        ].join("\n");
        await pool.query(`INSERT INTO wallet_link_challenges (account_id, session_hash, address, message, expires_at)
            VALUES ($1, $2, $3, $4, $5) ON CONFLICT (account_id) DO UPDATE SET
            session_hash=EXCLUDED.session_hash, address=EXCLUDED.address, message=EXCLUDED.message, expires_at=EXCLUDED.expires_at`,
            [auth.accountId, auth.sessionHash, parsed.data.address, message, expiresAt]);
        res.json({ message, expiresAt, ...(replacing && !adding ? {previousWallet:linked.address,requiresPreviousWalletProof:true} : {}) });
    });
    app.post("/auth/wallet/verify", async (req, res) => {
        const auth = await session(req, res); if (!auth) return;
        if(!walletBudget.allow(req.path+":"+auth.accountId,10,60_000)){res.setHeader("Retry-After","60");res.status(429).json({error:"wallet.tooManyAttempts"});return;}
        const parsed = z.object({ signature: proofSchema, previousSignature: proofSchema.optional() }).strict().safeParse(req.body);
        if (!parsed.success) { res.status(400).json({ error: "wallet.invalidProof" }); return; }
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            // Account-first lock order prevents concurrent replacements holding each other's session rows.
            await client.query("SELECT 1 FROM accounts WHERE id=$1 FOR UPDATE",[auth.accountId]);
            // Serialize with logout/password-reset revocation; authorization must still be live at commit.
            const active=(await client.query("SELECT 1 FROM auth_sessions WHERE token=$1 AND account_id=$2 AND expires_at>NOW() AND created_at>NOW()-INTERVAL '30 days' FOR UPDATE",[auth.credentialHash,auth.accountId])).rowCount;
            if(!active)throw new Error('wallet.signIn');
            const result = await client.query(`SELECT * FROM wallet_link_challenges WHERE account_id=$1
                AND session_hash=$2 AND expires_at > NOW() FOR UPDATE`, [auth.accountId, auth.sessionHash]);
            const challenge = result.rows[0];
            if (!challenge) throw new Error("wallet.expiredProof");
            const adding=challenge.message.split("\n")[0]==="AOCHAIN: add a linked Solana wallet without changing the active wallet";
            const linked=(await client.query('SELECT address FROM account_wallets WHERE account_id=$1 FOR UPDATE',[auth.accountId])).rows[0];
            if(linked && linked.address!==challenge.address){
                const fresh=(await client.query("SELECT 1 FROM auth_sessions WHERE token=$1 AND account_id=$2 AND created_at>NOW()-INTERVAL '10 minutes' AND expires_at>NOW()",[auth.credentialHash,auth.accountId])).rowCount;
                if(!fresh)throw new Error('wallet.reauthenticate');
                const pending=(await client.query(`SELECT 1 WHERE
                    EXISTS(SELECT 1 FROM characters WHERE account_id=$1 AND (connected OR economy_lock IS NOT NULL OR economy_login_until>NOW() OR chain_state='staked')) OR
                    EXISTS(SELECT 1 FROM economy_intents WHERE account_id=$1 AND state IN ('prepared','signed')) OR
                    EXISTS(SELECT 1 FROM game_asset_operations WHERE account_id=$1 AND state IN ('prepared','signed')) OR
                    EXISTS(SELECT 1 FROM character_sales WHERE seller_id=$1 AND state IN ('listed','reserved')) OR
                    EXISTS(SELECT 1 FROM item_sales WHERE seller_id=$1 AND state IN ('listed','reserved'))`,[auth.accountId])).rowCount;
                if(pending && !adding)throw new Error('wallet.finishOperations');
                // The same challenge binds both wallet proofs to this account/session/replacement.
                if(!adding && (!challenge.message.split('\n').includes('Previous wallet: '+linked.address)||!parsed.data.previousSignature||!validSignature(linked.address,challenge.message,parsed.data.previousSignature)))throw new Error('wallet.previousProofRequired');
            }
            if (!validSignature(challenge.address,challenge.message,parsed.data.signature)) throw new Error("wallet.invalidProof");
            const membership=(await client.query('SELECT account_id FROM account_linked_wallets WHERE address=$1',[challenge.address])).rows[0];
            if(membership && membership.account_id!==auth.accountId)throw new Error('wallet.alreadyLinked');
            const count=(await client.query('SELECT count(*)::int n FROM account_linked_wallets WHERE account_id=$1',[auth.accountId])).rows[0].n;
            if(!membership && count>=5)throw new Error('wallet.limitReached');
            // Account lock serializes membership count; global address uniqueness handles other accounts.
            if(linked)await client.query('INSERT INTO account_linked_wallets(account_id,address) VALUES($1,$2) ON CONFLICT(address) DO NOTHING',[auth.accountId,linked.address]);
            if(!membership)await client.query('INSERT INTO account_linked_wallets(account_id,address) VALUES($1,$2)',[auth.accountId,challenge.address]);
            if(!adding || !linked)await client.query(`INSERT INTO account_wallets (account_id, address) VALUES ($1, $2)
                ON CONFLICT (account_id) DO UPDATE SET address=EXCLUDED.address, linked_at=NOW()`, [auth.accountId, challenge.address]);
            if(!adding && linked && linked.address!==challenge.address){
                await client.query("DELETE FROM game_tickets WHERE account_id=$1",[auth.accountId]);
                await client.query("DELETE FROM auth_sessions WHERE account_id=$1 AND token<>$2",[auth.accountId,auth.credentialHash]);
            }
            await client.query("DELETE FROM wallet_link_challenges WHERE account_id=$1", [auth.accountId]);
            await client.query("COMMIT");
            res.json({ wallet: { address: adding && linked ? linked.address : challenge.address }, linkedWallet: {address:challenge.address} });
        } catch (error) {
            await client.query("ROLLBACK");
            const duplicate = (error as { code?: string }).code === "23505";
            const message = error instanceof Error && error.message.startsWith("wallet.") ? error.message : "wallet.failed";
            res.status(duplicate ? 409 : 400).json({ error: duplicate ? "wallet.alreadyLinked" : message });
        } finally { client.release(); }
    });
}
