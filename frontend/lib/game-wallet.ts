import type {Transaction} from '@solana/web3.js';
export type WalletSigner={address:string;signMessage(message:Uint8Array):Promise<Uint8Array>;signTransaction(tx:Transaction):Promise<Transaction>};
export async function jsonPost(path:string,body:unknown){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error??'assets.failed');return d;}
export async function ensureLinkedWallet(wallet:WalletSigner){
 const r=await fetch('/api/wallet',{cache:'no-store'}),data=await r.json();if(!r.ok)throw Error('wallet.signIn');
 if(data.wallet?.address){if(data.wallet.address!==wallet.address)throw Error('economy.wrongWallet');return;}
 const challenge=await jsonPost('/api/wallet/challenge',{address:wallet.address});const signature=await wallet.signMessage(new TextEncoder().encode(challenge.message));await jsonPost('/api/wallet/verify',{signature:btoa(String.fromCharCode(...signature))});window.dispatchEvent(new Event('aochain:wallet-linked'));
}
export type WalletInventory={wallet:string;network:string;goldBalance:string|null;goldMint:string|null;checkedAt:string;assets:{address:string;kind:'character'|'item';name:string;quantity:number|null;characterId:string;staked:boolean;itemId?:number;appearance?:{bodyId:number;headId:number;weaponId:number;shieldId:number;helmetId:number}}[]};
