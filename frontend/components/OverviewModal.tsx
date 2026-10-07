"use client";

import { LocalizedText, LocalizedLabel } from '@/components/LocalizedText';
import React from "react";
import type { PanelRow, PanelSnapshot } from "../lib/aowProtocol";

type OverviewModalProps = {
    snapshot: PanelSnapshot | null;
    isOpen: boolean;
    isRefreshing: boolean;
    onClose: () => void;
    onRefresh: () => void;
};

type SortKey =
    | "name"
    | "onlineMs"
    | "totalPackets"
    | "nonPingPackets"
    | "pingPackets"
    | "css"
    | "odh"
    | "frh"
    | "fph"
    | "rth"
    | "csh"
    | "oaa"
    | "oau"
    | "oan"
    | "avgSessionPpm"
    | "pps5"
    | "pps60"
    | "peakPps1s"
    | "burstSecondsOver10Pps1m"
    | "minRecentPacketIntervalMs"
    | "medianRecentPacketIntervalMs"
    | "p95RecentPacketIntervalMs"
    | "burstUnder10Pct"
    | "burstUnder20Pct"
    | "intervalsSampleSize"
    | "baselineRatioPps60";

type SortDirection = "desc" | "asc";
const PAGE_SIZE = 24;

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
    { value: "name", label: "Nombre" },
    { value: "css", label: "Score C" },
    { value: "frh", label: "Auto R" },
    { value: "fph", label: "Auto P" },
    { value: "rth", label: "Target R" },
    { value: "csh", label: "Spell C" },
    { value: "odh", label: "FDV confirmados" },
    { value: "pps60", label: "PPS 60s" },
    { value: "pps5", label: "PPS 5s" },
    { value: "peakPps1s", label: "Pico 1s" },
    { value: "avgSessionPpm", label: "Promedio sesion" },
    { value: "baselineRatioPps60", label: "Ratio baseline" },
    { value: "totalPackets", label: "Paquetes totales" },
    { value: "nonPingPackets", label: "Sin ping" },
    { value: "pingPackets", label: "Ping" },
    { value: "oaa", label: "Ataques FDV" },
    { value: "oau", label: "FDV a users" },
    { value: "oan", label: "FDV a npcs" },
    { value: "onlineMs", label: "Tiempo online" },
    { value: "burstSecondsOver10Pps1m", label: "Segundos >10pps" },
    { value: "burstUnder20Pct", label: "% <=20ms" },
    { value: "burstUnder10Pct", label: "% <=10ms" },
    { value: "minRecentPacketIntervalMs", label: "Min intervalo" },
    { value: "medianRecentPacketIntervalMs", label: "Mediana intervalo" },
    { value: "p95RecentPacketIntervalMs", label: "P95 intervalo" },
    { value: "intervalsSampleSize", label: "Tamano muestra" },
];

function formatDuration(ms: number) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
}

function getRisk(entry: PanelRow, baselinePps60: number) {
    const ratio =
        baselinePps60 > 0
            ? entry.pps60 / baselinePps60
            : entry.baselineRatioPps60;

    if (
        entry.css >= 60 ||
        entry.frh >= 2 ||
        (entry.css >= 40 &&
            (entry.fph >= 1 || entry.rth >= 1 || entry.odh >= 2))
    ) {
        return {
            label: "alto riesgo",
            tone: "border-rose-300/30 bg-rose-400/12 text-rose-100",
            accent: "text-rose-200",
        };
    }

    if (
        entry.css >= 20 ||
        entry.odh >= 1 ||
        entry.frh >= 1 ||
        entry.fph >= 1 ||
        entry.rth >= 1 ||
        entry.csh >= 1
    ) {
        return {
            label: "revisar",
            tone: "border-amber-300/30 bg-amber-300/12 text-amber-50",
            accent: "text-amber-200",
        };
    }

    if (
        entry.pps60 >= 10 ||
        entry.peakPps1s >= 12 ||
        entry.burstUnder20Pct >= 35 ||
        (ratio >= 2.2 && entry.burstUnder20Pct >= 20)
    ) {
        return {
            label: "alto riesgo",
            tone: "border-rose-300/30 bg-rose-400/12 text-rose-100",
            accent: "text-rose-200",
        };
    }

    if (
        entry.pps60 >= 7 ||
        entry.peakPps1s >= 9 ||
        entry.burstUnder20Pct >= 18 ||
        entry.burstSecondsOver10Pps1m >= 3 ||
        ratio >= 1.6
    ) {
        return {
            label: "revisar",
            tone: "border-amber-300/30 bg-amber-300/12 text-amber-50",
            accent: "text-amber-200",
        };
    }

    return {
        label: "normal",
        tone: "border-emerald-300/25 bg-emerald-300/10 text-emerald-50",
        accent: "text-emerald-200",
    };
}

