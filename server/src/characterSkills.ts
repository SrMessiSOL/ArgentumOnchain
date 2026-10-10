export const SKILLS=['tactics','defense','weapons','projectiles','wrestling','hiding','stabbing','magic','mining','woodcutting','fishing','carpentry','tailoring','blacksmith','smelting','navigation'] as const;
export type Skill=(typeof SKILLS)[number];
export type SkillState={version:1;level:number;points:number;natural:Record<Skill,number>;assigned:Record<Skill,number>;xp:Record<Skill,number>};
type User={level?:number;skillState?:unknown;pvpChar?:boolean};
export const skillsEnabled=()=>process.env.AOWEB_NATURAL_SKILLS==='1';
const cooldowns=new WeakMap<object,Partial<Record<Skill,number>>>();
const values=(n:number)=>Object.fromEntries(SKILLS.map(key=>[key,n])) as Record<Skill,number>;
export function ensureSkills(user:User):SkillState {
    const level=Math.max(1,Math.floor(Number(user.level)||1));
    let state=user.skillState as SkillState|undefined;
    if(!state){state={version:1,level,points:20+Math.max(0,level-1)*5,natural:values(level>1?Math.min(100,level*3):0),assigned:values(0),xp:values(0)};user.skillState=state;}
    if(state.version!==1 || !Number.isSafeInteger(state.level) || state.level<1 || !Number.isSafeInteger(state.points) || state.points<0)throw Error('Invalid skill state');
    for(const group of ['natural','assigned','xp'] as const){
        if(!state[group] || Object.keys(state[group]).length!==SKILLS.length || SKILLS.some(key=>!Number.isSafeInteger(state![group][key]) || state![group][key]<0 || state![group][key]>(group==='xp'?10000:100)))throw Error('Invalid skill state');
    }
    if(SKILLS.some(key=>state!.natural[key]+state!.assigned[key]>100))throw Error('Invalid skill cap');
    if(level>state.level){state.points+=(level-state.level)*5;state.level=level;}
    return state;
}
export function getCharacterSkill(user:User,skill:Skill):number {
    if(!skillsEnabled() || user.pvpChar)return Math.min(100,Math.max(0,Number(user.level??0)*3));
    const state=ensureSkills(user);return Math.min(100,state.natural[skill]+state.assigned[skill]);
}
// Call only after the server accepts a real action, never from arbitrary client XP.
export function trainCharacterSkill(user:User,skill:Skill,now=Date.now()):boolean {
    if(!skillsEnabled() || user.pvpChar)return false;
    const state=ensureSkills(user),last=cooldowns.get(user)??{};
    if(state.natural[skill]+state.assigned[skill]>=100 || (last[skill]!==undefined && now-last[skill]!<5000))return false;
    last[skill]=now;cooldowns.set(user,last);
    state.xp[skill]++;
    const threshold=10+state.natural[skill]*2;
    if(state.xp[skill]<threshold)return false;
    state.xp[skill]-=threshold;state.natural[skill]=Math.min(100-state.assigned[skill],state.natural[skill]+1);return true;
}
export function assignCharacterSkill(user:User,skill:string,amount:number) {
    if(!skillsEnabled() || user.pvpChar)throw Error('Natural skills are not active in this realm.');
    if(!SKILLS.includes(skill as Skill) || !Number.isSafeInteger(amount) || amount<1 || amount>100)throw Error('Use /assignskill <skill> <points>.');
    const key=skill as Skill,state=ensureSkills(user);
    if(state.points<amount || state.natural[key]+state.assigned[key]+amount>100)throw Error('Not enough points, or the skill would exceed 100.');
    state.points-=amount;state.assigned[key]+=amount;
}
