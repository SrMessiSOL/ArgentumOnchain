"use client";

import PortalModal from './PortalModal';
import SellAssetModal from './SellAssetModal';
import CharacterChoices from './CharacterChoices';

import {useEffect,useRef,useState} from 'react';

import {Transaction} from '@solana/web3.js';

import {ArrowUpRight,LockKeyhole,Package,RefreshCw} from 'lucide-react';

import {useI18n} from './I18nProvider';

import {economyEnglish,economySpanish,type EconomyText} from '@/lib/economy-locales';

import {useGameWallet} from './GameWalletProvider';

import {jsonPost,type WalletInventory} from '@/lib/game-wallet';

import CharacterSpritePreview from './CharacterSpritePreview';

import {MarketItemArtwork} from './MarketItemArtwork';

import AssetTransactionVisual,{type AssetStage} from './AssetTransactionVisual';

import {assetUiEnglish,assetUiSpanish} from '@/lib/asset-ui-copy';

import {portalEnglish,portalSpanish} from '@/lib/portal-copy';

import CharacterAchievements from './CharacterAchievements';

import WalletGoldDeposit from './WalletGoldDeposit';



type Item={slot:number;item:number;name:string;quantity:number;equipped:boolean;tradable:boolean};

type Character={gold:number;id_body:number;id_head:number;id_weapon:number;id_shield:number;id_helmet:number;id:string;name:string;level:number;chain_state:'offchain'|'staked'|'unstaked';chain_required:boolean;asset_address:string|null;connected:boolean;economy_lock:string|null;inventory:Item[]};

type Operation={character_id:string;item_id:number|null;id:string;kind:string;state:string;signature:string|null};

type Data={goldOperations?:{id:string;kind:string;state:string;signature:string|null;amount:string}[];ready:boolean;wallet:string|null;characters:Character[];operations:Operation[];items:{item_id:number;asset_address:string;name:string;quantity:number}[]};

const playerName=(name:string)=>name;

const english={heading:'Characters & item receipts',intro:'Mint your character once. Stake to play, then unstake to save its progress and trade it with its entire inventory and bank.',trust:'Your NFT stays in your wallet. Staking locks transfers. The game operator manages progress and co-signs staking, settlement and marketplace transfers.',offline:'Log out before minting, unstaking or moving items.',mint:'Mint & stake',stake:'Stake character',unstake:'Withdraw character',offchain:'Not minted',staked:'Ready to play',unstaked:'In wallet · transferable',pending:'Waiting for Solana confirmation. This operation remains reserved; you can safely check it again.',signing:'Review and sign the transaction in your wallet.',complete:'Operation completed.',failed:'Transaction failed or expired. The reservation was released.',check:'Check pending operations',unavailable:'Character assets are unavailable right now.',link:'Link your wallet above to continue.',export:'Withdraw an item',exportHelp:'Withdrawal removes the selected quantity from your inventory and mints an item receipt NFT. The receipt can be transferred or sold.',character:'Character',item:'Item',quantity:'Quantity',withdraw:'Withdraw & mint',deposit:'Deposit an item',depositHelp:'Deposit burns the registered receipt NFT and returns its exact item quantity to the selected character.',asset:'NFT address',import:'Burn & deposit',receive:'Receive a character',receiveHelp:'Paste a character NFT address owned by your linked wallet. Staking claims that character with its saved inventory and progress.',received:'Stake received character',issued:'Issued item receipts',receipt:'View transaction',empty:'Create a character to get started.',loading:'Loading character assets…',error:'The operation could not complete. Check pending operations before trying again.'};