function renderTypeShare(entry: PanelRow) {
    if (entry.topPacketTypes.length === 0) {
        return "sin muestra";
    }

    return entry.topPacketTypes
        .map((item) => `${item.type} ${item.percentage}%`)
        .join(" | ");
}

export default function OverviewModal({
    snapshot,
    isOpen,
    isRefreshing,
    onClose,
    onRefresh,
}: OverviewModalProps) {
    const [nameFilter, setNameFilter] = React.useState("");
    const [sortKey, setSortKey] = React.useState<SortKey>("css");
    const [sortDirection, setSortDirection] =
        React.useState<SortDirection>("desc");
    const [page, setPage] = React.useState(1);

    React.useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    const sampledAtLabel = snapshot
        ? new Date(snapshot.sampledAt).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
          })
        : "--:--:--";

    const visibleEntries = React.useMemo(() => {
        if (!snapshot) {
            return [];
        }

        const normalizedFilter = nameFilter.trim().toLowerCase();
        const filteredEntries = snapshot.entries.filter((entry) =>
            normalizedFilter.length === 0
                ? true
                : entry.name.toLowerCase().includes(normalizedFilter),
        );

        return [...filteredEntries].sort((left, right) => {
            const directionFactor = sortDirection === "desc" ? -1 : 1;

            if (sortKey === "name") {
                return (
                    left.name.localeCompare(right.name, "es", {
                        sensitivity: "base",
                    }) * directionFactor
                );
            }

            const leftValue = left[sortKey];
            const rightValue = right[sortKey];

            if (leftValue === rightValue) {
                return left.name.localeCompare(right.name, "es", {
                    sensitivity: "base",
                });
            }

            return (
                ((Number(leftValue) || 0) - (Number(rightValue) || 0)) *
                directionFactor
            );
        });
    }, [nameFilter, snapshot, sortDirection, sortKey]);

    React.useEffect(() => {
        setPage(1);
    }, [isOpen, nameFilter, sortDirection, sortKey, snapshot?.sampledAt]);

    const totalPages = Math.max(
        1,
        Math.ceil(visibleEntries.length / PAGE_SIZE),
    );
    const currentPage = Math.min(page, totalPages);
    const pagedEntries = React.useMemo(() => {
        const startIndex = (currentPage - 1) * PAGE_SIZE;
        return visibleEntries.slice(startIndex, startIndex + PAGE_SIZE);
    }, [currentPage, visibleEntries]);

    if (!isOpen) {
        return null;
    }

    return (
        <div className="game-modal-backdrop fixed inset-0 z-[97] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm">
            <div className="game-modal-panel flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-[30px] border border-[#6f5c39] bg-[radial-gradient(circle_at_top,#312418_0%,#17100c_42%,#080706_100%)] text-stone-100 shadow-[0_40px_140px_rgba(0,0,0,0.65)]">
                <div className="border-b border-amber-200/10 bg-black/20 px-6 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.34em] text-amber-300/75">
                                Panel
                            </p>
                            <h2 className="mt-2 text-2xl font-semibold text-[#f5ead2]"><LocalizedText source={"Panel de actividad "} /></h2>
                            <p className="mt-2 max-w-4xl text-sm text-stone-300/85"><LocalizedText source={"Vista resumida de actividad reciente para revisar patrones fuera de lo comun sin depender de la consola. "} /></p>
                        </div>

                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={onRefresh}
                                className="rounded-full border border-cyan-200/15 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100 transition hover:border-cyan-200/30 hover:bg-cyan-300/15"
                            >
                                <LocalizedText source={isRefreshing ? "Actualizando" : "Actualizar"} />
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-200 transition hover:border-white/20 hover:bg-white/10"
                            ><LocalizedText source={"Cerrar "} /></button>
                        </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                            <div className="text-[11px] uppercase tracking-[0.24em] text-stone-400">
                                Baseline pps60
                            </div>
                            <div className="mt-1 text-2xl font-semibold text-cyan-100">
                                {snapshot?.baselinePps60.toFixed(1) ?? "0.0"}
                            </div>
                            <div className="mt-1 text-xs text-stone-400"><LocalizedText source={"Promedio actual entre conectados. "} /></div>
                        </div>

                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                            <div className="text-[11px] uppercase tracking-[0.24em] text-stone-400"><LocalizedText source={"Muestra "} /></div>
                            <div className="mt-1 text-2xl font-semibold text-amber-100">
                                {snapshot?.entries.length ?? 0}
                            </div>
                            <div className="mt-1 text-xs text-stone-400"><LocalizedText source={"Jugadores analizados ahora. "} /></div>
                        </div>

                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                            <div className="text-[11px] uppercase tracking-[0.24em] text-stone-400"><LocalizedText source={"Ultima lectura "} /></div>
                            <div className="mt-1 text-2xl font-semibold text-fuchsia-100">
                                {sampledAtLabel}
                            </div>
                            <div className="mt-1 text-xs text-stone-400"><LocalizedText source={"Snapshot recibido desde el servidor. "} /></div>
                        </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(220px,0.7fr)_180px]">
                        <label className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-stone-300">
                            <div className="text-[11px] uppercase tracking-[0.24em] text-stone-500"><LocalizedText source={"Filtrar por nombre "} /></div>
                            <LocalizedLabel><input
                                value={nameFilter}
                                onChange={(event) =>
                                    setNameFilter(event.target.value)
                                }
                                placeholder="Buscar jugador..."
                                className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-stone-100 outline-none placeholder:text-stone-500 focus:border-cyan-200/30"
                            /></LocalizedLabel>
                        </label>

                        <label className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-stone-300">
                            <div className="text-[11px] uppercase tracking-[0.24em] text-stone-500"><LocalizedText source={"Ordenar por dato "} /></div>
                            <select
                                value={sortKey}
                                onChange={(event) =>
                                    setSortKey(event.target.value as SortKey)
                                }
                                className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-stone-100 outline-none focus:border-cyan-200/30"
                            >
                                {SORT_OPTIONS.map((option) => (
                                    <option
                                        key={option.value}
                                        value={option.value}
                                    >
                                        <LocalizedText source={option.label} />
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-stone-300">
                            <div className="text-[11px] uppercase tracking-[0.24em] text-stone-500"><LocalizedText source={"Orden "} /></div>
                            <select
                                value={sortDirection}
                                onChange={(event) =>
                                    setSortDirection(
                                        event.target.value as SortDirection,
                                    )
                                }
                                className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-stone-100 outline-none focus:border-cyan-200/30"
                            >
                                <option value="desc"><LocalizedText source={"Mayor a menor"} /></option>
                                <option value="asc"><LocalizedText source={"Menor a mayor"} /></option>
                            </select>
                        </label>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-stone-300">
                        <div>
                            {visibleEntries.length}<LocalizedText source={" resultados "} />{snapshot ? ` de ${snapshot.entries.length}` : ""}
                        </div>
                        <div><LocalizedText source={"Pagina "} />{currentPage}<LocalizedText source={" de "} />{totalPages}
                        </div>
                    </div>
                </div>

                <div className="overflow-y-auto px-6 py-6">
                    {!snapshot || snapshot.entries.length === 0 ? (
                        <div className="rounded-[26px] border border-white/8 bg-black/18 p-6 text-sm text-stone-300"><LocalizedText source={"No hay datos suficientes todavÃ­a. Proba de nuevo cuando haya jugadores activos enviando paquetes no-ping. "} /></div>
                    ) : visibleEntries.length === 0 ? (
                        <div className="rounded-[26px] border border-white/8 bg-black/18 p-6 text-sm text-stone-300"><LocalizedText source={"No hay jugadores que coincidan con ese filtro. "} /></div>
                    ) : (
                        <div className="grid gap-4 xl:grid-cols-2">
                            {pagedEntries.map((entry, index) => {
                                const risk = getRisk(
                                    entry,
                                    snapshot.baselinePps60,
                                );
                                const absoluteIndex =
                                    (currentPage - 1) * PAGE_SIZE + index + 1;

                                return (
                                    <article
                                        key={entry.name}
                                        className="rounded-[26px] border border-white/8 bg-black/18 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-xs uppercase tracking-[0.22em] text-stone-500">
                                                        #{absoluteIndex}
                                                    </span>
                                                    <h3 className="text-xl font-semibold text-stone-100">
                                                        {entry.name}
                                                    </h3>
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-300">
                                                    <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1">
                                                        online{" "}
                                                        {formatDuration(
                                                            entry.onlineMs,
                                                        )}
                                                    </span>
                                                    <span
                                                        className={`rounded-full border px-3 py-1 ${risk.tone}`}
                                                    >
                                                        <LocalizedText source={risk.label} />
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="text-right">
                                                <div
                                                    className={`text-sm font-semibold ${risk.accent}`}
                                                >
                                                    score=
                                                    {entry.css} | x
                                                    {entry.baselineRatioPps60.toFixed(
                                                        2,
                                                    )}{" "}<LocalizedText source={"del promedio "} /></div>
                                                <div className="mt-1 text-xs text-stone-400">
                                                    pps60=
                                                    {entry.pps60.toFixed(1)}<LocalizedText source={" | pico1s="} />{entry.peakPps1s}<LocalizedText source={" | confirmados= "} />{entry.odh +
                                                        entry.frh +
                                                        entry.fph +
                                                        entry.rth +
                                                        entry.csh}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                                                <div className="text-[11px] uppercase tracking-[0.22em] text-stone-500"><LocalizedText source={"Volumen "} /></div>
                                                <div className="mt-2 text-sm text-stone-200">
                                                    total={entry.totalPackets}
                                                </div>
                                                <div className="text-sm text-stone-300"><LocalizedText source={"sin ping= "} />{entry.nonPingPackets}
                                                </div>
                                                <div className="text-sm text-stone-400">
                                                    ping={entry.pingPackets}
                                                </div>
                                            </div>

                                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                                                <div className="text-[11px] uppercase tracking-[0.22em] text-stone-500"><LocalizedText source={"Ritmo "} /></div>
                                                <div className="mt-2 text-sm text-stone-200"><LocalizedText source={"avgSesion= "} />{entry.avgSessionPpm.toFixed(
                                                        1,
                                                    )}{" "}
                                                    ppm
                                                </div>
                                                <div className="text-sm text-stone-300">
                                                    pps5={entry.pps5.toFixed(1)}
                                                </div>
                                                <div className="text-sm text-stone-400">
                                                    pps60=
                                                    {entry.pps60.toFixed(1)}
                                                </div>
                                            </div>

                                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                                                <div className="text-[11px] uppercase tracking-[0.22em] text-stone-500"><LocalizedText source={"Rafagas "} /></div>
                                                <div className="mt-2 text-sm text-stone-200"><LocalizedText source={"pico1s="} />{entry.peakPps1s}
                                                </div>
                                                <div className="text-sm text-stone-300"><LocalizedText source={"segs&gt;10pps= "} />{
                                                        entry.burstSecondsOver10Pps1m
                                                    }
                                                </div>
                                                <div className="text-sm text-stone-400">
                                                    &lt;20ms=
                                                    {entry.burstUnder20Pct.toFixed(
                                                        1,
                                                    )}
                                                    %
                                                </div>
                                            </div>

                                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                                                <div className="text-[11px] uppercase tracking-[0.22em] text-stone-500">
                                                    CS
                                                </div>
                                                <div className="mt-2 text-sm text-stone-200">
                                                    score=
                                                    {entry.css}
                                                </div>
                                                <div className="text-sm text-stone-300">
                                                    AR=
                                                    {entry.frh}
                                                </div>
                                                <div className="text-sm text-stone-400">
                                                    AP=
                                                    {entry.fph}
                                                </div>
                                            </div>

                                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                                                <div className="text-[11px] uppercase tracking-[0.22em] text-stone-500">
                                                    FDV
                                                </div>
                                                <div className="mt-2 text-sm text-stone-200">
                                                    total=
                                                    {entry.oaa}
                                                </div>
                                                <div className="text-sm text-stone-300">
                                                    users=
                                                    {entry.oau}
                                                </div>
                                                <div className="text-sm text-stone-400">
                                                    npcs=
                                                    {entry.oan}
                                                </div>
                                                <div className="text-sm text-cyan-200"><LocalizedText source={"confirmados= "} />{entry.odh}
                                                </div>
                                            </div>

                                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                                                <div className="text-[11px] uppercase tracking-[0.22em] text-stone-500"><LocalizedText source={"Reacciones "} /></div>
                                                <div className="mt-2 text-sm text-stone-200"><LocalizedText source={"targetReactivo= "} />{entry.rth}
                                                </div>
                                                <div className="text-sm text-stone-300"><LocalizedText source={"spellClavado= "} />{entry.csh}
                                                </div>
                                                <div className="text-sm text-stone-400">
                                                    AP=
                                                    {entry.fph}
                                                </div>
                                            </div>

                                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                                                <div className="text-[11px] uppercase tracking-[0.22em] text-stone-500"><LocalizedText source={"Intervalos "} /></div>
                                                <div className="mt-2 text-sm text-stone-200">
                                                    min=
                                                    {
                                                        entry.minRecentPacketIntervalMs
                                                    }
                                                    ms
                                                </div>
                                                <div className="text-sm text-stone-300">
                                                    med=
                                                    {
                                                        entry.medianRecentPacketIntervalMs
                                                    }
                                                    ms
                                                </div>
                                                <div className="text-sm text-stone-400">
                                                    p95=
                                                    {
                                                        entry.p95RecentPacketIntervalMs
                                                    }
                                                    ms
                                                </div>
                                            </div>

                                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 sm:col-span-2 xl:col-span-2">
                                                <div className="text-[11px] uppercase tracking-[0.22em] text-stone-500"><LocalizedText source={"Tipos dominantes "} /></div>
                                                <div className="mt-2 text-sm text-stone-200">
                                                    <LocalizedText source={renderTypeShare(entry)} />
                                                </div>
                                                <div className="mt-1 text-xs text-stone-400"><LocalizedText source={"Muestra de"} />{" "}
                                                    {entry.intervalsSampleSize}{" "}<LocalizedText source={"intervalos recientes no-ping. "} /></div>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}

                            {visibleEntries.length > PAGE_SIZE ? (
                                <div className="xl:col-span-2">
                                    <div className="flex flex-wrap items-center justify-center gap-3 rounded-[26px] border border-white/8 bg-black/18 p-4 text-sm text-stone-300">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setPage((current) =>
                                                    Math.max(1, current - 1),
                                                )
                                            }
                                            disabled={currentPage <= 1}
                                            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-200 transition enabled:hover:border-white/20 enabled:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                        ><LocalizedText source={"Anterior "} /></button>

                                        <span><LocalizedText source={"Pagina "} />{currentPage}<LocalizedText source={" de "} />{totalPages}
                                        </span>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                setPage((current) =>
                                                    Math.min(
                                                        totalPages,
                                                        current + 1,
                                                    ),
                                                )
                                            }
                                            disabled={currentPage >= totalPages}
                                            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-200 transition enabled:hover:border-white/20 enabled:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                        ><LocalizedText source={"Siguiente "} /></button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
