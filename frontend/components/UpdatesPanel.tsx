"use client";

import { LocalizedText } from '@/components/LocalizedText';
import Link from "next/link";
import { useEffect, useState } from "react";
import changelogEntries from "@/data/changelog.json";
import roadmapEntries from "@/data/roadmap.json";

type ChangelogEntry = {
    features: string[];
};

type RoadmapEntry = {
    title: string;
    items: string[];
};

type UpdatesPanelProps = {
    mode?: "preview" | "full";
    backHref?: string;
};

const reversedChangelogEntries = [
    ...(changelogEntries as ChangelogEntry[]),
].reverse();
const orderedRoadmapEntries = roadmapEntries as RoadmapEntry[];

export default function UpdatesPanel({
    mode = "preview",
    backHref,
}: UpdatesPanelProps) {
    const isPreview = mode === "preview";
    const [isChangelogExpanded, setIsChangelogExpanded] = useState(false);
    const [isRoadmapExpanded, setIsRoadmapExpanded] = useState(false);
    const changelogPreview = reversedChangelogEntries[0];
    const roadmapPreview = orderedRoadmapEntries[0];
    const visibleChangelogEntries =
        isPreview || !isChangelogExpanded
            ? reversedChangelogEntries.slice(0, 1)
            : reversedChangelogEntries;
    const visibleRoadmapEntries =
        isPreview || !isRoadmapExpanded
            ? orderedRoadmapEntries.slice(0, 1)
            : orderedRoadmapEntries;

    useEffect(() => {
        if (isPreview) {
            return;
        }

        const syncExpandedSections = () => {
            const rawHash = window.location.hash;
            const normalizedHash = rawHash.includes("#")
                ? `#${rawHash.split("#").filter(Boolean)[0] ?? ""}`
                : rawHash;

            if (normalizedHash && normalizedHash !== rawHash) {
                window.history.replaceState(
                    null,
                    "",
                    `${window.location.pathname}${window.location.search}${normalizedHash}`,
                );
            }

            setIsChangelogExpanded(normalizedHash === "#changelog");
            setIsRoadmapExpanded(normalizedHash === "#roadmap");
        };

        syncExpandedSections();
        window.addEventListener("hashchange", syncExpandedSections);

        return () => {
            window.removeEventListener("hashchange", syncExpandedSections);
        };
    }, [isPreview]);

    const navigateToUpdatesSection = (section: "changelog" | "roadmap") => {
        if (typeof window !== "undefined") {
            window.location.assign(`/updates#${section}`);
        }
    };

    return (
        <div className="space-y-6">
            {backHref ? (
                <div className="flex justify-end">
                    <Link
                        href={backHref}
                        prefetch={false}
                        className="text-sm text-stone-300 transition hover:text-stone-100"
                    ><LocalizedText source={"Volver "} /></Link>
                </div>
            ) : null}

            <section
                id="changelog"
                className="rounded-[28px] border border-white/8 bg-stone-950/75 p-5 shadow-2xl backdrop-blur-md"
            >
                <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-200/75">
                        Changelog
                    </p>
                    {isPreview ? (
                        <button
                            type="button"
                            onClick={() =>
                                navigateToUpdatesSection("changelog")
                            }
                            className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-100 transition hover:text-white"
                        ><LocalizedText source={"Mostrar mas "} /></button>
                    ) : null}
                </div>

                <div className="mt-5 space-y-4">
                    {isPreview ? (
                        changelogPreview ? (
                            <article className="relative overflow-hidden rounded-2xl border border-white/7 bg-white/4 p-4">
                                <span className="mb-3 inline-flex rounded-full bg-cyan-300/12 px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-cyan-100">
                                    Update{" "}
                                    {String(changelogEntries.length).padStart(
                                        2,
                                        "0",
                                    )}
                                </span>

                                <ul className="mt-3 space-y-2 text-sm text-stone-300">
                                    {changelogPreview.features
                                        .slice(0, 3)
                                        .map((feature) => (
                                            <li
                                                key={feature}
                                                className="flex gap-2 leading-6"
                                            >
                                                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amber-200" />
                                                <span><LocalizedText source={feature} /></span>
                                            </li>
                                        ))}
                                </ul>

                                {changelogPreview.features.length > 3 ? (
                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-stone-950 via-stone-950/85 to-transparent" />
                                ) : null}
                            </article>
                        ) : null
                    ) : (
                        visibleChangelogEntries.map((entry, index) => (
                            <article
                                key={`${entry.features[0] ?? "update"}-${index}`}
                                className="relative rounded-2xl border border-white/7 bg-white/4 p-4"
                            >
                                <span className="mb-3 inline-flex rounded-full bg-cyan-300/12 px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-cyan-100">
                                    Update{" "}
                                    {String(
                                        changelogEntries.length - index,
                                    ).padStart(2, "0")}
                                </span>

                                <ul className="mt-3 space-y-2 text-sm text-stone-300">
                                    {entry.features.map((feature) => (
                                        <li
                                            key={feature}
                                            className="flex gap-2 leading-6"
                                        >
                                            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-amber-200" />
                                            <span><LocalizedText source={feature} /></span>
                                        </li>
                                    ))}
                                </ul>
                            </article>
                        ))
                    )}

                    {!isPreview && reversedChangelogEntries.length > 1 ? (
                        <button
                            type="button"
                            onClick={() =>
                                setIsChangelogExpanded((current) => !current)
                            }
                            className="w-full rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-medium text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-300/15"
                        >
                            <LocalizedText source={isChangelogExpanded
                                ? "Mostrar menos"
                                : "Mostrar mas"} />
                        </button>
                    ) : null}
                </div>
            </section>

            <section
                id="roadmap"
                className="rounded-[28px] border border-white/8 bg-stone-950/75 p-5 shadow-2xl backdrop-blur-md"
            >
                <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-amber-200/75">
                        Roadmap
                    </p>
                    {isPreview ? (
                        <button
                            type="button"
                            onClick={() => navigateToUpdatesSection("roadmap")}
                            className="text-xs font-medium uppercase tracking-[0.22em] text-amber-100 transition hover:text-white"
                        ><LocalizedText source={"Mostrar mas "} /></button>
                    ) : null}
                </div>

                <div className="mt-5 space-y-4">
                    {isPreview ? (
                        roadmapPreview ? (
                            <article className="relative overflow-hidden rounded-2xl border border-white/7 bg-white/4 p-4">
                                <p className="text-base font-semibold text-white">
                                    <LocalizedText source={roadmapPreview.title} />
                                </p>

                                <ul className="mt-4 space-y-2 text-sm text-stone-300">
                                    {roadmapPreview.items
                                        .slice(0, 2)
                                        .map((item) => (
                                            <li
                                                key={item}
                                                className="flex gap-2 leading-6"
                                            >
                                                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-cyan-200" />
                                                <span><LocalizedText source={item} /></span>
                                            </li>
                                        ))}
                                </ul>

                                {roadmapPreview.items.length > 2 ? (
                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-stone-950 via-stone-950/85 to-transparent" />
                                ) : null}
                            </article>
                        ) : null
                    ) : (
                        visibleRoadmapEntries.map((entry) => (
                            <article
                                key={entry.title}
                                className="rounded-2xl border border-white/7 bg-white/4 p-4"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-base font-semibold text-white">
                                        <LocalizedText source={entry.title} />
                                    </p>
                                </div>

                                <ul className="mt-4 space-y-2 text-sm text-stone-300">
                                    {entry.items.map((item) => (
                                        <li
                                            key={item}
                                            className="flex gap-2 leading-6"
                                        >
                                            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-cyan-200" />
                                            <span><LocalizedText source={item} /></span>
                                        </li>
                                    ))}
                                </ul>
                            </article>
                        ))
                    )}

                    {!isPreview && orderedRoadmapEntries.length > 1 ? (
                        <button
                            type="button"
                            onClick={() =>
                                setIsRoadmapExpanded((current) => !current)
                            }
                            className="w-full rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-medium text-amber-100 transition hover:border-amber-300/40 hover:bg-amber-300/15"
                        >
                            <LocalizedText source={isRoadmapExpanded
                                ? "Mostrar menos"
                                : "Mostrar mas"} />
                        </button>
                    ) : null}
                </div>
            </section>
        </div>
    );
}
