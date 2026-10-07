export type EconomyIntent={id:string;kind:string;state:string;amount:string;signature:string|null;character_id:string;listing_id:string|null};
export type EconomyProgress={id?:string;kind:string;name:string;characterId?:string;listingId?:string;stage:'preparing'|'signing'|'confirming'|'awaitingExpiry'|'complete'|'failed';signature?:string|null};
export function updateEconomyProgress(current:EconomyProgress|null,intents:EconomyIntent[],characters:{id:string;name:string}[],signing=false):EconomyProgress|null{
 if(current?.id&&['complete','failed'].includes(current.stage))return current;
 const intent=current?.id?intents.find(i=>i.id===current.id):intents.find(i=>i.state==='prepared'||i.state==='signed');
 if(!intent)return current;
 const base=current??{kind:intent.kind,name:characters.find(c=>c.id===intent.character_id)?.name??'',characterId:intent.character_id,listingId:intent.listing_id??undefined};
 const stage=intent.state==='complete'?'complete':intent.state==='failed'?'failed':intent.signature?'confirming':signing&&current?.stage==='signing'?'signing':'awaitingExpiry';
 return {...base,name:base.name||characters.find(c=>c.id===intent.character_id)?.name||'',id:intent.id,stage,signature:intent.signature};
}
export function economyInProgress(progress:EconomyProgress|null){return Boolean(progress&&!['complete','failed'].includes(progress.stage));}
