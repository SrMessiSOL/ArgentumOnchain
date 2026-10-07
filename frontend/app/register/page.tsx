"use client";
import { useI18n } from "@/components/I18nProvider";

import AuthScene from "../../components/AuthScene";
import { useAuthRedirect } from "../../hooks/useAuthRedirect";

export default function RegisterPage() {
    const { t: localizeKey, text: localizeText } = useI18n();

    const { loading } = useAuthRedirect({
        redirectTo: "/characters",
        when: "authenticated",
    });

    if (loading) {
        return (
            <main className="flex min-h-[calc(100svh-88px)] items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_top,#0f766e33,transparent_35%),radial-gradient(circle_at_bottom,#f59e0b22,transparent_30%),linear-gradient(180deg,#0f172a,#0c0a09)] px-4 py-12 text-stone-100">
                <div className="rounded-[28px] border border-white/8 bg-stone-950/82 px-6 py-5 text-sm text-stone-300 shadow-2xl backdrop-blur-md">{localizeKey("auth.loading")}</div>
            </main>
        );
    }

    return (
        <main className="flex min-h-[calc(100svh-88px)] items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_top,#0f766e33,transparent_35%),radial-gradient(circle_at_bottom,#f59e0b22,transparent_30%),linear-gradient(180deg,#0f172a,#0c0a09)] px-4 py-12 text-stone-100">
            <div className="w-full max-w-5xl">
                <div className="mb-8 flex items-center justify-between gap-4 text-sm text-stone-300/80">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-cyan-200/75">{localizeKey("auth.registration")}</span>
                </div>
                <AuthScene mode="register" />
            </div>
        </main>
    );
}
