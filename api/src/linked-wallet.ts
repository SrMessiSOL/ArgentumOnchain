import type {Request} from 'express';
import type {Pool,PoolClient} from 'pg';
/** Request selection is untrusted. Membership is checked on every use. */
export async function selectedWallet(req:Request,account:string,db:Pool|PoolClient){
 const requested=req.headers['x-aochain-wallet'];
 if(requested!==undefined&&(typeof requested!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(requested)))throw Error('economy.wrongWallet');
 const result=requested?await db.query('SELECT address FROM account_linked_wallets WHERE account_id=$1 AND address=$2',[account,requested]):await db.query('SELECT address FROM account_wallets WHERE account_id=$1',[account]);
 if(!result.rows[0])throw Error('economy.linkWallet');return result.rows[0].address as string;
}
/** Finalized custody history survives wallet switching and pending operations. */
export const ownerWalletSql=`(SELECT custody.wallet FROM (
 SELECT wallet,completed_at,id FROM game_asset_operations WHERE character_id=c.id AND kind IN ('mint','stake') AND state='complete'
 UNION ALL SELECT wallet,completed_at,id FROM economy_intents WHERE character_id=c.id AND kind='purchase' AND state='complete'
 ) custody ORDER BY completed_at DESC,id DESC LIMIT 1)`;
export async function assertCharacterWallet(db:Pool|PoolClient,id:string,address:string){
 const row=(await db.query(`SELECT c.asset_address,${ownerWalletSql} AS owner_wallet FROM characters c WHERE c.id=$1`,[id])).rows[0];
 if(!row||(row.asset_address&&row.owner_wallet!==address))throw Error('economy.wrongWallet');
}
