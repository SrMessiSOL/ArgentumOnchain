import type { Express, Request } from 'express';
import pool from './db';
import { getPublicSessionByToken } from './repositories/auth';
async function account(req: Request) {
  const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  return token ? (await getPublicSessionByToken(token))?.account._id : null;
}
export function installPreferencesRoutes(app: Express) {
  app.get('/auth/preferences', async(req,res)=>{
    const id=await account(req); if(!id) {res.status(401).json({error:'Authentication required'});return;}
    const result=await pool.query('SELECT locale FROM account_preferences WHERE account_id=$1',[id]);
    res.json({locale:result.rows[0]?.locale ?? null});
  });
  app.put('/auth/preferences', async(req,res)=>{
    const id=await account(req); if(!id) {res.status(401).json({error:'Authentication required'});return;}
    if(!['en','es'].includes(req.body?.locale)){res.status(400).json({error:'Invalid locale'});return;}
    await pool.query('INSERT INTO account_preferences(account_id,locale) VALUES($1,$2) ON CONFLICT(account_id) DO UPDATE SET locale=EXCLUDED.locale, updated_at=NOW()',[id,req.body.locale]);
    res.json({locale:req.body.locale});
  });
}
