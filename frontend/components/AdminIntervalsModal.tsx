"use client";

import { LocalizedText } from '@/components/LocalizedText';
import React from "react";
import type { RuntimeTimingConfig } from "../lib/runtime-config";

type TimingField = {
    path: string;
    label: string;
    alias: string;
    description: string;
};

type TimingSection = {
    title: string;
    accent: string;
    fields: TimingField[];
};

type AdminIntervalsModalProps = {
    timing: RuntimeTimingConfig;
    isOpen: boolean;
    savingPath: string | null;
    onClose: () => void;
    onRefresh: () => void;
    onSave: (path: string, value: number) => void;
};

const TIMING_SECTIONS: TimingSection[] = [
    {
        title: "Motor y mundo",
        accent: "text-amber-200",
        fields: [
            {
                path: "gameplayTickMs",
                label: "Tick general",
                alias: "gameplay",
                description: "Loop principal del server.",
            },
            {
                path: "walkStepMs",
                label: "Paso al caminar",
                alias: "walk",
                description: "Movimiento local del cliente.",
            },
            {
                path: "playerStatusTickMs",
                label: "Estado del jugador",
                alias: "playerstatus",
                description: "Meditacion y buffs.",
            },
            {
                path: "fishingTickMs",
                label: "Pesca",
                alias: "fishing",
                description: "Frecuencia de intentos de pesca.",
            },
            {
                path: "npcThinkMs",
                label: "Pensamiento NPC",
                alias: "npcthink",
                description: "Chequeo de ataque y decision NPC.",
            },
        ],
    },
    {
        title: "Mantenimiento",
        accent: "text-cyan-200",
        fields: [
            {
                path: "idleCharacterTimeoutMs",
                label: "Idle timeout",
                alias: "idle",
                description: "Tiempo maximo antes de desconectar inactivos.",
            },
            {
                path: "idleCharacterSweepMs",
                label: "Barrido idle",
                alias: "idlesweep",
                description: "Cada cuanto se revisa inactividad.",
            },
            {
                path: "cleanupClosedCharactersMs",
                label: "Limpieza cerrados",
                alias: "cleanup",
                description: "Cada cuanto se limpian personajes cerrados.",
            },
            {
                path: "onlineStatsSnapshotMs",
                label: "Stats online",
                alias: "onlinestats",
                description: "Frecuencia de snapshot de usuarios online.",
            },
            {
                path: "worldSaveMs",
                label: "World save",
                alias: "worldsave",
                description: "Guardado global del mundo.",
            },
        ],
    },
    {
        title: "Cooldowns",
        accent: "text-emerald-200",
        fields: [
            {
                path: "actionCooldowns.dialogMs",
                label: "Dialogo",
                alias: "dialog",
                description: "Anti spam de dialogo.",
            },
            {
                path: "actionCooldowns.clickMs",
                label: "Click mapa",
                alias: "click",
                description:
                    "Cadencia de clicks sobre mapa para interacciones.",
            },
            {
                path: "actionCooldowns.doorToggleMs",
                label: "Puertas",
                alias: "doortoggle",
                description: "Cadencia de abrir y cerrar puertas.",
            },
            {
                path: "actionCooldowns.meleeMs",
                label: "Golpe",
                alias: "melee",
                description: "Cooldown de melee.",
            },
            {
                path: "actionCooldowns.rangeMs",
                label: "Arco",
                alias: "range",
                description: "Cooldown de rango.",
            },
            {
                path: "actionCooldowns.spellMs",
                label: "Hechizo",
                alias: "spell",
                description: "Cooldown de hechizos.",
            },
            {
                path: "actionCooldowns.meleeToSpellMs",
                label: "Golpe a hechizo",
                alias: "meleetospell",
                description: "Delay entre melee y spell.",
            },
            {
                path: "actionCooldowns.spellToMeleeMs",
                label: "Hechizo a golpe",
                alias: "spelltomelee",
                description: "Delay entre spell y melee.",
            },
            {
                path: "actionCooldowns.useItemMs",
                label: "Usar item",
                alias: "useitem",
                description: "Cadencia global de uso de items.",
            },
            {
                path: "actionCooldowns.meleeToUseItemMs",
                label: "Golpe a item",
                alias: "meleetouseitem",
                description: "Delay entre melee y usar item.",
            },
            {
                path: "actionCooldowns.dropItemMs",
                label: "Tirar item",
                alias: "dropitem",
                description: "Cadencia de tirar items al piso.",
            },
            {
                path: "actionCooldowns.equipToggleMs",
                label: "Equipar toggle",
                alias: "equiptoggle",
                description: "Cadencia de equipar y desequipar items.",
            },
        ],
    },
    {
        title: "Duraciones y telemetria",
        accent: "text-fuchsia-200",
        fields: [
            {
                path: "statusDurations.crowdControlUserMs",
                label: "CC usuario",
                alias: "crowdcontroluser",
                description: "Paralisis e inmovilidad en usuarios.",
            },
            {
                path: "statusDurations.crowdControlNpcMs",
                label: "CC NPC",
                alias: "crowdcontrolnpc",
                description: "Paralisis e inmovilidad en NPCs.",
            },
            {
                path: "statusDurations.fuerzaAgilidadBuffMs",
                label: "Buff fuerza/agilidad",
                alias: "fuerzaagilidadbuff",
                description: "Duracion de buffs.",
            },
            {
                path: "statusDurations.invisibilitySpellMs",
                label: "Invisibilidad",
                alias: "invisibility",
                description: "Duracion de invisibilidad magica.",
            },
            {
                path: "visualEffects.invisibilityFadeOutMs",
                label: "Invisibilidad fade out",
                alias: "invisibilityfadeout",
                description: "Tiempo en ocultarse dentro del ciclo visual.",
            },
            {
                path: "visualEffects.invisibilityFadeInMs",
                label: "Invisibilidad fade in",
                alias: "invisibilityfadein",
                description:
                    "Tiempo en volver a verse dentro del ciclo visual.",
            },
            {
                path: "visualEffects.invisibilityMinAlpha",
                label: "Invisibilidad alpha min",
                alias: "invisibilityalphamin",
                description: "Alpha minimo cuando llega a ocultarse.",
            },
            {
                path: "visualEffects.invisibilityMaxAlpha",
                label: "Invisibilidad alpha max",
                alias: "invisibilityalphamax",
                description: "Alpha maximo cuando vuelve a verse.",
            },
            {
                path: "statusDurations.npcAttackMs",
                label: "Ataque NPC",
                alias: "npcattack",
                description: "Cooldown de ataque de NPC.",
            },
        ],
    },
];

