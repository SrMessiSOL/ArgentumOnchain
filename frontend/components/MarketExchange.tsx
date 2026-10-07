"use client";

import PortalModal from './PortalModal';
import {portalEnglish,portalSpanish} from '@/lib/portal-copy';

import {useGameWallet} from '@/components/GameWalletProvider';

import {canDepositWalletGold} from '@/lib/wallet-gold';

import BrowseToolbar from "@/components/BrowseToolbar";

import {browseEnglish,browseSpanish} from "@/lib/browse-copy";

import {ItemExchange,type ExchangeItem,type ItemListing} from '@/components/ItemExchange';

import {itemMarketEnglish,itemMarketSpanish} from '@/lib/item-market-copy';

import CharacterSpritePreview from '@/components/CharacterSpritePreview';

import Link from 'next/link';

import {useRouter} from 'next/navigation';

import {uxEnglish,uxSpanish} from "@/lib/ux-copy";

import {useCallback,useEffect,useRef,useState} from 'react';

import {Transaction} from '@solana/web3.js';

import {ArrowUpRight,Check,Coins,Crown,LoaderCircle,Package,RefreshCw,Shield,Sparkles,Sword,Wallet} from 'lucide-react';

import {useI18n} from '@/components/I18nProvider';

import {economyEnglish,economySpanish,type EconomyText} from '@/lib/economy-locales';

import {marketEnglish,marketSpanish} from '@/lib/market-copy';

import {economyInProgress,updateEconomyProgress,type EconomyIntent,type EconomyProgress} from '@/lib/economy-progress';

import '@/app/character-market/market.css';

const playerName=(name:string)=>name;

type Character={id_body:number;id_head:number;id_weapon:number;id_shield:number;id_helmet:number;chain_state:string;asset_address:string|null;id:string;name:string;gold:number;level:number;connected:boolean;economy_lock:string|null;inventory:ExchangeItem[]};

type Item={item:number;name:string|null;quantity:number;equipped?:boolean};

type Listing={id_body:number;id_head:number;id_weapon:number;id_shield:number;id_helmet:number;id:string;character_id:string;name:string;price:string;state:string;mine:boolean;level:number;gold:number;inventory:Item[];bank:Item[];achievements:string[]};

type Data={marketActivity:{id:string;kind:string;name:string;price:string;state:string;created_at:string}[];itemListings:ItemListing[];characters:Character[];listings:Listing[];intents:EconomyIntent[];goldReady:boolean;goldMint:string|null};

