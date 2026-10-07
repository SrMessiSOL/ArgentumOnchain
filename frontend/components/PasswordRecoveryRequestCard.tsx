"use client";

import { LocalizedText, LocalizedLabel } from '@/components/LocalizedText';
import Link from "next/link";
import { useState } from "react";
import type { AuthErrorResponse, PasswordResetResponse } from "../lib/auth";

export default function PasswordRecoveryRequestCard() {
    const [email, setEmail] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const submit = async (
        event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>,
    ) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        setMessage(null);

        try {
            const response = await fetch("/api/auth/password-reset/request", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email }),
            });

            const result = (await response.json()) as
                | PasswordResetResponse
                | AuthErrorResponse;

            if (!response.ok) {
                throw new Error(
                    "error" in result && result.error
                        ? result.error
                        : "No se pudo procesar la solicitud",
                );
            }

            setMessage(
                `${
                    "message" in result
                        ? result.message
                        : "Si existe una cuenta con ese email, te enviamos un link para recuperar la password."
                } Si no ves el email revisa la sección de spam.`,
            );
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : "Ocurrio un error inesperado",
            );
        } finally {
            setPending(false);
        }
    };

    return (
        <div className="realm-auth-card mx-auto w-full max-w-md overflow-hidden rounded-[32px] border border-stone-700/70 bg-stone-950/88 text-stone-100 shadow-2xl backdrop-blur-md">
            <div className="border-b border-white/8 bg-[radial-gradient(circle_at_top,#22d3ee22,transparent_55%),linear-gradient(135deg,#111827,#0f172a)] px-6 py-6">
                <p className="text-[11px] uppercase tracking-[0.34em] text-cyan-200/80">
                    AOWeb
                </p>
                <h1 className="mt-2 text-3xl font-semibold text-stone-50"><LocalizedText source={"Recuperar contraseña "} /></h1>
            </div>

            <div className="p-6">
                <form className="space-y-3" onSubmit={submit}>
                    <LocalizedLabel><input
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="w-full rounded-2xl border border-stone-700 bg-stone-900/90 px-4 py-3 text-sm outline-none transition focus:border-cyan-400"
                        placeholder="Email"
                        type="email"
                        autoComplete="email"
                        required
                    /></LocalizedLabel>

                    <button
                        type="submit"
                        disabled={pending}
                        className="w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
                    >
                        <LocalizedText source={pending
                            ? "Enviando..."
                            : "Enviar email de recuperación"} />
                    </button>
                </form>

                {message ? (
                    <div role="status" className="mt-4 rounded-2xl bg-emerald-500/12 px-4 py-3 text-sm text-emerald-200">
                        <LocalizedText source={message} />
                    </div>
                ) : null}

                {error ? (
                    <div role="alert" className="mt-4 rounded-2xl bg-rose-500/12 px-4 py-3 text-sm text-rose-200">
                        <LocalizedText source={error} />
                    </div>
                ) : null}

                <div className="mt-5 border-t border-white/8 pt-4 text-sm text-stone-400">
                    <Link
                        href="/login"
                        prefetch={false}
                        className="font-medium text-cyan-300 transition hover:text-cyan-200"
                    ><LocalizedText source={"Volver a iniciar sesión "} /></Link>
                </div>
            </div>
        </div>
    );
}
