import {NextResponse} from 'next/server';
import {forwardSessionJsonRequest} from '../../auth/shared';
export async function POST(request:Request,context:{params:Promise<{action:string}>}){
  const {action}=await context.params;
  if(!['claim','equip'].includes(action))return NextResponse.json({error:'Not found'},{status:404});
  if(request.headers.get('origin')!==new URL(process.env.NEXT_PUBLIC_SITE_URL||request.url).origin)return NextResponse.json({error:'Invalid origin'},{status:403});
  const raw=await request.text();if(raw.length>256)return NextResponse.json({error:'Invalid request'},{status:413});
  let body;try{body=JSON.parse(raw);}catch{return NextResponse.json({error:'Invalid request'},{status:400});}
  return forwardSessionJsonRequest(`/auth/cosmetics/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},request,55000);
}
