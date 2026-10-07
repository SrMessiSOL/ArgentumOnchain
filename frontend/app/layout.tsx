import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppChrome from "@/components/AppChrome";
import { cookies } from "next/headers";
import { I18nProvider } from "@/components/I18nProvider";
import GameWalletProvider from '@/components/GameWalletProvider';
import { parseLocale } from "@/lib/i18n";
import {
    buildPageMetadata,
    siteDescription,
    siteTitle,
    siteUrl,
} from "@/lib/seo";
import "./globals.css";
import "./realm-brand.css";
import "./player-portal.css";
import "./portal-polish.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    ...buildPageMetadata({
        title: siteTitle,
        description: siteDescription,
        path: "/",
        imagePath: "/opengraph-image",
        twitterImagePath: "/twitter-image",
    }),
    metadataBase: new URL(siteUrl),
    applicationName: "AOCHAIN",
    title: {
        default: siteTitle,
        template: "%s | AOCHAIN",
    },
    description: siteDescription,
    authors: [{ name: "Damian Catanzaro" }],
    creator: "Damian Catanzaro",
    publisher: "AOCHAIN",
    category: "games",
    formatDetection: {
        email: false,
        address: false,
        telephone: false,
    },
    icons: {
        icon: "/brand/mark.svg",
        shortcut: "/brand/mark.svg",
        apple: "/brand/mark.svg",
    },
    manifest: "/manifest.webmanifest",
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
        },
    },
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const locale = parseLocale((await cookies()).get('aoweb-locale')?.value);
    return (
        <html lang={locale}>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            >
                <I18nProvider initialLocale={locale}><GameWalletProvider><AppChrome>{children}</AppChrome></GameWalletProvider></I18nProvider>
            </body>
        </html>
    );
}
