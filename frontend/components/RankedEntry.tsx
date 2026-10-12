"use client";
import Link from "next/link";
import { useI18n } from "./I18nProvider";
export default function RankedEntry() {
    const { locale } = useI18n();
    // Enable only after the paired asset API and regional workers are deployed.
    if (process.env.NEXT_PUBLIC_RANKED_ENABLED !== "1") return null;
    return (
        <p style={{ margin: "20px 0" }}>
            <Link className="realm-button" href="/ranked">
                {locale === "es"
                    ? "Jugar ranked · Arena 1 contra 1"
                    : "Play ranked · 1v1 arena"}
            </Link>
        </p>
    );
}
