"use client";
import {useEffect,useRef,useState} from 'react';
import {loadBodiesDB,loadHeadsDB,loadGraphicsDB,getTexturePath} from '@/utils/gameLoader';
import type {GraphicData} from '@/types/game';
export default function NpcArtwork({bodyId,headId,name}:{bodyId:number;headId:number;name:string}){
 const canvas=useRef<HTMLCanvasElement>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{let active=true;setFailed(false);async function draw(){const [bodies,heads,graphics]=await Promise.all([loadBodiesDB(),loadHeadsDB(),loadGraphicsDB()]);const body=bodies[String(bodyId)];function frame(id:number){let g=graphics[String(id)];if(g?.numFrames>1)g=graphics[g.frames?.['1']];return g;}
 const b=frame(body?.['2']),h=headId>0?frame(heads[String(headId)]?.['2']):null;if(!b?.numFile)throw Error('No sprite');
 const parts:{g:GraphicData;x:number;y:number}[]=[{g:b,x:0,y:0}];if(h?.numFile)parts.push({g:h,x:b.width/2-h.width/2+(body.headOffsetX??0),y:b.height-50+(body.headOffsetY??0)});
 const minX=Math.min(...parts.map(p=>p.x)),minY=Math.min(...parts.map(p=>p.y)),width=Math.max(...parts.map(p=>p.x+p.g.width))-minX,height=Math.max(...parts.map(p=>p.y+p.g.height))-minY,scale=Math.min(3,100/width,100/height);
 const images=await Promise.all(parts.map(p=>new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=getTexturePath(p.g);})));if(!active)return;const ctx=canvas.current?.getContext('2d');if(!ctx)return;ctx.clearRect(0,0,112,112);ctx.imageSmoothingEnabled=false;parts.forEach((p,i)=>ctx.drawImage(images[i],p.g.sX,p.g.sY,p.g.width,p.g.height,(112-width*scale)/2+(p.x-minX)*scale,(112-height*scale)/2+(p.y-minY)*scale,p.g.width*scale,p.g.height*scale));}
 draw().catch(()=>{if(active)setFailed(true);});return()=>{active=false;};},[bodyId,headId]);return <div className="wiki-npc-art">{failed?<span>{name}</span>:<canvas ref={canvas} width={112} height={112} role="img" aria-label={name}/>}</div>;
}
