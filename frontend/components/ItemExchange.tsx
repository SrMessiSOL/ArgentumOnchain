"use client";

import CharacterChoices from './CharacterChoices';
import PortalModal from './PortalModal';
import BrowseToolbar from "@/components/BrowseToolbar";

import {browseEnglish,browseSpanish} from "@/lib/browse-copy";

import {MarketItemArtwork} from '@/components/MarketItemArtwork';

import {useEffect,useState} from 'react';

import {ArrowUpRight,Package,Shield,LoaderCircle} from 'lucide-react';

import {useI18n} from '@/components/I18nProvider';

import {itemMarketEnglish,itemMarketSpanish} from '@/lib/item-market-copy';

import {economyEnglish,economySpanish} from '@/lib/economy-locales';

const playerName=(name:string)=>name;

export type ExchangeItem={slot:number;item:number;name:string;quantity:number;equipped:boolean;tradable:boolean};

export type ItemListing={id:string;character_id:string;item_id:number;graphic_id?:number;quantity:number;name:string;seller_name:string;price:string;state:string;mine:boolean};

type Character={id_body:number;id_head:number;id_weapon:number;id_shield:number;id_helmet:number;chain_state:string;id:string;name:string;connected:boolean;economy_lock:string|null;inventory:ExchangeItem[]};

