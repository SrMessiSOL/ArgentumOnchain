"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { parseLocale, translate, translateSource, type Locale, type TextKey } from "@/lib/i18n";
type Context = {locale: Locale; setLocale: (locale: Locale) => void; t: (key: TextKey) => string; text: (source: string) => string};
const I18nContext = createContext<Context | null>(null);
export function I18nProvider({initialLocale, children}:{initialLocale: Locale; children: React.ReactNode}) {
    const [locale, updateLocale] = useState(initialLocale);
    const [saveError, setSaveError] = useState(false);
    const pathname = usePathname();
    const revision = useRef(0);
    const apply = useCallback((next: Locale) => {
        updateLocale(next);
        document.documentElement.lang = next;
        window.dispatchEvent(new Event('aoweb:locale'));
        document.cookie = `aoweb-locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    }, []);
    useEffect(() => {
        let cancelled = false;
        const atStart = revision.current;
        fetch('/api/preferences', {cache:'no-store'}).then(r => r.ok ? r.json() : null).then(data => {
            if (!cancelled && atStart === revision.current && data?.locale) apply(parseLocale(data.locale));
        }).catch(() => {});
        return () => {cancelled = true;};
    }, [pathname, apply]);
    const setLocale = useCallback((next: Locale) => {
        revision.current++;
        apply(next); setSaveError(false);
        fetch('/api/preferences', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({locale:next})})
            .then(r => {if (!r.ok && r.status !== 401) setSaveError(true);}).catch(() => setSaveError(true));
    }, [apply]);
    const t = useCallback((key:TextKey) => translate(key,locale), [locale]);
    const text = useCallback((source:string) => translateSource(source,locale), [locale]);
    return <I18nContext.Provider value={{locale,setLocale,t,text}}>{children}{saveError && <p role="status" className="fixed bottom-2 left-2 z-[999] rounded bg-stone-900 p-2 text-sm text-amber-200">{locale === 'en' ? 'Language saved on this device; account sync failed.' : 'Idioma guardado en este dispositivo; no se pudo sincronizar la cuenta.'}</p>}</I18nContext.Provider>;
}
export function useI18n() { const value=useContext(I18nContext); if(!value) throw new Error('I18nProvider missing'); return value; }
export function LanguageSelector() {
    const {locale,setLocale}=useI18n();
    return <label className="text-sm text-stone-200"><span className="sr-only">Language / Idioma</span><select aria-label="Language / Idioma" value={locale} onChange={e=>setLocale(parseLocale(e.target.value))} className="rounded-lg border border-stone-600 bg-stone-900 p-2"><option value="en">English</option><option value="es">Español</option></select></label>;
}
