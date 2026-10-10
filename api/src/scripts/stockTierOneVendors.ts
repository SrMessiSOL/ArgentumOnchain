import fs from 'node:fs';
import path from 'node:path';
import pool from '../db';
import {computeChecksum,normalizeNpcData,type GameNpcRecordData} from '../lib/gameData';
import {planTierOneVendorStock} from '../lib/tierOneVendorStock';

async function main() {
    const apply=process.argv.includes('--apply');
    const backupIndex=process.argv.indexOf('--backup');
    const backup=backupIndex>=0?process.argv[backupIndex+1]:undefined;
    if(apply && (!backup || backup.startsWith('--')))throw Error('--apply requires --backup <new file path>');
    const client=await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtext('aochain-tier-one-vendors'))");
        const objects=await client.query('SELECT id,data FROM game_objects ORDER BY id FOR SHARE');
        const npcs=await client.query('SELECT id,data FROM game_npcs ORDER BY id FOR UPDATE');
        if(!objects.rows.length || !npcs.rows.length)throw Error('Catalog is empty; refusing to seed or change it.');
        const plan=planTierOneVendorStock(objects.rows,npcs.rows);
        console.log(JSON.stringify({mode:apply?'apply':'dry-run',eligibleItems:plan.eligibleItems,unresolved:plan.unresolved,changes:plan.changes.map(({id,name,added})=>({id,name,added}))},null,2));
        if(plan.unresolved.length)throw Error('Some Tier 1 items have no reviewed vendor group. No changes applied.');
        if(!apply || !plan.changes.length){await client.query('ROLLBACK');return;}
        fs.writeFileSync(path.resolve(backup!),JSON.stringify(Object.fromEntries(plan.changes.map(({id,before})=>[String(id),before])),null,2),{encoding:'utf8',flag:'wx'});
        for(const change of plan.changes) {
            const data=normalizeNpcData(change.after as GameNpcRecordData),checksum=computeChecksum(data);
            const revision=await client.query("INSERT INTO game_data_revisions(kind,entity_id,action,checksum) VALUES('npcs',$1,'upsert',$2) RETURNING id",[change.id,checksum]);
            await client.query('UPDATE game_npcs SET data=$2::jsonb,checksum=$3,version=$4,updated_at=NOW() WHERE id=$1',[change.id,JSON.stringify(data),checksum,revision.rows[0].id]);
        }
        await client.query('COMMIT');
        console.log(`Applied ${plan.changes.length} vendor updates. Backup written before changes.`);
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
main().catch(()=>{console.error('Vendor update failed; no partial stock changes were committed. Review catalog, backup path and database access.');process.exitCode=1;}).finally(()=>pool.end());
