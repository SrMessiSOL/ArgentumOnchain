import {NextResponse} from 'next/server';
import {Connection,PublicKey} from '@solana/web3.js';
import {forwardSessionJsonRequest} from '../../auth/shared';
import {checkSolFunding,fundingErrors} from '@/lib/sol-funding';
const budget=new Map<string,{count:number;until:number}>();
const rpc=new Connection(process.env.AOWEB_DEVNET_RPC||'https://api.devnet.solana.com',{commitment:'confirmed',disableRetryOnRateLimit:true,fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(8000)})});
let verifiedUntil=0;
export async function POST(request:Request){
 const origin=new URL(process.env.NEXT_PUBLIC_SITE_URL||request.url).origin;
 if(request.headers.get('origin')!==origin)return NextResponse.json({error:'economy.signIn'},{status:403});
 const raw=await request.text();if(raw.length>2400)return NextResponse.json({error:'economy.invalidRequest'},{status:413});
 let body:{address:string;transaction?:string};
 try{body=JSON.parse(raw);if(typeof body.address!=='string')throw Error();new PublicKey(body.address);if(Object.keys(body).some(key=>!['address','transaction'].includes(key))||body.transaction!==undefined&&(typeof body.transaction!=='string'||! /^[A-Za-z0-9+/]+={0,2}$/.test(body.transaction)||Buffer.from(body.transaction,'base64').length>1232))throw Error();}catch{return NextResponse.json({error:'economy.invalidRequest'},{status:400});}
 const session=await forwardSessionJsonRequest('/auth/wallet',{method:'GET'},request);
 if(!session.ok)return session;
 const account=await session.json();if(!(account.wallets??[account.wallet]).some((w:{address?:string}|null)=>w?.address===body.address))return NextResponse.json({error:'economy.wrongWallet'},{status:403});
 const now=Date.now();for(const [key,value]of budget)if(value.until<now)budget.delete(key);
 const previous=budget.get(body.address);if(previous&&previous.count>=12)return NextResponse.json({error:'economy.balanceUnavailable'},{status:429});
 if(!previous&&budget.size>=1000)return NextResponse.json({error:'economy.balanceUnavailable'},{status:429});
 budget.set(body.address,{count:(previous?.count??0)+1,until:previous?.until??now+60000});
 try{if(now>=verifiedUntil){if(await rpc.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw Error('economy.balanceUnavailable');verifiedUntil=now+60000;}const funding=await checkSolFunding(body.address,body.transaction,rpc);return NextResponse.json({...funding,network:'devnet'},{headers:{'Cache-Control':'no-store'}});}catch(e){const error=e instanceof Error&& (fundingErrors.has(e.message)||e.message==='economy.wrongWallet')?e.message:'economy.balanceUnavailable';return NextResponse.json({error},{status:409});}
}
