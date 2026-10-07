"use client";

import { LocalizedText } from '@/components/LocalizedText';
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AuthErrorResponse } from "../../../../lib/auth";
import type { ArenaRoomDetails } from "../../../../lib/arenas";
import { useAuthRedirect } from "../../../../hooks/useAuthRedirect";

export default function ArenaJoinPage() {
    const router = useRouter();
    const params = useParams<{ joinToken: string }>();
    const { session, loading } = useAuthRedirect({
        redirectTo: "/login",
        when: "unauthenticated",
        preserveRedirect: true,
    });
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!session) {
            return;
        }

        let cancelled = false;

        const run = async () => {
            const joinToken = params.joinToken;

            if (!joinToken) {
                setError("Link de sala invalido");
                return;
            }

            try {
                const response = await fetch(`/api/arenas/join/${joinToken}`, {
                    method: "POST",
                });
                const result = (await response.json()) as ArenaRoomDetails | AuthErrorResponse;

                if (!response.ok || "error" in result) {
                    throw new Error("error" in result ? result.error : "No se pudo entrar a la sala");
                }

                if (!cancelled) {
                    router.replace(`/arenas?room=${result.id}`);
                }
            } catch (joinError) {
                if (!cancelled) {
                    setError(joinError instanceof Error ? joinError.message : "No se pudo entrar a la sala");
                }
            }
        };

        void run();

        return () => {
            cancelled = true;
        };
    }, [params.joinToken, router, session]);

    return (
        <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#111827,#0b1120)] px-4 text-stone-100">
            <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-stone-950/85 p-6 text-center shadow-2xl">
                <p className="text-[11px] uppercase tracking-[0.34em] text-amber-200/75">Arenas</p>
                <h1 className="mt-3 text-2xl font-semibold text-white">
                    <LocalizedText source={error
                        ? "No se pudo entrar"
                        : loading
                          ? "Verificando sesion..."
                          : "Entrando a la sala..."} />
                </h1>
                <p className="mt-3 text-sm text-stone-300">
                    <LocalizedText source={error ?? (loading ? "Estamos validando tu acceso." : "Estamos resolviendo tu link privado.")} />
                </p>
            </div>
        </main>
    );
}
