import type {Express} from 'express';
import pool from './db';
import {getPublicSessionByToken} from './repositories/auth';
import {requireAuth} from './middleware/auth';
export async function characterAchievementTitle(id:string){
 const r=await pool.query('SELECT t.kind FROM character_titles t JOIN characters c ON c.id=t.character_id WHERE c.id=$1 AND c.deleted_at IS NULL',[id]);return r.rows[0]?.kind??null;
}
export async function earnAchievements() {
 await pool.query(`INSERT INTO character_achievements(character_id,kind)
 SELECT id,'explorer' FROM characters WHERE deleted_at IS NULL AND (asset_address IS NULL OR chain_state='staked') AND level>=2 ON CONFLICT DO NOTHING`);
 await pool.query(`INSERT INTO character_achievements(character_id,kind)
 SELECT id,'first-hunt' FROM characters WHERE deleted_at IS NULL AND (asset_address IS NULL OR chain_state='staked') AND level>=2 AND npc_matados>=4 ON CONFLICT DO NOTHING`);
}
export function installAchievementRoutes(app:Express){
 // Opt-in cutover preserves legacy handlers for rollback. No legacy NFT records are deleted.
 app.get('/auth/cosmetics',async(req,res,next)=>{if(process.env.AOWEB_CHARACTER_ACHIEVEMENTS!=='1'){next();return;}const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];const s=token?await getPublicSessionByToken(token):null;if(!s){res.status(401).json({error:'cosmetic.signIn'});return;}const kind=s.selectedCharacterId?await characterAchievementTitle(s.selectedCharacterId):null;res.json({equipped:Boolean(kind),equippedKind:kind??'explorer',verification:'verified',characterId:s.selectedCharacterId});});
 app.get('/internal/characters/:id/cosmetic-title',requireAuth,async(req,res,next)=>{if(process.env.AOWEB_CHARACTER_ACHIEVEMENTS!=='1'){next();return;}if(!/^[0-9a-f-]{36}$/i.test(String(req.params.id))){res.status(400).json({error:'Invalid character ID'});return;}res.json({kind:await characterAchievementTitle(String(req.params.id))});});
 for(const action of ['claim','equip'])app.post('/auth/cosmetics/'+action,(_,res,next)=>{if(process.env.AOWEB_CHARACTER_ACHIEVEMENTS!=='1'){next();return;}res.status(410).json({error:'economy.characterAchievements'});});
 app.get('/auth/achievements',async(req,res)=>{const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];const s=token?await getPublicSessionByToken(token):null;if(!s){res.status(401).json({error:'economy.signIn'});return;}
 await earnAchievements();const rows=await pool.query(`SELECT c.id,c.name,c.level,c.npc_matados,c.connected,c.economy_lock,t.kind AS title,
 COALESCE((SELECT json_agg(a.kind) FROM character_achievements a WHERE a.character_id=c.id),'[]') AS achievements
 FROM characters c LEFT JOIN character_titles t ON t.character_id=c.id WHERE c.account_id=$1 AND c.deleted_at IS NULL ORDER BY c.name`,[s.account._id]);res.json({characters:rows.rows});});
 app.post('/auth/achievements/title',async(req,res)=>{const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];const s=token?await getPublicSessionByToken(token):null;if(!s){res.status(401).json({error:'economy.signIn'});return;}
 const {characterId,kind}=req.body??{};if(!/^[0-9a-f-]{36}$/i.test(characterId)||![null,'explorer','first-hunt'].includes(kind)){res.status(400).json({error:'economy.invalidRequest'});return;}
 await earnAchievements();const client=await pool.connect();try{await client.query('BEGIN');const c=(await client.query('SELECT account_id,economy_lock FROM characters WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[characterId])).rows[0];if(!c||c.account_id!==s.account._id||c.economy_lock)throw Error('economy.notOwned');
 if(kind===null)await client.query('DELETE FROM character_titles WHERE character_id=$1',[characterId]);else {const a=await client.query('SELECT 1 FROM character_achievements WHERE character_id=$1 AND kind=$2',[characterId,kind]);if(!a.rowCount)throw Error('economy.notEarned');await client.query('INSERT INTO character_titles VALUES($1,$2) ON CONFLICT(character_id) DO UPDATE SET kind=EXCLUDED.kind',[characterId,kind]);}await client.query('COMMIT');res.json({ok:true});}catch(e){await client.query('ROLLBACK');res.status(409).json({error:e instanceof Error?e.message:'economy.failed'});}finally{client.release();}});
 app.get('/internal/characters/:id/achievement-title',requireAuth,async(req,res)=>{await earnAchievements();const r=await pool.query('SELECT t.kind FROM character_titles t JOIN characters c ON c.id=t.character_id WHERE c.id=$1 AND c.deleted_at IS NULL',[req.params.id]);res.json({kind:r.rows[0]?.kind??null});});
}

