"use client";
import {useGameWallet} from './GameWalletProvider';
import HeaderWallet from './HeaderWallet';
import { LocalizedLabel } from '@/components/LocalizedText';
import { useI18n, LanguageSelector } from "@/components/I18nProvider";

import {portalEnglish,portalSpanish} from '@/lib/portal-copy';
import {brandEnglish,brandSpanish} from '@/lib/brand-copy';
import {uxEnglish,uxSpanish} from "@/lib/ux-copy";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
    Menu, X, Home,
    Trophy,
    UserRound,
    ScrollText,
    LogIn,
    LogOut,
    MessageCircle,
    Wallet,
    Store,
} from "lucide-react";
import { useEffect, useState, useRef } from "react";
import type { AuthErrorResponse, AuthSession } from "@/lib/auth";

type AppChromeProps = {
    children: React.ReactNode;
};

const navItems: {href:string;label:string;icon:typeof UserRound;external?:boolean}[] = [
 {href:'/characters',label:'play',icon:UserRound},
 {href:'/character-market',label:'market',icon:Store},
 {href:'/profile',label:'collection',icon:Wallet},
 {href:'/wiki',label:'guide',icon:ScrollText},

];

function isActivePath(pathname: string, href: string) {
    if (href === "/") {
        return pathname === "/";
    }

    if (href === "/wiki/equipment") {
        return pathname === "/wiki" || pathname.startsWith("/wiki/");
    }

    return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppChrome({ children }: AppChromeProps) {
    const { locale, t: localizeKey, text: localizeText } = useI18n();
    const copy=locale==='es'?brandSpanish:brandEnglish;const portal=locale==='es'?portalSpanish:portalEnglish;

    const ux=locale==='es'?uxSpanish:uxEnglish;
    const [menuOpen,setMenuOpen]=useState(false);
    const menuButton=useRef<HTMLButtonElement>(null);
    useEffect(()=>{if(!menuOpen)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){setMenuOpen(false);menuButton.current?.focus();}};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[menuOpen]);
    const pathname = usePathname();
    useEffect(()=>{setMenuOpen(false);},[pathname]);
    const router = useRouter();
    const gameWallet=useGameWallet();
    async function signOut(){await fetch("/api/auth/signout",{method:"POST"});await gameWallet.disconnect();setSession(null);router.push("/login");router.refresh();}
    const [sessionLoading,setSessionLoading]=useState(true);
    const [session, setSession] = useState<AuthSession | null>(null);

    useEffect(() => {
        let cancelled = false;

        fetch("/api/auth/me", { cache: "no-store" })
            .then(async (response) => {
                if (!response.ok) {
                    return null;
                }

                const result = (await response.json()) as
                    | AuthSession
                    | AuthErrorResponse;
                if ("error" in result) {
                    return null;
                }

                return result;
            })
            .then((result) => {
                if (!cancelled) {
                    setSession(result);setSessionLoading(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setSession(null);setSessionLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [pathname]);

    if (pathname === "/play") {
        return <><div className="fixed bottom-2 left-2 z-50"><LanguageSelector /></div>{children}</>;
    }

    return (
        <>
            <a className="realm-skip-link" href="#realm-content">{ux.skip}</a>
            <header className="realm-header sticky top-0 z-50 border-b border-white/8 bg-[#05080d]/92 backdrop-blur-xl">
                <div className="realm-header-inner mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
                    <Link href="/" className="realm-brand-link" aria-label={copy.fullName}><img src="/brand/mark.svg" alt=""/><span className="realm-wordmark"><b>AO<span>CHAIN</span></b><small>{copy.fullName}</small></span></Link>

                    <nav aria-label={ux.navigation} className="portal-global-nav hidden items-center gap-2 rounded-2xl border border-white/6 bg-black/20 p-1 lg:flex">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const active = item.external
                                ? false
                                : isActivePath(pathname, item.href);

                            return (
                                <Link
                                    key={item.href}
                                    aria-current={active ? "page" : undefined}
                                    href={item.href}
                                    target={
                                        item.external ? "_blank" : undefined
                                    }
                                    rel={
                                        item.external ? "noreferrer" : undefined
                                    }
                                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition ${
                                        active
                                            ? "bg-amber-300/12 text-amber-300"
                                            : "text-stone-400 hover:bg-white/5 hover:text-stone-100"
                                    }`}
                                >
                                    <Icon className="h-4 w-4" />
                                    {portal[item.label as keyof typeof portal]}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="realm-header-actions flex items-center gap-3"><HeaderWallet session={session} loading={sessionLoading}/><LanguageSelector /><button type="button" ref={menuButton} className="realm-menu-toggle lg:hidden" aria-expanded={menuOpen} onKeyDown={event=>{if(event.key === "Escape")setMenuOpen(false);}} aria-controls="realm-mobile-navigation" aria-label={menuOpen?ux.close:ux.menu} onClick={()=>setMenuOpen(v=>!v)}>{menuOpen?<X size={20}/>:<Menu size={20}/>}</button>
                        {session ? (
                            <>
                                <Link href="/profile" className="hidden text-sm text-stone-200 sm:inline">
                                    {session.account.name}
                                </Link>
                                <LocalizedLabel><button
                                    type="button"
                                    onClick={signOut}
                                    className="hidden sm:inline-flex items-center justify-center rounded-full p-2 text-stone-400 transition hover:bg-white/5 hover:text-stone-100"
                                    aria-label={localizeKey("nav.logout")}
                                >
                                    <LogOut className="h-4 w-4" />
                                </button></LocalizedLabel>
                            </>
                        ) : (
                            <Link
                                href="/login"
                                className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-white/8 px-4 py-2 text-sm text-stone-200 transition hover:bg-white/5"
                            >
                                <LogIn className="h-4 w-4" />{localizeKey("nav.login")}</Link>
                        )}
                    </div>
                </div>
            </header>

            <div id="realm-mobile-navigation" hidden={!menuOpen} className={`realm-mobile-navigation ${menuOpen?"is-open":""} lg:hidden border-b border-white/8 bg-[#05080d]/92 px-4 py-2 backdrop-blur-xl`}>
                <nav onKeyDown={event=>{if(event.key === "Escape")setMenuOpen(false);}} aria-label={ux.navigation} className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const active = item.external
                            ? false
                            : isActivePath(pathname, item.href);

                        return (
                            <Link
                                key={item.href}
                                aria-current={active ? "page" : undefined}
                                href={item.href}
                                target={item.external ? "_blank" : undefined}
                                rel={item.external ? "noreferrer" : undefined}
                                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                                    active
                                        ? "bg-amber-300/12 text-amber-300"
                                        : "text-stone-400 hover:bg-white/5 hover:text-stone-100"
                                }`}
                            >
                                <Icon className="h-4 w-4" />
                                {portal[item.label as keyof typeof portal]}
                            </Link>
                        );
                    })}
                    {session?<button className="realm-mobile-account" onClick={signOut}><LogOut size={16}/>{localizeKey('nav.logout')}</button>:<Link className="realm-mobile-account" href="/login"><LogIn size={16}/>{localizeKey('nav.login')}</Link>}
                </nav>
            </div>

            <div id="realm-content" tabIndex={-1} className="realm-frame">{children}</div>
            <footer className="realm-footer"><div className="realm-footer-top"><Link href="/" className="realm-brand-link"><img src="/brand/mark.svg" alt=""/><span className="realm-wordmark"><b>AO<span>CHAIN</span></b><small>{copy.fullName}</small></span></Link><nav><Link href="/characters">{copy.play}</Link><Link href="/character-market">{copy.market}</Link><Link href="/wiki">{portal.guide}</Link><Link href="/ranking">{portal.rankings}</Link></nav></div><div className="realm-footer-bottom"><span>{copy.footer}<br/>{copy.credit}</span><span>{copy.test}</span></div></footer>
        </>
    );
}
