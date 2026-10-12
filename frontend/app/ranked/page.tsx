"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuthRedirect } from "@/hooks/useAuthRedirect";
import { useI18n } from "@/components/I18nProvider";
import PortalModal from "@/components/PortalModal";
type Character = {
    id: string;
    name: string;
    chain_state: string;
    connected: boolean;
    economy_lock: string | null;
};
type Region = { id: string; url: string };
type Admission = {
    ticket: string;
    lockId: string;
    url: string;
    expires: number;
};
export default function RankedPage() {
    const { session, loading } = useAuthRedirect({
        redirectTo: "/login",
        when: "unauthenticated",
        preserveRedirect: true,
    });
    const { locale } = useI18n(),
        es = locale === "es";
    const [characters, setCharacters] = useState<Character[]>([]),
        [regions, setRegions] = useState<Region[]>([]),
        [region, setRegion] = useState(""),
        [admission, setAdmission] = useState<Admission | null>(null),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(""),
        [unlocked, setUnlocked] = useState(false);
    const frame = useRef<HTMLIFrameElement>(null);
    async function load() {
        const r = await fetch("/api/ranked/characters", { cache: "no-store" }),
            data = await r.json();
        if (!r.ok) throw Error(data.error || "Could not load characters");
        setCharacters(data.characters);
        setRegions(data.regions);
        setRegion((old) => old || data.regions[0]?.id || "");
    }
    useEffect(() => {
        if (session) void load().catch((e) => setError(e.message));
    }, [session]);
    useEffect(() => {
        if (!admission) return;
        const origin = new URL(admission.url).origin;
        const receive = (event: MessageEvent) => {
            if (
                event.origin !== origin ||
                event.source !== frame.current?.contentWindow
            )
                return;
            if (event.data?.type === "aochain-ranked-ready")
                frame.current?.contentWindow?.postMessage(
                    {
                        type: "aochain-ranked-admission",
                        ticket: admission.ticket,
                    },
                    origin,
                );
            if (event.data?.type === "aochain-ranked-unlocked") {
                setUnlocked(true);
                void load().catch(() => {});
            }
        };
        window.addEventListener("message", receive);
        return () => window.removeEventListener("message", receive);
    }, [admission]);
    async function play(characterId: string) {
        setBusy(true);
        setError("");
        try {
            const r = await fetch("/api/ranked/admit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ characterId, region }),
                }),
                data = await r.json();
            if (!r.ok) throw Error(data.error || "Could not enter ranked");
            setUnlocked(false);
            setAdmission(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not enter ranked");
        } finally {
            setBusy(false);
        }
    }
    async function leave() {
        if (!admission) return;
        setBusy(true);
        try {
            const r = await fetch("/api/ranked/cancel", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lockId: admission.lockId }),
                }),
                data = await r.json();
            if (!r.ok) throw Error(data.error || "Forfeit before leaving");
            setAdmission(null);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Forfeit before leaving");
        } finally {
            setBusy(false);
        }
    }
    if (loading || !session)
        return (
            <main className="player-portal">
                <p role="status">
                    {es ? "Verificando tu cuenta…" : "Checking your account…"}
                </p>
            </main>
        );
    return (
        <main className="player-portal">
            <header className="portal-page-heading">
                <div>
                    <p className="portal-eyebrow">AOCHAIN / RANKED</p>
                    <h1>{es ? "Arena 1 contra 1" : "Ranked arena"}</h1>
                    <p>
                        {es
                            ? "Nivel 50, equipo newbie y hechizos válidos para tu clase. Tu inventario guardado no cambia."
                            : "Level 50, newbie equipment and valid spells for your class. Your saved inventory stays unchanged."}
                    </p>
                </div>
                <Link href="/profile">{es ? "Perfil" : "Profile"}</Link>
            </header>
            {admission ? (
                <>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 16,
                            marginBottom: 16,
                        }}
                    >
                        <p role="status">
                            {unlocked
                                ? es
                                    ? "Personaje disponible."
                                    : "Character unlocked."
                                : es
                                  ? "El personaje está reservado hasta cancelar o terminar la partida."
                                  : "Character reserved until search cancellation or match completion."}
                        </p>
                        <button
                            className="realm-button quiet"
                            disabled={busy}
                            onClick={() =>
                                unlocked ? setAdmission(null) : void leave()
                            }
                        >
                            {es
                                ? "Volver a personajes"
                                : "Return to characters"}
                        </button>
                    </div>
                    <iframe
                        ref={frame}
                        title="AOCHAIN arena"
                        src={new URL("/ranked", admission.url).toString()}
                        style={{
                            width: "100%",
                            height: "min(900px,85dvh)",
                            minHeight: 540,
                            border: "1px solid #34515d",
                            borderRadius: 16,
                        }}
                        allow="fullscreen"
                    />
                </>
            ) : (
                <>
                    <label>
                        {es ? "Región" : "Region"}{" "}
                        <select
                            value={region}
                            onChange={(e) => setRegion(e.target.value)}
                            disabled={busy}
                        >
                            {regions.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.id}
                                </option>
                            ))}
                        </select>
                    </label>
                    {!regions.length && (
                        <p role="status">
                            {es
                                ? "Los servidores regionales todavía no están configurados."
                                : "Regional servers are not configured yet."}
                        </p>
                    )}
                    <section
                        style={{
                            display: "grid",
                            gridTemplateColumns:
                                "repeat(auto-fit,minmax(240px,1fr))",
                            gap: 20,
                            marginTop: 24,
                        }}
                    >
                        {characters.map((c) => {
                            const available =
                                c.chain_state === "staked" &&
                                !c.economy_lock &&
                                !c.connected;
                            return (
                                <article
                                    key={c.id}
                                    style={{
                                        padding: 24,
                                        border: "1px solid #34515d",
                                        borderRadius: 16,
                                    }}
                                >
                                    <h2>{c.name}</h2>
                                    <p>
                                        {c.economy_lock || c.connected
                                            ? es
                                                ? "En uso o reservado"
                                                : "In use or reserved"
                                            : c.chain_state !== "staked"
                                              ? es
                                                  ? "Primero depositá y stakeá el personaje"
                                                  : "Deposit and stake this character first"
                                              : es
                                                ? "Listo para jugar"
                                                : "Ready to play"}
                                    </p>
                                    <p>
                                        {es
                                            ? "Preset PvP · Nivel 50 · Equipo newbie"
                                            : "PvP preset · Level 50 · Newbie equipment"}
                                    </p>
                                    <button
                                        className="realm-button"
                                        disabled={busy || !available || !region}
                                        onClick={() => void play(c.id)}
                                    >
                                        {es ? "Jugar ranked" : "Play ranked"}
                                    </button>
                                </article>
                            );
                        })}
                    </section>
                </>
            )}
            {error && (
                <PortalModal
                    title={
                        es ? "Revisá tu personaje" : "Character needs attention"
                    }
                    onClose={() => setError("")}
                >
                    <p role="alert">{error}</p>
                </PortalModal>
            )}
        </main>
    );
}
