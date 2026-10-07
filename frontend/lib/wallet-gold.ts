export function canDepositWalletGold(amount:string,balance:string|null):boolean{
 if(balance===null||!/^\d+$/.test(balance)||!/^\d+$/.test(amount))return false;
 const value=BigInt(amount);return value>=BigInt(1)&&value<=BigInt('2147483647')&&value<=BigInt(balance);
}
