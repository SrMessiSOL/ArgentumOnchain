import {NextResponse} from 'next/server';
import {forwardSessionJsonRequest} from '../auth/shared';
export async function GET(request:Request){return forwardSessionJsonRequest('/auth/achievements',{method:'GET'},request);}
export async function POST(request:Request){if(request.headers.get('origin')!==new URL(process.env.NEXT_PUBLIC_SITE_URL||request.url).origin)return NextResponse.json({error:'Invalid origin'},{status:403});const body=await request.text();if(body.length>300)return NextResponse.json({error:'Invalid request'},{status:413});try{JSON.parse(body);}catch{return NextResponse.json({error:'Invalid request'},{status:400});}return forwardSessionJsonRequest('/auth/achievements/title',{method:'POST',headers:{'Content-Type':'application/json'},body},request);}
