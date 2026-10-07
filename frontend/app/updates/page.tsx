import {translateSource} from '@/lib/i18n';
import { LocalizedText } from '@/components/LocalizedText';
import type { Metadata } from "next";
import UpdatesPanel from "@/components/UpdatesPanel";
import changelogEntries from "@/data/changelog.json";
import roadmapEntries from "@/data/roadmap.json";
import { buildPageMetadata } from "@/lib/seo";

const latestFeatures = changelogEntries[0]?.features ?? [];
const nextFocus = roadmapEntries[0];

const updatesDescription = `Follow the AOCHAIN changelog and public roadmap: ${translateSource(latestFeatures[0] ?? 'New features','en')}. Next: ${translateSource(nextFocus?.title ?? 'Game improvements','en')}.`;

export const metadata: Metadata = buildPageMetadata({
    title: "Updates, changelog y roadmap",
    description: updatesDescription,
    path: "/updates",
    keywords: ["updates AOCHAIN", "roadmap Argentum Online", "changelog MMORPG"],
    imagePath: "/updates/opengraph-image",
    twitterImagePath: "/updates/twitter-image",
});

export default function UpdatesPage() {
    return (
        <main className="min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_top,#0f766e33,transparent_35%),radial-gradient(circle_at_bottom,#f59e0b22,transparent_30%),linear-gradient(180deg,#0f172a,#0c0a09)] px-4 py-12 text-stone-100">
            <div className="mx-auto max-w-4xl">
                <div className="mb-8">
                    <p className="text-[11px] uppercase tracking-[0.34em] text-cyan-200/75">
                        AOCHAIN
                    </p>
                    <h1 className="mt-3 text-3xl font-semibold text-white md:text-4xl"><LocalizedText source={"Changelog y roadmap "} /></h1>
                </div>

                <UpdatesPanel mode="full" backHref="/characters" />
            </div>
        </main>
    );
}
