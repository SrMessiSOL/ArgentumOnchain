"use client";
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Wallet,Plus,CheckCircle2,LoaderCircle,ArrowRight} from 'lucide-react';
import {useGameWallet} from './GameWalletProvider';
import {useI18n} from './I18nProvider';
import {jsonPost} from '@/lib/game-wallet';
import {linkAdditionalWallet} from '@/lib/wallet-link-management';
import {walletEnglish,walletSpanish} from '@/lib/wallet-locales';
import PortalModal from './PortalModal';
type LinkedWallet={address:string};
export default function LinkedWallets(){
 const wallet=useGameWallet(),{locale}=useI18n(),es=locale==='es';
 const [list,setList]=useState<LinkedWallet[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[stage,setStage]=useState(''),[result,setResult]=useState(''),[target,setTarget]=useState<string|null>(null);
 const inFlight=useRef(false);
 async function refresh(){const r=await fetch('/api/wallet',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error??'wallet.failed');const entries:LinkedWallet[]=d.wallets??(d.wallet?[d.wallet]:[]);setList(entries);return entries;}
 useEffect(()=>{void refresh().catch(()=>setError(es?'No pudimos cargar tus wallets. Reintentá.':'Could not load your linked wallets. Please retry.')).finally(()=>setLoading(false));},[es]);
 async function choose(expected?:string){if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setResult('');setTarget(expected??null);setStage('connect');try{
  const signer=await wallet.connect(true);
  if(expected&&signer.address!==expected)throw Error('wallet.selectionMismatch');
  setTarget(signer.address);
  const entries=await refresh();
  if(!entries.some(w=>w.address===signer.address)){
   await linkAdditionalWallet(signer,jsonPost,setStage);
   // Apply the server receipt before refreshing: a failed refresh must not hide a successful link.
   setList(current=>current.some(w=>w.address===signer.address)?current:[...current,{address:signer.address}]);
   setResult('linked');void refresh().catch(()=>{});
  }else setResult('connected');
  window.dispatchEvent(new Event('aochain:wallet-linked'));
 }catch(e){const key=e instanceof Error?e.message:'';const copy=es?walletSpanish:walletEnglish;setError(key==='wallet.selectionMismatch'?(es?'La extensión conectó otra dirección. Seleccioná la dirección de esta tarjeta en tu wallet y reintentá.':'Your extension connected a different address. Select the address shown on this card in your wallet and try again.'):key in copy?copy[key as keyof typeof copy]:key==='economy.walletRejected'?(es?'Conexión cancelada. Podés volver a intentarlo.':'Connection cancelled. You can try again.'):es?'No se completó la vinculación. Revisá tu wallet y reintentá.':'Linking did not complete. Check your wallet and try again.');}finally{setBusy(false);setStage('');inFlight.current=false;}}
 const dismiss=()=>{setError('');setResult('');};
 return <section className="linked-wallets"><header><div><p className="realm-eyebrow">{es?'CONEXIÓN Y PROPIEDAD':'CONNECTION & OWNERSHIP'}</p><h2>{es?'Tus wallets':'Your wallets'}</h2><p>{es?'Conectá la wallet que querés usar para tus personajes, objetos y oro.':'Connect the wallet you want to use for your characters, items and gold.'}</p></div><span className="linked-wallet-count">{list.length} / 5 {es?'vinculadas':'linked'}</span></header>
 {loading?<p role="status">{es?'Cargando wallets…':'Loading wallets…'}</p>:<div className="linked-wallet-grid">{list.map((w,i)=><article key={w.address} className={`linked-wallet-card ${w.address===wallet.address?'is-connected':''}`}><div className="linked-wallet-card-top"><Wallet size={24}/><span>{w.address===wallet.address?(es?'Conectada':'Connected'):(es?'Vinculada':'Linked')}</span></div><h3>Wallet {i+1}</h3><code>{w.address}</code><p>{w.address===wallet.address?(es?'Esta wallet se usa para las nuevas operaciones.':'This wallet is selected for new operations.'):(es?'Elegí esta dirección en tu extensión antes de conectar.':'Select this address in your extension before connecting.')}</p><button className="realm-button quiet" disabled={busy||w.address===wallet.address} onClick={()=>choose(w.address)}>{w.address===wallet.address?<CheckCircle2 size={16}/>:<ArrowRight size={16}/>} {w.address===wallet.address?(es?'En uso':'In use'):(es?'Usar esta wallet':'Use this wallet')}</button></article>)}{list.length<5&&<button className="linked-wallet-add" disabled={busy} onClick={()=>choose()}><Plus size={28}/><strong>{es?'Agregar wallet':'Add wallet'}</strong><span>{es?'Elegí otra cuenta en tu extensión y firmá un mensaje gratuito.':'Choose another account in your extension and sign a free message.'}</span></button>}</div>}
 <p className="linked-wallet-footnote">{es?'Vincular no mueve activos ni cuesta SOL. Cada wallet conserva sus propios personajes, objetos y tokens.':'Linking does not move assets or cost SOL. Each wallet keeps its own characters, items and tokens.'}</p>
 {(stage==='approve'||stage==='verify'||result||error)&&<PortalModal title={error?(es?'No se completó':'Could not complete'):result?(es?'Wallet lista':'Wallet ready'):es?'Vinculando wallet':'Linking wallet'} locked={busy} onClose={dismiss}><div className="wallet-link-result">{error?<Wallet size={36}/>:result?<CheckCircle2 size={40}/>:<LoaderCircle className="wallet-link-spinner" size={40}/>}<h3>{error?(es?'Revisá la conexión':'Check the connection'):result==='linked'?(es?'Wallet vinculada correctamente':'Wallet successfully linked'):result==='connected'?(es?'Wallet conectada':'Wallet connected'):stage==='approve'?(es?'Aprobá el mensaje en tu wallet':'Approve the message in your wallet'):(es?'Verificando tu firma…':'Verifying your signature…')}</h3>{target&&<code className="connection-address">{target}</code>}<p role={error?'alert':'status'}>{error|| (result?(es?'Ya podés usar esta wallet para administrar sus activos.':'You can now use this wallet to manage its assets.'):es?'Esto verifica que la wallet es tuya. No es una transacción ni tiene costo.':'This verifies that you control the wallet. It is not a transaction and has no fee.')}</p>{error&&<button className="realm-button" onClick={()=>{dismiss();void choose(target??undefined);}}>{es?'Reintentar':'Try again'}</button>}{error&&<Link className="wallet-link-signin" href="/login?reauth=1&redirect=%2Fwallet">{es?'Volver a ingresar':'Sign in again'}</Link>}{result&&<button className="realm-button" onClick={dismiss}>{es?'Listo':'Done'}</button>}</div></PortalModal>}
 </section>;
}
