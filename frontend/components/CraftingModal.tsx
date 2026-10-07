"use client";
import { LocalizedText, LocalizedLabel } from '@/components/LocalizedText';
import { localizeItemDetails } from "../lib/game-i18n";
import { useI18n } from "@/components/I18nProvider";

import React from "react";
import type { CraftingRecipe, InventoryItem } from "../lib/aowProtocol";
import type { GraphicData } from "../types/game";
import { getTexturePath, loadGraphicsDB } from "../utils/gameLoader";

type CraftingModalProps = {
    title: string;
    recipes: CraftingRecipe[];
    inventory: InventoryItem[];
    onClose: () => void;
    onCraftRequest: (itemId: number, amount: number) => void;
};

function ItemGraphic({
    graphicData,
    name,
}: {
    graphicData?: GraphicData;
    name: string;
}) {
    if (!graphicData?.numFile) {
        return <div className="h-12 w-12 rounded-md bg-black/20" />;
    }

    const scale = Math.min(
        1,
        40 / Math.max(graphicData.width, graphicData.height, 1),
    );

    return (
        <div className="relative h-12 w-12 overflow-hidden rounded-sm">
            <LocalizedLabel><div
                aria-label={name}
                className="absolute left-1/2 top-1/2 bg-no-repeat"
                style={{
                    width: graphicData.width,
                    height: graphicData.height,
                    backgroundImage: `url(${getTexturePath(graphicData)})`,
                    backgroundPosition: `-${graphicData.sX}px -${graphicData.sY}px`,
                    transform: `translate(-50%, -50%) scale(${scale})`,
                    transformOrigin: "center",
                }}
            /></LocalizedLabel>
        </div>
    );
}

