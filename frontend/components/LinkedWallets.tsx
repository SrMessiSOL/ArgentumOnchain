"use client";
import {useEffect,useState} from 'react';
import {useGameWallet} from './GameWalletProvider';
import {useI18n} from './I18nProvider';
import {jsonPost} from '@/lib/game-wallet';
import {walletEnglish,walletSpanish} from '@/lib/wallet-locales';
type Proof={message:string;address:string;previousWallet?:string;signature:string};
export default function LinkedWallets(){
 const wallet=useGameWallet(),{locale}=useI18n(),es=locale==='es';
 const [list,setList]=useState<{address:string}[]>([]),[active,setActive]=useState(''),[proof,setProof]=useState<Proof|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function refresh(){const r=await fetch('/api/wallet',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setList(d.wallets??(d.wallet?[d.wallet]:[]));setActive(d.wallet?.address??'');}
 useEffect(()=>{void refresh().catch(()=>{});},[]);
 const encoded=(s:Uint8Array)=>btoa(String.fromCharCode(...s));
 async function run(action:()=>Promise<void>){setBusy(true);setError('');try{await action();}catch(e){const key=e instanceof Error?e.message:'';const copy=es?walletSpanish:walletEnglish;setError(key in copy?copy[key as keyof typeof walletEnglish]:es?'No pudimos completar la vinculación. Verificá las wallets y reintentá.':'Linking could not finish. Check the wallets and retry.');}finally{setBusy(false);}}
 async function begin(mode:'add'|'activate'){
 const signer=await wallet.connect(true);
 const c=await jsonPost('/api/wallet/challenge',{address:signer.address,mode});
 const signature=encoded(await signer.signMessage(new TextEncoder().encode(c.message)));
 if(c.requiresPreviousWalletProof){setProof({message:c.message,address:signer.address,previousWallet:c.previousWallet,signature});return;}
 await jsonPost('/api/wallet/verify',{signature});await refresh();window.dispatchEvent(new Event('aochain:wallet-linked'));
 }
 async function approve(){if(!proof)return;await wallet.disconnect();const signer=await wallet.connect(true);if(signer.address!==proof.previousWallet)throw Error('wallet.previousProofRequired');const previousSignature=encoded(await signer.signMessage(new TextEncoder().encode(proof.message)));await jsonPost('/api/wallet/verify',{signature:proof.signature,previousSignature});setProof(null);await refresh();window.dispatchEvent(new Event('aochain:wallet-linked'));}
 return <section className="portal-page-heading"><div><h2>{es?'Wallets de tu cuenta':'Account wallets'}</h2><p>{es?'Hasta 5 wallets verificadas. Una wallet activa para NFTs, SPL y marketplace. Agregar una wallet no mueve activos.':'Up to 5 verified wallets. One active wallet for NFTs, SPL and marketplace. Adding a wallet does not move assets.'}</p>
 <p>{es?'Wallet conectada:':'Connected wallet:'} <code className="connection-address">{wallet.address??(es?'Ninguna':'None')}</code></p><p>{es?'Para agregar otra wallet, primero salí de tu cuenta e ingresá de nuevo. Firmá con la nueva wallet y luego con la activa.':'Before adding another wallet, sign out of your account and sign in again. Sign with the new wallet, then with the active wallet.'}</p><ul>{list.map(w=><li key={w.address}><code className="connection-address">{w.address}</code>{w.address===active?(es?' — Activa':' — Active'):''}</li>)}</ul>
 {proof?<><p>{es?'Conectá la wallet activa para aprobar este mismo mensaje antes de que venza:':'Connect the active wallet to approve this same message before it expires:'} <code>{proof.previousWallet}</code></p><button disabled={busy} onClick={()=>run(approve)}>{es?'Firmar con la wallet activa':'Approve with active wallet'}</button><button disabled={busy} onClick={()=>setProof(null)}>{es?'Cancelar':'Cancel'}</button></>:<><button disabled={busy||list.length>=5} onClick={()=>run(()=>begin('add'))}>{es?'Elegir y vincular otra wallet':'Choose and link another wallet'}</button><button disabled={busy} onClick={()=>run(()=>begin('activate'))}>{es?'Elegir wallet activa':'Choose active wallet'}</button><button disabled={busy} onClick={()=>run(async()=>{await wallet.disconnect();await wallet.connect(true);})}>{es?'Cambiar wallet conectada':'Change connected wallet'}</button></>}
 <p>{es?'Para cambiar la activa: salí del juego, retirá los personajes stakeados y resolvé operaciones y ventas pendientes. Ambas wallets deben firmar.':'To change the active wallet: log out of the game, unstake characters and resolve pending operations and listings. Both wallets must sign.'}</p>{error&&<p role="alert">{error}</p>}</div></section>;
}
