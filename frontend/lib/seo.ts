import type { Metadata } from "next";
import {translateSource} from './i18n';

const rawSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    "https://aoweb.app";

const normalizedSiteUrl = rawSiteUrl.startsWith("http")
    ? rawSiteUrl
    : `https://${rawSiteUrl}`;

export const siteUrl = normalizedSiteUrl.replace(/\/+$/, "");
export const siteName = "AOCHAIN";
export const siteTitle = "AOCHAIN — Argentum Onchain";
export const siteDescription = "A classic browser MMORPG. Explore Argentum, build your character and exchange characters, equipment and gold with Solana devnet payments.";
export const siteKeywords = [
    "AOCHAIN",
    "Argentum Onchain",
    "AO Web",
    "MMORPG web",
    "AOCHAIN devnet",
    "changelog AOCHAIN",
    "roadmap AOCHAIN",
];

export function absoluteUrl(path = "/"): string {
    return new URL(path, `${siteUrl}/`).toString();
}

type PageMetadataInput = {
    title: string;
    description: string;
    path: string;
    keywords?: string[];
    imagePath?: string;
    twitterImagePath?: string;
};

export function buildPageMetadata({
    title,
    description,
    path,
    keywords = [],
    imagePath = "/opengraph-image",
    twitterImagePath = imagePath,
}: PageMetadataInput): Metadata {
    title=translateSource(title,'en');
    description=translateSource(description,'en');
    return {
        title,
        description,
        keywords: [...siteKeywords, ...keywords].map(keyword => translateSource(keyword, 'en').trim()),
        alternates: {
            canonical: path,
        },
        openGraph: {
            type: "website",
            locale: "en_US",
            url: absoluteUrl(path),
            siteName,
            title,
            description,
            images: [
                {
                    url: absoluteUrl(imagePath),
                    width: 1200,
                    height: 630,
                    alt: title,
                },
            ],
        },
        twitter: {
            card: "summary_large_image",
            creator: "@DamianCatanzaro",
            title,
            description,
            images: [absoluteUrl(twitterImagePath)],
        },
    };
}
