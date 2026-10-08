const {createHmac,createHash,timingSafeEqual}=require('node:crypto');
const {isIP}=require('node:net');
const fields=['x-aochain-proxy-ip','x-aochain-proxy-time','x-aochain-proxy-nonce','x-aochain-proxy-proof'];
function canonical(method,url,ip,time,nonce,authorization){return ['aochain-proxy-v1',method,url,ip,time,nonce,createHash('sha256').update(authorization||'').digest('hex')].join('\n');}
function createVerifier(){
 const seen=new Map();
 return (req,key,now=Date.now())=>{
  if(typeof key!=='string'||!/^[a-f0-9]{64}$/i.test(key))return null;
  const [ip,time,nonce,proof]=fields.map(name=>req.headers[name]);
  if(typeof ip!=='string'||!isIP(ip)||typeof time!=='string'||!/^\d{13}$/.test(time)||Math.abs(now-Number(time))>30000||typeof nonce!=='string'||!/^[a-f0-9]{32}$/.test(nonce)||typeof proof!=='string'||!/^[a-f0-9]{64}$/.test(proof))return null;
  const expected=createHmac('sha256',key).update(canonical(req.method,req.url,ip,time,nonce,req.headers.authorization)).digest();
  if(!timingSafeEqual(expected,Buffer.from(proof,'hex')))return null;
  for(const [id,expiry]of seen)if(expiry<now)seen.delete(id);
  if(seen.has(nonce)||seen.size>=10000)return null;
  seen.set(nonce,Number(time)+30000);return ip;
 };
}
module.exports={fields,canonical,createVerifier};
