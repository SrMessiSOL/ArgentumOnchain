"use client";
import { LocalizedLabel } from '@/components/LocalizedText';
import {cosmeticWalletState,isCosmeticAssetAddress} from '@/lib/cosmetic-wallet';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useI18n} from './I18nProvider';
type Claim={asset_address:string;state:string}|null;
type Status={ready:boolean;level:number;eligible:boolean;wallet:string|null;claim:Claim;equipped:boolean;equippedAsset:string|null;equippedKind:string;verification:string;hunt:{eligible:boolean;kills:number;remaining:number;limit:number;claim:Claim}};
export default function ExplorerCosmetic({compact=false}:{compact?:boolean}){
 const {t}=useI18n();const [status,setStatus]=useState<Status|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const [receivedAsset,setReceivedAsset]=useState('');
 const [checking,setChecking]=useState(true),[loadError,setLoadError]=useState<string|null>(null),[notice,setNotice]=useState<'cosmetic.equipSuccess'|'cosmetic.unequipSuccess'|'cosmetic.claimSuccess'|null>(null);
 const requestRef=useRef<AbortController|null>(null);
 const walletState=cosmeticWalletState(status,checking,loadError);
 const refresh=useCallback(async()=>{
  requestRef.current?.abort();const controller=new AbortController();requestRef.current=controller;
  setChecking(true);setLoadError(null);const timeout=setTimeout(()=>controller.abort(),10000);
  try{const r=await fetch('/api/cosmetics',{cache:'no-store',signal:controller.signal});if(!r.ok)throw new Error(r.status===401?'cosmetic.signIn':'cosmetic.retry');const next=await r.json();if(requestRef.current===controller)setStatus(next);}
  catch(e){if(requestRef.current===controller){setStatus(null);setLoadError(e instanceof Error&&e.message==='cosmetic.signIn'?'cosmetic.signIn':'cosmetic.retry');}}
  finally{clearTimeout(timeout);if(requestRef.current===controller){requestRef.current=null;setChecking(false);}}
 },[]);
 useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),30000);return()=>{clearInterval(timer);const request=requestRef.current;requestRef.current=null;request?.abort();};},[refresh]);
 async function act(action:'claim'|'equip',body:unknown){setBusy(true);setError(null);setNotice(null);try{const r=await fetch(`/api/cosmetics/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error);await refresh();setNotice(action==='claim'?'cosmetic.claimSuccess':(body as {asset?:string|null}).asset===null?'cosmetic.unequipSuccess':'cosmetic.equipSuccess');window.dispatchEvent(new Event('aoweb:cosmetic-changed'));}catch(e){setError(e instanceof Error?e.message:'cosmetic.retry');}finally{setBusy(false);}}
 function equipReceived(){if(!isCosmeticAssetAddress(receivedAsset)){setError('cosmetic.assetInvalid');setNotice(null);return;}void act('equip',{asset:receivedAsset.trim()});}
 if(compact)return walletState==='equipped'&&status?<LocalizedLabel><span title={t('cosmetic.noBonus')} className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-amber-200"><LocalizedLabel><img src={status.equippedKind==='first-hunt'?'/cosmetics/first-hunt.svg':'/cosmetics/explorer.svg'} alt="" width="22" height="22"/></LocalizedLabel>{t(status.equippedKind==='first-hunt'?'cosmetic.huntTitle':'cosmetic.title')}</span></LocalizedLabel>:null;
 const errorKey=error&&['cosmetic.signIn','cosmetic.linkWallet','cosmetic.levelRequired','cosmetic.unavailable','cosmetic.pending','cosmetic.claimConflict','cosmetic.notOwned','cosmetic.retry','cosmetic.huntRequired','cosmetic.soldOut','cosmetic.assetInvalid'].includes(error)?error as Parameters<typeof t>[0]:'cosmetic.retry';
 return <section className="mt-8 rounded-2xl border border-amber-300/25 bg-stone-900 p-6">
  <div className="flex items-center gap-4"><LocalizedLabel><img src="/cosmetics/explorer.svg" alt="" width="64" height="64"/></LocalizedLabel><div><p className="text-xs uppercase tracking-widest text-amber-300">Solana Devnet</p><h2 className="text-xl font-semibold">{t('cosmetic.collection')}</h2></div></div>
  <p className="mt-4">{t('cosmetic.mission')}</p><p className="mt-2 text-sm text-stone-400">{t('cosmetic.noBonus')}</p>
  <div className="mt-5 rounded-xl border border-white/10 bg-stone-950/60 p-4" aria-live="polite" aria-busy={checking}>
   <p className="text-xs uppercase tracking-widest text-stone-400">{t('cosmetic.current')}</p>
   {walletState==='equipped'&&status?<div className="mt-3 flex items-center gap-3"><img src={status.equippedKind==='first-hunt'?'/cosmetics/first-hunt.svg':'/cosmetics/explorer.svg'} width="40" height="40" alt=""/><div><p className="font-semibold">{t(status.equippedKind==='first-hunt'?'cosmetic.huntTitle':'cosmetic.title')}</p><p className="text-sm text-emerald-300">{t('cosmetic.verified')}</p></div><button disabled={busy||checking} onClick={()=>void act('equip',{asset:null})} className="ml-auto rounded-lg border border-stone-600 px-3 py-2 text-sm disabled:opacity-40">{t('cosmetic.unequip')}</button></div>:<p className="mt-2 text-sm text-stone-300">{t(walletState==='checking'?'cosmetic.checking':walletState==='sign-in'?'cosmetic.signIn':walletState==='unavailable'?'cosmetic.verificationUnavailable':walletState==='not-owned'?'cosmetic.lostOwnership':'cosmetic.none')}</p>}
   {walletState==='not-owned'&&<button disabled={busy} onClick={()=>void act('equip',{asset:null})} className="mt-3 text-sm underline">{t('cosmetic.clearedSelection')}</button>}
   <p className="mt-3 text-xs text-stone-400">{t('cosmetic.syncHint')}</p>
  </div>
  {notice&&<p role="status" className="mt-3 text-sm text-emerald-300">{t(notice)}</p>}
  {!status?<button disabled={checking||busy} onClick={()=>void refresh()} className="mt-4 text-sm underline disabled:opacity-40">{t('cosmetic.refresh')}</button>:<>
   <p className="mt-4">{t('characters.level')}: {status.level}/2 · {status.eligible?t('cosmetic.eligible'):t('cosmetic.levelRequired')}</p>
   {!status.ready&&<p className="mt-2 text-amber-200">{t('cosmetic.unavailable')}</p>}
   {!status.wallet&&<p className="mt-2">{t('cosmetic.linkWallet')}</p>}
   <div className="mt-4 flex flex-wrap gap-3">
    {status.claim?.state==='confirmed'?<><a target="_blank" rel="noreferrer" className="underline text-amber-200" href={`https://explorer.solana.com/address/${status.claim.asset_address}?cluster=devnet`}>{t('cosmetic.explorer')}</a><button disabled={busy||!status.ready||!status.wallet} onClick={()=>void act('equip',{asset:status.equippedAsset===status.claim!.asset_address?null:status.claim!.asset_address})} className="rounded-lg border border-amber-300 px-4 py-2 disabled:opacity-40">{status.equippedAsset===status.claim.asset_address?t('cosmetic.unequip'):t('hud.equip')}</button></>:<button disabled={busy||!status.ready||!status.eligible||!status.wallet} onClick={()=>void act('claim',{})} className="rounded-lg bg-amber-300 px-4 py-2 font-semibold text-stone-950 disabled:opacity-40">{busy?t('cosmetic.pending'):t('cosmetic.claim')}</button>}
    <button disabled={busy||checking} onClick={()=>void refresh()} className="text-sm underline">{t('cosmetic.refresh')}</button>
   </div>
   {status.verification==='unavailable'&&<p className="mt-2 text-amber-200">{t('cosmetic.retry')}</p>}
   {status.hunt&&<div className="mt-6 border-t border-purple-300/30 pt-5">
    <h3 className="flex items-center gap-3 text-lg"><LocalizedLabel><img src="/cosmetics/first-hunt.svg" width="48" height="48" alt=""/></LocalizedLabel>{t('cosmetic.huntTitle')}</h3>
    <p className="mt-2">{t('cosmetic.huntRequired')}</p>
    <p className="text-sm text-stone-400">{t('cosmetic.huntLimit')} {status.hunt.remaining}/{status.hunt.limit} · {t('cosmetic.kills')}: {status.hunt.kills}/4</p>
    {status.hunt.claim?.state==='confirmed'?<div className="mt-3 flex gap-4"><a target="_blank" rel="noreferrer" className="underline" href={`https://explorer.solana.com/address/${status.hunt.claim.asset_address}?cluster=devnet`}>{t('cosmetic.explorer')}</a><button disabled={busy||!status.ready||!status.wallet} onClick={()=>void act('equip',{asset:status.equippedAsset===status.hunt.claim!.asset_address?null:status.hunt.claim!.asset_address})}>{status.equippedAsset===status.hunt.claim.asset_address?t('cosmetic.unequip'):t('hud.equip')}</button></div>:<button className="mt-3 rounded-lg border border-purple-300 px-4 py-2 disabled:opacity-40" disabled={busy||!status.ready||!status.wallet||!status.hunt.eligible||(!status.hunt.remaining&&!status.hunt.claim)} onClick={()=>void act('claim',{kind:'first-hunt'})}>{t('cosmetic.claim')}</button>}
   </div>}
   <div className="mt-6 border-t border-stone-700 pt-4"><h3 className="font-semibold">{t('cosmetic.received')}</h3><p className="mt-2 text-sm text-stone-400">{t('cosmetic.receivedHelp')}</p><label className="mt-3 block">{t('cosmetic.assetAddress')}<input className="mt-2 block w-full rounded bg-stone-800 p-2" value={receivedAsset} onChange={e=>setReceivedAsset(e.target.value)} /></label><button className="mt-3 underline" disabled={busy||!status.ready||!status.wallet||!receivedAsset.trim()} onClick={equipReceived}>{t('cosmetic.verifyEquip')}</button></div>
  </>}
  {error&&<p role="alert" className="mt-3 text-amber-200">{t(errorKey)}</p>}
 </section>;
}
