import {createHash} from 'node:crypto';
export class AuthBudget {
    private buckets=new Map<string,{count:number;until:number}>();
    constructor(private maxKeys=20000,private clock=Date.now){}
    allow(key:string,limit:number,windowMs:number):boolean{
        const now=this.clock();let bucket=this.buckets.get(key);
        if(bucket&&bucket.until<=now){this.buckets.delete(key);bucket=undefined;}
        if(!bucket){
            if(this.buckets.size>=this.maxKeys){for(const [k,v] of this.buckets)if(v.until<=now)this.buckets.delete(k);}
            if(this.buckets.size>=this.maxKeys)return false;
            bucket={count:0,until:now+windowMs};this.buckets.set(key,bucket);
        }
        if(bucket.count>=limit)return false;bucket.count++;return true;
    }
}
export function authIdentity(value:string):string{return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');}
