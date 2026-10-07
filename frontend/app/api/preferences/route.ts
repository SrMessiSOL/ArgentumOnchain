import { NextResponse } from "next/server";
import { forwardSessionJsonRequest } from "../auth/shared";
export async function GET(request: Request) { return forwardSessionJsonRequest('/auth/preferences',{},request); }
export async function PUT(request: Request) {
    const origin = request.headers.get('origin');
    if (origin !== new URL(process.env.NEXT_PUBLIC_SITE_URL || request.url).origin) return NextResponse.json({error:'Invalid origin'},{status:403});
    const body = await request.json().catch(()=>null);
    if (!body || !['en','es'].includes(body.locale)) return NextResponse.json({error:'Invalid locale'},{status:400});
    return forwardSessionJsonRequest('/auth/preferences',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({locale:body.locale})},request);
}
