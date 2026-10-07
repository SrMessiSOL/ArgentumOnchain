import {isIP} from 'node:net';
export function canonicalIp(raw:string|undefined):string|undefined{
 if(!raw||raw.length>64)return undefined;
 const value=raw.trim();const mapped=value.toLowerCase().startsWith('::ffff:')?value.slice(7):value;
 const version=isIP(mapped);if(version===4)return mapped;
 if(version===6)return new URL('http://['+mapped+']/').hostname.slice(1,-1);
 return undefined;
}
/** Only a loopback gateway may supply its sanitized, dedicated client-IP header. */
export function connectionIdentity(remote:string|undefined,headers:Record<string,string|string[]|undefined>):string|undefined{
 const peer=canonicalIp(remote);
 if(peer==='127.0.0.1'||peer==='::1'){
  const forwarded=headers['x-aochain-client-ip'];
  if(typeof forwarded==='string'){const client=canonicalIp(forwarded);if(client)return client;}
 }
 return peer;
}
