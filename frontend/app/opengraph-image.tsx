import { ImageResponse } from "next/og";
import {
    SocialCard,
    getSocialBackdropSrc,
    socialImageContentType,
    socialImageSize,
} from "@/lib/social-card";

export const alt = "AOCHAIN";
export const size = socialImageSize;
export const contentType = socialImageContentType;

export default async function OpenGraphImage() {
    const backdropSrc = await getSocialBackdropSrc();

    return new ImageResponse(
        <SocialCard
            eyebrow="ARGENTUM ONCHAIN"
            title="AOCHAIN"
            description="A realm worth fighting for. Steel, magic and adventure, straight from your browser."
            bullets={[
                "MMORPG clasico 100% web",
                "Changelog y roadmap publicos",
                "Seguimiento y mejoras continuas",
            ]}
            accent="#d8b77a"
            backdropSrc={backdropSrc}
        />,
        size,
    );
}
