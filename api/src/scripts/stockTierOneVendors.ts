import fs from 'node:fs';
import path from 'node:path';
import pool from '../db';
import {computeChecksum,normalizeNpcData,type GameNpcRecordData} from '../lib/gameData';
import {planHouseAndTailorStock} from '../lib/houseAndTailorStock';
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
        const mapsIndex=process.argv.indexOf('--maps-dir');
        const mapsDir=mapsIndex>=0?process.argv[mapsIndex+1]:undefined;
        if(!mapsDir)throw Error('--maps-dir <authoritative host map directory> is required for town vendors.');
        const locations:Record<number,string[]>={};
        for(const folder of fs.readdirSync(mapsDir,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^mapa_\d+$/.test(d.name))){
            const meta=JSON.parse(fs.readFileSync(path.join(mapsDir,folder.name,'meta.json'),'utf8'));
            if(String(meta.zona).toUpperCase()!=='CIUDAD')continue;
            const placements=JSON.parse(fs.readFileSync(path.join(mapsDir,folder.name,'npcs.json'),'utf8'));
            for(const placement of placements){const id=Number(placement.npcIndex);locations[id]??=[];if(!locations[id].includes(meta.name))locations[id].push(meta.name);}
        }
        const base=npcs.rows.map(npc=>({id:npc.id,data:plan.changes.find(c=>c.id===npc.id)?.after??npc.data}));
        const extras=planHouseAndTailorStock(objects.rows,base,locations);
        plan.unresolved.push(...extras.unresolved);
        for(const extra of extras.changes){const existing=plan.changes.find(c=>c.id===extra.id);if(existing){existing.after=extra.after as typeof existing.after;existing.added.push(...extra.added);}else plan.changes.push({...extra,name:extra.before.name,after:extra.after as any});}

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
