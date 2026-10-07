"use client";
import {useEffect,useRef,useState} from 'react';
import PortalModal from './PortalModal';
import AssetTransactionVisual,{type AssetStage} from './AssetTransactionVisual';
import {portalEnglish,portalSpanish} from '@/lib/portal-copy';
import {assetUiEnglish,assetUiSpanish} from '@/lib/asset-ui-copy';
import {canDepositWalletGold} from '@/lib/wallet-gold';
import {Transaction} from '@solana/web3.js';
import {useGameWallet} from './GameWalletProvider';
import {useI18n} from './I18nProvider';
import {jsonPost,type WalletInventory} from '@/lib/game-wallet';
import {economyEnglish,economySpanish,type EconomyText} from '@/lib/economy-locales';
type Character={gold:number;id:string;name:string;connected:boolean;economy_lock:string|null;chain_state:string;chain_required:boolean};
const playerName=(name:string)=>name;
export default function WalletGoldDeposit({inventory,characters,onRefresh,blocked,defaultOpen=false,onBusyChange}:{inventory:WalletInventory|null;characters:Character[];onRefresh:()=>Promise<unknown>;blocked:boolean;defaultOpen?:boolean;onBusyChange?:(busy:boolean)=>void}){
 const {locale}=useI18n(),wallet=useGameWallet(),copy=locale==='es'?economySpanish:economyEnglish;
 const ui=locale==='es'?assetUiSpanish:assetUiEnglish;const portal=locale==='es'?portalSpanish:portalEnglish;
 const [showFeedback,setShowFeedback]=useState(false);
 const [mode,setMode]=useState<'deposit'|'withdraw'>('deposit');
 const [stage,setStage]=useState<AssetStage|null>(null);
 const [selected,setSelected]=useState(''),[amount,setAmount]=useState('1'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[operation,setOperation]=useState<{id:string;state:string;signature?:string|null}|null>(null);
 useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
 const running=useRef(false),character=characters.find(c=>c.id===(selected||characters[0]?.id));
 const labels=locale==='es'?{character:'Personaje'}:{character:'Character'};
 const available=mode==='withdraw'?character?BigInt(character.gold):null:inventory?.goldBalance===null||!inventory?null:BigInt(inventory.goldBalance);
 const valid=canDepositWalletGold(amount,available===null?null:String(available));
 async function check(){if(!operation)return;const d=await jsonPost('/api/economy/reconcile',{intentId:operation.id});setOperation({id:operation.id,state:d.state,signature:d.signature});await onRefresh();}
 async function deposit(){if(running.current)return;running.current=true;setBusy(true);setError('');setOperation(null);setShowFeedback(true);setStage('preparing');try{
  const signer=await wallet.connect();if(signer.address!==inventory?.wallet)throw Error('economy.wrongWallet');
  const p=await jsonPost('/api/economy/prepare',{kind:mode,characterId:character?.id,amount:Number(amount)});setOperation({id:p.id,state:'prepared'});setStage('signing');
  if(p.wallet!==signer.address)throw Error('economy.wrongWallet');
  const signed=await signer.signTransaction(Transaction.from(Uint8Array.from(atob(p.transaction),c=>c.charCodeAt(0))));
  setStage('confirming');const result=await jsonPost('/api/economy/submit',{intentId:p.id,transaction:btoa(String.fromCharCode(...signed.serialize({requireAllSignatures:false})))});setOperation({id:p.id,state:result.state,signature:result.signature});await onRefresh();
 }catch(e){setStage(null);setError(e instanceof Error?e.message:'economy.failed');}finally{running.current=false;setBusy(false);}}
 useEffect(()=>{fetch('/api/economy',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{const op=d?.intents.find((i:{kind:string;state:string})=>['deposit','withdraw'].includes(i.kind)&&!['complete','failed'].includes(i.state));if(op){setMode(op.kind);setOperation({id:op.id,state:op.state,signature:op.signature});}}).catch(()=>{});},[]);
 useEffect(()=>{if(!operation||['complete','failed'].includes(operation.state))return;const timer=setInterval(()=>{if(!running.current)check().catch(()=>{});},5000);return ()=>clearInterval(timer);},[operation?.id,operation?.state]);
 const pending=operation&&!['complete','failed'].includes(operation.state);
 const feedback:AssetStage|null=operation?.state==='complete'?'complete':operation?.state==='failed'?'failed':stage??(operation?.state==='signed'?'confirming':operation?.state==='prepared'?'signing':null);
 const disabledReason=!character?ui.pickCharacter:character.connected?ui.online:character.economy_lock&&!pending?ui.locked:character.chain_state==='unstaked'||(character.chain_required&&character.chain_state!=='staked')?ui.stakeFirst:available===null?ui.unknownGold:available===BigInt('0')?(mode==='withdraw'?copy['economy.insufficientGold']:ui.noGold):!valid?ui.invalidAmount:'';
 return <details open={defaultOpen} className={defaultOpen?'game-assets-tools portal-gold-form':'game-assets-tools'}><summary>{locale==='es'?'Depositar oro de la wallet':'Deposit wallet gold'}</summary><div className="portal-transfer-switch"><button type="button" disabled={busy||Boolean(pending)} aria-pressed={mode==='deposit'} onClick={()=>{setMode('deposit');setAmount('1');}}>{portal.deposit}</button><button type="button" disabled={busy||Boolean(pending)} aria-pressed={mode==='withdraw'} onClick={()=>{setMode('withdraw');setAmount('1');}}>{portal.withdraw}</button></div><div className="portal-gold-balances"><div className={mode==='deposit'?'is-source':''}><small>{ui.gold}</small><strong>{!inventory||inventory.goldBalance===null?'—':BigInt(inventory.goldBalance).toLocaleString(locale)}</strong></div><div className={mode==='withdraw'?'is-source':''}><small>{portal.gameGold}</small><strong>{character?character.gold.toLocaleString(locale):'—'}</strong></div></div><div className="asset-gold-intro"><img src="/brand/gold.svg" width="90" height="90" alt=""/><div><strong>{mode==='deposit'?portal.depositGoldHelp:portal.withdrawGoldHelp}</strong><p>1 SPL = 1 {portal.gold}</p></div></div><label>{labels.character}<select disabled={busy||Boolean(pending)} value={selected||characters[0]?.id||''} onChange={e=>setSelected(e.target.value)}>{characters.map(c=><option key={c.id} value={c.id}>{playerName(c.name)}</option>)}</select></label><label>{copy.amount}<div className="asset-amount-input"><input disabled={busy||Boolean(pending)} aria-label={copy.amount} type="number" min="1" max={available===null?'0':String(available>BigInt('2147483647')?BigInt('2147483647'):available)} step="1" value={amount} onChange={e=>setAmount(e.target.value)}/><button type="button" disabled={busy||Boolean(pending)||available===null||available===BigInt('0')} onClick={()=>setAmount(String(available!>BigInt('2147483647')?BigInt('2147483647'):available!))}>{ui.max}</button></div></label><p id="wallet-gold-guidance" className="asset-inline-help">{pending?copy.pending:disabledReason}</p><button aria-describedby="wallet-gold-guidance" disabled={blocked||busy||Boolean(pending)||!valid||!character||character.connected||Boolean(character.economy_lock)||character.chain_state==='unstaked'||(character.chain_required&&character.chain_state!=='staked')} onClick={deposit}>{mode==='withdraw'?copy.withdraw:copy.deposit}</button>{error&&<PortalModal title={locale==='es'?'No se pudo transferir':'Transfer could not complete'} onClose={()=>setError('')}><p>{copy[error as EconomyText]??copy['economy.failed']}</p></PortalModal>}{showFeedback&&feedback&&!error&&<PortalModal title={locale==='es'?'Transferencia de oro':'Gold transfer'} locked={busy} onClose={()=>{setShowFeedback(false);setStage(null);if(operation?.state==='complete'||operation?.state==='failed')setOperation(null);}}><AssetTransactionVisual stage={feedback} signature={operation?.signature} onDismiss={feedback==='complete'||feedback==='failed'?()=>{setOperation(null);setStage(null);}:undefined}><img src="/brand/gold.svg" width="100" height="100" alt=""/></AssetTransactionVisual></PortalModal>}<details className="asset-ownership"><summary>{portal.goldDetails}</summary><p>{copy.bridgeHelp}</p></details>{pending&&<button disabled={busy} onClick={()=>{setShowFeedback(true);setBusy(true);check().catch(()=>setError('economy.failed')).finally(()=>setBusy(false));}}>{copy.recover}</button>}</details>;
}


