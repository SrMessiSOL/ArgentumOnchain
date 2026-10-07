"use client";
import { LocalizedText, LocalizedLabel } from '@/components/LocalizedText';
/* eslint-disable @next/next/no-img-element */


import { useEffect, useMemo, useRef, useState } from "react";
import { Crown, Flame, Trophy, RefreshCw } from "lucide-react";
import BrowseToolbar from "@/components/BrowseToolbar";
import {useI18n} from "@/components/I18nProvider";
import { formatNumber } from "@/lib/number-format";
import type {
    RankingCharacter,
    RankingHeadSprite,
    RankingPageData,
} from "@/lib/ranking";

type RankingViewProps = {
    characters: RankingCharacter[];
    headSpritesById: Record<string, RankingHeadSprite | null>;
    unavailable?: boolean;
};

type RankingSortKey = "level" | "kills";
type RankingClassFilter = "all" | number;

const MAX_LEVEL = 50;

const sortOptions: Array<{ key: RankingSortKey; label: string }> = [
    { key: "level", label: "Nivel" },
    { key: "kills", label: "Kills" },
];

const classLabels: Record<number, string> = {
    1: "Mago",
    2: "Clerigo",
    3: "Guerrero",
    4: "Asesino",
    6: "Bardo",
    7: "Druida",
    8: "Paladin",
    9: "Cazador",
};

const raceLabels: Record<number, string> = {
    1: "Humano",
    2: "Elfo",
    3: "Elfo Drow",
    4: "Enano",
    5: "Gnomo",
};

const factionColors = {
    armada: "#00AFFF",
    caos: "#fb7185",
} as const;

const classFilterOptions = [
    { value: "all" as const, label: "Todos" },
    ...Object.entries(classLabels).map(([value, label]) => ({
        value: Number(value),
        label,
    })),
];

function getMetricLabel(character: RankingCharacter, sortKey: RankingSortKey) {
    return sortKey === "level"
        ? isMaxLevelCharacter(character)
            ? `Nivel ${formatNumber(character.level)}`
            : `Nivel ${formatNumber(character.level)} (${formatExperiencePercent(character)})`
        : `${formatNumber(character.kills)} kills`;
}

function isMaxLevelCharacter(character: RankingCharacter) {
    return character.level >= MAX_LEVEL;
}

function getExperiencePercent(character: RankingCharacter) {
    if (character.expNextLevel <= 0) {
        return 0;
    }

    return Math.max(
        0,
        Math.min(100, (character.exp / character.expNextLevel) * 100),
    );
}

function formatExperiencePercent(character: RankingCharacter) {
    return `${Math.round(getExperiencePercent(character))}%`;
}

function getCharacterMeta(character: RankingCharacter) {
    const classLabel =
        classLabels[character.idClase] ?? `Clase ${character.idClase}`;
    const raceLabel =
        raceLabels[character.idRaza] ?? `Raza ${character.idRaza}`;
    return <><LocalizedText source={classLabel} />{" · "}<LocalizedText source={raceLabel} /></>;
}

function getCharacterNameColor(character: RankingCharacter) {
    if (character.faction === "armada") {
        return factionColors.armada;
    }

    if (character.faction === "caos") {
        return factionColors.caos;
    }

    return character.criminal ? "#fb7185" : "#93c5fd";
}

function getClanTag(character: RankingCharacter) {
    return character.clanName ? `<${character.clanName}>` : null;
}

