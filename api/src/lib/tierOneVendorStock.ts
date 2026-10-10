type Entry={id:number;data:Record<string,any>};
const newbieIds=new Set([561,562,563,564,565,855,856,857,858,859,860,861,862,863,864,1044,1045,1046,1047,1048,1051,1052]);
const normalize=(name:unknown)=>String(name??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function itemGroup(data:Record<string,any>):string|null {
    const name=normalize(data.name);
    switch(Number(data.objType)) {
        case 2: return /baston|vara|laud|flauta/.test(name)?'magic':'weapons';
        case 3: return /tunica|manto|vestimenta|ropa|traje/.test(name)?'clothes':'armor';
        case 16: case 17: return 'armor';
        case 18: case 26: return 'magic';
        case 31: return 'ships';
        default:return null;
    }
}
function vendorGroup(npc:Entry,objects:Map<number,Record<string,any>>):string|null {
    const name=normalize(npc.data.name);
    if(/sastre|tunica/.test(name))return 'clothes';
    if(/armadura/.test(name))return 'armor';
    if(/herrero|armas/.test(name))return 'weapons';
    if(/mago|magia/.test(name))return 'magic';
    if(/astillero|barcos/.test(name))return 'ships';
    const groups=new Set<string>();
    for(const stock of npc.data.objs??[]) {
        const item=objects.get(Number(stock.item));
        const group=item && itemGroup(item);
        if(group)groups.add(group);
    }
    // Mixed/unknown shops need explicit review rather than guessing their trade.
    return groups.size===1?[...groups][0]:null;
}
export function planTierOneVendorStock(objects:Entry[],npcs:Entry[]) {
    const lookup=new Map(objects.map(item=>[item.id,item.data]));
    const items=objects.filter(item=>Number(item.data.tier)===1 && Number(item.data.newbie??0)===0 && !newbieIds.has(item.id) && Number(item.data.objType)!==5);
    const vendors=npcs.filter(npc=>Number(npc.data.npcType)===10).map(npc=>({...npc,group:vendorGroup(npc,lookup)}));
    const unresolved=items.filter(item=>!itemGroup(item.data) || !vendors.some(npc=>npc.group===itemGroup(item.data))).map(item=>({id:item.id,name:item.data.name}));
    const changes=vendors.flatMap(npc=>{
        const additions=items.filter(item=>npc.group && itemGroup(item.data)===npc.group && !(npc.data.objs??[]).some((stock:any)=>Number(stock.item)===item.id && Number(stock.cant)>0));
        if(!additions.length)return [];
        const stock=(npc.data.objs??[]).map((entry:any)=>({...entry}));
        for(const item of additions) {
            const existing=stock.find((entry:any)=>Number(entry.item)===item.id);
            if(existing)existing.cant=1000;else stock.push({item:item.id,cant:1000});
        }
        return [{id:npc.id,name:npc.data.name,added:additions.map(item=>item.id),before:npc.data,after:{...npc.data,objs:stock}}];
    });
    return {eligibleItems:items.length,unresolved,changes};
}
