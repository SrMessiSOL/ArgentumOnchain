import {NextResponse} from 'next/server';
import {forwardSessionJsonRequest} from '../../auth/shared';
export async function POST(request:Request,context:{params:Promise<{action:string}>}){
 const {action}=await context.params;if(!['list','cancel','item-list','item-cancel','prepare','submit','reconcile'].includes(action))return NextResponse.json({error:'Not found'},{status:404});
 if(request.headers.get('origin')!==new URL(process.env.NEXT_PUBLIC_SITE_URL||request.url).origin)return NextResponse.json({error:'Invalid origin'},{status:403});
 const body=await request.text();if(body.length>4000)return NextResponse.json({error:'Invalid request'},{status:413});
 try{JSON.parse(body);}catch{return NextResponse.json({error:'Invalid request'},{status:400});}
 return forwardSessionJsonRequest('/auth/economy/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body},request,30000);
}
