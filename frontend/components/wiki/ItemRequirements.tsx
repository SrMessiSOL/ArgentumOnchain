"use client";
import recipes from '@/lib/crafting-wiki.json';
import {useI18n} from '../I18nProvider';

export default function ItemRequirements({itemId}:{itemId:number}) {
    const {locale}=useI18n();
    const es=locale==='es';
    const recipe=recipes.find(r=>r.output.itemId===itemId && r.profession!=='smelting');
    const professions:Record<string,string>=es?{carpentry:'Carpintería',tailoring:'Sastrería',blacksmith:'Herrería'}:{carpentry:'Carpentry',tailoring:'Tailoring',blacksmith:'Blacksmithing'};
    return <dl className="mt-2 space-y-1 text-xs leading-5 text-stone-400">
        <div><dt className="inline text-stone-200">{es?'Nivel para usar: ':'Level to use: '}</dt><dd className="inline">{es?'Sin mínimo':'No minimum'}</dd></div>
        <div><dt className="inline text-stone-200">{es?'Skill para usar: ':'Skill to use: '}</dt><dd className="inline">{es?'No requerido':'Not required'}</dd></div>
        {recipe&&<div><dt className="inline text-stone-200">{es?'Fabricar: ':'Craft: '}</dt><dd className="inline">{professions[recipe.profession]} {recipe.skill} · {es?'Nivel':'Level'} {Math.max(1,Math.ceil(recipe.skill/3))}</dd></div>}
    </dl>;
}
