import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export type IssuanceBudget={directory:string;maximumGold:number;maximumAssets:number;maximumCosmetics:number};
type Reservation={id:string;digest:string;gold:number;assets:number;cosmetics:number};
/** Signer-owned lifetime ceilings; reservations are never automatically refunded/reset. */
export function reserveIssuance(budget:IssuanceBudget,id:string,message:string,cost:{gold:number;assets:number;cosmetics:number}){
 const safe=(n:number)=>Number.isSafeInteger(n)&&n>=0;
 if(!/^[0-9a-f-]{36}$/i.test(id)||![budget.maximumGold,budget.maximumAssets,budget.maximumCosmetics,cost.gold,cost.assets,cost.cosmetics].every(safe))throw Error('signer.budgetDenied');
 const lock=path.join(budget.directory,'budget.lock');
 const lockFd=fs.openSync(lock,'wx',0o600);
 try{
  const requested:Reservation={id,digest:createHash('sha256').update(message).digest('hex'),...cost};
  let gold=0,assets=0,cosmetics=0;
  for(const name of fs.readdirSync(budget.directory)){
   if(name==='budget.lock')continue;
   if(!/^[0-9a-f-]{36}\.json$/i.test(name))throw Error('signer.budgetCorrupt');
   const row=JSON.parse(fs.readFileSync(path.join(budget.directory,name),'utf8')) as Reservation;
   if(name!==row.id+'.json'||typeof row.digest!=='string'||!/^[a-f0-9]{64}$/.test(row.digest)||![row.gold,row.assets,row.cosmetics].every(safe))throw Error('signer.budgetCorrupt');
   if(row.id===id){if(JSON.stringify(row)!==JSON.stringify(requested))throw Error('signer.budgetConflict');return;}
   gold+=row.gold;assets+=row.assets;cosmetics+=row.cosmetics;
  }
  if(![gold,assets,cosmetics].every(safe)||gold+cost.gold>budget.maximumGold||assets+cost.assets>budget.maximumAssets||cosmetics+cost.cosmetics>budget.maximumCosmetics)throw Error('signer.budgetDenied');
  const fd=fs.openSync(path.join(budget.directory,id+'.json'),'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(requested));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 }finally{fs.closeSync(lockFd);fs.unlinkSync(lock);}
}
