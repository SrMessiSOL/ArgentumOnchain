import { NextResponse } from "next/server";
import { fetchApi, proxyJsonResponse } from "../../shared";

export async function POST(request: Request) {
    const body = await request.json();

    const response = await fetchApi("/auth/password-reset/request", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-aochain-client-ip": request.headers.get("x-aochain-client-ip") || "",
        },
        body: JSON.stringify(body),
        cache: "no-store",
    });

    if (response.status >= 500) {
        return NextResponse.json(
            {
                error: "No se pudo enviar el email de recuperacion. Intenta de nuevo.",
            },
            { status: 500 },
        );
    }

    return proxyJsonResponse(response);
}
