import type {Express} from 'express';
import pool from './db';
import {requireAuth} from './middleware/auth';
import {cosmeticChain, cosmeticChainReady} from './cosmetic-chain';
import {COSMETIC_SEASON,HUNT_SEASON,ownsExplorer} from './cosmetic-policy';

export function installCosmeticInspection(app:Express) {
    // Server-to-server only: no wallet, account or asset details are exposed.
    app.get('/internal/characters/:id/cosmetic-title', requireAuth, async(req,res)=>{
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(req.params.id))){res.status(400).json({error:'Invalid character ID'});return;}
        try {
            if(!cosmeticChainReady()){res.json({kind:null});return;}
            const result=await pool.query(`SELECT w.address AS wallet, c.asset_address, c.issuer_address, c.season
                FROM characters p JOIN cosmetic_equipment e ON e.account_id=p.account_id
                JOIN cosmetic_claims c ON c.asset_address=e.asset_address
                JOIN account_wallets w ON w.account_id=p.account_id
                WHERE p.id=$1 AND p.deleted_at IS NULL AND c.state='confirmed'
                AND c.season=ANY($2::text[])`,[req.params.id,[COSMETIC_SEASON,HUNT_SEASON]]);
            const row=result.rows[0];
            if(!row){res.json({kind:null});return;}
            const chain=await cosmeticChain();
            const owned=ownsExplorer(await chain.fetch(row.asset_address),row.wallet,row.issuer_address);
            res.json({kind:owned?(row.season===HUNT_SEASON?'first-hunt':'explorer'):null});
        } catch {res.status(503).json({error:'Cosmetic verification unavailable'});}
    });
}
