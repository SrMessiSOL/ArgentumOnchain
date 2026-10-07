import type { Metadata } from "next";
import {translateSource} from '@/lib/i18n';
import { notFound, redirect } from "next/navigation";
import WikiExplorer from "@/components/wiki/WikiExplorer";
import { buildPageMetadata } from "@/lib/seo";
import {
    getWikiSectionHref,
    WIKI_SECTIONS,
    WIKI_SECTION_LABELS,
    type WikiSection,
} from "@/lib/wiki-sections";
import { getWikiData } from "@/lib/wiki-data";

export const dynamic = "force-dynamic";

type WikiSectionPageProps = {
    params: Promise<{
        section: string;
    }>;
};

export function generateStaticParams() {
    return WIKI_SECTIONS.map((section) => ({ section }));
}

export async function generateMetadata(
    props: WikiSectionPageProps,
): Promise<Metadata> {
    const { section } = await props.params;

    if (!WIKI_SECTIONS.includes(section as WikiSection)) {
        return {};
    }

    const label = translateSource(WIKI_SECTION_LABELS[section as WikiSection],'en');

    return buildPageMetadata({
        title: `${label} wiki`,
        description: `Explore AOCHAIN ${label.toLowerCase()}, with game statistics and descriptions.`,
        path: getWikiSectionHref(section as WikiSection),
        keywords: ["wiki AOCHAIN", label, "Argentum Online"],
    });
}

export default async function WikiSectionPage(props: WikiSectionPageProps) {
    const { section } = await props.params;

    if (section === "objects") {
        redirect(getWikiSectionHref("equipment"));
    }

    if (!WIKI_SECTIONS.includes(section as WikiSection)) {
        notFound();
    }

    const data = await getWikiData();

    return (
        <main className="realm-wiki min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_top,#0f766e33,transparent_35%),radial-gradient(circle_at_bottom,#f59e0b22,transparent_30%),linear-gradient(180deg,#0f172a,#0c0a09)] px-4 py-10 text-stone-100">
            <div className="mx-auto max-w-7xl">
                <WikiExplorer data={data} section={section as WikiSection} />
            </div>
        </main>
    );
}
