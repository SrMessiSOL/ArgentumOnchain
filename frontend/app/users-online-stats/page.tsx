"use client";

import { LocalizedText, LocalizedLabel } from '@/components/LocalizedText';
import { useEffect, useMemo, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { AuthErrorResponse } from "../../lib/auth";
import { formatNumber } from "../../lib/number-format";
import {
    type UserOnlineStat,
    type UserOnlineStatsResponse,
} from "../../lib/users-online-stats";

type DisplayUserOnlineStat = UserOnlineStat & {
    workersUsers: number;
};

type StatKey = "totalUsers" | "pveUsers" | "pvpUsers" | "workersUsers";

type ChartPoint = {
    x: number;
    y: number;
    value: number;
    label: string;
};

const statConfig: Array<{
    key: StatKey;
    label: string;
    shortLabel: string;
    color: string;
    glow: string;
}> = [
    {
        key: "totalUsers",
        label: "Total users",
        shortLabel: "Total",
        color: "#d7e3f4",
        glow: "rgba(215, 227, 244, 0.12)",
    },
    {
        key: "pveUsers",
        label: "PvE users",
        shortLabel: "PvE",
        color: "#7dd3a7",
        glow: "rgba(125, 211, 167, 0.12)",
    },
    {
        key: "pvpUsers",
        label: "PvP users",
        shortLabel: "PvP",
        color: "#d6a36d",
        glow: "rgba(214, 163, 109, 0.12)",
    },
    {
        key: "workersUsers",
        label: "Workers",
        shortLabel: "Workers",
        color: "#7ea6d8",
        glow: "rgba(126, 166, 216, 0.12)",
    },
];

const rangeOptions = [
    { label: "15m", hours: 0.25 },
    { label: "1h", hours: 1 },
    { label: "6h", hours: 6 },
    { label: "24h", hours: 24 },
    { label: "7d", hours: 168 },
    { label: "14d", hours: 336 },
    { label: "1m", hours: 720 },
] as const;

const CHART_WIDTH = 860;
const CHART_HEIGHT = 360;
const CHART_PADDING = {
    top: 18,
    right: 58,
    bottom: 40,
    left: 54,
};

function formatSampleLabel(value: string) {
    return new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
    }).format(new Date(value));
}

function formatTickLabel(value: string) {
    return new Intl.DateTimeFormat("en-US", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
    }).format(new Date(value));
}

function getNiceMax(value: number) {
    if (value <= 10) {
        return 10;
    }

    const roughStep = value / 4;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const normalized = roughStep / magnitude;

    let niceStep = magnitude;

    if (normalized > 5) {
        niceStep = 10 * magnitude;
    } else if (normalized > 2) {
        niceStep = 5 * magnitude;
    } else if (normalized > 1) {
        niceStep = 2 * magnitude;
    }

    return Math.ceil(value / niceStep) * niceStep;
}

function getSeriesPoints(
    stats: DisplayUserOnlineStat[],
    key: StatKey,
    maxValue: number,
) {
    const innerWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
    const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

    return stats.map((stat, index) => {
        const x =
            stats.length === 1
                ? CHART_PADDING.left + innerWidth / 2
                : CHART_PADDING.left +
                  (index / (stats.length - 1)) * innerWidth;
        const y =
            CHART_PADDING.top +
            innerHeight -
            (Math.max(stat[key], 0) / Math.max(maxValue, 1)) * innerHeight;

        return {
            x,
            y,
            value: stat[key],
            label: formatSampleLabel(stat.sampledMinute),
        };
    });
}

function buildLinePath(points: ChartPoint[]) {
    return points
        .map(
            (point, index) =>
                `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`,
        )
        .join(" ");
}

function getTickIndexes(length: number, totalTicks = 6) {
    if (length === 0) {
        return [] as number[];
    }

    const steps = Math.min(totalTicks, length);
    return Array.from({ length: steps }, (_, index) =>
        Math.min(
            length - 1,
            Math.round((index / Math.max(steps - 1, 1)) * (length - 1)),
        ),
    ).filter((value, index, values) => values.indexOf(value) === index);
}