function formatUpdatedAt(value: string) {
    return new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

function sortCharacters(
    characters: RankingCharacter[],
    sortKey: RankingSortKey,
) {
    return [...characters].sort((left, right) => {
        const metricDelta = right[sortKey] - left[sortKey];

        if (metricDelta !== 0) {
            return metricDelta;
        }

        if (right.level !== left.level) {
            return right.level - left.level;
        }

        if (right.exp !== left.exp) {
            return right.exp - left.exp;
        }

        if (right.kills !== left.kills) {
            return right.kills - left.kills;
        }

        return left.name.localeCompare(right.name, "es");
    });
}

function RankingHead({
    sprite,
    size,
    className,
}: {
    sprite: RankingHeadSprite | null;
    size: number;
    className?: string;
}) {
    if (!sprite) {
        return (
            <div
                className={`flex items-center justify-center rounded-[18px] border border-white/10 bg-black/20 text-[10px] uppercase tracking-[0.22em] text-stone-500 ${className ?? ""}`}
                style={{ width: size, height: size }}
            >
                N/A
            </div>
        );
    }

    return (
        <div
            className={`relative overflow-hidden rounded-[18px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.18),rgba(12,10,9,0.95)_58%),linear-gradient(180deg,rgba(120,53,15,0.16),rgba(12,10,9,0))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${className ?? ""}`}
            style={{ width: size, height: size }}
        >
            <div
                className="absolute overflow-hidden"
                style={{
                    left: 0,
                    top: 0,
                    width: size,
                    height: size,
                    imageRendering: "pixelated",
                }}
            >
                <LocalizedLabel><img
                    src={`/graphics/${sprite.numFile}.png`}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute max-w-none select-none"
                    style={{
                        left: -sprite.sourceX,
                        top: -sprite.sourceY,
                        width: "auto",
                        height: "auto",
                        transform: `scale(${Math.max(size / sprite.width, size / sprite.height)})`,
                        transformOrigin: `${sprite.sourceX}px ${sprite.sourceY}px`,
                        imageRendering: "pixelated",
                    }}
                /></LocalizedLabel>
            </div>
        </div>
    );
}

function characterName(character:RankingCharacter){return character.name;}
export default function RankingView({characters,headSpritesById,unavailable=false}:RankingViewProps) {
 const {locale,text}=useI18n();
 const copy=locale==='es'?{eyebrow:'LEYENDAS DEL REINO',title:'Tabla de clasificación',intro:'Cada nivel se gana. Cada rival cuenta. Conocé a quienes dejan su huella en Argentum.',level:'Nivel',kills:'Kills',all:'Todas las clases',class:'Clase',leaders:'Líderes del reino',players:'Personajes',updated:'Progreso registrado',loading:'Actualizando clasificación…',error:'No pudimos actualizar la clasificación.',retry:'Reintentar',empty:'El reino espera sus primeras leyendas.',none:'No hay personajes para estos filtros.',reset:'Limpiar filtros',help:'Ordenado por nivel o kills. El porcentaje indica el progreso hacia el próximo nivel.'}:{eyebrow:'LEGENDS OF THE REALM',title:'Leaderboard',intro:'Every level earned. Every rival counted. Meet the adventurers making their mark in Argentum.',level:'Level',kills:'Kills',all:'All classes',class:'Class',leaders:'Realm leaders',players:'Characters',updated:'Progress recorded',loading:'Updating leaderboard…',error:'We couldn’t update the leaderboard.',retry:'Try again',empty:'The realm awaits its first legends.',none:'No characters match these filters.',reset:'Clear filters',help:'Ranked by level or kills. The percentage shows progress toward the next level.'};
 const [sortKey,setSortKey]=useState<RankingSortKey>('level');
 const [classFilter,setClassFilter]=useState<RankingClassFilter>('all');
 const [query,setQuery]=useState('');
 const [rankingCharacters,setRankingCharacters]=useState(characters);
 const [rankingHeads,setRankingHeads]=useState(headSpritesById);
 const [isLoading,setIsLoading]=useState(false);
 const [failed,setFailed]=useState(unavailable);
 const [retry,setRetry]=useState(0);
 const first=useRef(true);
 useEffect(()=>{
  if(first.current){first.current=false;return;}
  const controller=new AbortController();
  const params=new URLSearchParams({sort:sortKey});
  if(classFilter!=='all')params.set('classId',String(classFilter));
  setIsLoading(true);setFailed(false);
  fetch(`/api/ranking?${params}`,{signal:controller.signal,cache:'no-store'}).then(async r=>{
   if(!r.ok)throw Error('Leaderboard unavailable');
   return await r.json() as RankingPageData;
  }).then(data=>{if(!controller.signal.aborted){setRankingCharacters(data.characters);setRankingHeads(data.headSpritesById);}}).catch(()=>{if(!controller.signal.aborted)setFailed(true);}).finally(()=>{if(!controller.signal.aborted)setIsLoading(false);});
  return ()=>controller.abort();
 },[sortKey,classFilter,retry]);
 const ranked=useMemo(()=>sortCharacters(rankingCharacters,sortKey).filter(c=>classFilter==='all'||c.idClase===classFilter),[rankingCharacters,sortKey,classFilter]);
 const visible=ranked.map((character,index)=>({character,rank:index+1})).filter(({character})=>character.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const leaders=ranked.slice(0,3);
 const latest=ranked.reduce((value,c)=>Math.max(value,new Date(c.updatedAt).getTime()||0),0);
 const head=(c:RankingCharacter,size:number)=><RankingHead sprite={rankingHeads[String(c.headId)]??null} size={size} className="shrink-0"/>;
 return <main className="realm-ranking realm-leaderboard"><div className="leaderboard-wrap">
  <header className="leaderboard-heading"><div><p className="exchange-eyebrow">{copy.eyebrow}</p><h1>{text(copy.title)}</h1><p>{copy.intro}</p></div><Trophy size={48} aria-hidden="true"/></header>
  <div className="leaderboard-controls"><div className="leaderboard-tabs" aria-label={locale==='es'?'Ordenar clasificación':'Leaderboard ranking'}>{sortOptions.map(o=><button key={o.key} type="button" aria-pressed={sortKey===o.key} onClick={()=>setSortKey(o.key)}>{o.key==='level'?<Crown size={16}/>:<Flame size={16}/>} {o.key==='level'?copy.level:copy.kills}</button>)}</div><label>{copy.class}<select value={classFilter} onChange={e=>setClassFilter(e.target.value==='all'?'all':Number(e.target.value))}><option value="all">{copy.all}</option>{classFilterOptions.filter(o=>o.value!=='all').map(o=><option key={o.value} value={o.value}>{text(o.label)}</option>)}</select></label></div>
  <div className="leaderboard-status" role="status" aria-live="polite">{isLoading?copy.loading:failed?copy.error:copy.help}{failed&&<button type="button" onClick={()=>setRetry(v=>v+1)}><RefreshCw size={14}/>{copy.retry}</button>}</div>
  <BrowseToolbar kind="characters" query={query} onQuery={setQuery} count={visible.length}/>
  {leaders.length>0&&<section className="leaderboard-podium" aria-label={copy.leaders}>{leaders.map((c,i)=><article key={c.id}><span className="leaderboard-place"><Trophy size={14}/> #{i+1}</span><div className="leaderboard-champion">{head(c,64)}<div><h2 title={characterName(c)}>{characterName(c)}</h2><p>{getCharacterMeta(c)}</p>{c.clanName&&<small>{c.clanName}</small>}</div></div><div className="leaderboard-score"><strong>{formatNumber(c[sortKey])}</strong><span>{sortKey==='level'?copy.level:copy.kills}</span>{sortKey==='level'&&!isMaxLevelCharacter(c)&&<small>{formatExperiencePercent(c)} XP</small>}</div></article>)}</section>}
  <section className="leaderboard-list" aria-busy={isLoading}><div className="leaderboard-list-heading"><h2>{copy.players}</h2>{latest>0&&<small>{copy.updated}: {new Intl.DateTimeFormat(locale==='es'?'es-AR':'en-US',{dateStyle:'medium'}).format(latest)}</small>}</div>
   <div className="leaderboard-column-head" aria-hidden="true"><span>#</span><span>{copy.players}</span><span>{copy.level}</span><span>{copy.kills}</span></div>
   <ol className="leaderboard-rows">{visible.map(({character:c,rank})=><li key={c.id}><span className="leaderboard-rank">{rank}</span><div className="leaderboard-player">{head(c,44)}<div><h3 style={{color:getCharacterNameColor(c)}} title={characterName(c)}>{characterName(c)}</h3><p>{getCharacterMeta(c)}</p>{c.clanName&&<small>{c.clanName}</small>}</div></div><div className="leaderboard-stat"><span>{copy.level}</span><b>{formatNumber(c.level)}</b>{!isMaxLevelCharacter(c)&&<small>{formatExperiencePercent(c)} XP</small>}</div><div className="leaderboard-stat kills"><span>{copy.kills}</span><b>{formatNumber(c.kills)}</b></div></li>)}</ol>
   {!visible.length&&!isLoading&&!failed&&<div className="leaderboard-empty"><Trophy size={28}/><h3>{query||classFilter!=='all'?copy.none:copy.empty}</h3>{(query||classFilter!=='all')&&<button onClick={()=>{setQuery('');setClassFilter('all');}}>{copy.reset}</button>}</div>}
  </section>
 </div></main>;
}
