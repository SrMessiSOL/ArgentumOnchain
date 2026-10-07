export const MAX_INBOUND_BYTES=16*1024;
/** Per-socket budget: checked before parsing, including unauthenticated clients. */
export class InboundBudget {
 private start:number|null=null;
 private count=0;
 private bytes=0;
 allow(size:number,now=Date.now()):boolean {
  if(!Number.isSafeInteger(size)||size<1||size>MAX_INBOUND_BYTES)return false;
  if(this.start===null||now-this.start>=1000){this.start=now;this.count=0;this.bytes=0;}
  this.count++;this.bytes+=size;
  return this.count<=120&&this.bytes<=128*1024;
 }
}