function getValueByPath(timing: RuntimeTimingConfig, path: string): number {
    return path.split(".").reduce<unknown>((current, segment) => {
        if (typeof current !== "object" || current === null) {
            return 0;
        }

        return (current as Record<string, unknown>)[segment];
    }, timing) as number;
}

function isAlphaField(path: string): boolean {
    return (
        path === "visualEffects.invisibilityMinAlpha" ||
        path === "visualEffects.invisibilityMaxAlpha"
    );
}

export default function AdminIntervalsModal({
    timing,
    isOpen,
    savingPath,
    onClose,
    onRefresh,
    onSave,
}: AdminIntervalsModalProps) {
    const [draftValues, setDraftValues] = React.useState<
        Record<string, string>
    >({});

    React.useEffect(() => {
        if (!isOpen) {
            return;
        }

        const nextDrafts: Record<string, string> = {};

        for (const section of TIMING_SECTIONS) {
            for (const field of section.fields) {
                nextDrafts[field.path] = String(
                    getValueByPath(timing, field.path),
                );
            }
        }

        setDraftValues(nextDrafts);
    }, [isOpen, timing]);

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

    if (!isOpen) {
        return null;
    }

    return (
        <div className="game-modal-backdrop fixed inset-0 z-[96] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
            <div className="game-modal-panel flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[30px] border border-[#6f5c39] bg-[radial-gradient(circle_at_top,#3f311d_0%,#18110c_46%,#090807_100%)] text-stone-100 shadow-[0_40px_140px_rgba(0,0,0,0.65)]">
                <div className="border-b border-amber-200/10 bg-black/20 px-6 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.34em] text-amber-300/75">
                                Panel
                            </p>
                            <h2 className="mt-2 text-2xl font-semibold text-[#f5ead2]"><LocalizedText source={"Intervalos del servidor "} /></h2>
                            <p className="mt-2 max-w-3xl text-sm text-stone-300/85"><LocalizedText source={"Cambia timings en caliente. Cada guardado ejecuta el comando interno y actualiza server, DB y este cliente. "} /></p>
                        </div>

                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={onRefresh}
                                className="rounded-full border border-cyan-200/15 bg-cyan-300/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100 transition hover:border-cyan-200/30 hover:bg-cyan-300/15"
                            ><LocalizedText source={"Recargar "} /></button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-200 transition hover:border-white/20 hover:bg-white/10"
                            ><LocalizedText source={"Cerrar "} /></button>
                        </div>
                    </div>
                </div>

                <div className="grid gap-4 overflow-y-auto px-6 py-6 lg:grid-cols-2">
                    {TIMING_SECTIONS.map((section) => (
                        <section
                            key={section.title}
                            className="rounded-[26px] border border-white/8 bg-black/18 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                        >
                            <div className="mb-4">
                                <h3
                                    className={`text-lg font-semibold ${section.accent}`}
                                >
                                    <LocalizedText source={section.title} />
                                </h3>
                            </div>

                            <div className="space-y-3">
                                {section.fields.map((field) => {
                                    const currentValue = getValueByPath(
                                        timing,
                                        field.path,
                                    );
                                    const alphaField = isAlphaField(field.path);
                                    const draftValue =
                                        draftValues[field.path] ??
                                        String(currentValue);
                                    const parsedValue = Number(draftValue);
                                    const hasValidNumber =
                                        Number.isFinite(parsedValue) &&
                                        (alphaField
                                            ? parsedValue >= 0 &&
                                              parsedValue <= 1
                                            : parsedValue > 0);
                                    const isDirty =
                                        hasValidNumber &&
                                        Math.abs(parsedValue - currentValue) >
                                            0.0001;
                                    const isSaving = savingPath === field.path;

                                    return (
                                        <div
                                            key={field.path}
                                            className="rounded-2xl border border-white/8 bg-white/[0.03] p-3"
                                        >
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <div className="text-sm font-semibold text-stone-100">
                                                            <LocalizedText source={field.label} />
                                                        </div>
                                                        <span className="rounded-full border border-amber-200/10 bg-amber-200/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-amber-100/80">
                                                            {field.alias}
                                                        </span>
                                                    </div>
                                                    <div className="mt-1 text-xs text-stone-400">
                                                        <LocalizedText source={field.description} />
                                                    </div>
                                                    <div className="mt-1 text-[11px] text-stone-500">
                                                        `{field.path}<LocalizedText source={"` actual:"} />{" "}
                                                        {currentValue}
                                                        {alphaField
                                                            ? " alpha"
                                                            : " ms"}
                                                    </div>
                                                </div>

                                                <div className="flex min-w-[260px] flex-col items-end gap-2 sm:flex-row sm:items-center">
                                                    <input
                                                        type="number"
                                                        min={
                                                            alphaField
                                                                ? "0"
                                                                : "1"
                                                        }
                                                        max={
                                                            alphaField
                                                                ? "1"
                                                                : undefined
                                                        }
                                                        step={
                                                            alphaField
                                                                ? "0.001"
                                                                : "1"
                                                        }
                                                        value={draftValue}
                                                        onChange={(event) =>
                                                            setDraftValues(
                                                                (current) => ({
                                                                    ...current,
                                                                    [field.path]:
                                                                        event
                                                                            .target
                                                                            .value,
                                                                }),
                                                            )
                                                        }
                                                        className="w-full rounded-xl border border-white/10 bg-stone-950/80 px-3 py-2 text-right text-sm text-stone-100 outline-none transition focus:border-cyan-300/40"
                                                    />
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setDraftValues(
                                                                    (
                                                                        current,
                                                                    ) => ({
                                                                        ...current,
                                                                        [field.path]:
                                                                            String(
                                                                                currentValue,
                                                                            ),
                                                                    }),
                                                                )
                                                            }
                                                            disabled={
                                                                !isDirty ||
                                                                isSaving
                                                            }
                                                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                                        >
                                                            Reset
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                onSave(
                                                                    field.path,
                                                                    alphaField
                                                                        ? parsedValue
                                                                        : Math.round(
                                                                              parsedValue,
                                                                          ),
                                                                )
                                                            }
                                                            disabled={
                                                                !isDirty ||
                                                                !hasValidNumber ||
                                                                isSaving
                                                            }
                                                            className="rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-950 transition disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
                                                            style={{
                                                                background:
                                                                    "linear-gradient(135deg, #f7d488 0%, #d8aa57 100%)",
                                                            }}
                                                        >
                                                            <LocalizedText source={isSaving
                                                                ? "Guardando"
                                                                : "Aplicar"} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
}
