import type { Metadata } from "next";
import RankingView from "@/components/RankingView";
import { getApiBaseUrlCandidates } from "@/lib/api-base-url";
import { getRankingHeadSprites } from "@/lib/ranking-heads";
import type { RankingPageData } from "@/lib/ranking";
import { buildPageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = buildPageMetadata({
    title: "Leaderboard",
    description:
        "Explore the AOCHAIN leaderboard and discover the realm leaders by level and kills.",
    path: "/ranking",
    keywords: ["ranking AOCHAIN", "top kills", "top nivel"],
});

async function getRanking(): Promise<RankingPageData> {
    try {
        let ranking: RankingPageData | null = null;

        for (const apiBaseUrl of getApiBaseUrlCandidates()) {
            try {
                const response = await fetch(`${apiBaseUrl}/ranking?sort=level`, {
                    next: { revalidate: 300 },
                });

                if (!response.ok) {
                    throw new Error("No se pudo cargar el ranking");
                }

                ranking = (await response.json()) as RankingPageData;
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

        return {
            characters: ranking.characters,
            headSpritesById: await getRankingHeadSprites(
                ranking.characters.map((character) => character.headId),
            ),
        };
    } catch (error) {
        console.error("Could not load rankings:", error);
        return { characters: [], headSpritesById: {}, unavailable: true };
    }
}

export default async function RankingPage() {
    const ranking = await getRanking();

    return (
        <RankingView
            unavailable={ranking.unavailable}
            characters={ranking.characters}
            headSpritesById={ranking.headSpritesById}
        />
    );
}
