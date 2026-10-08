import {createHmac,createHash,randomBytes} from 'node:crypto';
import {isIP} from 'node:net';
import {headers} from 'next/headers';

export async function backendProxyHeaders(url:string,init?:RequestInit):Promise<Headers>{
 const output=new Headers(init?.headers);
 for(const name of ['x-aochain-client-ip','x-aochain-proxy-ip','x-aochain-proxy-time','x-aochain-proxy-nonce','x-aochain-proxy-proof'])output.delete(name);
 if(!process.env.VERCEL)return output;
 const key=process.env.API_PROXY_HMAC_KEY;
 if(!key)return output; // Gateway remains closed until the separate credential is provisioned.
 if(!/^[a-f0-9]{64}$/i.test(key))throw Error('Backend proxy credential is invalid');
 // Vercel overwrites X-Forwarded-For. Never accept an arbitrary caller's custom IP header.
 const ip=(await headers()).get('x-forwarded-for')?.trim()||'';
 if(!isIP(ip))throw Error('Verified Vercel client IP is unavailable');
 const destination=new URL(url),time=String(Date.now()),nonce=randomBytes(16).toString('hex');
 const authorization=createHash('sha256').update(output.get('authorization')||'').digest('hex');
 const message=['aochain-proxy-v1',(init?.method||'GET').toUpperCase(),destination.pathname+destination.search,ip,time,nonce,authorization].join('\n');
 output.set('x-aochain-proxy-ip',ip);output.set('x-aochain-proxy-time',time);output.set('x-aochain-proxy-nonce',nonce);
 output.set('x-aochain-proxy-proof',createHmac('sha256',key).update(message).digest('hex'));
 output.set('ngrok-skip-browser-warning','1');
 return output;
}
