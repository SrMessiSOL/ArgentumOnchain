"use client";
import {cloneElement, type ReactElement} from 'react';
import {useI18n} from './I18nProvider';

/** Explicit presentation boundary. Never apply to player-authored names or chat. */
export function LocalizedText({source}:{source:string | number | null | undefined}) {
    const {text}=useI18n();
    return typeof source === 'string' ? text(source) : source ?? null;
}

/** Translate accessible labels and hints without changing values or event handlers. */
export function LocalizedLabel({children}:{children:ReactElement<Record<string,unknown>>}) {
    const {text}=useI18n();
    const props:Record<string,string>={};
    for(const key of ['title','aria-label','placeholder','alt']) {
        const value=children.props[key];
        if(typeof value==='string') props[key]=text(value);
    }
    return cloneElement(children,props);
}
