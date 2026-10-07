"use client";
import {useEffect,useRef,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
let openModalCount=0;
let previousBodyOverflow='';
import {useI18n} from './I18nProvider';
export default function PortalModal({title,children,onClose,locked=false}:{title:string;children:ReactNode;onClose:()=>void;locked?:boolean}){
 const ref=useRef<HTMLDivElement>(null),{locale}=useI18n();
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;if(openModalCount++===0){previousBodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}ref.current?.focus();return()=>{if(--openModalCount===0)document.body.style.overflow=previousBodyOverflow;if(previous?.isConnected)previous.focus();};},[]);
 if(typeof document==='undefined')return null;
 return createPortal(<div className="portal-modal-backdrop" onClick={e=>{if(e.target===e.currentTarget&&!locked)onClose();}}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="portal-modal" onKeyDown={e=>{if(e.key==='Escape'&&!locked)onClose();if(e.key==='Tab'){const nodes=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')??[]);const first=nodes[0],last=nodes[nodes.length-1];if(!first){e.preventDefault();return;}if(e.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===ref.current)){e.preventDefault();first.focus();}}}}><header><h2>{title}</h2><button disabled={locked} aria-label={locale==='es'?'Cerrar':'Close'} onClick={onClose}>×</button></header><div className="portal-modal-body">{children}</div></div></div>,document.body);
}
