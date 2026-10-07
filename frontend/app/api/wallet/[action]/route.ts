import { NextResponse } from "next/server";
import { forwardSessionJsonRequest } from "../../auth/shared";
export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
    // Next can normalize request.url to localhost behind its development server.
    // Compare against the configured public origin, never a forwarded Host header.
    const expectedOrigin = new URL(process.env.NEXT_PUBLIC_SITE_URL || request.url).origin;
    if (request.headers.get("origin") !== expectedOrigin) {
        return NextResponse.json({ error: "wallet.failed" }, { status: 403 });
    }
    const { action } = await context.params;
    if (action !== "challenge" && action !== "verify") {
        return NextResponse.json({ error: "wallet.failed" }, { status: 404 });
    }
    const text = await request.text();
    if (text.length > 2048) return NextResponse.json({ error: "wallet.failed" }, { status: 413 });
    let body: unknown;
    try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "wallet.failed" }, { status: 400 }); }
    return forwardSessionJsonRequest(`/auth/wallet/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }, request);
}
