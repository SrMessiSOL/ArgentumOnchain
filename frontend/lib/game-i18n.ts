import { translateSource, type Locale } from './i18n';
import { englishCommandNames } from './command-display';

export function localizeLoadingDetail(text:string,locale:Locale):string {
    if(locale==='es')return text;
    const patterns:Array<[RegExp,(m:RegExpExecArray)=>string]>=[
        [/^Mapa (\d+) listo para transicion rapida\.$/,m=>`Map ${m[1]} ready for travel.`],
        [/^Analizando (\d+) mapas cercanos\.\.\.$/,m=>`Checking ${m[1]} nearby maps...`],
        [/^Precargando apariencia de (.+)\.\.\.$/,m=>`Loading ${m[1]}'s appearance...`],
        [/^Precargando (\d+) efectos de hechizos\.\.\.$/,m=>`Loading ${m[1]} spell effects...`],
        [/^Descargando init y mapa (\d+)\.\.\.$/,m=>`Loading game data and map ${m[1]}...`],
    ];
    if(text==='Inicializando renderer y recursos base...')return 'Initializing the renderer and game assets...';
    for(const [pattern,render] of patterns){const m=pattern.exec(text);if(m)return render(m);}
    return translateSource(text,locale);
}

/** Render only. Never replace raw protocol text used by game state handlers. */
export function localizeGameMessage(text: string, locale: Locale, npcName?: string): string {
    if (locale === 'es') return text;
    // The same combat text is used for players and creatures. Never infer identity
    // from a catalog match: a player is allowed to choose a name such as "Mago".
    const entityName = (name: string) => name === npcName ? translateSource(name, locale) : name;
    // Ground-object inspection sends an authored item name plus its stack count.
    const groundItem = /^(.+) - (\d+)$/.exec(text);
    if (groundItem) return `${translateSource(groundItem[1],locale)} - ${groundItem[2]}`;
    // Inspection packets are assembled from several messages on the server.
    const inspectedNpc = /^Ves a (.+?) \[NPC\]([\s\S]*)$/.exec(text);
    if (inspectedNpc) {
        const suffix = inspectedNpc[2]
            .replace(/\[Invocación de ([^\]]+)\]/g,(_,owner)=>`[${owner}'s summon]`)
            .replace(/\[Vida: ([^\]]+)\]/g,'[Health: $1]')
            .replace(/\[Paralizado\]/g,'[Paralyzed]')
            .replace(/\[Inmovilizado\]/g,'[Immobilized]')
            .replace(/\[Agresor: /g,'[Aggressor: ')
            .replace(/\[Aggro reciente: si\]/g,'[Recent aggro: yes]')
            .replace(/\[Aggro reciente: no\]/g,'[Recent aggro: no]')
            .replace(/\[Memoria aggro: /g,'[Aggro memory: ')
            .replace(/\[Presion: /g,'[Pressure: ')
            .replace(/\[(Target|Aggressor): ninguno\]/g,'[$1: none]');
        return `You see ${translateSource(inspectedNpc[1],locale)} [NPC]${suffix}`;
    }
    const inspectedPlayer = /^Ves a (.+) - ([^,]+), nivel (\d+)(.*)$/.exec(text);
    if (inspectedPlayer) {
        const suffix=inspectedPlayer[4]
            .replace(/^ - ([^\[]+?)(?= - \[| \[|$)/,(_,faction)=>` - ${translateSource(faction,locale)}`)
            .replace(/\[([^\]]+)\]/g,(_,value)=>`[${translateSource(value,locale)}]`)
            .replace(/Aciertos: /g,'Hits: ').replace(/Errados: /g,'Misses: ')
            .replace(/Porcentaje de aciertos: /g,'Accuracy: ');
        return `You see ${inspectedPlayer[1]} - ${translateSource(inspectedPlayer[2],locale)}, level ${inspectedPlayer[3]}${suffix}`;
    }
    const level = /^¡Has subido a nivel (\d+)!$/.exec(text);
    if (level) return `You reached level ${level[1]}!`;
    const statGain = /^¡Has ganado (\d+) puntos de (vida|maná)!$/.exec(text);
    if (statGain) return `You gained ${statGain[1]} ${statGain[2] === 'vida' ? 'health' : 'mana'} points!`;
    const attackGain = /^¡Tu golpe (máximo|mínimo) aumento en (\d+) puntos!$/.exec(text);
    if (attackGain) return `Your ${attackGain[1] === 'máximo' ? 'maximum' : 'minimum'} damage increased by ${attackGain[2]} points!`;
    const experience = /^¡Has ganado (\d+) puntos de experiencia!$/.exec(text);
    if (experience) return `You gained ${experience[1]} experience points!`;
    const resurrection = /^Comienzas a resucitar a (.+)\.$/.exec(text);
    if (resurrection) return `You begin resurrecting ${resurrection[1]}.`;
    const connected = /^Conectado como (.+)$/.exec(text);
    if (connected) return `Connected as ${connected[1]}`;
    const npc = /^Ves a (.+) \[NPC\]$/.exec(text);
    if (npc) return `You see ${translateSource(npc[1], locale)} [NPC]`;
    const gold = /^¡Has ganado (\d+) monedas de oro!$/.exec(text);
    if (gold) return `You gained ${gold[1]} gold!`;
    const cast = /^Has lanzado (.+) sobre (.+)$/.exec(text);
    if (cast) return `You cast ${translateSource(cast[1], locale)} on ${entityName(cast[2])}`;
    const damage = /^Le has quitado (\d+) puntos de vida a (.+)$/.exec(text);
    if (damage) return `You dealt ${damage[1]} damage to ${entityName(damage[2])}`;
    const healed = /^Le has curado (\d+) puntos de vida a (.+)$/.exec(text);
    if (healed) return `You healed ${entityName(healed[2])} for ${healed[1]} health`;
    const backstab = /^¡Has apuñalado a (.+) por (\d+)!$/.exec(text);
    if (backstab) return `You backstabbed ${entityName(backstab[1])} for ${backstab[2]}!`;
    const killed = /^¡Has matado a (.+)!$/.exec(text);
    if (killed) return `You killed ${entityName(killed[1])}!`;
    const missed = /^(.+) ha fallado un golpe\.$/.exec(text);
    if (missed) return `${entityName(missed[1])} missed an attack.`;
    const hit = /^(.+) te ha pegado en (el brazo derecho|el brazo izquierdo|la pierna derecha|la pierna izquierda|la cabeza|el torso) por (\d+)$/.exec(text);
    if (hit) {
        const parts: Record<string,string> = {'el brazo derecho':'right arm','el brazo izquierdo':'left arm','la pierna derecha':'right leg','la pierna izquierda':'left leg','la cabeza':'head','el torso':'torso'};
        return `${entityName(hit[1])} hit your ${parts[hit[2]]} for ${hit[3]} damage.`;
    }
    const death = /^(.+) te ha matado\.$/.exec(text);
    if (death) return `${entityName(death[1])} killed you.`;
    if (text.startsWith('[Retos] ') && / \(abandono\)\.?$/.test(text)) {
        const ending = text.endsWith('.') ? '.' : '';
        return `${translateSource(text.replace(/ \(abandono\)(\.)?$/, '$1'), locale).replace(/\.$/, '')} (forfeit)${ending}`;
    }
    const record = /^\[Online Record\] Nuevo record: (\d+) jugadores en simultáneo \(mundo abierto: (\d+), arena: (\d+)\)$/.exec(text);
    if(record)return `[Online record] ${record[1]} simultaneous players (shared world: ${record[2]}, arena: ${record[3]})`;
    return translateSource(text,locale);
}

export function localizeConsoleEntry(entry: {
    text: string; source: string; channel?: string; senderName?: string; speakerType?: 'npc' | 'user'; npcName?: string;
}, locale: Locale): string {
    // Translate only the server's channel prefix, never the player's message or name.
    if (locale==='en' && entry.channel==='whisper' && entry.senderName && entry.text.startsWith('[Privado] ')) {
        return '[Private] '+entry.text.slice('[Privado] '.length);
    }
    // NPC speech is authored game content, including its console copy.
    if (entry.source === 'dialog' && entry.speakerType === 'npc' && !entry.senderName) {
        const speech = /^\[([^\]]+)\]: ([\s\S]*)$/.exec(entry.text);
        return speech ? `[${translateSource(speech[1],locale)}]: ${translateSource(speech[2],locale)}`
            : translateSource(entry.text,locale);
    }
    // Chat channels and player dialog are user-authored, including exact catalog matches.
    if (entry.senderName || entry.source === 'dialog' ||
        (entry.channel && entry.channel !== 'console')) return entry.text;
    const display = localizeGameMessage(entry.text, locale, entry.npcName);
    return locale === 'en' ? englishCommandNames(display) : display;
}

const detailLabels: Record<string, string> = {
    'Defensa': 'Defense', 'Defensa Mágica': 'Magic defense',
    'Resistencia mágica': 'Magic resistance', 'Bonus daño mágico': 'Magic damage bonus',
    'Daño': 'Damage', 'Curación': 'Healing', 'Maná requerida': 'Mana required',
    'Nivel requerido': 'Required level',
};
/** Translate after stats have been parsed from the unchanged Spanish wire format. */
export function localizeItemDetails(details: string, locale: Locale): string {
    if (locale === 'es') return details;
    return details.split('|').map(part => {
        const text = part.trim();
        if (text === 'Apuñala') return 'Can backstab';
        const match = /^([^:]+):\s*(\d+(?:\/\d+)?%?)$/.exec(text);
        return match && detailLabels[match[1]]
            ? `${detailLabels[match[1]]}: ${match[2]}` : translateSource(text, locale);
    }).join(' | ');
}
