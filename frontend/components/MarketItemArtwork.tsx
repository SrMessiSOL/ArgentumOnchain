"use client";
import {useEffect,useState} from 'react';
import {Package} from 'lucide-react';
import {useI18n} from '@/components/I18nProvider';
import {loadGraphicsDB,loadObjectsDB,getTexturePath} from '@/utils/gameLoader';
import type {GraphicData} from '@/types/game';
export function MarketItemArtwork({itemId,name,graphicId}:{itemId:number;name:string;graphicId?:number}){
 const {text:localize}=useI18n(),[graphic,setGraphic]=useState<GraphicData|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let active=true;setGraphic(null);setFailed(false);Promise.all([loadGraphicsDB(),loadObjectsDB()]).then(([graphics,objects])=>{const id=graphicId??objects[String(itemId)]?.grhIndex;let g=graphics[String(id)];if(g?.numFrames>1)g=graphics[g.frames?.['1']];if(active)setGraphic(g?.numFile?g:null);}).catch(()=>{if(active)setFailed(true);});return()=>{active=false;};},[itemId,graphicId]);
 const scale=graphic?Math.min(4,100/Math.max(graphic.width,graphic.height,1)):1;
 return <div className="market-item-art" role="img" aria-label={localize(name)}>{graphic&&!failed?<><img src={getTexturePath(graphic)} alt="" className="market-texture-check" onError={()=>setFailed(true)}/><div className="market-item-pixel" style={{width:graphic.width,height:graphic.height,backgroundImage:`url(${getTexturePath(graphic)})`,backgroundPosition:`-${graphic.sX}px -${graphic.sY}px`,transform:`translate(-50%,-50%) scale(${scale})`}}/></>:<Package size={36} aria-hidden="true"/>}</div>;
}
