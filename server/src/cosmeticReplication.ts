export type CrestKind = 'explorer' | 'first-hunt';
export type CrestSubject = {id:number|string; _id?:string; map:number; connected?:boolean; cerrado?:boolean;dead?:number|boolean;invisibleAdmin?:boolean;invisibleSpell?:boolean;hiddenSkill?:boolean};
export type CrestEntry = {id:number; kind:CrestKind};
export const COSMETIC_SNAPSHOT_PACKET = 82;

export function encodeCosmeticSnapshot(map:number, entries:CrestEntry[]):Buffer {
    const frame=Buffer.alloc(5+entries.length*9);
    frame.writeUInt8(COSMETIC_SNAPSHOT_PACKET,0);frame.writeUInt16LE(map,1);frame.writeUInt16LE(entries.length,3);
    entries.forEach((entry,i)=>{frame.writeDoubleLE(entry.id,5+i*9);frame.writeUInt8(entry.kind==='first-hunt'?2:1,13+i*9);});
    return frame;
}

/** Ownership checks run outside gameplay ticks. Cache entries are tied to the session object. */
export class CosmeticReplication {
    private cache=new WeakMap<CrestSubject,{kind:CrestKind|null;expiresAt:number;nextCheck:number;pending:boolean}>();
    private inFlight=0;
    constructor(private verify:(characterId:string)=>Promise<unknown>,private now=()=>Date.now()){}
    refresh(subjects:CrestSubject[]) {
        const ordered=[...subjects].sort((a,b)=>(this.cache.get(a)?.nextCheck??0)-(this.cache.get(b)?.nextCheck??0));
        for(const subject of ordered){
            if(!subject._id || !subject.connected || subject.cerrado || this.inFlight>=8)continue;
            let value=this.cache.get(subject);
            if(!value){value={kind:null,expiresAt:0,nextCheck:0,pending:false};this.cache.set(subject,value);}
            if(value.pending||value.nextCheck>this.now())continue;
            const entry=value;entry.pending=true;entry.nextCheck=this.now()+15_000;this.inFlight++;
            void this.verify(subject._id).then(result=>{
                entry.kind=result==='explorer'||result==='first-hunt'?result:null;
                entry.expiresAt=this.now()+35_000;
            }).catch(()=>{entry.kind=null;entry.expiresAt=0;}).finally(()=>{entry.pending=false;this.inFlight--;});
        }
    }
    snapshot(map:number, subjects:CrestSubject[]):CrestEntry[]{
        const seen=new Set<number>();
        return subjects.flatMap(subject=>{
            const value=this.cache.get(subject); const id=Number(subject.id);
            if(subject.map!==map||!subject.connected||subject.cerrado||subject.dead||subject.invisibleAdmin||subject.invisibleSpell||subject.hiddenSkill||id<=0||!Number.isSafeInteger(id)||seen.has(id)||!value?.kind||value.expiresAt<=this.now())return [];
            seen.add(id);return [{id,kind:value.kind}];
        });
    }
}



