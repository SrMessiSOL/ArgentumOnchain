import type {IncomingMessage,ServerResponse} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type {SignedReceipt} from './journal';

const identityRequest=z.object({id:z.string().uuid()}).strict();
const submissionRequest=z.object({id:z.string().uuid(),transaction:z.string().min(1).max(2200)}).strict();
export type SignerHandlers={
 identity:(id:string)=>Promise<{address:string;issuer:string}>;
 economy:(id:string,transaction:string)=>Promise<SignedReceipt>;
 asset:(id:string,transaction:string)=>Promise<SignedReceipt>;
};
/** Fixed, authenticated, bounded protocol. Production startup remains disabled. */
export function signerHttpHandler(token:string,enabled:boolean,handlers?:SignerHandlers){
 if(token.length<64||enabled&&!handlers)throw Error('signer.invalidConfiguration');
 const expected=Buffer.from('Bearer '+token);let active=0;
 return async(req:IncomingMessage,res:ServerResponse)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const send=(status:number,value:object)=>{res.writeHead(status).end(JSON.stringify(value));};
  const supplied=Buffer.from(req.headers.authorization??'');
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){send(401,{error:'unauthorized'});return;}
  if(req.method==='GET'&&req.url==='/health'){send(200,{ok:true,enabled});return;}
  if(!enabled){send(503,{error:'signer.disabled'});return;}
  if(req.method!=='POST'||!['/asset-identity','/economy-submit','/asset-submit'].includes(req.url??'')){send(404,{error:'notFound'});return;}
  if(active>=2){send(429,{error:'signer.busy'});return;}
  if(req.headers['content-type']!=='application/json'||req.headers['content-encoding']){send(400,{error:'invalidRequest'});return;}
  active++;
  try{
   const chunks:Buffer[]=[];let length=0;
   for await(const part of req){length+=part.length;if(length>4096){send(413,{error:'requestTooLarge'});return;}chunks.push(Buffer.from(part));}
   const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(req.url==='/asset-identity'){
    const input=identityRequest.parse(body),result=await handlers!.identity(input.id);
    // Only these public fields may leave custody.
    send(200,{address:result.address,issuer:result.issuer});
   }else{
    const input=submissionRequest.parse(body);
    const result=await (req.url==='/economy-submit'?handlers!.economy:handlers!.asset)(input.id,input.transaction);
    send(200,{id:result.id,message:result.message,bytes:result.bytes,signature:result.signature});
   }
  }catch{if(!res.writableEnded&&!res.destroyed)send(400,{error:'signer.denied'});}
  finally{active--;}
 };
}