export function ItemExchange({characters,listings,selected,setSelected,blocked,run,post,buy,profile=false}:{profile?:boolean;characters:Character[];listings:ItemListing[];selected:string;setSelected:(s:string)=>void;blocked:boolean;run:(fn:()=>Promise<unknown>,financial?:boolean)=>Promise<void>;post:(action:string,body:unknown)=>Promise<unknown>;buy:(listing:ItemListing)=>Promise<void>}){

 const {locale,text:localize}=useI18n(),copy=locale==='es'?itemMarketSpanish:itemMarketEnglish,text=locale==='es'?economySpanish:economyEnglish;

 const [slot,setSlot]=useState(''),[quantity,setQuantity]=useState('1'),[price,setPrice]=useState('0.01');

 const [query,setQuery]=useState(''),[sort,setSort]=useState('recent'),[preview,setPreview]=useState<ItemListing|null>(null);

 const browse=locale==='es'?browseSpanish:browseEnglish;

 const visibleListings=listings.filter(l=>localize(l.name).toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale))).slice().sort((a,b)=>sort==='priceLow'?Number(a.price)-Number(b.price):sort==='priceHigh'?Number(b.price)-Number(a.price):0);

 const chosen=characters.find(c=>c.id===selected),eligible=(chosen?.inventory??[]).filter(i=>i.tradable&&!i.equipped),source=eligible.find(i=>String(i.slot)===slot),unavailable=blocked||!chosen||chosen.connected||Boolean(chosen.economy_lock);

 useEffect(()=>{setSlot(old=>eligible.some(i=>String(i.slot)===old)?old:eligible.some(i=>String(i.slot)===new URLSearchParams(window.location.search).get('slot'))?new URLSearchParams(window.location.search).get('slot')!:eligible[0]?String(eligible[0].slot):'');},[selected,characters]);

 const number=(n:number)=>new Intl.NumberFormat(locale,{maximumFractionDigits:9}).format(n);

 return <><div className={profile?"exchange-profile-layout":"exchange-browse-layout"}>{!profile&&<section><div className="exchange-section-heading"><h2>{copy.available}</h2><span>{listings.length}</span></div><div className="market-recipient-heading"><strong>{locale==='es'?'Entregar al personaje':'Deliver to character'}</strong><small>{locale==='es'?'Elegí quién recibe tu compra. Debe estar desconectado.':'Choose who receives your purchase. The character must be offline.'}</small></div><CharacterChoices characters={characters} selected={selected} onSelect={setSelected} disabled={blocked}/>{(!chosen||chosen.connected||chosen.economy_lock)&&<p className="market-recipient-help">{browse.recipientUnavailable}</p>}<BrowseToolbar query={query} onQuery={setQuery} sort={sort} onSort={setSort} kind="items" count={visibleListings.length}/><div className="exchange-card-grid">{visibleListings.map(l=><article className="exchange-character" key={l.id}><div className="exchange-character-top"><div className="exchange-avatar market-art-stage"><MarketItemArtwork itemId={l.item_id} graphicId={l.graphic_id} name={l.name}/><span className={'exchange-pill '+(l.mine?'own':'')}>{l.mine?copy.ownListing:copy.listed}</span></div></div><h3>{localize(l.name)}</h3><p className="exchange-level">× {number(l.quantity)}</p><p className="exchange-muted">{copy.seller} {playerName(l.seller_name)}</p><p className="exchange-fineprint">{copy.delivery}</p><button className="market-details-button" onClick={()=>setPreview(l)}>{browse.reviewPurchase}<ArrowUpRight size={14}/></button><div className="exchange-character-footer"><div><small>{text.price}</small><strong>{number(Number(l.price)/1e9)} <span>SOL</span></strong></div>{l.state==='reserved'?<span className="exchange-pending"><LoaderCircle size={15} className="exchange-spin"/>{text.reserved}</span>:<button className={l.mine?'exchange-secondary':'exchange-primary'} disabled={l.mine?blocked:unavailable} aria-label={l.mine?undefined:browse.reviewPurchase+': '+localize(l.name)} onClick={()=>l.mine?window.location.assign('/profile?sell=items'):setPreview(l)}>{l.mine?(locale==='es'?'Administrar':'Manage'):text.buy}{!l.mine&&<ArrowUpRight size={15}/>}</button>}</div></article>)}</div>{query&&visibleListings.length===0&&<div className="exchange-empty"><h3>{browse.noResults}</h3><p>{browse.noResultsHelp}</p><button className="exchange-secondary" onClick={()=>setQuery('')}>{browse.clear}</button></div>}{!listings.length&&!query&&<div className="exchange-empty"><Package size={36}/><h3>{copy.empty}</h3><p>{copy.emptyHelp}</p></div>}<div className="exchange-rules"><Shield size={20}/><div><p>{copy.rules}</p><small>{copy.delivery}</small></div></div></section>}{profile&&<aside className="exchange-panel">{listings.filter(l=>l.mine).map(l=><div className="portal-gold-operation" key={l.id}><strong>{localize(l.name)} × {l.quantity}</strong><button disabled={blocked||l.state==='reserved'} onClick={()=>run(()=>post('item-cancel',{listingId:l.id}))}>{text.cancel}</button></div>)}<h2>{copy.sell}</h2><p className="exchange-muted">{copy.sellHelp}</p><label>{copy.receive}<select value={selected} disabled={blocked} onChange={e=>setSelected(e.target.value)}>{!characters.length&&<option>{text.none}</option>}{characters.map(c=><option key={c.id} value={c.id}>{playerName(c.name)}{c.economy_lock?' · '+text.locked:''}</option>)}</select></label>{eligible.length?<><label>{copy.chooseItem}<select value={slot} disabled={unavailable} onChange={e=>{setSlot(e.target.value);setQuantity('1');}}>{eligible.map(i=><option key={i.slot} value={i.slot}>{localize(i.name)} · × {number(i.quantity)}</option>)}</select></label><label>{copy.quantity}<input type="number" min="1" max={Math.min(source?.quantity??1,10000)} step="1" value={quantity} disabled={unavailable} onChange={e=>setQuantity(e.target.value)}/></label><label>{text.price}<div className="exchange-input-unit"><input type="number" min="0.001" max="1000" step="0.001" value={price} disabled={unavailable} onChange={e=>setPrice(e.target.value)}/><span>SOL</span></div></label><button className="exchange-primary exchange-wide" disabled={unavailable||!source} onClick={()=>run(()=>post('item-list',{characterId:selected,slot:Number(slot),quantity:Number(quantity),price:Math.round(Number(price)*1e9)}))}>{copy.list}<ArrowUpRight size={16}/></button></>:<p className="exchange-muted">{copy.noEligible}</p>}<p className="exchange-fineprint">{copy.logout}</p></aside>}</div>{preview&&<PortalModal title={browse.reviewPurchase} onClose={()=>setPreview(null)}><div className="market-item-review-art"><MarketItemArtwork itemId={preview.item_id} graphicId={preview.graphic_id} name={preview.name}/></div><h3 className="market-item-review-name">{localize(preview.name)} <span>× {number(preview.quantity)}</span></h3><dl className="market-purchase-summary"><div><dt>{copy.seller}</dt><dd>{playerName(preview.seller_name)}</dd></div><div><dt>{browse.recipient}</dt><dd>{chosen?.name??browse.chooseRecipient}</dd></div><div><dt>{browse.totalPrice}</dt><dd>{number(Number(preview.price)/1e9)} SOL</dd></div></dl><p className="connection-footnote">{browse.purchaseHelp}</p>{unavailable&&<p className="market-recipient-help">{browse.recipientUnavailable}</p>}<button className="realm-button market-purchase-confirm" disabled={unavailable||preview.mine||preview.state==='reserved'} onClick={()=>{const listing=preview;setPreview(null);void run(()=>buy(listing),true);}}>{preview.state==='reserved'?text.reserved:preview.mine?(locale==='es'?'Tu publicación':'Your listing'):text.buy}<ArrowUpRight size={16}/></button></PortalModal>}</>;

}

