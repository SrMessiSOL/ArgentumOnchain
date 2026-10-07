/** Resolve only the command token. Arguments and permission checks stay unchanged. */
export const englishCommandAliases: Readonly<Record<string, string>> = {
    '/home': '/hogar', '/sethome': '/asignarhogar', '/logout': '/salir',
    '/meditate': '/meditar', '/accept': '/aceptar', '/leaveparty': '/salirparty',
    '/kickparty': '/expulsarparty', '/createclan': '/clancrear',
    '/applyclan': '/clanpostular', '/acceptclan': '/clanaceptar',
    '/rejectclan': '/clanrechazar', '/leaveclan': '/clansalir',
    '/kickclan': '/clanexpulsar', '/clancoleader': '/clancolider',
    '/deleteclan': '/claneliminar', '/clanleader': '/clanlider',
    '/bail': '/fianza', '/enlist': '/enlistar', '/reward': '/recompensa',
    '/giveexp': '/darexp', '/givegold': '/daroro', '/doubleexp': '/dobleexp',
    '/doublegold': '/dobleoro', '/intervals': '/intervalos', '/interval': '/intervalo',
    '/bring': '/traer', '/revive': '/revivir', '/changeclass': '/cambiarclase',
    '/invisible': '/invi', '/spawnnpc': '/invocarnpc', '/removebots': '/quitarbots',
    '/createitem': '/crearitem', '/removenpc': '/quitarnpc',
    '/removenpcpermanent': '/quitarnpcpermanente', '/reloaditems': '/recargarobjs',
    '/reloadnpcs': '/recargarnpcs', '/reloadbalance': '/recargarbalance',
    '/reloadcrafting': '/recargarcrafting', '/viewip': '/verip',
    '/resethits': '/resetaciertos', '/shutdown': '/apagar', '/devrevive': '/devrevivir',
    '/jail': '/carcel', '/announce': '/globalgm', '/clearground': '/limpiarpiso',
    '/ayuda': '/help',
};
export function resolveCommandAlias(command: string): string {
    const token = command.toLowerCase();
    return Object.prototype.hasOwnProperty.call(englishCommandAliases, token)
        ? englishCommandAliases[token] : token;
}
/** Class arguments used by /bot and /changeclass; entity names are never normalized here. */
export function normalizeClassInput(value:string):string {
    const normalized=value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const aliases:Record<string,string>={mage:'mago',cleric:'clerigo',warrior:'guerrero',assassin:'asesino',thief:'ladron',bard:'bardo',druid:'druida',paladin:'paladin',hunter:'cazador',pirate:'pirata',worker:'trabajador'};
    return Object.prototype.hasOwnProperty.call(aliases,normalized)?aliases[normalized]:normalized;
}
/** Server-generated bot labels use English; real character names are never passed here. */
export function formatAdminBotName(className:string,level:number,index:number):string {
    const names:Record<string,string>={mago:'Mage',clerigo:'Cleric',guerrero:'Warrior',asesino:'Assassin',ladron:'Thief',bardo:'Bard',druida:'Druid',paladin:'Paladin',cazador:'Hunter',pirata:'Pirate',trabajador:'Worker'};
    const key=normalizeClassInput(className);
    const label=Object.prototype.hasOwnProperty.call(names,key)?names[key]:className;
    return `Bot ${label} ${level} #${index}`;
}
export const playerCommandHelp = [
    'Commands: /home, /sethome (near a governor), /meditate, /logout, /stats, /online.',
    'Party: /party <player>, /accept, /leaveparty, /kickparty <player>. Chat: /p, /c, /w, /global.',
    'Clan: /clan, /createclan, /applyclan, /acceptclan, /rejectclan, /leaveclan, /kickclan, /clancoleader, /clanleader, /deleteclan.',
    'Faction: /enlist, /reward, /bail. Use a command without arguments to see its usage. Spanish commands still work.',
];

/** Options only; never normalize NPC IDs, names, chat, or free-form arguments. */
export function parseNpcSpawnOptions(persistence = '', movement = '') {
    return {
        persist: ['save', 'saved', 'fixed', 'persistent', 'guardar', 'guardado', 'fijo', 'persistente'].includes(persistence.toLowerCase()),
        persistMovement: ['move', 'mobile', 'moving', 'mover', 'movil', 'móvil'].includes(movement.toLowerCase()),
    };
}
