"use client";

import { LocalizedText, LocalizedLabel } from '@/components/LocalizedText';
import Link from "next/link";
import { useEffect, useState } from "react";
import type {
    AuthErrorResponse,
    PasswordResetResponse,
    PasswordResetStatus,
} from "../lib/auth";

type PasswordResetCardProps = {
    token: string;
};

export default function PasswordResetCard({ token }: PasswordResetCardProps) {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [pending, setPending] = useState(false);
    const [checking, setChecking] = useState(true);
    const [valid, setValid] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const validateToken = async () => {
            try {
                const response = await fetch(
                    `/api/auth/password-reset/${encodeURIComponent(token)}`,
                    { cache: "no-store" },
                );

                const result = (await response.json()) as
                    | PasswordResetStatus
                    | AuthErrorResponse;

                if (!response.ok) {
                    throw new Error(
                        "error" in result && result.error
                            ? result.error
                            : "No se pudo validar el link",
                    );
                }

                if (!cancelled) {
                    const isValid = "valid" in result && Boolean(result.valid);
                    setValid(isValid);
                    if (!isValid) {
                        setError(
                            "El link de recuperacion es invalido o ya vencio.",
                        );
                    }
                }
            } catch (validationError) {
                if (!cancelled) {
                    setError(
                        validationError instanceof Error
                            ? validationError.message
                            : "Ocurrio un error inesperado",
                    );
                }
            } finally {
                if (!cancelled) {
                    setChecking(false);
                }
            }
        };

        void validateToken();

        return () => {
            cancelled = true;
        };
    }, [token]);

    const submit = async (
        event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>,
    ) => {
        event.preventDefault();

        if (password !== confirmPassword) {
            setError("Las passwords no coinciden");
            return;
        }

        setPending(true);
        setError(null);
        setMessage(null);

        try {
            const response = await fetch("/api/auth/password-reset/confirm", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ token, password }),
            });

            const result = (await response.json()) as
                | PasswordResetResponse
                | AuthErrorResponse;

            if (!response.ok) {
                throw new Error(
                    "error" in result && result.error
                        ? result.error
                        : "No se pudo actualizar la password",
                );
            }

            setMessage(
                "message" in result
                    ? result.message
                    : "La password se actualizo correctamente.",
            );
            setValid(false);
            setPassword("");
            setConfirmPassword("");
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
            <div className="border-b border-white/8 bg-[radial-gradient(circle_at_top,#f59e0b33,transparent_55%),linear-gradient(135deg,#111827,#0f172a)] px-6 py-6">
                <p className="text-[11px] uppercase tracking-[0.34em] text-amber-200/80">
                    AOWeb
                </p>
                <h1 className="mt-2 text-3xl font-semibold text-stone-50"><LocalizedText source={"Elegi una nueva contraseña "} /></h1>
                <p className="mt-2 text-sm text-stone-300/80"><LocalizedText source={"Usa una clave de al menos 8 caracteres. El link sirve una sola vez. "} /></p>
            </div>

            <div className="p-6">
                {checking ? (
                    <div className="rounded-2xl bg-white/5 px-4 py-3 text-sm text-stone-300"><LocalizedText source={"Validando link seguro... "} /></div>
                ) : null}

                {!checking && valid ? (
                    <form className="space-y-3" onSubmit={submit}>
                        <LocalizedLabel><input
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            className="w-full rounded-2xl border border-stone-700 bg-stone-900/90 px-4 py-3 text-sm outline-none transition focus:border-amber-400"
                            placeholder="Nueva contraseña"
                            type="password"
                            autoComplete="new-password"
                            minLength={8}
                            required
                        /></LocalizedLabel>
                        <LocalizedLabel><input
                            value={confirmPassword}
                            onChange={(event) =>
                                setConfirmPassword(event.target.value)
                            }
                            className="w-full rounded-2xl border border-stone-700 bg-stone-900/90 px-4 py-3 text-sm outline-none transition focus:border-amber-400"
                            placeholder="Confirmar nueva contraseña"
                            type="password"
                            autoComplete="new-password"
                            minLength={8}
                            required
                        /></LocalizedLabel>

                        <button
                            type="submit"
                            disabled={pending}
                            className="w-full rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
                        >
                            <LocalizedText source={pending ? "Guardando..." : "Actualizar contraseña"} />
                        </button>
                    </form>
                ) : null}

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
                    ><LocalizedText source={"Ir a inicio de sesión "} /></Link>
                </div>
            </div>
        </div>
    );
}
