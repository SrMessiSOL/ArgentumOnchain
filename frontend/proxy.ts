import { NextRequest, NextResponse } from "next/server";
import {trustedMutation,RequestBudget,requestIdentity} from './lib/request-security';
import {AUTH_COOKIE_NAME} from './lib/auth-session';
const budget=new RequestBudget();

// One shared realm. Old arena bookmarks and invitation links lead to characters.
export function proxy(request: NextRequest) {
    const { pathname, searchParams } = request.nextUrl;
    if(pathname.startsWith('/api/')){
        const mutating=!['GET','HEAD','OPTIONS'].includes(request.method);
        // Public origin comes from deployment configuration, never a client-supplied Host.
        const siteOrigin=new URL(process.env.NEXT_PUBLIC_SITE_URL||request.url).origin;
        if(mutating&&!trustedMutation(request.headers,siteOrigin))return NextResponse.json({error:'This request must come from the game website.'},{status:403});
        const auth=/^\/api\/auth\/(login|register|password-reset)(\/|$)/.test(pathname);
        const sensitive=/^\/api\/(wallet|game-assets|economy)(\/|$)/.test(pathname)||pathname.startsWith('/api/auth/');
        if(auth||sensitive){
            const session=request.cookies.get(AUTH_COOKIE_NAME)?.value;
            const identity=requestIdentity(auth?undefined:session,request.headers.get('x-aochain-client-ip')||'local');
            const ip=requestIdentity(undefined,request.headers.get('x-aochain-client-ip')||'local');
            const ipRetry=budget.check('global:'+ip,1200,60000);
            if(ipRetry)return NextResponse.json({error:'Too many requests. Please wait and retry.'},{status:429,headers:{'Retry-After':String(ipRetry)}});
            const category=auth?'auth':mutating?'write':'read';
            const retry=budget.check(category+':'+identity,auth?60:mutating?120:360,auth?300000:60000);
            if(retry)return NextResponse.json({error:'Too many requests. Please wait and retry.'},{status:429,headers:{'Retry-After':String(retry)}});
        }
    }
    if (pathname.startsWith("/api/arenas")) {
        return NextResponse.json({ error: "Las salas no estÃƒÂ¡n habilitadas en este servidor." }, { status: 404 });
    }
    if (pathname.startsWith("/arenas") ||
        (pathname === "/play" && (searchParams.get("mode") === "arena" || searchParams.has("room")))) {
        return NextResponse.redirect(new URL("/characters", request.url));
    }
    return NextResponse.next();
}

export const config = { matcher: ["/arenas/:path*", "/api/:path*", "/play"] };