export default function CraftingModal({
    title,
    recipes,
    inventory,
    onClose,
    onCraftRequest,
}: CraftingModalProps) {
    const { t: localizeKey, text: localizeText, locale } = useI18n();

    const [graphicsDB, setGraphicsDB] = React.useState<Record<
        string,
        GraphicData
    > | null>(null);
    const [selectedItemId, setSelectedItemId] = React.useState<number | null>(
        recipes[0]?.itemId ?? null,
    );
    const [amountText, setAmountText] = React.useState("1");

    React.useEffect(() => {
        let isActive = true;

        loadGraphicsDB()
            .then((data) => {
                if (isActive) {
                    setGraphicsDB(data);
                }
            })
            .catch(() => {
                if (isActive) {
                    setGraphicsDB({});
                }
            });

        return () => {
            isActive = false;
        };
    }, []);

    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    React.useEffect(() => {
        if (
            selectedItemId !== null &&
            recipes.some((recipe) => recipe.itemId === selectedItemId)
        ) {
            return;
        }

        setSelectedItemId(recipes[0]?.itemId ?? null);
    }, [recipes, selectedItemId]);

    const selectedRecipe = React.useMemo(
        () =>
            recipes.find((recipe) => recipe.itemId === selectedItemId) ?? null,
        [recipes, selectedItemId],
    );

    const parsedAmount = Number.parseInt(amountText, 10);
    const craftAmount = Number.isFinite(parsedAmount)
        ? Math.max(1, Math.min(parsedAmount, 9999))
        : 1;
    const inventoryCounts = React.useMemo(() => {
        const counts = new Map<number, number>();

        for (const item of inventory) {
            counts.set(
                item.idItem,
                (counts.get(item.idItem) ?? 0) + item.amount,
            );
        }

        return counts;
    }, [inventory]);

    const canCraft =
        selectedRecipe !== null &&
        selectedRecipe.materials.every((material) => {
            const owned = inventoryCounts.get(material.itemId) ?? 0;
            return owned >= material.amount * craftAmount;
        });

    return (
        <div className="game-modal-backdrop fixed inset-0 z-[90] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
            <div className="game-modal-panel w-full max-w-5xl overflow-hidden rounded-[28px] border border-[#5f4630] bg-[linear-gradient(180deg,#2b1d13_0%,#18110c_100%)] text-stone-100 shadow-[0_32px_120px_rgba(0,0,0,0.55)]">
                <div className="border-b border-[#6a4f39] bg-[#120d09]/85 px-5 py-4">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-[11px] uppercase tracking-[0.28em] text-amber-200/75"><LocalizedText source={"ProfesiÃ³n "} /></p>
                            <h2 className="mt-1 text-xl font-semibold text-[#f3e7c8]">
                                <LocalizedText source={title} />
                            </h2>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full border border-stone-500/40 px-3 py-1 text-xs uppercase tracking-[0.22em] text-stone-300 transition hover:border-amber-300/60 hover:text-amber-100"
                        >{localizeKey("common.close")}</button>
                    </div>
                </div>

                <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.9fr)] md:p-5">
                    <div className="rounded-3xl border border-[#5a412d] bg-black/15 p-3">
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-xs uppercase tracking-[0.24em] text-stone-300/75"><LocalizedText source={"Recetas "} /></p>
                            <p className="text-xs text-stone-400">
                                {recipes.length}<LocalizedText source={" disponibles "} /></p>
                        </div>

                        <div className="grid max-h-[55vh] gap-2 overflow-y-auto pr-1">
                            {recipes.map((recipe) => {
                                const isSelected =
                                    recipe.itemId === selectedRecipe?.itemId;

                                return (
                                    <button
                                        key={recipe.itemId}
                                        type="button"
                                        onClick={() =>
                                            setSelectedItemId(recipe.itemId)
                                        }
                                        className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-left transition ${
                                            isSelected
                                                ? "border-amber-300 bg-[#4a3117]"
                                                : "border-[#4b3828] bg-[#16100c] hover:border-amber-300/45 hover:bg-[#211812]"
                                        }`}
                                    >
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-black/25">
                                            <ItemGraphic
                                                graphicData={
                                                    graphicsDB?.[
                                                        String(recipe.grhIndex)
                                                    ]
                                                }
                                                name={recipe.name}
                                            />
                                        </div>

                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-medium text-stone-100">
                                                <LocalizedText source={recipe.name} />
                                            </div>
                                            <div className="mt-1 text-xs text-stone-400">
                                                <LocalizedText source={recipe.category} /> Â· Skill{" "}
                                                {recipe.skill}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-3xl border border-[#5a412d] bg-black/15 p-4">
                        {selectedRecipe ? (
                            <>
                                <div className="flex items-start gap-4">
                                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/25">
                                        <ItemGraphic
                                            graphicData={
                                                graphicsDB?.[
                                                    String(
                                                        selectedRecipe.grhIndex,
                                                    )
                                                ]
                                            }
                                            name={selectedRecipe.name}
                                        />
                                    </div>

                                    <div className="min-w-0">
                                        <p className="text-[11px] uppercase tracking-[0.24em] text-amber-200/75">
                                            <LocalizedText source={selectedRecipe.category} />
                                        </p>
                                        <h3 className="mt-1 text-lg font-semibold text-[#f3e7c8]">
                                            <LocalizedText source={selectedRecipe.name} />
                                        </h3>
                                        <p className="mt-2 text-sm text-stone-300">
                                            <LocalizedText source={selectedRecipe.details || "Sin descripciÃ³n adicional."} />
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-5">
                                    {selectedRecipe.stats ? (
                                        <>
                                            <p className="text-xs uppercase tracking-[0.24em] text-stone-300/75">
                                                Stats
                                            </p>
                                            <div className="mt-3 rounded-2xl border border-[#5a412d] bg-[#120d09] px-3 py-3 text-sm text-stone-200">
                                                {localizeItemDetails(selectedRecipe.stats, locale)}
                                            </div>
                                        </>
                                    ) : null}
                                </div>

                                <div className="mt-5">
                                    <p className="text-xs uppercase tracking-[0.24em] text-stone-300/75"><LocalizedText source={"Materiales "} /></p>
                                    <div className="mt-3 space-y-2">
                                        {selectedRecipe.materials.map(
                                            (material) => {
                                                const owned =
                                                    inventoryCounts.get(
                                                        material.itemId,
                                                    ) ?? 0;
                                                const required =
                                                    material.amount *
                                                    craftAmount;
                                                const enough =
                                                    owned >= required;

                                                return (
                                                    <div
                                                        key={`${selectedRecipe.itemId}-${material.itemId}`}
                                                        className={`flex items-center justify-between rounded-2xl border px-3 py-2 text-sm ${
                                                            enough
                                                                ? "border-emerald-400/20 bg-emerald-950/10 text-stone-100"
                                                                : "border-rose-400/20 bg-rose-950/10 text-stone-100"
                                                        }`}
                                                    >
                                                        <span>
                                                            <LocalizedText source={material.name} />
                                                        </span>
                                                        <span
                                                            className={
                                                                enough
                                                                    ? "text-emerald-300"
                                                                    : "text-rose-300"
                                                            }
                                                        >
                                                            {owned} / {required}
                                                        </span>
                                                    </div>
                                                );
                                            },
                                        )}
                                    </div>
                                </div>

                                <div className="mt-5 flex items-end gap-3">
                                    <label className="min-w-0 flex-1">
                                        <span className="text-xs uppercase tracking-[0.24em] text-stone-300/75">{localizeKey("hud.amount")}</span>
                                        <input
                                            value={amountText}
                                            onChange={(event) =>
                                                setAmountText(
                                                    event.target.value.replace(
                                                        /[^0-9]/g,
                                                        "",
                                                    ) || "1",
                                                )
                                            }
                                            className="mt-2 w-full rounded-2xl border border-[#5a412d] bg-[#120d09] px-4 py-3 text-stone-100 outline-none transition focus:border-amber-300/70"
                                            inputMode="numeric"
                                        />
                                    </label>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            onCraftRequest(
                                                selectedRecipe.itemId,
                                                craftAmount,
                                            )
                                        }
                                        disabled={!canCraft}
                                        className="rounded-2xl border border-amber-300/35 bg-amber-300/15 px-5 py-3 text-sm font-medium text-amber-100 transition hover:border-amber-300/60 hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:border-stone-600/40 disabled:bg-stone-800/40 disabled:text-stone-500"
                                    ><LocalizedText source={"Craftear "} /></button>
                                </div>
                            </>
                        ) : (
                            <div className="flex min-h-[240px] items-center justify-center text-sm text-stone-400"><LocalizedText source={"No hay recetas disponibles. "} /></div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