export default function MarketExchange({profile=false}:{profile?:boolean}){

 const {locale:portalLocale}=useI18n();const portal=portalLocale==='es'?portalSpanish:portalEnglish;

 const walletConnection=useGameWallet();

 const router=useRouter(),{locale,text:localize}=useI18n(),text=locale==='es'?economySpanish:economyEnglish,copy=locale==='es'?marketSpanish:marketEnglish,itemCopy=locale==='es'?itemMarketSpanish:itemMarketEnglish;

 const [data,setData]=useState<Data|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(false),[selected,setSelected]=useState(''),[price,setPrice]=useState('0.01'),[amount,setAmount]=useState('1'),[tab,setTab]=useState<'market'|'items'|'gold'|'activity'>('market'),[progress,setProgress]=useState<EconomyProgress|null>(null);

 const [walletGold,setWalletGold]=useState<string|null>(null),[walletScan,setWalletScan]=useState(0);

 useEffect(()=>{if(tab!=='gold')return;let cancelled=false;setWalletGold(null);fetch('/api/game-assets/wallet',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{if(!cancelled)setWalletGold(d?.goldBalance??null);}).catch(()=>{});return ()=>{cancelled=true;};},[tab,progress?.stage,walletScan]);

 const signing=useRef(false),running=useRef(false);
 const [loadError,setLoadError]=useState('');

 const refresh=useCallback(async()=>{const r=await fetch('/api/economy',{cache:'no-store'});const d:Data&{error?:string}=await r.json();if(!r.ok){const message=r.status===401?'economy.signIn':d.error||'economy.failed';setLoadError(message);throw Error(message);}setLoadError('');setData(d);setSelected(old=>d.characters.some(c=>c.id===old)?old:d.characters.find(c=>c.id===new URLSearchParams(window.location.search).get('character'))?.id||d.characters[0]?.id||'');setProgress(old=>old?updateEconomyProgress(old,d.intents,d.characters,signing.current):null);return d;},[]);

 useEffect(()=>{if(window.location.hash==='#items'||new URLSearchParams(window.location.search).get('sell')==='items')setTab('items');else if(window.location.hash==='#gold')router.replace('/profile?view=gold');else if(window.location.hash==='#activity')setTab('activity');refresh().catch(e=>{setLoadError(e.message);setError(e.message);});},[refresh]);

 useEffect(()=>{if(progress?.stage==='complete'){setError('');setNotice(false);}},[progress?.stage]);

 const pending=Boolean(data?.intents.some(i=>['prepared','signed'].includes(i.state)))||economyInProgress(progress);

 // Poll saved server state, not the RPC. The recovery worker reconciles receipts.

 useEffect(()=>{if(!pending)return;let stopped=false;let timer:ReturnType<typeof setTimeout>;async function poll(){try{await refresh();}catch{/* Keep the last known state; never infer success from a network error. */}if(!stopped)timer=setTimeout(poll,2500);}timer=setTimeout(poll,2500);return()=>{stopped=true;clearTimeout(timer);};},[pending,refresh]);

 async function post(action:string,body:unknown){const r=await fetch('/api/economy/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(r.status===401?'economy.signIn':d.error);return d;}

 async function run(fn:()=>Promise<unknown>,financial=false,announce=true){if(running.current)return;running.current=true;setBusy(true);setError('');setNotice(false);try{await fn();await refresh();if(!financial&&announce)setNotice(true);}catch(e){const code=(e as {code?:number})?.code;setError(code===4001?'economy.walletRejected':e instanceof Error?e.message:'economy.failed');setProgress(old=>old&&!old.id?{...old,stage:'failed'}:old);try{await refresh();}catch{}}finally{signing.current=false;running.current=false;setBusy(false);}}

 async function sign(kind:string,listing?:Listing|ItemListing){setProgress({kind,name:kind==='item-purchase'?localize(listing?.name??''):playerName(listing?.name??data?.characters.find(c=>c.id===selected)?.name??''),characterId:kind==='item-purchase'?selected:listing?.character_id??selected,listingId:listing?.id,stage:'preparing'});const provider=await walletConnection.connect();const w={publicKey:{toString:()=>provider.address}};const linked=await fetch('/api/wallet',{cache:'no-store'});const wd=await linked.json();if(!linked.ok)throw Error('economy.linkWallet');if(w.publicKey.toString()!==wd.wallet?.address)throw Error('economy.wrongWallet');

 const p=await post('prepare',{kind,listingId:listing?.id,characterId:selected,amount:Number(amount)});try{sessionStorage.setItem('aoweb:last-economy-intent',p.id);}catch{}setProgress(old=>old?{...old,id:p.id,stage:'signing'}:old);if(p.wallet!==w.publicKey.toString())throw Error('economy.wrongWallet');signing.current=true;const raw=Uint8Array.from(atob(p.transaction),c=>c.charCodeAt(0));const signed=await provider.signTransaction(Transaction.from(raw));signing.current=false;setProgress(old=>old?{...old,stage:'confirming'}:old);const transaction=btoa(String.fromCharCode(...signed.serialize({requireAllSignatures:false})));const submitted=await post('submit',{intentId:p.id,transaction});setProgress(old=>old?{...old,signature:submitted.signature,stage:'confirming'}:old);await refresh();try{await post('reconcile',{intentId:p.id});}catch{/* Persisted signed bytes remain recoverable; automatic polling continues. */}}

 async function play(){if(!progress?.characterId||progress.stage!=='complete')return;await run(async()=>{const r=await fetch('/api/auth/select-character',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({characterId:progress.characterId})});if(!r.ok)throw Error('economy.notOwned');router.push('/play');router.refresh();},true);}

 const [preview,setPreview]=useState<Listing|null>(null);
 const [query,setQuery]=useState(''),[sort,setSort]=useState('recent');

 const browse=locale==='es'?browseSpanish:browseEnglish;

 const visibleListings=(data?.listings??[]).filter(l=>l.name.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale))).slice().sort((a,b)=>sort==='priceLow'?Number(a.price)-Number(b.price):sort==='priceHigh'?Number(b.price)-Number(a.price):sort==='levelHigh'?b.level-a.level:0);

 const blocked=busy||pending,chosen=data?.characters.find(c=>c.id===selected),number=(n:number)=>new Intl.NumberFormat(locale,{maximumFractionDigits:9}).format(n);

 const stageTitle=progress?progress.stage==='complete'?(progress.kind==='item-purchase'?itemCopy.complete:progress.kind==='purchase'?copy.complete:copy.goldComplete):copy[progress.stage]:'';

 const stageHelp=progress?progress.stage==='complete'?(progress.kind==='item-purchase'?itemCopy.completeHelp:progress.kind==='purchase'?copy.completeHelp:copy.goldCompleteHelp):progress.stage==='awaitingExpiry'?copy.awaitingHelp:copy[(progress.stage+'Help') as keyof typeof copy]:'';

 function itemList(items:Item[]){return <ul className="exchange-items">{items.map(i=><li key={i.item}><span>{i.name?localize(i.name):i.item}{i.equipped&&<small>{copy.equipped}</small>}</span><b>× {number(i.quantity)}</b></li>)}</ul>;}

 const ux=locale==='es'?uxSpanish:uxEnglish;

 return <main className="exchange">

  <header className="exchange-hero portal-market-heading"><div><p className="exchange-eyebrow"><Sparkles size={14}/>{copy.eyebrow}</p><h1>{profile?(locale==='es'?'Publicar activos':'List your assets'):portal.market}</h1><p className="exchange-intro">{profile?(locale==='es'?'Administrá tus publicaciones.':'Manage your listings from your profile.'):portal.marketIntro}</p></div><span className="exchange-network"><i/>{copy.devnet}</span></header>

  <nav className="exchange-tabs" aria-label={text.title}>{(profile?['market','items'] as const:['market','activity'] as const).map(key=><button key={key} aria-pressed={tab===key||!profile&&key==='market'&&tab==='items'} className={tab===key||!profile&&key==='market'&&tab==='items'?'active':''} onClick={()=>setTab(key)}>{key==='market'?<Sword size={17}/>:key==='items'?<Package size={17}/>:<Wallet size={17}/>} {key==='market'&&!profile?(locale==='es'?'Explorar':'Browse'):key==='items'?itemCopy.tab:copy[key]}{key==='market'&&data&&<span>{data.listings.length}</span>}</button>)}<button className="exchange-refresh" aria-label={copy.refresh} disabled={busy} onClick={()=>run(refresh,false,false)}><RefreshCw size={16}/></button></nav>

  {!profile&&tab!=='activity'&&<div className="portal-transfer-switch"><button aria-pressed={tab==='market'} onClick={()=>setTab('market')}>{portal.characters}</button><button aria-pressed={tab==='items'} onClick={()=>setTab('items')}>{portal.items}</button><Link href="/profile">{locale==='es'?'Tu perfil · vender':'Your profile · sell'}</Link></div>}

  {error&&<PortalModal title={locale==='es'?'No se pudo completar':'Could not complete the action'} onClose={()=>setError('')}><p role="alert" className="exchange-error">{error.startsWith('economy.')&&itemCopy[error.slice(8) as keyof typeof itemCopy]||text[error as EconomyText]||text['economy.failed']}</p></PortalModal>}{notice&&<p role="status" className="exchange-notice">{copy.saved}</p>}

  {progress&&<PortalModal title={locale==='es'?'Operación del mercado':'Marketplace operation'} locked={busy} onClose={()=>{setProgress(null);sessionStorage.removeItem('aoweb:last-economy-intent');}}><section className={'exchange-progress '+progress.stage} role="status" aria-live="polite" aria-atomic="true"><div className="exchange-progress-icon">{progress.stage==='complete'?<Check/>:progress.stage==='failed'?<Shield/>:<LoaderCircle className="exchange-spin"/>}</div><div className="exchange-progress-content"><p className="exchange-eyebrow">{progress.name||text[progress.kind as EconomyText]}</p><h2>{stageTitle}</h2><p>{stageHelp}</p>{!['failed','awaitingExpiry'].includes(progress.stage)&&<div className="exchange-steps">{[copy.wallet,copy.confirming,copy.settlement].map((s,i)=><span key={s} className={progress.stage==='complete'||i===0&&progress.stage==='confirming'?'done':''}>{progress.stage==='complete'?<Check size={13}/>:<b>{i+1}</b>}{s}</span>)}</div>}</div><div className="exchange-progress-actions">{progress.stage==='complete'&&['purchase','item-purchase'].includes(progress.kind)&&<button className="exchange-primary" disabled={busy} onClick={play}>{copy.play}<ArrowUpRight size={16}/></button>}{progress.signature&&<a className="exchange-text-link" href={`https://explorer.solana.com/tx/${progress.signature}?cluster=devnet`} target="_blank" rel="noreferrer">{copy.receipt}<ArrowUpRight size={14}/></a>}{economyInProgress(progress)&&<small>{copy.automatic}</small>}</div></section></PortalModal>}

  {!data?<div className="exchange-empty" aria-busy={!loadError}>{loadError?<><Shield size={36}/><h2>{loadError==='economy.signIn'?ux.marketSignIn:ux.unavailable}</h2><p>{loadError==='economy.signIn'?ux.marketHelp:ux.unavailableHelp}</p><div className="realm-actions">{loadError==='economy.signIn'?<><Link className="exchange-primary" href="/login?redirect=%2Fcharacter-market">{ux.signIn}</Link><Link className="exchange-secondary" href="/register?redirect=%2Fcharacter-market">{ux.register}</Link></>:<button className="exchange-primary" disabled={busy} onClick={()=>run(refresh,false,false)}>{ux.retry}</button>}</div></>:<><LoaderCircle className="exchange-spin"/><p>{text.working}</p></>}</div>:<>

  {tab==='market'&&<div className={profile?"exchange-profile-layout":"exchange-browse-layout"}>{!profile&&<section><div className="exchange-section-heading"><h2>{copy.available}</h2><span>{data.listings.length}</span></div><BrowseToolbar query={query} onQuery={setQuery} sort={sort} onSort={setSort} kind="characters" count={visibleListings.length}/><div className="exchange-card-grid">{visibleListings.map(l=><article className="exchange-character" key={l.id}><div className="exchange-character-top"><div className="exchange-avatar market-art-stage">{l.id_body>0&&l.id_head>0?<CharacterSpritePreview bodyId={l.id_body} headId={l.id_head} weaponId={l.id_weapon} shieldId={l.id_shield} helmetId={l.id_helmet} scale={1.25} className="market-character-sprite"/>:<Crown size={36}/>}<span className={'exchange-pill '+(l.mine?'own':'')}>{l.mine?copy.ownListing:copy.listed}</span></div></div><h3>{playerName(l.name)}</h3><p className="exchange-level">{text.level} {l.level} <span>·</span> {number(l.gold)} {text.gold}</p><div className="exchange-character-stats"><span><Sword size={16}/><b>{l.inventory.length}</b>{copy.inventory}</span><span><Shield size={16}/><b>{l.bank.length}</b>{copy.bank}</span></div><button className="market-details-button" onClick={()=>setPreview(l)}>{locale==='es'?'Ver personaje y pertenencias':'View character & belongings'}<ArrowUpRight size={14}/></button><div className="exchange-character-footer"><div><small>{copy.price}</small><strong>{number(Number(l.price)/1e9)} <span>SOL</span></strong></div>{l.state==='reserved'?<span className="exchange-pending"><LoaderCircle size={15} className="exchange-spin"/>{text.reserved}</span>:<button className={l.mine?'exchange-secondary':'exchange-primary'} disabled={blocked} onClick={()=>l.mine?router.push('/profile?sell=characters&character='+l.character_id):setPreview(l)}>{l.mine?(locale==='es'?'Administrar':'Manage'):text.buy}{!l.mine&&<ArrowUpRight size={15}/>}</button>}</div></article>)}</div>{query&&visibleListings.length===0&&<div className="exchange-empty"><h3>{browse.noResults}</h3><p>{browse.noResultsHelp}</p><button className="exchange-secondary" onClick={()=>setQuery('')}>{browse.clear}</button></div>}{!data.listings.length&&!query&&<div className="exchange-empty"><Sword size={36}/><h3>{copy.empty}</h3><p>{copy.emptyHelp}</p></div>}<div className="exchange-rules"><Shield size={20}/><div><p>{copy.bundleRule}</p><small>{copy.accountRule}</small></div></div></section>}{profile&&<aside className="exchange-panel"><p className="exchange-eyebrow">{text.mine}</p><h2>{copy.sell}</h2><p className="exchange-muted">{copy.sellHelp}</p>{data.characters.length?<><label>{copy.choose}<select value={selected} onChange={e=>setSelected(e.target.value)} disabled={blocked}>{data.characters.map(c=><option key={c.id} value={c.id}>{playerName(c.name)} · {text.level} {c.level}{c.economy_lock?' · '+text.locked:''}</option>)}</select></label><label>{text.price}<div className="exchange-input-unit"><input type="number" min="0.001" max="1000" step="0.001" value={price} onChange={e=>setPrice(e.target.value)} disabled={blocked}/><span>SOL</span></div></label><button className="exchange-primary exchange-wide" disabled={blocked||!selected||Boolean(chosen?.economy_lock)||Boolean(chosen?.connected)||Boolean(chosen?.asset_address&&chosen.chain_state!=='unstaked')} onClick={()=>run(()=>post('list',{characterId:selected,price:Math.round(Number(price)*1e9)}))}>{text.list}<ArrowUpRight size={16}/></button></>:<p className="exchange-muted">{copy.noCharacters}</p>}{data.listings.filter(l=>l.mine).map(l=><div className="portal-gold-operation" key={l.id}><strong>{l.name}</strong><span>{number(Number(l.price)/1e9)} SOL</span><button disabled={blocked||l.state==='reserved'} onClick={()=>run(()=>post('cancel',{listingId:l.id}))}>{text.cancel}</button></div>)}{chosen?.asset_address&&chosen.chain_state!=='unstaked'&&<p className="exchange-fineprint">{locale==='es'?'Guardá y retirá el personaje antes de publicarlo.':'Withdraw this character before listing it.'}</p>}<p className="exchange-fineprint">{text.logout}</p><Link className="exchange-text-link" href="/wallet">{copy.walletLink}<ArrowUpRight size={14}/></Link></aside>}</div>}

  {tab==='items'&&<ItemExchange characters={data.characters} listings={data.itemListings??[]} selected={selected} setSelected={setSelected} blocked={blocked} run={run} post={post} buy={l=>sign('item-purchase',l)} profile={profile}/>}

  {tab==='activity'&&<section className="exchange-activity"><div className="exchange-section-heading"><h2>{locale==='es'?'Actividad del mercado':'Marketplace activity'}</h2><small>{locale==='es'?'Publicaciones y ventas recientes':'Recent listings and sales'}</small></div>{!data.marketActivity?.length&&<div className="exchange-empty"><Wallet size={32}/><p>{copy.historyEmpty}</p></div>}{data.marketActivity?.map(i=><div className="exchange-operation" key={i.id}><div><strong>{localize(i.name)}</strong><small>{number(Number(i.price)/1e9)} SOL · {new Date(i.created_at).toLocaleString(locale)}</small></div><span>{i.state==='sold'?(locale==='es'?'Vendido':'Sold'):i.state==='listed'?(locale==='es'?'Publicado':'Listed'):i.state==='reserved'?text.reserved:(locale==='es'?'Cancelado':'Cancelled')}</span></div>)}</section>}

  </>}

  {preview&&<PortalModal title={preview.name} onClose={()=>setPreview(null)}><div className="market-detail-art"><CharacterSpritePreview bodyId={preview.id_body} headId={preview.id_head} weaponId={preview.id_weapon} shieldId={preview.id_shield} helmetId={preview.id_helmet} scale={1.6} className="market-character-sprite"/></div><div className="market-detail-meta"><span>{text.level} {preview.level}</span><span>{number(preview.gold)} {text.gold}</span><strong>{number(Number(preview.price)/1e9)} SOL</strong></div><div className="market-detail-bundle"><h3>{text.inventory}</h3>{preview.inventory.length?itemList(preview.inventory):<p>—</p>}<h3>{text.bank}</h3>{preview.bank.length?itemList(preview.bank):<p>—</p>}<h3>{copy.achievements}</h3><p>{preview.achievements.map(a=>a==='first-hunt'?text.hunt:text.explorer).join(' · ')||copy.noAchievements}</p></div><p>{copy.bundleRule}</p><p className="connection-footnote">{locale==='es'?'Revisá los detalles. Tu wallet te pedirá aprobar la compra.':'Review the details. Your wallet will ask you to approve the purchase.'}</p>{preview.state==='reserved'?<p>{text.reserved}</p>:<button className="realm-button" disabled={blocked} onClick={()=>{const listing=preview;setPreview(null);if(listing.mine)router.push('/profile?sell=characters&character='+listing.character_id);else void run(()=>sign('purchase',listing),true);}}>{preview.mine?(locale==='es'?'Administrar publicación':'Manage listing'):text.buy}<ArrowUpRight size={16}/></button>}</PortalModal>}

  <footer className="exchange-footer"><Link href="/characters">{copy.back}<ArrowUpRight size={14}/></Link><span><Shield size={14}/>{copy.devnet}</span></footer>

 </main>;

}







