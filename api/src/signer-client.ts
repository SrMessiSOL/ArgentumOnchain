import {PublicKey,Transaction} from '@solana/web3.js';
import bs58 from 'bs58';
import {z} from 'zod';

let active=0;
export function isolatedSignerConfigured(){return Boolean(process.env.AOWEB_SIGNER_URL&&process.env.AOWEB_SIGNER_TOKEN);}
const identity=z.object({address:z.string().min(32).max(44),issuer:z.string().min(32).max(44)}).strict();
const signed=z.object({id:z.string().uuid(),message:z.string().max(2200),bytes:z.string().max(2200),signature:z.string().max(100)}).strict();
/** Fixed routes, loopback only, no credential redirects, bounded body/deadline/concurrency. */
export async function signerRequest<T>(route:'/asset-identity'|'/economy-submit'|'/asset-submit'|'/cosmetic-identity'|'/cosmetic-submit',body:object,schema:z.ZodType<T>):Promise<T>{
 if(active>=4)throw Error('signer.unavailable');
 const base=new URL(process.env.AOWEB_SIGNER_URL!);
 if(base.protocol!=='http:'||base.hostname!=='127.0.0.1'||base.pathname!=='/'||base.username||base.password||base.search||base.hash||!base.port)throw Error('signer.unavailable');
 const token=process.env.AOWEB_SIGNER_TOKEN;
 if(!token||token.length<64)throw Error('signer.unavailable');
 active++;
 try{
  const response=await fetch(new URL(route,base),{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok||!response.body){await response.body?.cancel();throw Error('signer.unavailable');}
  const reader=response.body.getReader();let size=0;const parts:Uint8Array[]=[];
  try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>8192){await reader.cancel();throw Error('signer.unavailable');}parts.push(item.value);}}finally{reader.releaseLock();}
  return schema.parse(JSON.parse(Buffer.concat(parts).toString('utf8')));
 }catch{throw Error('signer.unavailable');}finally{active--;}
}
export async function isolatedAssetIdentity(id:string){
 if(!z.string().uuid().safeParse(id).success)throw Error('assets.invalidAsset');
 const result=await signerRequest('/asset-identity',{id},identity);
 new PublicKey(result.address);new PublicKey(result.issuer);
 if(result.issuer!==process.env.AOWEB_GOLD_AUTHORITY_PUBLIC_KEY)throw Error('assets.invalidAsset');
 return result;
}
/** Verify returned bytes locally before the API persists them or broadcasts. */
export async function isolatedSubmission(kind:'economy'|'asset'|'cosmetic',id:string,raw:string,message:string,wallet:string){
 if(!z.string().uuid().safeParse(id).success||typeof raw!=='string'||raw.length>2200)throw Error('economy.invalidTransaction');
 const result=await signerRequest(kind==='economy'?'/economy-submit':kind==='cosmetic'?'/cosmetic-submit':'/asset-submit',{id,transaction:raw},signed);
 try{
  const tx=Transaction.from(Buffer.from(result.bytes,'base64'));
  if(result.id!==id||result.message!==message||tx.serializeMessage().toString('base64')!==message||tx.feePayer?.toBase58()!==wallet||!tx.verifySignatures()||!tx.signature||bs58.encode(tx.signature)!==result.signature)throw Error();
  return {bytes:result.bytes,signature:result.signature};
 }catch{throw Error('economy.invalidTransaction');}
}
export async function isolatedCosmeticIdentity(account:string,season:string){
 if(!z.string().uuid().safeParse(account).success)throw Error('cosmetic.invalidAccount');
 const result=await signerRequest('/cosmetic-identity',{account,season},identity);
 new PublicKey(result.address);new PublicKey(result.issuer);
 if(result.issuer!==process.env.AOWEB_GOLD_AUTHORITY_PUBLIC_KEY)throw Error('cosmetic.invalidIssuer');
 return result;
}
