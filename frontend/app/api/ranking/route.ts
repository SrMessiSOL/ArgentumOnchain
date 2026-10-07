import { NextResponse } from "next/server";
import { getApiBaseUrlCandidates } from "@/lib/api-base-url";
import { getRankingHeadSprites } from "@/lib/ranking-heads";
import type { RankingPageData, RankingResponse } from "@/lib/ranking";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get("sort") === "kills" ? "kills" : "level";
    const rawClassId = Number.parseInt(searchParams.get("classId") ?? "", 10);
    const classId =
        Number.isInteger(rawClassId) && rawClassId > 0 ? rawClassId : null;
    const query = new URLSearchParams({ sort });

    if (classId !== null) {
        query.set("classId", String(classId));
    }

    try {
        let ranking: RankingResponse | null = null;

        for (const apiBaseUrl of getApiBaseUrlCandidates()) {
            try {
                const response = await fetch(
                    `${apiBaseUrl}/ranking?${query.toString()}`,
                    {
                        next: { revalidate: 300 },
                    },
                );

                if (!response.ok) {
                    throw new Error("No se pudo cargar el ranking");
                }

                ranking = (await response.json()) as RankingResponse;
                break;
            } catch (error) {
                console.error(
                    `Could not load rankings from ${apiBaseUrl}:`,
                    error,
                );
            }
        }

        if (!ranking) {
            throw new Error("No se pudo cargar el ranking desde ningun origen");
        }

        const headSpritesById = await getRankingHeadSprites(
            ranking.characters.map((character) => character.headId),
        );
        const payload: RankingPageData = {
            characters: ranking.characters,
            headSpritesById,
        };

        return NextResponse.json(payload, {
            headers: {
                "Cache-Control": "s-maxage=300, stale-while-revalidate=86400",
            },
        });
    } catch (error) {
        console.error("Could not load rankings:", error);
        return NextResponse.json({
            characters: [],
            headSpritesById: {},
        } satisfies RankingPageData, {status: 503});
    }
}
