"use client";

import { LocalizedText, LocalizedLabel } from '@/components/LocalizedText';
import React from "react";
import type { PlayerHudState } from "../lib/aowProtocol";
import type { RuntimeTimingConfig } from "../lib/runtime-config";

const HUNTER_CLASS_ID = 9;

type BuffStatusSidebarProps = {
    hud: PlayerHudState | null;
    runtimeTiming: RuntimeTimingConfig;
};

type StatusEntry = {
    key: string;
    label: string;
    seconds: number;
    progress: number;
    accent: string;
    iconSrc: string;
};

type TimedStatusKey =
    | "invisibleSpell"
    | "hiddenSkill"
    | "paralizado"
    | "inmovilizado";

type TimedStatusFlags = Record<TimedStatusKey, boolean>;

type TimedStatusExpiry = Record<TimedStatusKey, number>;

type BuffStatusKey = "fuerza" | "agilidad";

type BuffStatusExpiry = Record<BuffStatusKey, number>;

function formatSecondsLabel(totalSeconds: number): string {
    const safeSeconds = Math.max(0, totalSeconds);
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;

    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function clampProgress(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.min(1, Math.max(0, value));
}

function getHiddenSkillDurationMs(skill: number, classId?: number): number {
    const normalizedSkill = Math.max(0, Number(skill) || 0);
    const interval = 500;
    const missingSkill = 100 - normalizedSkill;
    let durationCounter =
        (-0.000001 * missingSkill ** 3 +
            0.00009229 * missingSkill ** 2 +
            -0.0088 * missingSkill +
            0.9571) *
        interval;

    if (classId === HUNTER_CLASS_ID) {
        durationCounter = Math.floor(durationCounter / 2);
    } else {
        durationCounter = Math.floor(durationCounter / 3);
    }

    return Math.max(1000, durationCounter * 40);
}

export default function BuffStatusSidebar({
    hud,
    runtimeTiming,
}: BuffStatusSidebarProps) {
    const hasHud = Boolean(hud);
    const [now, setNow] = React.useState(() => Date.now());
    const [buffExpiryAt, setBuffExpiryAt] = React.useState<BuffStatusExpiry>({
        fuerza: 0,
        agilidad: 0,
    });
    const [timedStatusExpiryAt, setTimedStatusExpiryAt] =
        React.useState<TimedStatusExpiry>({
            invisibleSpell: 0,
            hiddenSkill: 0,
            paralizado: 0,
            inmovilizado: 0,
        });
    const previousTimedFlagsRef = React.useRef<TimedStatusFlags>({
        invisibleSpell: false,
        hiddenSkill: false,
        paralizado: false,
        inmovilizado: false,
    });

    React.useEffect(() => {
        const interval = window.setInterval(() => {
            setNow(Date.now());
        }, 1000);

        return () => window.clearInterval(interval);
    }, []);

    React.useEffect(() => {
        const currentNow = Date.now();

        setBuffExpiryAt({
            fuerza:
                (hud?.buffFuerzaSeconds ?? 0) > 0
                    ? currentNow + (hud?.buffFuerzaSeconds ?? 0) * 1000
                    : 0,
            agilidad:
                (hud?.buffAgilidadSeconds ?? 0) > 0
                    ? currentNow + (hud?.buffAgilidadSeconds ?? 0) * 1000
                    : 0,
        });
    }, [
        hud?.buffAgilidadSeconds,
        hud?.buffAgilidadUpdatedAt,
        hud?.buffFuerzaSeconds,
        hud?.buffFuerzaUpdatedAt,
    ]);

    React.useEffect(() => {
        if (!hasHud || !hud || hud.dead) {
            previousTimedFlagsRef.current = {
                invisibleSpell: false,
                hiddenSkill: false,
                paralizado: false,
                inmovilizado: false,
            };
            setBuffExpiryAt({
                fuerza: 0,
                agilidad: 0,
            });
            setTimedStatusExpiryAt({
                invisibleSpell: 0,
                hiddenSkill: 0,
                paralizado: 0,
                inmovilizado: 0,
            });
            return;
        }

        const nextFlags: TimedStatusFlags = {
            invisibleSpell: Boolean(hud.invisibleSpell),
            hiddenSkill: Boolean(hud.hiddenSkill),
            paralizado: Boolean(hud.paralizado),
            inmovilizado: Boolean(hud.inmovilizado),
        };
        const hiddenSkillDurationMs = getHiddenSkillDurationMs(
            Math.min(100, Number(hud.level ?? 0) * 3),
            hud.idClase,
        );
        const reportedInvisibilityRemainingMs = Math.max(
            0,
            Number(hud.invisibleSpellRemainingMs ?? 0),
        );
        const reportedInvisibilityUpdatedAt = Math.max(
            0,
            Number(hud.invisibleSpellUpdatedAt ?? 0),
        );
        const reportedInvisibilityExpiryAt =
            reportedInvisibilityRemainingMs > 0 &&
            reportedInvisibilityUpdatedAt > 0
                ? reportedInvisibilityUpdatedAt +
                  reportedInvisibilityRemainingMs
                : 0;
        const nextDurations = {
            invisibleSpell: runtimeTiming.statusDurations.invisibilitySpellMs,
            hiddenSkill: hiddenSkillDurationMs,
            paralizado: runtimeTiming.statusDurations.crowdControlUserMs,
            inmovilizado: runtimeTiming.statusDurations.crowdControlUserMs,
        };
        const currentFlags = previousTimedFlagsRef.current;
        const currentNow = Date.now();

        setTimedStatusExpiryAt((currentExpiryAt) => {
            let changed = false;
            const nextExpiryAt = { ...currentExpiryAt };

            for (const key of Object.keys(nextFlags) as TimedStatusKey[]) {
                if (!nextFlags[key]) {
                    if (nextExpiryAt[key] !== 0) {
                        nextExpiryAt[key] = 0;
                        changed = true;
                    }
                    continue;
                }

                // Start the estimated timer only on the inactive -> active edge.
                // If the server clears the flag a tick later than our estimate,
                // rearming here causes the icon to flash back for a moment.
                if (!currentFlags[key]) {
                    nextExpiryAt[key] =
                        key === "invisibleSpell" &&
                        reportedInvisibilityExpiryAt > 0
                            ? reportedInvisibilityExpiryAt
                            : currentNow + nextDurations[key];
                    changed = true;
                    continue;
                }

                if (
                    key === "invisibleSpell" &&
                    reportedInvisibilityExpiryAt > 0
                ) {
                    // Rearm only when a fresh server sync pushes the expiry farther
                    // into the future, which is what happens on invisibility recast.
                    if (
                        reportedInvisibilityExpiryAt >
                        nextExpiryAt.invisibleSpell + 750
                    ) {
                        nextExpiryAt.invisibleSpell =
                            reportedInvisibilityExpiryAt;
                        changed = true;
                    }
                }
            }

            return changed ? nextExpiryAt : currentExpiryAt;
        });

        previousTimedFlagsRef.current = nextFlags;
    }, [
        hasHud,
        hud?.dead,
        hud?.inmovilizado,
        hud?.hiddenSkill,
        hud?.idClase,
        hud?.level,
        hud?.invisibleSpell,
        hud?.invisibleSpellRemainingMs,
        hud?.invisibleSpellUpdatedAt,
        hud?.paralizado,
        runtimeTiming.statusDurations.crowdControlUserMs,
        runtimeTiming.statusDurations.invisibilitySpellMs,
    ]);

    const entries = React.useMemo<StatusEntry[]>(() => {
        if (!hud || hud.dead) {
            return [];
        }

        const forceSeconds =
            buffExpiryAt.fuerza > 0
                ? Math.max(0, Math.ceil((buffExpiryAt.fuerza - now) / 1000))
                : 0;
        const agilitySeconds =
            buffExpiryAt.agilidad > 0
                ? Math.max(0, Math.ceil((buffExpiryAt.agilidad - now) / 1000))
                : 0;
        const invisibilitySeconds = hud.invisibleSpell
            ? Math.max(
                  0,
                  Math.ceil((timedStatusExpiryAt.invisibleSpell - now) / 1000),
              )
            : 0;
        const hiddenSkillSeconds = hud.hiddenSkill
            ? Math.max(
                  0,
                  Math.ceil((timedStatusExpiryAt.hiddenSkill - now) / 1000),
              )
            : 0;
        const hiddenSkillDurationMs = getHiddenSkillDurationMs(
            Math.min(100, Number(hud.level ?? 0) * 3),
            hud.idClase,
        );
        const paralyzedSeconds = hud.paralizado
            ? Math.max(
                  0,
                  Math.ceil((timedStatusExpiryAt.paralizado - now) / 1000),
              )
            : 0;
        const immobilizedSeconds = hud.inmovilizado
            ? Math.max(
                  0,
                  Math.ceil((timedStatusExpiryAt.inmovilizado - now) / 1000),
              )
            : 0;

        return [
            {
                key: "fuerza",
                label: "Fza",
                seconds: forceSeconds,
                progress: clampProgress(
                    (forceSeconds * 1000) /
                        runtimeTiming.statusDurations.fuerzaAgilidadBuffMs,
                ),
                accent: "rgba(248, 113, 113, 0.98)",
                iconSrc: "/imgs/spells/fuerza.png",
            },
            {
                key: "agilidad",
                label: "Agi",
                seconds: agilitySeconds,
                progress: clampProgress(
                    (agilitySeconds * 1000) /
                        runtimeTiming.statusDurations.fuerzaAgilidadBuffMs,
                ),
                accent: "rgba(74, 222, 128, 0.98)",
                iconSrc: "/imgs/spells/agilidad.png",
            },
            {
                key: "invisibilidad",
                label: "Invi",
                seconds: invisibilitySeconds,
                progress: clampProgress(
                    (invisibilitySeconds * 1000) /
                        runtimeTiming.statusDurations.invisibilitySpellMs,
                ),
                accent: "rgba(96, 165, 250, 0.98)",
                iconSrc: "/imgs/spells/invisibilidad.png",
            },
            {
                key: "ocultar",
                label: "Ocult",
                seconds: hiddenSkillSeconds,
                progress: clampProgress(
                    (hiddenSkillSeconds * 1000) / hiddenSkillDurationMs,
                ),
                accent: "rgba(167, 139, 250, 0.98)",
                iconSrc: "/imgs/spells/invisibilidad.png",
            },
            {
                key: "paralizado",
                label: "Paral",
                seconds: paralyzedSeconds,
                progress: clampProgress(
                    (paralyzedSeconds * 1000) /
                        runtimeTiming.statusDurations.crowdControlUserMs,
                ),
                accent: "rgba(244, 114, 182, 0.98)",
                iconSrc: "/imgs/spells/paralisis.png",
            },
            {
                key: "inmovilizado",
                label: "Inmo",
                seconds: immobilizedSeconds,
                progress: clampProgress(
                    (immobilizedSeconds * 1000) /
                        runtimeTiming.statusDurations.crowdControlUserMs,
                ),
                accent: "rgba(250, 204, 21, 0.98)",
                iconSrc: "/imgs/spells/inmovilizar.png",
            },
        ].filter((entry) => entry.seconds > 0);
    }, [
        buffExpiryAt.agilidad,
        buffExpiryAt.fuerza,
        hud,
        now,
        runtimeTiming,
        timedStatusExpiryAt,
    ]);

    if (!entries.length) {
        return null;
    }

    return (
        <div className="pointer-events-none absolute left-2 top-2 z-20 flex flex-col gap-2 lg:-left-[72px] lg:top-0">
            {entries.map((entry) => {
                return (
                    <div
                        key={entry.key}
                        className="relative h-[60px] w-[60px] rounded-[18px] border border-white/10 bg-stone-950/95 p-[4px] shadow-[0_18px_36px_rgba(0,0,0,0.38)]"
                    >
                        <div className="absolute inset-[4px] overflow-hidden rounded-[14px] bg-stone-900/95">
                            <LocalizedLabel><img
                                src={entry.iconSrc}
                                alt=""
                                className="h-full w-full object-cover opacity-75"
                                draggable={false}
                            /></LocalizedLabel>
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.14),transparent_52%),linear-gradient(180deg,rgba(12,10,9,0.12),rgba(12,10,9,0.8))]" />
                            <div
                                className="absolute inset-x-0 top-0 px-1.5 pt-1 text-[9px] font-semibold uppercase tracking-[0.18em]"
                                style={{ color: entry.accent }}
                            >
                                <LocalizedText source={entry.label} />
                            </div>
                            <div className="absolute inset-x-0 bottom-0 px-1.5 pb-1 text-center text-[11px] font-semibold text-stone-50 drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]">
                                {formatSecondsLabel(entry.seconds)}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
