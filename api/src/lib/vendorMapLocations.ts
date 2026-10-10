import fs from 'node:fs';
import path from 'node:path';
export function readVendorMapLocations(mapsDir:string,stateDir?:string):Record<number,string[]> {
 const locations:Record<number,string[]>={};
 const folders=fs.readdirSync(mapsDir,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^mapa_\d+$/.test(d.name));
 if(!folders.length)throw Error('Map catalog is empty');
 for(const folder of folders){
  const meta=JSON.parse(fs.readFileSync(path.join(mapsDir,folder.name,'meta.json'),'utf8'));
  if(String(meta.zona).toUpperCase()!=='CIUDAD')continue;
  if(typeof meta.name!=='string')throw Error('Town name missing');
  // Preserve unnamed-town occurrences so shared NPCs cannot look town-unique.
  const town=meta.name.trim()||`[unnamed town ${folder.name}]`;
  const override=stateDir?path.join(stateDir,folder.name,'npcs.json'):undefined;
  const bundled=path.join(mapsDir,folder.name,'npcs.json');
  const file=override&&fs.existsSync(override)?override:bundled;
  // Match mapNpcStorage: a missing placement file means no NPC placements.
  const placements=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
  if(!Array.isArray(placements))throw Error('Invalid NPC placement file');
  for(const placement of placements){
   const id=Number(placement.npcIndex);if(!Number.isSafeInteger(id)||id<=0)throw Error('Invalid NPC template');
   locations[id]??=[];if(!locations[id].includes(town))locations[id].push(town);
  }
 }
 return locations;
}
