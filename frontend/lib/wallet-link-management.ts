/** Different wallets enter the two-proof management flow, never transaction signing. */
export function needsWalletManagement(activeAddress:string|null|undefined,connectedAddress:string):boolean {
 return Boolean(activeAddress && activeAddress!==connectedAddress);
}
