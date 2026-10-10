// Higher-tier crafting/smelting outputs and NPC drops belong to the player economy.
// Normal Tier 1 equipment, worker tools and potions are acquisition-source exceptions.
export function isHouseKey(object:Record<string,any>):boolean {
    const name=String(object.name??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    return Number(object.objType)===9 && /^llave [a-z]+ (casa\b|mansion\b)/.test(name);
}
export function isTierOneVendorItem(object:Record<string,any>):boolean {
    return Number(object.tier)===1 && [2,3,16,17,18,26,31].includes(Number(object.objType));
}
const workerTools = new Set([127,138,187,198,389,1005]);
function isWorkerTool(itemId:number, object:Record<string,any>):boolean {
    // The database owns the sewing-kit ID; match its canonical catalog name.
    return workerTools.has(Number(itemId)) || String(object.name ?? '').trim().toLowerCase()==='costurero';
}
const legacyNewbieIds = new Set([561,562,563,564,565,855,856,857,858,859,860,861,862,863,864,1044,1045,1046,1047,1048,1051,1052]);
function isNewbie(itemId:number, object:Record<string,any>):boolean {
    return legacyNewbieIds.has(Number(itemId)) || object.newbie===true || Number(object.newbie ?? 0)!==0;
}
// Explicit catalog: provisions, travel tickets and basic clothes.
// New entries require review; unknown items cannot silently become vendor stock.
const vendorCatalog = new Set([1,22,23,24,25,29,31,32,35,42,43,158,160,161,
    498,522,533,550,557,612,622,754,958,
    1054,1055,1056,1057,1058,1065]);
export function canBuyFromNpc(itemId: number, objects: Record<string, any>,
    npcs: Record<string, any>, recipes: Array<{itemId: number; deleted?: boolean}>,
    smelting: Array<{ingotItemId: number; deleted?: boolean}> = []): boolean {
    const object=objects[itemId];
    if (!object || isNewbie(itemId,object) || Number(object.objType)===5) return false;
    if (isHouseKey(object) || isTierOneVendorItem(object) || Number(object.objType)===11 || isWorkerTool(itemId,object)) return true;
    return vendorCatalog.has(Number(itemId)) && canNpcVendorTrade(itemId,objects,npcs,recipes,smelting);
}
export function canNpcVendorTrade(itemId: number, objects: Record<string, any>,
    npcs: Record<string, any>, recipes: Array<{itemId: number; deleted?: boolean}>,
    smelting: Array<{ingotItemId: number; deleted?: boolean}> = []): boolean {
    const object = objects[itemId];
    if (!object || isNewbie(itemId,object) || Number(object.objType)===5) return false;
    if (isHouseKey(object) || isTierOneVendorItem(object) || Number(object.objType) === 11 || isWorkerTool(itemId,object)) return true;
    if (recipes.some(recipe => !recipe.deleted && Number(recipe.itemId) === Number(itemId))) return false;
    if (smelting.some(recipe => !recipe.deleted && Number(recipe.ingotItemId) === Number(itemId))) return false;
    return !Object.values(npcs).some(npc =>
        Array.isArray(npc.drop) && npc.drop.some((drop: any) => Number(drop.item) === Number(itemId) && Number(drop.cant) > 0));
}