const spanish:typeof english={heading:'Personajes y recibos de objetos',intro:'Minteá tu personaje una vez. Stakeá para jugar y retiralo para guardar su progreso y venderlo con todo su inventario y banco.',trust:'El NFT permanece en tu wallet. El staking bloquea transferencias. El operador del juego administra el progreso y firma staking, sincronización y ventas del mercado.',offline:'Desconectate antes de mintear, retirar el personaje o mover objetos.',mint:'Mintear y stakear',stake:'Stakear para jugar',unstake:'Retirar personaje',offchain:'Sin mintear',staked:'Stakeado · listo para jugar',unstaked:'Retirado · listo para vender',pending:'Esperando confirmación de Solana. La operación sigue reservada; podés verificarla nuevamente.',signing:'Revisá y firmá la transacción en tu wallet.',complete:'Operación completada.',failed:'La transacción falló o venció. Se liberó la reserva.',check:'Verificar operaciones pendientes',unavailable:'Los activos de personajes no están disponibles ahora.',link:'Vinculá tu wallet arriba para continuar.',export:'Retirar un objeto',exportHelp:'El retiro elimina la cantidad elegida del inventario y crea un NFT de recibo que podés transferir o vender.',character:'Personaje',item:'Objeto',quantity:'Cantidad',withdraw:'Retirar y mintear',deposit:'Depositar un objeto',depositHelp:'El depósito quema el NFT de recibo registrado y devuelve su cantidad exacta al personaje elegido.',asset:'Dirección del NFT',import:'Quemar y depositar',receive:'Recibir un personaje',receiveHelp:'Pegá la dirección de un NFT de personaje que pertenezca a tu wallet vinculada. El staking reclama el personaje con su inventario y progreso guardados.',received:'Stakear personaje recibido',issued:'Recibos de objetos emitidos',receipt:'Ver transacción',empty:'Creá un personaje para empezar.',loading:'Cargando activos de personajes…',error:'No se pudo completar la operación. Revisá las operaciones pendientes antes de reintentar.'};

