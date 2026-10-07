import { LocalizedText } from '@/components/LocalizedText';
import type { ReactNode } from "react";

type InspectableNpcDrop = {
    itemId: number;
    quantity: number;
    chance: number;
    name: string;
    graphicData?: unknown;
};

type InspectableNpc = {
    entityId: number;
    name: string;
    desc?: string;
    currentHp?: number;
    maxHp?: number;
    exp?: number;
    gold?: number;
    minHit?: number;
    maxHit?: number;
    def?: number;
    poderAtaque?: number;
    poderEvasion?: number;
    drops: InspectableNpcDrop[];
};

type NpcInspectorModalProps = {
    npc: InspectableNpc | null;
    isAdmin: boolean;
    removingNpcEntityId: number | null;
    formatNumber: (value: number) => string;
    formatDropChance: (chance: number) => string;
    renderItemGraphic: (graphicData: unknown, name: string) => ReactNode;
    onClose: () => void;
    onRemoveNpc: (npc: InspectableNpc) => void;
    onRemoveNpcPermanently: (npc: InspectableNpc) => void;
};

function NpcDetailRow({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-cyan-200/10 bg-black/20 px-3 py-2 text-xs text-stone-200">
            <span className="uppercase tracking-[0.18em] text-stone-400">
                <LocalizedText source={label} />
            </span>
            <span className="text-right font-medium text-stone-100">
                {value}
            </span>
        </div>
    );
}

export function NpcInspectorModal({
    npc,
    isAdmin,
    removingNpcEntityId,
    formatNumber,
    formatDropChance,
    renderItemGraphic,
    onClose,
    onRemoveNpc,
    onRemoveNpcPermanently,
}: NpcInspectorModalProps) {
    if (!npc) {
        return null;
    }

    return (
        <div
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-[2px]"
            onClick={onClose}
        >
            <div
                className={`max-h-full w-full overflow-hidden rounded-[28px] border border-cyan-200/15 bg-stone-950/96 shadow-2xl ${
                    npc.drops.length ? "max-w-2xl" : "max-w-[26rem]"
                }`}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4 border-b border-cyan-200/10 px-6 py-5">
                    <div>
                        <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-200/60"><LocalizedText source={"Inspeccion NPC "} /></p>
                        <h2 className="mt-2 text-2xl font-semibold text-white">
                            <LocalizedText source={npc.name} />
                        </h2>
                        {npc.desc ? (
                            <p className="mt-2 max-w-xl text-sm leading-6 text-stone-300">
                                <LocalizedText source={npc.desc} />
                            </p>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full border border-cyan-200/15 px-3 py-1 text-xs uppercase tracking-[0.18em] text-stone-300 transition hover:border-cyan-200/30 hover:text-white"
                    ><LocalizedText source={"Cerrar "} /></button>
                </div>
                {isAdmin ? (
                    <div className="flex flex-wrap justify-end gap-3 border-b border-cyan-200/10 px-6 pb-4">
                        <button
                            type="button"
                            disabled={removingNpcEntityId === npc.entityId}
                            onClick={() => onRemoveNpc(npc)}
                            className="rounded-xl border border-rose-300/25 bg-rose-400/10 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <LocalizedText source={removingNpcEntityId === npc.entityId
                                ? "Quitando..."
                                : "Quitar del mapa"} />
                        </button>
                        <button
                            type="button"
                            disabled={removingNpcEntityId === npc.entityId}
                            onClick={() => onRemoveNpcPermanently(npc)}
                            className="rounded-xl border border-rose-300/25 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <LocalizedText source={removingNpcEntityId === npc.entityId
                                ? "Quitando..."
                                : "Quitar permanente"} />
                        </button>
                    </div>
                ) : null}
                <div
                    className={`grid max-h-[70vh] gap-6 overflow-y-auto px-6 py-5 ${
                        npc.drops.length
                            ? "md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]"
                            : "grid-cols-1"
                    }`}
                >
                    <div className="space-y-3">
                        <NpcDetailRow
                            label="Vida"
                            value={
                                npc.maxHp != null
                                    ? formatNumber(npc.maxHp)
                                    : typeof npc.currentHp === "number"
                                      ? formatNumber(npc.currentHp)
                                      : "-"
                            }
                        />
                        <NpcDetailRow
                            label="Experiencia"
                            value={
                                typeof npc.exp === "number"
                                    ? formatNumber(npc.exp)
                                    : "-"
                            }
                        />
                        {typeof npc.gold === "number" && npc.gold > 0 ? (
                            <NpcDetailRow
                                label="Oro"
                                value={formatNumber(npc.gold)}
                            />
                        ) : null}
                        <NpcDetailRow
                            label="Golpe"
                            value={
                                npc.minHit != null || npc.maxHit != null
                                    ? `${formatNumber(npc.minHit ?? 0)} - ${formatNumber(npc.maxHit ?? 0)}`
                                    : "-"
                            }
                        />
                        <NpcDetailRow
                            label="Defensa"
                            value={
                                typeof npc.def === "number"
                                    ? formatNumber(npc.def)
                                    : "-"
                            }
                        />
                        <NpcDetailRow
                            label="Poder ataque"
                            value={
                                typeof npc.poderAtaque === "number"
                                    ? formatNumber(npc.poderAtaque)
                                    : "-"
                            }
                        />
                        <NpcDetailRow
                            label="Poder evasion"
                            value={
                                typeof npc.poderEvasion === "number"
                                    ? formatNumber(npc.poderEvasion)
                                    : "-"
                            }
                        />
                    </div>
                    {npc.drops.length ? (
                        <div>
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-100">
                                    Drops
                                </h3>
                                <span className="text-[11px] uppercase tracking-[0.16em] text-stone-400">
                                    {npc.drops.length} items
                                </span>
                            </div>
                            <div className="space-y-2">
                                {npc.drops.map((drop) => (
                                    <div
                                        key={`${drop.itemId}-${drop.quantity}-${drop.chance}`}
                                        className="flex items-center gap-3 rounded-2xl border border-cyan-200/10 bg-black/20 px-3 py-2"
                                    >
                                        {renderItemGraphic(
                                            drop.graphicData,
                                            drop.name,
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium text-stone-100">
                                                <LocalizedText source={drop.name} />
                                            </div>
                                            <div className="mt-1 text-xs text-stone-400"><LocalizedText source={"Cantidad:"} />{" "}
                                                {formatNumber(drop.quantity)}
                                            </div>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <div className="text-sm font-semibold text-cyan-200">
                                                {formatDropChance(drop.chance)}
                                            </div>
                                            <div className="text-[10px] uppercase tracking-[0.16em] text-stone-500">
                                                Drop
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
