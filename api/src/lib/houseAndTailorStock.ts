type Entry={id:number;data:Record<string,any>};
const normalize=(s:unknown)=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function houseKeyTown(data:Record<string,any>):string|null {
    if(Number(data.objType)!==9)return null;
    return normalize(data.name).match(/^llave ([a-z]+) (?:casa\b|mansion\b)/)?.[1]??null;
}
export function planHouseAndTailorStock(objects:Entry[],npcs:Entry[],locations:Record<number,string[]>){
    const changes:Map<number,{id:number;before:Record<string,any>;after:Record<string,any>;added:number[]}>=new Map();
    const unresolved:Array<{id:number;name:string;reason:string}>=[];
    const add=(npc:Entry,item:Entry,quantity:number)=>{
        const change=changes.get(npc.id)??{id:npc.id,before:npc.data,after:{...npc.data,objs:(npc.data.objs??[]).map((x:any)=>({...x}))},added:[]};
        const existing=change.after.objs.find((x:any)=>Number(x.item)===item.id);
        if(existing && Number(existing.cant)>0)return;
        if(existing)existing.cant=quantity;else change.after.objs.push({item:item.id,cant:quantity});
        change.added.push(item.id);changes.set(npc.id,change);
    };
    for(const item of objects){
        if(Number(item.data.newbie??0)!==0)continue;
        const town=houseKeyTown(item.data);
        if(town){
            const candidates=npcs.filter(npc=>Number(npc.data.npcType)===10 && locations[npc.id]?.length===1 && normalize(locations[npc.id][0]).includes(town));
            const vendor=candidates.sort((a,b)=>Number(/propiedad|inmobili/.test(normalize(b.data.name)))-Number(/propiedad|inmobili/.test(normalize(a.data.name))) || a.id-b.id)[0];
            if(vendor)add(vendor,item,1);else unresolved.push({id:item.id,name:item.data.name,reason:`No vendor unique to ${town}; review placements before adding keys.`});
        }
        if(normalize(item.data.name)==='costurero'){
            const tailors=npcs.filter(npc=>Number(npc.data.npcType)===10 && /sastre/.test(normalize(npc.data.name)));
            if(!tailors.length)unresolved.push({id:item.id,name:item.data.name,reason:'No tailor vendor found.'});
            for(const npc of tailors)add(npc,item,1000);
        }
    }
    return {changes:[...changes.values()],unresolved};
}
