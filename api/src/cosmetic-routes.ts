import type {Express,Request} from 'express';
import {installCosmeticInspection} from './cosmetic-inspection';
import pool from './db';
import {getPublicSessionByToken} from './repositories/auth';
import {cosmeticChain,cosmeticChainReady} from './cosmetic-chain';
import {COSMETIC_SEASON,HUNT_SEASON,HUNT_SUPPLY,eligibleForExplorer,ownsExplorer} from './cosmetic-policy';
async function player(req:Request) {
  const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  const session=token ? await getPublicSessionByToken(token) : null;
  if(!session)return null;
  const id=session.account._id;
  const data=await pool.query(`SELECT w.address, COALESCE((SELECT MAX(level) FROM characters WHERE account_id=$1 AND deleted_at IS NULL),0) AS level, EXISTS(SELECT 1 FROM characters WHERE account_id=$1 AND deleted_at IS NULL AND level>=2 AND npc_matados>=4) AS hunt_eligible, COALESCE((SELECT MAX(npc_matados) FROM characters WHERE account_id=$1 AND deleted_at IS NULL AND level>=2),0) AS kills FROM accounts a LEFT JOIN account_wallets w ON w.account_id=a.id WHERE a.id=$1`,[id]);
  return {id,wallet:data.rows[0].address as string|null,level:Number(data.rows[0].level),huntEligible:Boolean(data.rows[0].hunt_eligible),kills:Number(data.rows[0].kills)};
}
export function installCosmeticRoutes(app:Express) {
  installCosmeticInspection(app);
  app.get('/auth/cosmetics',async(req,res)=>{
    const p=await player(req);if(!p){res.status(401).json({error:'cosmetic.signIn'});return;}
    const result=await pool.query('SELECT asset_address,state FROM cosmetic_claims WHERE account_id=$1 AND season=$2',[p.id,COSMETIC_SEASON]);
    const equipped=await pool.query(`SELECT e.asset_address,c.issuer_address,c.season FROM cosmetic_equipment e JOIN cosmetic_claims c USING(asset_address) WHERE e.account_id=$1`,[p.id]);
    const huntClaim=await pool.query('SELECT asset_address,state FROM cosmetic_claims WHERE account_id=$1 AND season=$2',[p.id,HUNT_SEASON]);
    const reserved=Number((await pool.query('SELECT count(*) FROM cosmetic_supply_reservations WHERE season=$1',[HUNT_SEASON])).rows[0].count);
    let active=false, verification:'verified'|'unavailable'|'none'='none';
    if(equipped.rows[0]&&p.wallet&&cosmeticChainReady()){
      try{const chain=await cosmeticChain();active=ownsExplorer(await chain.fetch(equipped.rows[0].asset_address),p.wallet,equipped.rows[0].issuer_address);verification='verified';}
      catch{verification='unavailable';}
    }
    res.json({network:'devnet',ready:cosmeticChainReady(),level:p.level,eligible:eligibleForExplorer(p.level),wallet:p.wallet,claim:result.rows[0]??null,equipped:active,equippedAsset:active?equipped.rows[0].asset_address:null,equippedKind:active&&equipped.rows[0].season===HUNT_SEASON?'first-hunt':'explorer',verification,hunt:{eligible:p.huntEligible,kills:p.kills,limit:HUNT_SUPPLY,remaining:Math.max(0,HUNT_SUPPLY-reserved),claim:huntClaim.rows[0]??null}});
  });
  app.post('/auth/cosmetics/claim',async(req,res)=>{
    if(req.body?.kind!==undefined && req.body.kind!=='explorer' && req.body.kind!=='first-hunt'){res.status(400).json({error:'cosmetic.invalidKind'});return;}
    const hunt=req.body?.kind==='first-hunt';
    const season=hunt?HUNT_SEASON:COSMETIC_SEASON;
    const p=await player(req);if(!p){res.status(401).json({error:'cosmetic.signIn'});return;}
    if(!p.wallet){res.status(409).json({error:'cosmetic.linkWallet'});return;}
    if(!eligibleForExplorer(p.level)){res.status(403).json({error:'cosmetic.levelRequired'});return;}
    if(hunt&&!p.huntEligible){res.status(403).json({error:'cosmetic.huntRequired'});return;}
    if(!cosmeticChainReady()){res.status(503).json({error:'cosmetic.unavailable'});return;}
    const client=await pool.connect();let locked=false,supplyLocked=false;
    try{
      locked=(await client.query('SELECT pg_try_advisory_lock(hashtext($1),202610) AS locked',[p.id])).rows[0].locked;
      if(!locked){res.status(409).json({error:'cosmetic.pending'});return;}
      if(hunt){
        supplyLocked=(await client.query('SELECT pg_try_advisory_lock(hashtext($1),202611) AS locked',[HUNT_SEASON])).rows[0].locked;
        if(!supplyLocked){res.status(409).json({error:'cosmetic.pending'});return;}
        const existing=(await client.query('SELECT 1 FROM cosmetic_supply_reservations WHERE account_id=$1 AND season=$2',[p.id,season])).rowCount;
        const count=Number((await client.query('SELECT count(*) FROM cosmetic_supply_reservations WHERE season=$1',[season])).rows[0].count);
        if(!existing&&count>=HUNT_SUPPLY){res.status(409).json({error:'cosmetic.soldOut'});return;}
      }
      const chain=await cosmeticChain();
      const address=(hunt?chain.derive(p.id,season):chain.derive(p.id)).publicKey.toString();
      const metadata=new URL(process.env.AOWEB_DEVNET_METADATA_URL!);
      if(hunt)metadata.searchParams.set('kind','first-hunt');
      const uri=metadata.toString();
      if(new URL(uri).protocol!=='https:')throw new Error('Metadata must use HTTPS');
      if(hunt)await client.query('INSERT INTO cosmetic_supply_reservations(season,account_id,asset_address) VALUES($1,$2,$3) ON CONFLICT(season,account_id) DO NOTHING',[season,p.id,address]);
      await client.query(`INSERT INTO cosmetic_claims(account_id,season,asset_address,wallet_address,issuer_address,metadata_uri) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(account_id,season) DO NOTHING`,[p.id,season,address,p.wallet,chain.issuer,uri]);
      const row=(await client.query('SELECT * FROM cosmetic_claims WHERE account_id=$1 AND season=$2',[p.id,season])).rows[0];
      // A changed wallet/issuer cannot redirect or duplicate a prepared issuance.
      if(row.wallet_address!==p.wallet||row.asset_address!==address||row.issuer_address!==chain.issuer){res.status(409).json({error:'cosmetic.claimConflict'});return;}
      if(row.state==='confirmed'){res.json({asset:row.asset_address,signature:row.signature,network:'devnet'});return;}
      let asset=await chain.fetch(row.asset_address),signature=row.signature;
      if(!asset){signature=hunt?await chain.mint(p.id,row.wallet_address,row.metadata_uri,season,'AOWeb First Hunt — Devnet'):await chain.mint(p.id,row.wallet_address,row.metadata_uri);asset=await chain.fetch(row.asset_address);}
      if(!asset||asset.issuer!==row.issuer_address||asset.uri!==row.metadata_uri)throw new Error('Issuance not yet verified');
      await client.query("UPDATE cosmetic_claims SET state='confirmed',signature=$3 WHERE account_id=$1 AND season=$2",[p.id,season,signature]);
      res.json({asset:row.asset_address,signature,network:'devnet'});
    }catch(error){console.error('Devnet cosmetic claim failed:',error instanceof Error?error.message:'unknown');res.status(503).json({error:'cosmetic.retry'});}
    finally{if(supplyLocked)await client.query('SELECT pg_advisory_unlock(hashtext($1),202611)',[HUNT_SEASON]);if(locked)await client.query('SELECT pg_advisory_unlock(hashtext($1),202610)',[p.id]);client.release();}
  });
  app.post('/auth/cosmetics/equip',async(req,res)=>{
    const p=await player(req);if(!p){res.status(401).json({error:'cosmetic.signIn'});return;}
    if(req.body?.asset===null){await pool.query('DELETE FROM cosmetic_equipment WHERE account_id=$1',[p.id]);res.json({equipped:false});return;}
    if(!p.wallet||typeof req.body?.asset!=='string'){res.status(400).json({error:'cosmetic.linkWallet'});return;}
    const row=(await pool.query("SELECT issuer_address FROM cosmetic_claims WHERE asset_address=$1 AND season=ANY($2::text[]) AND state='confirmed'",[req.body.asset,[COSMETIC_SEASON,HUNT_SEASON]])).rows[0];
    if(!row){res.status(404).json({error:'cosmetic.notOwned'});return;}
    try{
      const chain=await cosmeticChain();
      if(!ownsExplorer(await chain.fetch(req.body.asset),p.wallet,row.issuer_address)){res.status(403).json({error:'cosmetic.notOwned'});return;}
      await pool.query('INSERT INTO cosmetic_equipment(account_id,asset_address) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET asset_address=EXCLUDED.asset_address',[p.id,req.body.asset]);
      res.json({equipped:true});
    }catch{res.status(503).json({error:'cosmetic.retry'});}
  });
}
