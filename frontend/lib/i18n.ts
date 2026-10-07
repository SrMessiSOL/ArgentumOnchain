import catalog from "../locales/catalog.json";
import legacyEnglish from '../locales/legacy-en.json';
import messageTemplates from '../locales/message-templates-en.json';
import worldEnglish from '../locales/world-en.json';
import extraEnglish from '../locales/extra-en.json';
import uiEnglish from '../locales/ui-en.json';
import dataSlotDefinitions from '../locales/message-data-slots.json';
export type Locale = "en" | "es";
export type TextKey = keyof typeof catalog;
export function parseLocale(value: unknown): Locale { return value === "es" ? "es" : "en"; }
export function translate(key: TextKey, locale: Locale): string { return catalog[key][locale] || catalog[key].en; }
// Migration adapter for original game data and legacy messages. IDs and wire values are untouched.
const sourceKeys = new Map(Object.entries(catalog).map(([key, value]) => [value.es, key as TextKey]));
const exactEnglish = new Map(Object.entries({...legacyEnglish,...worldEnglish,...extraEnglish,...uiEnglish}));
const dataSlots:Record<string,number[]>=dataSlotDefinitions;
function translateDataSlot(source:string, locale:Locale, list = false):string {
    // Match a complete value first: a nested message may contain free-text commas or "y".
    const translated=translateSource(source,locale);
    if(translated!==source || !list)return translated;
    // Lists here contain developer-authored class names or advancement requirements.
    // Player names and free text must never be marked as data slots.
    return source.split(/(, | y )/).map(part=>part===' y '?' and ':translateSource(part,locale)).join('');
}
const escapePattern = (value:string) => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const templates = Object.entries(messageTemplates).sort(([a],[b])=>b.replace(/\{\d+\}/g,'').length-a.replace(/\{\d+\}/g,'').length).map(([rawSource,english])=>{
    const source=rawSource.trim();
    const slots:number[]=[];
    let cursor=0, pattern='^';
    for(const match of source.matchAll(/\{(\d+)\}/g)) {
        pattern+=escapePattern(source.slice(cursor,match.index))+'(.*?)';
        slots.push(Number(match[1])); cursor=match.index!+match[0].length;
    }
    return {pattern:new RegExp(pattern+escapePattern(source.slice(cursor))+'$','s'),slots,english:english.trim(),dataSlots:dataSlots[rawSource]??[], listSlots: /Clases:|Clase invalida|Para ascender a/.test(rawSource)};
});
export function translateSource(source: string, locale: Locale): string {
    if(locale==='es')return source;
    const key = sourceKeys.get(source);
    if(key)return translate(key,locale);
    const normalized=source.replace(/\s+/g,' ').trim();
    const normalizedKey=sourceKeys.get(normalized);
    const exact=exactEnglish.get(source)??exactEnglish.get(normalized)??(normalizedKey?translate(normalizedKey,locale):undefined);
    if(exact!==undefined)return (source.match(/^\s+/)?.[0]??'')+exact+(source.match(/\s+$/)?.[0]??'');
    const prefix=/^(\[INFO\]\s+)([\s\S]+)$/.exec(source);
    if(prefix){
        const body=translateSource(prefix[2],locale);
        if(body!==prefix[2])return prefix[1]+body;
    }
    // Validate each sentence separately before matching a broad placeholder pattern.
    // Only use this path when every sentence is recognized; never rewrite fragments of free text.
    const sentences=source.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚ¡¿])/);
    if(sentences.length>1){
        const translated=sentences.map(part=>translateSource(part,locale));
        if(translated.every((part,index)=>part!==sentences[index]))return translated.join(' ');
    }
    for(const template of templates){
        const match=template.pattern.exec(source.trim());
        if(!match)continue;
        const values=new Map(template.slots.map((slot,index)=>[slot,template.dataSlots.includes(slot)?translateDataSlot(match[index+1],locale,template.listSlots):match[index+1]]));
        return (source.match(/^\s+/)?.[0]??'')+template.english.replace(/\{(\d+)\}/g,(_,slot)=>values.get(Number(slot))??'')+(source.match(/\s+$/)?.[0]??'');
    }
    return source;
}
