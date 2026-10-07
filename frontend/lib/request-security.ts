import {createHash} from 'node:crypto';

export function trustedMutation(headers:Headers,siteOrigin:string):boolean {
 const site=headers.get('sec-fetch-site');
 if(site==='cross-site'||site==='same-site')return false;
 const origin=headers.get('origin');
 if(origin)return origin===siteOrigin;
 const referer=headers.get('referer');
 if(referer){try{return new URL(referer).origin===siteOrigin;}catch{return false;}}
 return site==='same-origin';
}

/** Single-instance protection; bounded memory and no persistent raw session tokens. */
export class RequestBudget {
 private buckets=new Map<string,{count:number,reset:number}>();
 constructor(private capacity=20000){}
 check(key:string,limit:number,windowMs:number,now=Date.now()):number {
  let bucket=this.buckets.get(key);
  if(!bucket||bucket.reset<=now){
   if(this.buckets.size>=this.capacity){for(const [k,v]of this.buckets)if(v.reset<=now)this.buckets.delete(k);}
   if(!bucket&&this.buckets.size>=this.capacity)return 1;
   bucket={count:0,reset:now+windowMs};this.buckets.set(key,bucket);
  }
  if(bucket.count>=limit)return Math.max(1,Math.ceil((bucket.reset-now)/1000));
  bucket.count++;return 0;
 }
}
export function requestIdentity(session:string|undefined,ip:string){
 return createHash('sha256').update(session?'session:'+session:'ip:'+ip).digest('hex');
}