export default function UsersOnlineStatsPage() {
    const [stats, setStats] = useState<UserOnlineStat[]>([]);
    const [isLoadingStats, setIsLoadingStats] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedRangeHours, setSelectedRangeHours] = useState<number>(0.25);
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const [visibleStats, setVisibleStats] = useState<Record<StatKey, boolean>>({
        totalUsers: true,
        pveUsers: true,
        pvpUsers: true,
        workersUsers: true,
    });

    useEffect(() => {
        let cancelled = false;

        const loadStats = async () => {
            setIsLoadingStats(true);
            setError(null);

            try {
                const response = await fetch(
                    `/api/users-online-stats?hours=${encodeURIComponent(String(selectedRangeHours))}`,
                    {
                        cache: "no-store",
                    },
                );
                const result = (await response.json()) as
                    | UserOnlineStatsResponse
                    | AuthErrorResponse;

                if (!response.ok || "error" in result) {
                    throw new Error(
                        "error" in result
                            ? result.error
                            : "No se pudieron cargar las estadisticas",
                    );
                }

                if (!cancelled) {
                    setStats(result.stats);
                    setHoveredIndex(
                        result.stats.length > 0
                            ? result.stats.length - 1
                            : null,
                    );
                }
            } catch (loadError) {
                if (!cancelled) {
                    setError(
                        loadError instanceof Error
                            ? loadError.message
                            : "No se pudieron cargar las estadisticas",
                    );
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingStats(false);
                }
            }
        };

        void loadStats();

        return () => {
            cancelled = true;
        };
    }, [selectedRangeHours]);

    const displayStats = useMemo<DisplayUserOnlineStat[]>(
        () =>
            stats.map((stat) => ({
                ...stat,
                workersUsers:
                    stat.fishingUsers +
                    stat.miningUsers +
                    stat.woodcuttingUsers,
            })),
        [stats],
    );
    const latestStat = displayStats.at(-1) ?? null;
    const peakTotal = useMemo(
        () =>
            displayStats.reduce(
                (max, stat) => Math.max(max, stat.totalUsers),
                0,
            ),
        [displayStats],
    );
    const latestLabel = latestStat
        ? formatSampleLabel(latestStat.sampledMinute)
        : "Sin datos";
    const activeSeries = statConfig.filter((entry) => visibleStats[entry.key]);
    const selectedRange =
        rangeOptions.find((option) => option.hours === selectedRangeHours) ??
        rangeOptions[0];

    const chartMax = useMemo(() => {
        const values = displayStats.flatMap((stat) => [
            stat.totalUsers,
            stat.pveUsers,
            stat.pvpUsers,
            stat.workersUsers,
        ]);

        return getNiceMax(values.length > 0 ? Math.max(...values, 0) : 0);
    }, [displayStats]);

    const yTicks = useMemo(() => {
        return Array.from({ length: 5 }, (_, index) => {
            const value = Math.round((chartMax / 4) * index);
            const innerHeight =
                CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
            const y =
                CHART_PADDING.top +
                innerHeight -
                (value / Math.max(chartMax, 1)) * innerHeight;

            return {
                value,
                y,
            };
        });
    }, [chartMax]);

    const seriesWithPoints = useMemo(
        () =>
            activeSeries.map((entry) => ({
                ...entry,
                points: getSeriesPoints(displayStats, entry.key, chartMax),
            })),
        [activeSeries, chartMax, displayStats],
    );

    const xTickIndexes = useMemo(
        () => getTickIndexes(displayStats.length, 6),
        [displayStats.length],
    );
    const hoveredStat =
        hoveredIndex !== null &&
        hoveredIndex >= 0 &&
        hoveredIndex < displayStats.length
            ? displayStats[hoveredIndex]
            : null;
    const hoveredLinePoint =
        hoveredIndex !== null && seriesWithPoints.length > 0
            ? (seriesWithPoints[0]?.points[hoveredIndex] ?? null)
            : null;

    const handleChartPointerMove = (
        event: ReactMouseEvent<SVGRectElement, MouseEvent>,
    ) => {
        if (displayStats.length === 0) {
            return;
        }

        const bounds = event.currentTarget.getBoundingClientRect();
        const relativeX = event.clientX - bounds.left;
        const ratio = Math.min(Math.max(relativeX / bounds.width, 0), 1);
        const nextIndex = Math.min(
            displayStats.length - 1,
            Math.round(ratio * Math.max(displayStats.length - 1, 0)),
        );

        setHoveredIndex(nextIndex);
    };

    return (
        <main className="min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_top,#1b3045,transparent_26%),radial-gradient(circle_at_bottom,#0f3a4f66,transparent_24%),linear-gradient(180deg,#111827,#18212d)] px-4 py-10 text-stone-100">
            <div className="mx-auto max-w-7xl space-y-5">
                {error ? (
                    <div className="rounded-2xl bg-rose-500/12 px-4 py-3 text-sm text-rose-200">
                        <LocalizedText source={error} />
                    </div>
                ) : null}

                <section className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-[18px] border border-white/8 bg-[#202734] px-6 py-5 shadow-xl">
                        <p className="text-5xl font-semibold leading-none text-white">
                            {formatNumber(latestStat?.totalUsers ?? 0)}
                        </p>
                        <p className="mt-2 text-lg text-stone-300">
                            players right now
                        </p>
                    </div>

                    <div className="rounded-[18px] border border-white/8 bg-[#202734] px-6 py-5 shadow-xl">
                        <p className="text-5xl font-semibold leading-none text-white">
                            {formatNumber(peakTotal)}
                        </p>
                        <p className="mt-2 text-lg text-stone-300">
                            <LocalizedText source={selectedRange.label} /> peak
                        </p>
                    </div>

                    <div className="rounded-[18px] border border-white/8 bg-[#202734] px-6 py-5 shadow-xl">
                        <p className="text-4xl font-semibold leading-none text-white md:text-5xl">
                            {formatNumber(displayStats.length)}
                        </p>
                        <p className="mt-2 text-lg text-stone-300">
                            samples in range
                        </p>
                    </div>
                </section>

                <section className="rounded-[20px] border border-white/8 bg-[#202734] p-4 shadow-2xl md:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 pb-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="text-sm font-medium text-stone-300"><LocalizedText source={"Rango "} /></span>
                            {rangeOptions.map((option) => (
                                <button
                                    key={option.hours}
                                    type="button"
                                    onClick={() =>
                                        setSelectedRangeHours(option.hours)
                                    }
                                    className={`rounded-xl border px-3 py-2 text-sm transition ${
                                        selectedRangeHours === option.hours
                                            ? "border-slate-300/30 bg-slate-200/10 text-white"
                                            : "border-white/10 bg-[#161d29] text-stone-300 hover:border-white/20"
                                    }`}
                                >
                                    <LocalizedText source={option.label} />
                                </button>
                            ))}

                            <span className="text-sm font-medium text-stone-300">
                                Series
                            </span>
                            {statConfig.map((entry) => (
                                <label
                                    key={entry.key}
                                    className="inline-flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-[#161d29] px-3 py-2 text-sm text-stone-200 transition hover:border-white/20"
                                >
                                    <input
                                        type="checkbox"
                                        checked={visibleStats[entry.key]}
                                        onChange={(event) =>
                                            setVisibleStats((current) => ({
                                                ...current,
                                                [entry.key]:
                                                    event.target.checked,
                                            }))
                                        }
                                        className="h-4 w-4 accent-slate-300"
                                    />
                                    <span
                                        className="inline-block h-2.5 w-2.5 rounded-full"
                                        style={{ backgroundColor: entry.color }}
                                    />
                                    <LocalizedText source={entry.label} />
                                </label>
                            ))}
                        </div>

                        <div className="text-sm text-stone-400"><LocalizedText source={"Ultima muestra:"} />{" "}
                            <span className="text-stone-200">
                                <LocalizedText source={latestLabel} />
                            </span>
                        </div>
                    </div>

                    <div className="mt-4 rounded-[18px] border border-white/8 bg-[#1b2230] p-3 md:p-4">
                        {isLoadingStats ? (
                            <div className="flex h-[420px] items-center justify-center text-sm text-stone-400"><LocalizedText source={"Cargando grafico... "} /></div>
                        ) : displayStats.length === 0 ? (
                            <div className="flex h-[420px] items-center justify-center text-sm text-stone-400"><LocalizedText source={"Todavía no hay muestras guardadas. "} /></div>
                        ) : activeSeries.length === 0 ? (
                            <div className="flex h-[420px] items-center justify-center text-sm text-stone-400"><LocalizedText source={"Activa al menos un check para ver la grafica. "} /></div>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <div className="min-w-[780px]">
                                        <LocalizedLabel><svg
                                            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                                            className="h-[420px] w-full"
                                            role="img"
                                            aria-label="Grafico de conexiones por segmento"
                                        >
                                            <rect
                                                x="0"
                                                y="0"
                                                width={CHART_WIDTH}
                                                height={CHART_HEIGHT}
                                                fill="#1b2230"
                                                rx="18"
                                            />

                                            {yTicks.map((tick) => (
                                                <g key={tick.value}>
                                                    <line
                                                        x1={CHART_PADDING.left}
                                                        x2={
                                                            CHART_WIDTH -
                                                            CHART_PADDING.right
                                                        }
                                                        y1={tick.y}
                                                        y2={tick.y}
                                                        stroke="rgba(255,255,255,0.08)"
                                                        strokeWidth="1"
                                                    />
                                                    <text
                                                        x={
                                                            CHART_PADDING.left -
                                                            12
                                                        }
                                                        y={tick.y + 4}
                                                        textAnchor="end"
                                                        fontSize="13"
                                                        fill="#9ca3af"
                                                    >
                                                        {formatNumber(
                                                            tick.value,
                                                        )}
                                                    </text>
                                                </g>
                                            ))}

                                            {xTickIndexes.map((tickIndex) => {
                                                const point =
                                                    seriesWithPoints[0]?.points[
                                                        tickIndex
                                                    ] ?? null;

                                                return (
                                                    <text
                                                        key={tickIndex}
                                                        x={
                                                            point?.x ??
                                                            CHART_PADDING.left
                                                        }
                                                        y={CHART_HEIGHT - 12}
                                                        textAnchor="middle"
                                                        fontSize="12"
                                                        fill="#9ca3af"
                                                    >
                                                        {formatTickLabel(
                                                            displayStats[
                                                                tickIndex
                                                            ].sampledMinute,
                                                        )}
                                                    </text>
                                                );
                                            })}

                                            {hoveredLinePoint ? (
                                                <line
                                                    x1={hoveredLinePoint.x}
                                                    x2={hoveredLinePoint.x}
                                                    y1={CHART_PADDING.top}
                                                    y2={
                                                        CHART_HEIGHT -
                                                        CHART_PADDING.bottom
                                                    }
                                                    stroke="rgba(255,255,255,0.16)"
                                                    strokeWidth="1"
                                                    strokeDasharray="4 4"
                                                />
                                            ) : null}

                                            {seriesWithPoints.map((series) => {
                                                const latestPoint =
                                                    series.points.at(-1);
                                                const hoveredPoint =
                                                    hoveredIndex !== null
                                                        ? (series.points[
                                                              hoveredIndex
                                                          ] ?? null)
                                                        : null;

                                                return (
                                                    <g key={series.key}>
                                                        <path
                                                            d={buildLinePath(
                                                                series.points,
                                                            )}
                                                            fill="none"
                                                            stroke={
                                                                series.color
                                                            }
                                                            strokeWidth="2.25"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        />

                                                        {latestPoint ? (
                                                            <>
                                                                <circle
                                                                    cx={
                                                                        latestPoint.x
                                                                    }
                                                                    cy={
                                                                        latestPoint.y
                                                                    }
                                                                    r="5"
                                                                    fill={
                                                                        series.color
                                                                    }
                                                                    stroke="#ffffff"
                                                                    strokeWidth="2"
                                                                />
                                                                <text
                                                                    x={Math.min(
                                                                        latestPoint.x +
                                                                            14,
                                                                        CHART_WIDTH -
                                                                            10,
                                                                    )}
                                                                    y={
                                                                        latestPoint.y -
                                                                        10
                                                                    }
                                                                    fontSize="13"
                                                                    fill={
                                                                        series.color
                                                                    }
                                                                >
                                                                    {
                                                                        series.shortLabel
                                                                    }{" "}
                                                                    {formatNumber(
                                                                        latestPoint.value,
                                                                    )}
                                                                </text>
                                                            </>
                                                        ) : null}

                                                        {hoveredPoint ? (
                                                            <circle
                                                                cx={
                                                                    hoveredPoint.x
                                                                }
                                                                cy={
                                                                    hoveredPoint.y
                                                                }
                                                                r="4"
                                                                fill={
                                                                    series.color
                                                                }
                                                                stroke="#111827"
                                                                strokeWidth="2"
                                                            />
                                                        ) : null}
                                                    </g>
                                                );
                                            })}

                                            <rect
                                                x={CHART_PADDING.left}
                                                y={CHART_PADDING.top}
                                                width={
                                                    CHART_WIDTH -
                                                    CHART_PADDING.left -
                                                    CHART_PADDING.right
                                                }
                                                height={
                                                    CHART_HEIGHT -
                                                    CHART_PADDING.top -
                                                    CHART_PADDING.bottom
                                                }
                                                fill="transparent"
                                                onMouseMove={
                                                    handleChartPointerMove
                                                }
                                                onMouseLeave={() =>
                                                    setHoveredIndex(
                                                        displayStats.length > 0
                                                            ? displayStats.length -
                                                                  1
                                                            : null,
                                                    )
                                                }
                                            />
                                        </svg></LocalizedLabel>
                                    </div>
                                </div>

                                {hoveredStat && hoveredLinePoint ? (
                                    <div className="mt-4 rounded-[16px] border border-white/8 bg-[#151b26] px-4 py-3 text-sm text-stone-200">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <span className="font-medium text-white">
                                                {formatSampleLabel(
                                                    hoveredStat.sampledMinute,
                                                )}
                                            </span>
                                            <span className="text-stone-400"><LocalizedText source={"Tooltip activo sobre la muestra seleccionada "} /></span>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                                            {statConfig.map((entry) => (
                                                <div
                                                    key={entry.key}
                                                    className="flex items-center gap-2"
                                                >
                                                    <span
                                                        className="inline-block h-2.5 w-2.5 rounded-full"
                                                        style={{
                                                            backgroundColor:
                                                                entry.color,
                                                        }}
                                                    />
                                                    <span><LocalizedText source={entry.label} /></span>
                                                    <span className="font-semibold text-white">
                                                        {formatNumber(
                                                            hoveredStat[
                                                                entry.key
                                                            ],
                                                        )}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}

                                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/8 pt-4 text-sm text-stone-300">
                                    {seriesWithPoints.map((series) => {
                                        const currentValue =
                                            latestStat?.[series.key] ?? 0;
                                        return (
                                            <div
                                                key={series.key}
                                                className="flex items-center gap-2"
                                            >
                                                <span
                                                    className="inline-block h-2.5 w-2.5 rounded-full"
                                                    style={{
                                                        backgroundColor:
                                                            series.color,
                                                    }}
                                                />
                                                <span><LocalizedText source={series.label} /></span>
                                                <span className="font-semibold text-white">
                                                    {formatNumber(currentValue)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                </section>

                <section className="grid gap-4 lg:grid-cols-4">
                    <div className="rounded-[18px] border border-white/8 bg-[#202734] p-5 shadow-xl lg:col-span-1">
                        <p className="text-[11px] uppercase tracking-[0.28em] text-stone-400"><LocalizedText source={"Ultima muestra "} /></p>
                        <p className="mt-3 text-xl font-semibold text-white">
                            <LocalizedText source={latestLabel} />
                        </p>
                        <p className="mt-3 text-sm leading-7 text-stone-300"><LocalizedText source={"El eje vertical muestra valores reales, `totalUsers` queda como serie principal y el tooltip te da el detalle exacto por muestra. "} /></p>
                    </div>

                    {statConfig.map((entry) => (
                        <div
                            key={entry.key}
                            className="rounded-[18px] border border-white/8 p-5 shadow-xl"
                            style={{ backgroundColor: entry.glow }}
                        >
                            <p className="text-[11px] uppercase tracking-[0.28em] text-stone-300">
                                <LocalizedText source={entry.label} />
                            </p>
                            <p className="mt-3 text-3xl font-semibold text-white">
                                {formatNumber(latestStat?.[entry.key] ?? 0)}
                            </p>
                            <p className="mt-2 text-sm text-stone-300">
                                Visible: <LocalizedText source={visibleStats[entry.key] ? "Sí" : "No"} />
                            </p>
                        </div>
                    ))}
                </section>
            </div>
        </main>
    );
}
