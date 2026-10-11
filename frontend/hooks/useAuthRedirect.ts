"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AuthErrorResponse, AuthSession } from "../lib/auth";

type UseAuthRedirectOptions = {
    redirectTo: string;
    when: "authenticated" | "unauthenticated";
    preserveRedirect?: boolean;
    allowReauthentication?: boolean;
};

export function useAuthRedirect({
    redirectTo,
    when,
    preserveRedirect = false,
    allowReauthentication = false,
}: UseAuthRedirectOptions) {
    const pathname = usePathname();
    const router = useRouter();
    const [session, setSession] = useState<AuthSession | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const buildRedirectTarget = () => {
            if (!preserveRedirect || when !== "unauthenticated") {
                return redirectTo;
            }

            const currentPath =
                typeof window === "undefined"
                    ? pathname
                    : `${pathname}${window.location.search}`;
            const params = new URLSearchParams();
            params.set("redirect", currentPath);
            return `${redirectTo}?${params.toString()}`;
        };

        const getRedirectParam = () => {
            if (typeof window === "undefined") {
                return "";
            }

            return new URLSearchParams(window.location.search).get("redirect")?.trim() || "";
        };

        const loadSession = async () => {
            try {
                const response = await fetch("/api/auth/me", { cache: "no-store" });

                if (!response.ok) {
                    if (!cancelled && when === "unauthenticated") {
                        router.replace(buildRedirectTarget());
                    }
                    return;
                }

                const result = (await response.json()) as AuthSession | AuthErrorResponse;

                if (cancelled || "error" in result) {
                    return;
                }

                setSession(result);

                if (when === "authenticated" && !(allowReauthentication && new URLSearchParams(window.location.search).get("reauth") === "1")) {
                    const redirectPath = getRedirectParam();
                    router.replace(redirectPath || redirectTo);
                }
            } catch {
                if (!cancelled && when === "unauthenticated") {
                    router.replace(buildRedirectTarget());
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadSession();

        return () => {
            cancelled = true;
        };
    }, [pathname, preserveRedirect, redirectTo, router, when, allowReauthentication]);

    return { session, loading };
}
