/** Different wallets enter the two-proof management flow, never transaction signing. */
export function needsWalletManagement(activeAddress:string|null|undefined,connectedAddress:string):boolean {
 return Boolean(activeAddress && activeAddress!==connectedAddress);
}

/** A resolved signature is not completion; the API must confirm the same address. */
export async function linkAdditionalWallet(
 wallet:{address:string;signMessage(message:Uint8Array):Promise<Uint8Array>},
 post:(path:string,body:unknown)=>Promise<any>,
 onStage:(stage:'approve'|'verify')=>void,
){
 onStage('approve');
 const challenge=await post('/api/wallet/challenge',{address:wallet.address,mode:'add'});
 if(typeof challenge.message!=='string'||!challenge.message)throw Error('wallet.invalidProof');
 const signature=await wallet.signMessage(new TextEncoder().encode(challenge.message));
 onStage('verify');
 const result=await post('/api/wallet/verify',{signature:btoa(String.fromCharCode(...signature))});
 if(result.linkedWallet?.address!==wallet.address)throw Error('wallet.invalidProof');
 return {address:wallet.address};
}
