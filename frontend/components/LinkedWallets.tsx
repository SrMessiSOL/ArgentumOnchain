"use client";
import {useEffect,useState} from 'react';
import {useGameWallet} from './GameWalletProvider';
import {useI18n} from './I18nProvider';
import {jsonPost} from '@/lib/game-wallet';
import {walletEnglish,walletSpanish} from '@/lib/wallet-locales';
export default function LinkedWallets(){
 const wallet=useGameWallet(),{locale}=useI18n(),es=locale==='es';
 const [list,setList]=useState<{address:string}[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function refresh(){const r=await fetch('/api/wallet',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error);setList(d.wallets??[]);}
 useEffect(()=>{void refresh().catch(()=>{});},[]);
 async function choose(link:boolean){setBusy(true);setError('');try{const signer=await wallet.connect(true);if(link&&!list.some(w=>w.address===signer.address)){const c=await jsonPost('/api/wallet/challenge',{address:signer.address,mode:'add'});const signature=await signer.signMessage(new TextEncoder().encode(c.message));await jsonPost('/api/wallet/verify',{signature:btoa(String.fromCharCode(...signature))});await refresh();}window.dispatchEvent(new Event('aochain:wallet-linked'));}catch(e){const key=e instanceof Error?e.message:'';const copy=es?walletSpanish:walletEnglish;setError(key in copy?copy[key as keyof typeof copy]:es?'No se pudo vincular. Reintentá.':'Could not link. Please retry.');}finally{setBusy(false);}}
 return <section className="portal-page-heading"><div><h2>{es?'Mis wallets':'My wallets'}</h2><p>{es?'Una cuenta, hasta cinco wallets. Cada wallet conserva sus NFTs y tokens. Cambiar la conexión no mueve activos.':'One account, up to five wallets. Each wallet keeps its own NFTs and tokens. Switching connections does not move assets.'}</p><p>{es?'Conectada:':'Connected:'} <code className="connection-address">{wallet.address??(es?'Ninguna':'None')}</code></p><div className="wallet-options">{Array.from({length:5},(_,i)=>{const w=list[i];return <div key={i}><strong>Wallet {i+1}</strong>{w?<><code className="connection-address">{w.address}</code><p>{w.address===wallet.address?(es?'Conectada':'Connected'):(es?'Seleccioná esta dirección en tu extensión para usar sus activos.':'Select this address in your extension to use its assets.')}</p><button disabled={busy} onClick={()=>choose(false)}>{es?'Conectar wallet':'Connect wallet'}</button></>:<button disabled={busy} onClick={()=>choose(true)}>{es?'Vincular wallet':'Link wallet'}</button>}</div>;})}</div><p>{es?'Para vincular: ingresá recientemente a tu cuenta, elegí la wallet y firmá un mensaje. No cuesta SOL.':'To link: sign in recently, choose the wallet and sign one message. No SOL fee.'}</p>{error&&<p role="alert">{error}</p>}</div></section>;
}
