export type CosmeticWalletStatus = {
    equipped:boolean; verification:string; equippedKind:string;
};
export function cosmeticWalletState(status:CosmeticWalletStatus|null, checking:boolean, error:string|null) {
    if(checking)return 'checking';
    if(error==='cosmetic.signIn')return 'sign-in';
    if(error || !status || status.verification==='unavailable')return 'unavailable';
    if(status.equipped && status.verification==='verified')return 'equipped';
    if(status.verification==='verified')return 'not-owned';
    return 'none';
}
export function isCosmeticAssetAddress(value:string):boolean {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}
