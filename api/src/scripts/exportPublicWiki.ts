import fs from 'node:fs';
import path from 'node:path';
import {getPublicWiki} from '../repositories/wiki';
import pool from '../db';
async function main(){
 const index=process.argv.indexOf('--output'),output=index>=0?process.argv[index+1]:undefined;
 if(!output || output.startsWith('--'))throw Error('--output <new file path> required');
 const wiki=await getPublicWiki();
 if(!wiki.equipment.length || !wiki.npcs.length)throw Error('Empty catalog export refused');
 fs.writeFileSync(path.resolve(output),JSON.stringify(wiki,null,2),{encoding:'utf8',flag:'wx'});
 console.log(`Exported ${wiki.equipment.length} public objects and ${wiki.npcs.length} NPCs.`);
}
main().catch(()=>{console.error('Public wiki export failed; check database access and use a new output path.');process.exitCode=1;}).finally(()=>pool.end());
