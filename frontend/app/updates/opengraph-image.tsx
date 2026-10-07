import { ImageResponse } from "next/og";
import changelogEntries from "@/data/changelog.json";
import roadmapEntries from "@/data/roadmap.json";
import {
    SocialCard,
    getSocialBackdropSrc,
    socialImageContentType,
    socialImageSize,
} from "@/lib/social-card";

export const alt = "AOCHAIN updates";
export const size = socialImageSize;
export const contentType = socialImageContentType;

export default async function UpdatesOpenGraphImage() {
    const latestChangelog = changelogEntries[0]?.features ?? [];
    const firstRoadmap = roadmapEntries[0];
    const backdropSrc = await getSocialBackdropSrc();

    return new ImageResponse(
        <SocialCard
            eyebrow="Updates"
            title="AOCHAIN updates"
            description="Development updates and the public roadmap for Argentum Onchain."
            bullets={[
                ...latestChangelog.slice(0, 2),
                firstRoadmap?.items[0] ??
                    "Seguimiento publico de proximas funciones",
            ]}
            accent="#fbbf24"
            backdropSrc={backdropSrc}
        />,
        size,
    );
}