export default function GameAssets(){

 const walletConnection=useGameWallet();

 const [walletInventory,setWalletInventory]=useState<WalletInventory|null>(null),[scanning,setScanning]=useState(false),[scanError,setScanError]=useState(false);

 const {locale,text}=useI18n();const copy=locale==='es'?spanish:english;const ui=locale==='es'?assetUiSpanish:assetUiEnglish;const portal=locale==='es'?portalSpanish:portalEnglish;const economy=locale==='es'?economySpanish:economyEnglish;

 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[tracked,setTracked]=useState('');

 const [selected,setSelected]=useState(''),[slot,setSlot]=useState(''),[quantity,setQuantity]=useState('1'),[itemAsset,setItemAsset]=useState(''),[characterAsset,setCharacterAsset]=useState('');

 const [view,setView]=useState<'characters'|'items'|'gold'|'titles'|'activity'>('characters');

 const [goldBusy,setGoldBusy]=useState(false);

 function chooseView(tab:typeof view){setView(tab);const url=new URL(window.location.href);url.searchParams.set('view',tab);window.history.replaceState(null,'',url.pathname+url.search);}

 function clearTracked(){setTracked('');setStage(null);setNotice('');sessionStorage.removeItem('aochain:asset-operation');const url=new URL(window.location.href);url.searchParams.delete('operation');window.history.replaceState(null,'',url.pathname+url.search);}

 const [itemMode,setItemMode]=useState<'withdraw'|'deposit'>('withdraw');

 const [activeCharacter,setActiveCharacter]=useState('');

 const [manage,setManage]=useState<'character'|'item'|'deposit'|'wallet-character'|null>(null);
 const [sell,setSell]=useState<{character:Character;item?:Item}|null>(null);
 const [restriction,setRestriction]=useState<Item|null>(null);
 const [manageCharacter,setManageCharacter]=useState<Character|null>(null);

 const [stage,setStage]=useState<AssetStage|null>(null);

 const running=useRef(false);const pending=data?.operations.filter(o=>['prepared','signed'].includes(o.state))??[];

 const character=data?.characters.find(c=>c.id===selected);const items=character?.inventory.filter(i=>i.tradable&&!i.equipped)??[];

 const item=items.find(i=>String(i.slot)===slot);const unavailable=!data?.ready||!data.wallet;

 async function refresh(){const r=await fetch('/api/game-assets',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(r.status===401?'assets.signIn':d.error);setData(d);setSelected(old=>d.characters.some((c:Character)=>c.id===old)?old:d.characters[0]?.id??'');return d as Data;}

 async function post(action:string,body:unknown){const r=await fetch('/api/game-assets/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error);return d;}

 useEffect(()=>{const tab=new URLSearchParams(window.location.search).get('view');if(tab&&['characters','items','gold','titles','activity'].includes(tab))setView(tab as typeof view);let active=true;refresh().then(d=>{if(!active)return;const explicit=new URLSearchParams(window.location.search).get('operation');const saved=explicit??sessionStorage.getItem('aochain:asset-operation');const operation=d.operations.find(o=>o.id===saved);if(operation&&(explicit||['prepared','signed'].includes(operation.state)))setTracked(operation.id);else sessionStorage.removeItem('aochain:asset-operation');const requested=new URLSearchParams(window.location.search).get('character');if(requested&&d.characters.some(c=>c.id===requested))setSelected(requested);}).catch(e=>{if(active)setError(e.message);});return ()=>{active=false;};},[]);

 useEffect(()=>{const update=()=>refresh().catch(()=>{});window.addEventListener('aochain:wallet-linked',update);return ()=>window.removeEventListener('aochain:wallet-linked',update);},[]);

 useEffect(()=>{if(!pending.length)return;const timer=setInterval(()=>{if(!running.current)refresh().catch(()=>{});},5000);return ()=>clearInterval(timer);},[pending.length]);

 useEffect(()=>{setSlot('');setQuantity('1');},[selected]);

 async function scan(){setScanning(true);setScanError(false);try{const r=await fetch('/api/game-assets/wallet',{cache:'no-store'});if(!r.ok)throw Error('assets.failed');setWalletInventory(await r.json());}catch{setWalletInventory(null);setScanError(true);}finally{setScanning(false);}}

 useEffect(()=>{setWalletInventory(null);if(data?.wallet)scan();},[data?.wallet,data?.operations.find(o=>o.id===tracked)?.state]);

 async function reconcile(){if(running.current)return;running.current=true;setBusy(true);setError('');try{for(const op of pending)await post('reconcile',{operationId:op.id});await refresh();}catch(e){setError(e instanceof Error?e.message:'assets.failed');}finally{setBusy(false);running.current=false;}}

 async function sign(body:unknown){if(running.current)return;running.current=true;setBusy(true);setError('');setNotice('');setTracked('');setActiveCharacter((body as {characterId?:string}).characterId??'');setStage('preparing');try{

  const provider=await walletConnection.connect();if(provider.address!==data?.wallet)throw Error('economy.wrongWallet');

  const operation=await post('prepare',body);setTracked(operation.id);sessionStorage.setItem('aochain:asset-operation',operation.id);setStage('signing');await refresh();setNotice('signing');

  const signed=await provider.signTransaction(Transaction.from(Uint8Array.from(atob(operation.transaction),c=>c.charCodeAt(0))));

  setStage('confirming');const transaction=btoa(String.fromCharCode(...signed.serialize({requireAllSignatures:false})));const result=await post('submit',{operationId:operation.id,transaction});setNotice(result.state==='complete'?'complete':'pending');await refresh();

 }catch(e){setStage(null);setError(e instanceof Error?e.message:'assets.failed');setNotice('');try{await refresh();}catch{}}finally{setBusy(false);running.current=false;}}

 const currentOperation=data?.operations.find(o=>o.id===tracked);

 const displayStage:AssetStage|null=currentOperation?.state==='complete'?'complete':currentOperation?.state==='failed'?'failed':stage??(currentOperation?.state==='signed'?'confirming':currentOperation?.state==='prepared'?'signing':null);

 const portrait=data?.characters.find(c=>c.id===(currentOperation?.character_id??activeCharacter));

 const blocked=busy||goldBusy||unavailable||pending.length>0;const characterBlocked=blocked||!character||character.connected||Boolean(character.economy_lock)||character.chain_state==='unstaked'||(character.chain_required&&character.chain_state!=='staked');

 function message(code:string){const assetErrors:Record<string,string>={

  'assets.signIn':economy['economy.signIn'],'assets.linkWallet':copy.link,'assets.pending':copy.pending,'assets.unavailable':copy.unavailable,'assets.notOwned':locale==='es'?'Tu wallet no posee este activo.':'Your linked wallet does not own this asset.','assets.invalidAsset':locale==='es'?'No es un NFT registrado por AOCHAIN.':'This is not a registered AOCHAIN NFT.','assets.stakeFirst':copy.stake,'assets.notStaked':copy.stake,'assets.alreadyStaked':copy.staked,'assets.alreadyMinted':locale==='es'?'Este personaje ya tiene un NFT.':'This character already has an NFT.','assets.inconsistent':locale==='es'?'El estado guardado requiere revisión. El personaje sigue bloqueado.':'The saved state needs review. The character remains protected.'};return assetErrors[code]??economy[code as EconomyText]??(code.startsWith('assets.')||code.startsWith('economy.')?copy.error:code);}

 return <section className="game-assets-panel portal-collection-content"><nav className="portal-collection-tabs" aria-label={portal.collection}>{(['characters','items','gold','titles','activity'] as const).map(tab=><button type="button" key={tab} disabled={busy||goldBusy} aria-pressed={view===tab} className={view===tab?'is-active':''} onClick={()=>chooseView(tab)}>{portal[tab]}{tab==='activity'&&pending.length>0&&<span>{pending.length}</span>}</button>)}</nav><div className="collection-view-heading"><div><h2>{portal[view]}</h2><p>{portal[(view+'Help') as 'charactersHelp'|'itemsHelp'|'goldHelp'|'titlesHelp'|'activityHelp']}</p></div>{view!=='titles'&&view!=='activity'&&<button className="portal-refresh" aria-label={portal.refresh} disabled={scanning||busy||!data?.wallet} onClick={scan}><RefreshCw size={16} className={scanning?'asset-spinner':''}/></button>}</div>

  {restriction&&<PortalModal title={text(restriction.name)} onClose={()=>setRestriction(null)}><div className="modal-item-preview"><MarketItemArtwork itemId={restriction.item} name={restriction.name}/></div><span className="portal-info-badge">{restriction.equipped?(locale==='es'?'Equipado':'Equipped'):(locale==='es'?'Objeto del juego':'Game item')}</span><p>{restriction.equipped?(locale==='es'?'Desequipá este objeto dentro del juego antes de intentar retirarlo o venderlo. Los objetos newbie y los vendidos por NPC no son transferibles.':'Unequip this item in the game before withdrawing or selling it. Newbie items and items sold by NPC shops cannot be transferred.'):(locale==='es'?'Este objeto se usa dentro del juego y no se puede retirar ni publicar en el mercado. Los objetos newbie y los vendidos por NPC no son transferibles.':'This item is used in the game and cannot be withdrawn or listed. Newbie items and items sold by NPC shops cannot be transferred.')}</p><button className="realm-button" onClick={()=>setRestriction(null)}>{locale==='es'?'Entendido':'Got it'}</button></PortalModal>}
  {error&&<PortalModal title={locale==='es'?'No se pudo completar':'Could not complete the action'} onClose={()=>setError('')}><p role="alert">{message(error)}</p></PortalModal>}
  {displayStage&&!error&&<PortalModal title={locale==='es'?'Actualización del activo':'Asset update'} locked={busy} onClose={()=>{if(displayStage==='complete'||displayStage==='failed')clearTracked();else clearTracked();}}><AssetTransactionVisual stage={displayStage} signature={currentOperation?.signature} onDismiss={displayStage==='complete'||displayStage==='failed'?clearTracked:undefined}>{portrait?<CharacterSpritePreview bodyId={portrait.id_body} headId={portrait.id_head} weaponId={portrait.id_weapon} shieldId={portrait.id_shield} helmetId={portrait.id_helmet} scale={1}/>:undefined}</AssetTransactionVisual>{pending.length>0&&<button disabled={busy} onClick={reconcile}>{copy.check}</button>}</PortalModal>}
  {sell&&<SellAssetModal character={sell.character} item={sell.item} onClose={()=>setSell(null)} onSaved={()=>{refresh();scan();}}/>}
  {manage==='character'&&manageCharacter&&<PortalModal title={manageCharacter.name} onClose={()=>setManage(null)}><div className="modal-asset-art"><CharacterSpritePreview bodyId={manageCharacter.id_body} headId={manageCharacter.id_head} weaponId={manageCharacter.id_weapon} shieldId={manageCharacter.id_shield} helmetId={manageCharacter.id_helmet} scale={1.5}/></div><p>{copy[manageCharacter.chain_state]}</p><p>{portal.ownershipHelp}</p><button disabled={blocked||manageCharacter.connected||Boolean(manageCharacter.economy_lock)} onClick={()=>{setManage(null);sign(manageCharacter.chain_state==='offchain'?{kind:'mint',characterId:manageCharacter.id}:manageCharacter.chain_state==='staked'?{kind:'unstake',characterId:manageCharacter.id}:{kind:'stake',asset:manageCharacter.asset_address});}}>{manageCharacter.chain_state==='offchain'?copy.mint:manageCharacter.chain_state==='staked'?copy.unstake:copy.stake}</button><button onClick={()=>{setManage(null);setSell({character:manageCharacter});}}>{locale==='es'?'Publicar / administrar venta':'List / manage sale'}</button></PortalModal>}
  {manage==='wallet-character'&&<PortalModal title={copy.stake} onClose={()=>setManage(null)}><p>{portal.ownershipHelp}</p><button disabled={blocked} onClick={()=>{setManage(null);sign({kind:'stake',asset:itemAsset});}}>{copy.stake}</button></PortalModal>}
  {(manage==='item'||manage==='deposit')&&<PortalModal title={manage==='deposit'?copy.deposit:item?text(item.name):copy.item} onClose={()=>setManage(null)}>{manage==='deposit'&&<p className="item-destination-label">{locale==='es'?'Elegí el personaje que recibirá este objeto':'Choose the character who will receive this item'}</p>}{manage==='deposit'&&<CharacterChoices characters={data?.characters??[]} selected={selected} onSelect={setSelected}/>}{manage==='item'&&item?<><MarketItemArtwork itemId={item.item} name={item.name}/><p>{copy.exportHelp}</p><label>{copy.quantity}<input type="number" min="1" max={item.quantity} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><button disabled={characterBlocked||!Number.isInteger(Number(quantity))||Number(quantity)<1||Number(quantity)>item.quantity} onClick={()=>{setManage(null);sign({kind:'item-export',characterId:selected,slot:Number(slot),quantity:Number(quantity)});}}>{copy.withdraw}</button><button disabled={characterBlocked} onClick={()=>{setManage(null);setSell({character:character!,item});}}>{locale==='es'?'Publicar objeto':'List item'}</button></>:manage==='deposit'?<>{walletInventory?.assets.find(a=>a.address===itemAsset)&&<MarketItemArtwork itemId={walletInventory.assets.find(a=>a.address===itemAsset)!.itemId!} name={walletInventory.assets.find(a=>a.address===itemAsset)!.name}/>}<p>{copy.depositHelp}</p><p className="item-destination-label">{locale==='es'?'Destino:':'Destination:'} <strong>{character?.name??(locale==='es'?'Elegí un personaje':'Choose a character')}</strong></p><button disabled={characterBlocked||!itemAsset} onClick={()=>{setManage(null);sign({kind:'item-import',characterId:selected,asset:itemAsset});}}>{copy.import}</button></>:<p>{locale==='es'?'Este objeto no se puede vender ni retirar.':'This item cannot be listed or withdrawn.'}</p>}</PortalModal>}
  {!data?error?<button type="button" onClick={()=>{setError('');refresh().catch(e=>setError(e.message));}}>{economy.refresh}</button>:<div role="status" aria-label={ui.progress} className="asset-loading-grid"><span className="asset-skeleton"/><span className="asset-skeleton"/><span className="sr-only">{error?copy.error:copy.loading}</span></div>:<>{unavailable&&<p>{!data.ready?copy.unavailable:copy.link}</p>}

  {view==='characters'&&<><div className="game-assets-characters">{data.characters.map(c=><article className="asset-character-card" key={c.id}><div className="asset-portrait-stage"><CharacterSpritePreview bodyId={c.id_body} headId={c.id_head} weaponId={c.id_weapon} shieldId={c.id_shield} helmetId={c.id_helmet} scale={1.5}/><span className="asset-level">Lv. {c.level}</span></div><div className="asset-character-info"><h3>{playerName(c.name)}</h3><small className={'asset-chain-state asset-chain-'+c.chain_state}>{c.economy_lock?(locale==='es'?'Bloqueado · publicación o transferencia':'Locked · listing or transfer'):c.connected?ui.online:copy[c.chain_state]}</small><span className="asset-availability">{c.connected?ui.online:c.economy_lock?null:c.chain_state!=='staked'?(locale==='es'?'Stakeá para jugar':'Stake to play'):ui.ready}</span>{c.asset_address&&<a href={`https://core.metaplex.com/explorer/${c.asset_address}?env=devnet`} target="_blank" rel="noreferrer">{c.asset_address.slice(0,6)}…{c.asset_address.slice(-6)} <ArrowUpRight size={12}/></a>}</div><button disabled={busy} onClick={()=>{setManageCharacter(c);setManage('character');}}>{locale==='es'?'Administrar personaje':'Manage character'}</button></article>)}</div>

  {!data.characters.length&&<div className="asset-empty"><Package size={28}/><p>{copy.empty}</p><a href="/createcharacter">{portal.newCharacter} <ArrowUpRight size={14}/></a></div>}</>}

  {scanError&&!error&&<PortalModal title={portal.scanFailed} onClose={()=>setScanError(false)}><button onClick={()=>{setScanError(false);scan();}}>{portal.refresh}</button></PortalModal>}

  {view==='characters'&&walletInventory&&<div className="game-assets-characters">{walletInventory.assets.filter(a=>a.kind==='character'&&!data.characters.some(c=>c.asset_address===a.address)).map(a=><article className="asset-character-card" key={a.address}><div className="asset-portrait-stage">{a.appearance&&<CharacterSpritePreview {...a.appearance} scale={1.5}/>}</div><div className="asset-character-info"><h3>{a.name}</h3><small>{a.staked?copy.staked:copy.unstaked}</small></div><button disabled={blocked||a.staked} onClick={()=>{setItemAsset(a.address);setManage('wallet-character');}}>{copy.stake}</button></article>)}</div>}

  {view==='items'&&<section className="profile-item-section" aria-label={locale==='es'?'Objetos en tu wallet':'Wallet items'}><div className="profile-item-heading"><div><h3>{locale==='es'?'Objetos en tu wallet':'Wallet items'}</h3><p>{locale==='es'?'Depositá un objeto en un personaje para usarlo en el juego.':'Deposit an item into a character to use it in the game.'}</p></div><span>{walletInventory?.assets.filter(a=>a.kind==='item').length??0}</span></div>{walletInventory&&!walletInventory.assets.filter(a=>a.kind==='item').length&&<div className="asset-empty asset-empty-wallet"><Package size={24}/><div><strong>{portal.itemEmpty}</strong><p>{portal.itemEmptyHelp}</p></div></div>}{walletInventory&&<div className="asset-wallet-gallery profile-item-grid">{walletInventory.assets.filter(a=>a.kind==='item').map(a=><article className="asset-wallet-card profile-item-card" key={a.address}><div className="profile-item-art"><MarketItemArtwork itemId={a.itemId!} name={a.name}/><span className="profile-item-location">{locale==='es'?'En wallet':'In wallet'}</span></div><div className="profile-item-info"><strong>{text(a.name)}</strong><span>{locale==='es'?'Cantidad':'Quantity'} <b>× {a.quantity}</b></span><button disabled={blocked} onClick={()=>{setItemMode('deposit');setItemAsset(a.address);setManage('deposit');}}>{locale==='es'?'Depositar en personaje':'Deposit to character'}<ArrowUpRight size={14}/></button></div></article>)}</div>}</section>}


  <div hidden={view!=='gold'}><WalletGoldDeposit onBusyChange={setGoldBusy} defaultOpen inventory={walletInventory} characters={data.characters} blocked={busy||unavailable||pending.length>0} onRefresh={async()=>{await refresh();await scan();}}/></div>

  {view==='items'&&<section className="profile-inventory profile-item-section" aria-label={locale==='es'?'Inventario del personaje':'Character inventory'}><div className="profile-item-heading"><div><h3>{locale==='es'?'Inventario del personaje':'Character inventory'}</h3><p>{locale==='es'?'Elegí un personaje y administrá sus objetos. Los objetos elegibles se pueden retirar o publicar en el mercado.':'Choose a character to manage their items. Eligible items can be withdrawn or listed on the marketplace.'}</p></div><span>{character?.inventory.length??0}</span></div><CharacterChoices characters={data.characters} selected={selected} onSelect={setSelected}/>{character&&<p className="profile-inventory-owner">{locale==='es'?'Mostrando inventario de':'Showing inventory for'} <strong>{character.name}</strong></p>}<div className="asset-wallet-gallery profile-item-grid">{character?.inventory.map(i=><article className="asset-wallet-card profile-item-card" key={i.slot}><div className="profile-item-art"><MarketItemArtwork itemId={i.item} name={i.name}/><span className="profile-item-location">{i.equipped?portal.equipped:portal.inGame}</span></div><div className="profile-item-info"><strong>{text(i.name)}</strong><span>{locale==='es'?'Cantidad':'Quantity'} <b>× {i.quantity}</b></span><button disabled={busy} onClick={()=>{setSlot(String(i.slot));setQuantity('1');if(i.tradable&&!i.equipped)setManage('item');else setRestriction(i);}}>{i.tradable&&!i.equipped?(locale==='es'?'Administrar objeto':'Manage item'):(locale==='es'?'Ver restricciones':'View restrictions')}<ArrowUpRight size={14}/></button></div></article>)}</div>{character&&!character.inventory.length&&<p className="profile-inventory-owner">{locale==='es'?'Este personaje no tiene objetos en su inventario.':'This character has no inventory items.'}</p>}</section>}

  {view==='titles'&&<div className="portal-title-view"><CharacterAchievements/></div>}

  {view==='activity'&&pending.length>0&&<button onClick={()=>{setTracked(pending[0].id);setStage('confirming');}}>{copy.check}</button>}
  {view==='activity'&&data.operations.length>0&&<ul className="game-assets-history">{data.operations.map(o=><li key={o.id}><span>{o.kind==='mint'?copy.mint:o.kind==='stake'?copy.stake:o.kind==='unstake'?copy.unstake:o.kind==='item-export'?copy.withdraw:copy.import} · {['prepared','signed'].includes(o.state)?copy.pending:o.state==='complete'?copy.complete:copy.failed}</span>{o.signature&&<a target="_blank" rel="noreferrer" href={`https://explorer.solana.com/tx/${o.signature}?cluster=devnet`}>{copy.receipt}</a>}</li>)}</ul>}

  {view==='activity'&&<a className="portal-trade-history-link" href="/character-market#activity">{portal.market} · {portal.activity} <ArrowUpRight size={13}/></a>}

  {view==='activity'&&data.goldOperations?.map(o=><div className="portal-gold-operation" key={o.id}><span>{o.kind==='deposit'?portal.deposit:portal.withdraw} · {Number(o.amount).toLocaleString(locale)} {portal.gold}</span><small>{economy[o.state as EconomyText]??economy.pending}</small>{o.signature&&<a target="_blank" rel="noreferrer" href={`https://explorer.solana.com/tx/${o.signature}?cluster=devnet`}>{copy.receipt}</a>}</div>)}

  {view==='activity'&&!data.goldOperations?.length&&!data.operations.length&&<div className="asset-empty"><RefreshCw size={24}/><div><strong>{portal.noActivity}</strong><p>{portal.noActivityHelp}</p></div></div>}

  </>}

 </section>;

}







