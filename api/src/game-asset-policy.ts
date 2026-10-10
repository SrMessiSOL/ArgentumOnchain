import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import pool from './db';
import {verifyPlayableAsset} from './game-asset-chain';

export function canonical(value:unknown):string {
 if(value instanceof Date)return JSON.stringify(value.toISOString());
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
}
export function bundleHash(bundle:unknown){return createHash('sha256').update(canonical(bundle)).digest('hex');}
export async function readBundle(c:PoolClient,character:Record<string,unknown>){
 const id=character.id as string;
 const excluded=new Set(['account_id','ip','ip_banned_until','banned','privileges','connected','economy_lock','economy_login_until','updated_at','created_at','deleted_at','chain_state','chain_required','asset_address']);
 const data=Object.fromEntries(Object.entries(character).filter(([key])=>!excluded.has(key) && !(key==='skill_state' && character[key]==null)));
 const bundle:Record<string,unknown>={character:data};
 for(const table of ['character_items','character_bank_items','character_spells','character_achievements','character_titles']){
  const rows=(await c.query(`SELECT to_jsonb(t)-'character_id' AS value FROM ${table} t WHERE character_id=$1`,[id])).rows.map(r=>r.value);
  bundle[table]=rows.sort((a,b)=>canonical(a).localeCompare(canonical(b),'en'));
 }
 return bundle;
}
export async function saveSnapshot(c:PoolClient,character:Record<string,unknown>){
 const id=character.id as string;const bundle=await readBundle(c,character);
 const version=Number((await c.query('SELECT COALESCE(MAX(version),0)+1 AS version FROM character_snapshots WHERE character_id=$1',[id])).rows[0].version);
 const hash=bundleHash(bundle);const summary={name:character.name,level:character.level,gold:character.gold,inventory:(bundle.character_items as unknown[]).length,bank:(bundle.character_bank_items as unknown[]).length};
 await c.query('INSERT INTO character_snapshots(character_id,version,hash,bundle,summary) VALUES($1,$2,$3,$4,$5)',[id,version,hash,JSON.stringify(bundle),JSON.stringify(summary)]);
 return {version,hash};
}
/** Called while the caller holds a character row lock; RPC failure denies access. */
export async function assertPlayableCharacter(id:string,account:string,c?:PoolClient){
 const db=c??pool;
 const row=(await db.query('SELECT asset_address,chain_state,chain_required,account_id FROM characters WHERE id=$1',[id])).rows[0];
 if(!row||row.account_id!==account)throw Error('assets.notOwned');

 if(!row.asset_address||row.chain_state!=='staked')throw Error('Mint and stake this character from your profile before entering the realm.');
 const wallet=(await db.query('SELECT address FROM account_wallets WHERE account_id=$1',[account])).rows[0]?.address;
 if(!wallet||!await verifyPlayableAsset(row.asset_address,wallet))throw Error('The character stake could not be verified. Check your linked wallet and retry.');
}
