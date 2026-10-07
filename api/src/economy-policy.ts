export const MAX_GOLD=2147483647;
export function goldAmount(value:unknown):number {
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>MAX_GOLD)throw Error('economy.invalidAmount');
 return value;
}
export function saleLamports(value:unknown):number {
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1000000||value>1000000000000)throw Error('economy.invalidPrice');
 return value;
}
export function assertCharacterAvailable(c:{connected:boolean;economy_lock:string|null;economy_login_until?:Date|null;privileges:number;banned:Date|null;clan_id?:string|null;deleted_at?:Date|null},sale=false) {
 if(c.connected||c.economy_lock||(c.economy_login_until&&new Date(c.economy_login_until).getTime()>Date.now()))throw Error('economy.logout');
 if(c.deleted_at||c.privileges!==0||(c.banned&&new Date(c.banned).getTime()>Date.now()))throw Error('economy.restricted');
 if(sale&&c.clan_id)throw Error('economy.leaveClan');
}
