import names from './item-names-en.json';
const englishNames=new Map(Object.entries(names));
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
/** Search labels in either language; never replace authoritative item data. */
export function itemMatchesSearch(name:string,query:string):boolean {
    const needle=normalize(query.trim());
    return normalize(name).includes(needle)||normalize(englishNames.get(name)??'').includes(needle);
}
