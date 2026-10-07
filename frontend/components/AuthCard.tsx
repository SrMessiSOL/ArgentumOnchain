"use client";
import { useI18n } from "@/components/I18nProvider";

import {uxEnglish,uxSpanish} from "@/lib/ux-copy";
import PortalModal from './PortalModal';
import {Eye,EyeOff} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { encryptAuthPayload } from "../lib/authPayloadEncryption";
import type { AuthErrorResponse, AuthSession } from "../lib/auth";
import {
    DISPLAY_NAME_MAX_LENGTH,
    getDisplayNameError,
} from "../lib/name-validation";

type AuthCardProps = {
    mode: "login" | "register";
};

const initialLoginForm = {
    identifier: "",
    password: "",
};

const initialRegisterForm = {
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
};

export default function AuthCard({ mode }: AuthCardProps) {
    const { locale, t: localizeKey, text: localizeText } = useI18n();

    const copy=locale === "es" ? uxSpanish : uxEnglish;
    const [showPassword,setShowPassword]=useState(false);
    const router = useRouter();
    const [loginForm, setLoginForm] = useState(initialLoginForm);
    const [registerForm, setRegisterForm] = useState(initialRegisterForm);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [redirectPath, setRedirectPath] = useState("/characters");

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const nextRedirect =
            new URLSearchParams(window.location.search)
                .get("redirect")
                ?.trim() || "/characters";
        setRedirectPath(nextRedirect);
    }, []);

    const submit = async (
        event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>,
    ) => {
        event.preventDefault();
        setPending(true);
        setError(null);

        try {
            if (
                mode === "register" &&
                registerForm.password !== registerForm.confirmPassword
            ) {
                throw new Error("Las passwords no coinciden");
            }

            if (mode === "register") {
                const nameError = getDisplayNameError(registerForm.name);

                if (nameError) {
                    throw new Error(nameError);
                }
            }

            const payload = mode === "login" ? loginForm : registerForm;

            const response = await fetch(`/api/auth/${mode}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: await encryptAuthPayload(payload),
            });

            const result = (await response.json()) as
                | AuthSession
                | AuthErrorResponse;

            if (!response.ok) {
                throw new Error(
                    "error" in result && result.error
                        ? result.error
                        : localizeKey("auth.failed"),
                );
            }

            router.push(redirectPath);
            router.refresh();
        } catch (submitError) {
            setError(
                submitError instanceof Error
                    ? submitError.message
                    : localizeKey("auth.unexpected"),
            );
        } finally {
            setPending(false);
        }
    };

    return (
        <div className="realm-auth-card mx-auto w-full max-w-md overflow-hidden rounded-[32px] border border-stone-700/70 bg-stone-950/88 text-stone-100 shadow-2xl backdrop-blur-md">
            <div className="border-b border-white/8 bg-[radial-gradient(circle_at_top,#f59e0b33,transparent_55%),linear-gradient(135deg,#1c1917,#0f172a)] px-6 py-6">
                <p className="text-[11px] uppercase tracking-[0.34em] text-amber-200/75">
                    AOCHAIN
                </p>
                <h1 className="mt-2 text-3xl font-semibold text-stone-50">
                    {mode === "login" ? localizeKey("auth.login") : localizeKey("auth.create")}
                </h1>
                {mode === "register" ? (
                    <p className="mt-2 text-sm text-stone-300/80">{localizeKey("auth.usernameHelp")}</p>
                ) : null}
            </div>

            <div className="p-6">
                <form aria-busy={pending} className="space-y-3" onSubmit={submit}>
                    {mode === "register" && <label className="realm-field"><span>{copy.usernameLabel}</span><input value={registerForm.name} onChange={e=>setRegisterForm(v=>({...v,name:e.target.value}))} autoComplete="username" maxLength={DISPLAY_NAME_MAX_LENGTH} required disabled={pending}/></label>}
                    <label className="realm-field"><span>{mode === "login" ? copy.identifier : copy.email}</span><input value={mode === "login" ? loginForm.identifier : registerForm.email} onChange={e=>mode === "login" ? setLoginForm(v=>({...v,identifier:e.target.value})) : setRegisterForm(v=>({...v,email:e.target.value}))} type={mode === "login" ? "text" : "email"} autoComplete={mode === "login" ? "username" : "email"} required disabled={pending}/></label>
                    <label className="realm-field"><span>{copy.password}</span><input value={mode === "login" ? loginForm.password : registerForm.password} onChange={e=>mode === "login" ? setLoginForm(v=>({...v,password:e.target.value})) : setRegisterForm(v=>({...v,password:e.target.value}))} type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "register" ? 8 : undefined} required disabled={pending}/></label>
                    {mode === "register" && <label className="realm-field"><span>{copy.confirm}</span><input value={registerForm.confirmPassword} onChange={e=>setRegisterForm(v=>({...v,confirmPassword:e.target.value}))} type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={8} required disabled={pending}/></label>}
                    <button type="button" className="realm-password-toggle" aria-pressed={showPassword} onClick={()=>setShowPassword(v=>!v)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>} {showPassword ? copy.hidePassword : copy.showPassword}</button>

                    <button
                        type="submit"
                        disabled={pending}
                        className="w-full rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
                    >
                        {pending
                            ? localizeKey("auth.pending")
                            : mode === "login"
                              ? localizeKey("auth.enter")
                              : localizeKey("auth.create")}
                    </button>
                </form>

                {error ? (
                    <PortalModal title={locale==='es'?'Revisá tus datos':'Check your details'} onClose={()=>setError(null)}><p role="alert">{localizeText(error)}</p></PortalModal>
                ) : null}

                <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/8 pt-4 text-sm text-stone-400">
                    <span>
                        {mode === "login"
                            ? localizeKey("auth.noAccount")
                            : localizeKey("auth.hasAccount")}
                    </span>
                    <div className="flex items-center gap-4">
                        {mode === "login" ? (
                            <Link
                                href="/forgot-password"
                                prefetch={false}
                                className="font-medium text-amber-200 transition hover:text-amber-100"
                            >{localizeKey("auth.forgot")}</Link>
                        ) : null}
                        <Link
                            href={
                                mode === "login"
                                    ? `/register?redirect=${encodeURIComponent(redirectPath)}`
                                    : `/login?redirect=${encodeURIComponent(redirectPath)}`
                            }
                            prefetch={false}
                            className="font-medium text-cyan-300 transition hover:text-cyan-200"
                        >
                            {mode === "login" ? localizeKey("auth.register") : localizeKey("auth.loginAccent")}
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
