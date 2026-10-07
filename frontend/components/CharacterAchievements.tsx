"use client";
import PortalModal from './PortalModal';
import {useEffect,useState} from 'react';
import {portalEnglish,portalSpanish} from '@/lib/portal-copy';
import {useI18n} from './I18nProvider';
import {economyEnglish,economySpanish,type EconomyText} from '@/lib/economy-locales';
// Player-authored names must remain unchanged in both locales.
const playerName=(name:string)=>name;
type Character={id:string;name:string;title:string|null;achievements:string[];economy_lock:string|null};
export default function CharacterAchievements(){const {locale}=useI18n();const portal=locale==='es'?portalSpanish:portalEnglish;const text=locale==='es'?economySpanish:economyEnglish;const [characters,setCharacters]=useState<Character[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){const r=await fetch('/api/achievements',{cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(r.status===401?'economy.signIn':d.error);setCharacters(d.characters);}
 useEffect(()=>{refresh().catch(e=>setError(e.message));},[]);
 async function title(characterId:string,kind:string|null){setBusy(true);setError('');try{const r=await fetch('/api/achievements',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({characterId,kind})});const d=await r.json();if(!r.ok)throw Error(r.status===401?'economy.signIn':d.error);await refresh();window.dispatchEvent(new Event('aoweb:cosmetic-changed'));}catch(e){setError(e instanceof Error?e.message:'economy.failed');}finally{setBusy(false);}}
 return <section className="mt-8 rounded-2xl border border-purple-300/25 bg-stone-900 p-6"><h2 className="text-xl font-semibold">{text.achievements}</h2><p className="mt-3 text-sm text-stone-400">{text.achievementHelp}</p>{characters.map(c=><div key={c.id} className="mt-5 border-t border-stone-700 pt-4"><h3 className="font-semibold">{playerName(c.name)}</h3><p className="mt-2 text-sm">{c.title==='first-hunt'?text.hunt:c.title==='explorer'?text.explorer:text.none}</p><div className="mt-3 flex flex-wrap gap-3">{c.achievements.map(kind=><button key={kind} aria-pressed={c.title===kind} disabled={busy||Boolean(c.economy_lock)||c.title===kind} onClick={()=>title(c.id,kind)} className="flex items-center gap-2 rounded border border-purple-300/40 p-2 disabled:opacity-40"><img src={kind==='first-hunt'?'/cosmetics/first-hunt.svg':'/cosmetics/explorer.svg'} alt="" width="24" height="24"/>{kind==='first-hunt'?text.hunt:text.explorer} · {c.title===kind?portal.equipped:text.equip}</button>)}{c.title&&<button disabled={busy||Boolean(c.economy_lock)} onClick={()=>title(c.id,null)}>{text.clear}</button>}</div></div>)}{error&&<PortalModal title={locale==='es'?'No se pudo actualizar':'Could not update your title'} onClose={()=>setError('')}><p role="alert" className="mt-4 text-amber-200">{text[error as EconomyText]??text['economy.failed']}</p></PortalModal>}</section>;
}
