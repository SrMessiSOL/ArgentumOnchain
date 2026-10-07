"use client";
import { LocalizedText, LocalizedLabel } from '@/components/LocalizedText';
import { localizeItemDetails } from "@/lib/game-i18n";
import { useI18n } from "@/components/I18nProvider";

import React from "react";
import type { GraphicData } from "../types/game";
import type { TradeItem } from "../lib/aowProtocol";
import { formatNumber } from "../lib/number-format";
import { getTexturePath, loadGraphicsDB } from "../utils/gameLoader";

type TradeModalProps = {
    mode: "merchant" | "bank";
    merchantItems: TradeItem[];
    playerItems: TradeItem[];
    gold: number;
    bankTab?: "character" | "account" | "clan";
    vaultGold?: number;
    hasClanVault?: boolean;
    clanName?: string | null;
    bankStatusMessage?: string | null;
    onClose: () => void;
    onBankTabChange?: (tab: "character" | "account" | "clan") => void;
    onBuyRequest: (slot: number, amount: number) => void;
    onSellRequest: (slot: number, amount: number) => void;
    onDepositGoldRequest?: (amount: number) => void;
    onWithdrawGoldRequest?: (amount: number) => void;
    onEquipRequest?: (slot: number) => void;
    onMoveBankItem?: (sourceSlot: number, targetSlot: number) => void;
};

const GRID_COLUMNS = 5;
const MIN_GRID_SLOTS = 25;
const MAX_VISIBLE_GRID_ROWS = 5;
const GRID_GAP_PX = 6;

function ItemGraphic({
    graphicData,
    name,
}: {
    graphicData?: GraphicData;
    name: string;
}) {
    const {text: localizeText} = useI18n();
    if (!graphicData?.numFile) {
        return <div className="h-10 w-10 rounded-md bg-black/20" />;
    }

    const scale = Math.min(
        1,
        32 / Math.max(graphicData.width, graphicData.height, 1),
    );

    return (
        <div className="relative h-10 w-10 overflow-hidden rounded-sm">
            <LocalizedLabel><div
                aria-label={localizeText(name)}
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

function buildSlots<T extends { slot: number }>(items: T[]): Array<T | null> {
    if (items.length === 0) {
        return Array.from({ length: MIN_GRID_SLOTS }, () => null);
    }

    const lowestSlot = items.reduce(
        (minSlot, item) => Math.min(minSlot, item.slot),
        items[0].slot,
    );
    const highestSlot = items.reduce(
        (maxSlot, item) => Math.max(maxSlot, item.slot),
        items[0].slot,
    );
    const startSlot = lowestSlot === 0 ? 0 : 1;
    const totalSlots = Math.max(MIN_GRID_SLOTS, highestSlot - startSlot + 1);
    const bySlot = new Map(items.map((item) => [item.slot, item]));

    return Array.from(
        { length: totalSlots },
        (_, index) => bySlot.get(index + startSlot) ?? null,
    );
}

function parseItemDetails(details: string): string[] {
    return details
        .split("|")
        .map((detail) => detail.trim())
        .filter(Boolean);
}

function parseTradeItemStats(details: string) {
    const defense = details.match(/Defensa:\s*(\d+\/\d+)/i)?.[1] ?? null;
    const damage = details.match(/DaÃ±o:\s*(\d+\/\d+)/i)?.[1] ?? null;
    const tier = details.match(/Tier:\s*(\d+)/i)?.[1] ?? null;
    const magicResistance =
        details.match(/Resistencia mÃ¡gica:\s*(\d+%)/i)?.[1] ?? null;
    const magicDamageBonus =
        details.match(/Bonus daÃ±o mÃ¡gico:\s*(\d+%)/i)?.[1] ?? null;

    return { defense, damage, tier, magicResistance, magicDamageBonus };
}

function ItemOverlayMeta({
    details,
    goldLabel,
    amountLabel,
    forceAmountLabel,
}: {
    details: string;
    goldLabel?: string | null;
    amountLabel?: string | null;
    forceAmountLabel?: boolean;
}) {
    const {text: localizeText} = useI18n();
    const stats = parseTradeItemStats(details);
    const combatLabel = stats.magicResistance
        ? `${localizeText("RM")} ${stats.magicResistance}`
        : stats.magicDamageBonus
          ? `MAG ${stats.magicDamageBonus}`
          : stats.defense
            ? `DEF ${stats.defense}`
            : stats.damage
              ? `${localizeText("ATQ")} ${stats.damage}`
              : null;
    const primaryLabel = forceAmountLabel
        ? (amountLabel ?? null)
        : (combatLabel ?? amountLabel ?? null);

    if (!primaryLabel && !goldLabel && !stats.tier) {
        return null;
    }

    return (
        <>
            {primaryLabel ? (
                <span className="pointer-events-none absolute left-1 top-1 rounded border border-white/10 bg-black/90 px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-[0.04em] text-stone-50 shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                    {primaryLabel}
                </span>
            ) : null}
            {/* {stats.tier ? (
                <span className="pointer-events-none absolute right-1 top-1 rounded border border-violet-300/20 bg-violet-950/90 px-1.5 py-0.5 text-[9px] font-black uppercase leading-none tracking-[0.04em] text-violet-100 shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                    T{stats.tier}
                </span>
            ) : null} */}
            {goldLabel ? (
                <span className="pointer-events-none absolute bottom-1 left-1 rounded border border-amber-300/15 bg-amber-950/95 px-1.5 py-0.5 text-[9px] font-black leading-none text-amber-100 shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                    {goldLabel}
                </span>
            ) : null}
        </>
    );
}

function getSlotStateClasses({
    isSelected,
    isInvalid,
    palette,
}: {
    isSelected: boolean;
    isInvalid: boolean;
    palette: "merchant" | "player";
}) {
    if (palette === "merchant") {
        if (isSelected) {
            return isInvalid
                ? "border-rose-300 bg-[#46201f] shadow-[0_0_0_1px_rgba(253,164,175,0.25)]"
                : "border-amber-300 bg-[#4a3117] shadow-[0_0_0_1px_rgba(252,211,77,0.2)]";
        }

        return isInvalid
            ? "border-[#6d3a39] bg-[#241312] hover:border-rose-300/60 hover:bg-[#2d1716]"
            : "border-[#5a412d] bg-[#1a130f] hover:border-amber-300/55 hover:bg-[#261b14]";
    }

    if (isSelected) {
        return isInvalid
            ? "border-rose-300 bg-[#2f2126] shadow-[0_0_0_1px_rgba(253,164,175,0.24)]"
            : "border-cyan-300 bg-[#1f2d33] shadow-[0_0_0_1px_rgba(103,232,249,0.2)]";
    }

    return isInvalid
        ? "border-[#5b3940] bg-[#181116] hover:border-rose-300/55 hover:bg-[#21161c]"
        : "border-[#354247] bg-[#11181b] hover:border-cyan-300/55 hover:bg-[#152126]";
}

export default function TradeModal({
    mode,
    merchantItems,
    playerItems,
    gold,
    bankTab = "character",
    vaultGold = 0,
    hasClanVault = false,
    clanName,
    bankStatusMessage,
    onClose,
    onBankTabChange,
    onBuyRequest,
    onSellRequest,
    onDepositGoldRequest,
    onWithdrawGoldRequest,
    onEquipRequest,
    onMoveBankItem,
}: TradeModalProps) {
    const { locale, t: localizeKey, text: localizeText } = useI18n();

    const isBank = mode === "bank";
    const [graphicsDB, setGraphicsDB] = React.useState<Record<
        string,
        GraphicData
    > | null>(null);
    const [selectedMerchantSlot, setSelectedMerchantSlot] = React.useState<
        number | null
    >(merchantItems[0]?.slot ?? null);
    const [selectedPlayerSlot, setSelectedPlayerSlot] = React.useState<
        number | null
    >(null);
    const [amountText, setAmountText] = React.useState("1");
    const [goldText, setGoldText] = React.useState("1");
    const [draggedBankItem, setDraggedBankItem] =
        React.useState<TradeItem | null>(null);
    const [dragPointer, setDragPointer] = React.useState({ x: 0, y: 0 });
    const merchantGridContainerRef = React.useRef<HTMLDivElement | null>(null);
    const [merchantGridWidth, setMerchantGridWidth] = React.useState(0);

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
        const container = merchantGridContainerRef.current;

        if (!container) {
            return;
        }

        const updateWidth = () => {
            setMerchantGridWidth(container.clientWidth);
        };

        updateWidth();

        const resizeObserver = new ResizeObserver(() => {
            updateWidth();
        });

        resizeObserver.observe(container);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    React.useEffect(() => {
        if (
            selectedMerchantSlot !== null &&
            !merchantItems.some((item) => item.slot === selectedMerchantSlot)
        ) {
            setSelectedMerchantSlot(merchantItems[0]?.slot ?? null);
        }
    }, [merchantItems, selectedMerchantSlot]);

    React.useEffect(() => {
        if (
            selectedPlayerSlot !== null &&
            !playerItems.some((item) => item.slot === selectedPlayerSlot)
        ) {
            setSelectedPlayerSlot(null);
        }
    }, [playerItems, selectedPlayerSlot]);

    const finishBankDrag = React.useCallback(
        (clientX: number, clientY: number) => {
            if (!draggedBankItem) {
                return;
            }

            const dropTarget = document
                .elementFromPoint(clientX, clientY)
                ?.closest("[data-bank-slot]");
            const slotAttribute = dropTarget?.getAttribute("data-bank-slot");
            const targetSlot = slotAttribute ? Number(slotAttribute) : NaN;

            if (
                Number.isFinite(targetSlot) &&
                targetSlot !== draggedBankItem.slot
            ) {
                setSelectedMerchantSlot(targetSlot);
                onMoveBankItem?.(draggedBankItem.slot, targetSlot);
            }

            setDraggedBankItem(null);
        },
        [draggedBankItem, onMoveBankItem],
    );

    React.useEffect(() => {
        if (!draggedBankItem) {
            return;
        }

        const handleMouseMove = (event: MouseEvent) => {
            setDragPointer({ x: event.clientX, y: event.clientY });
        };

        const handleMouseUp = (event: MouseEvent) => {
            finishBankDrag(event.clientX, event.clientY);
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [draggedBankItem, finishBankDrag]);

    const merchantSlots = React.useMemo(
        () => buildSlots(merchantItems),
        [merchantItems],
    );
    const playerSlots = React.useMemo(
        () => buildSlots(playerItems),
        [playerItems],
    );
    const shouldScrollMerchantGrid = merchantSlots.length > MIN_GRID_SLOTS;
    const merchantGridMaxHeight = React.useMemo(() => {
        if (!shouldScrollMerchantGrid || merchantGridWidth <= 0) {
            return null;
        }

        const slotSize =
            (merchantGridWidth - GRID_GAP_PX * (GRID_COLUMNS - 1)) /
            GRID_COLUMNS;

        return (
            slotSize * MAX_VISIBLE_GRID_ROWS +
            GRID_GAP_PX * (MAX_VISIBLE_GRID_ROWS - 1)
        );
    }, [merchantGridWidth, shouldScrollMerchantGrid]);

    const selectedMerchantItem =
        merchantItems.find((item) => item.slot === selectedMerchantSlot) ??
        null;
    const selectedPlayerItem =
        playerItems.find((item) => item.slot === selectedPlayerSlot) ?? null;

    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target;
            const isTypingTarget =
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target instanceof HTMLSelectElement ||
                (target instanceof HTMLElement && target.isContentEditable);

            if (event.key === "Escape") {
                onClose();
                return;
            }

            if (isTypingTarget) {
                return;
            }

            if (
                isBank &&
                event.key.toLowerCase() === "e" &&
                selectedPlayerItem
            ) {
                onEquipRequest?.(selectedPlayerItem.slot);
                event.preventDefault();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isBank, onClose, onEquipRequest, selectedPlayerItem]);

    const parsedAmount = Number.parseInt(amountText, 10);
    const parsedGoldAmount = Number.parseInt(goldText, 10);
    const safeAmount = Number.isFinite(parsedAmount)
        ? Math.max(1, parsedAmount)
        : 1;
    const safeGoldAmount = Number.isFinite(parsedGoldAmount)
        ? Math.max(1, parsedGoldAmount)
        : 1;
    const previewItem = selectedMerchantItem ?? selectedPlayerItem;
    const maxSelectableAmount = selectedMerchantItem
        ? isBank
            ? Math.max(selectedMerchantItem.amount, 1)
            : Math.max(
                  1,
                  Math.floor(
                      gold /
                          Math.max(
                              Math.floor(selectedMerchantItem.value / 2),
                              1,
                          ),
                  ),
              )
        : Math.max(selectedPlayerItem?.amount ?? 0, 1);
    const clampedAmount = Math.min(safeAmount, maxSelectableAmount);
    const buyTotalPrice = selectedMerchantItem
        ? Math.floor((selectedMerchantItem.value * clampedAmount) / 2)
        : 0;
    const sellTotalPrice = selectedPlayerItem
        ? selectedPlayerItem.value * clampedAmount
        : 0;
    const maxMerchantActionAmount = selectedMerchantItem
        ? Math.max(
              1,
              Math.min(maxSelectableAmount, selectedMerchantItem.amount),
          )
        : 0;
    const maxPlayerActionAmount = selectedPlayerItem
        ? Math.max(1, selectedPlayerItem.amount)
        : 0;
    const previewDetails = previewItem
        ? parseItemDetails(previewItem.details)
        : [];
    const isSharedVault = isBank && bankTab !== "character";
    const vaultGoldLabel =
        bankTab === "clan" ? "Oro bÃ³veda clan" : "Oro bÃ³veda cuenta";
    const tabs: Array<{
        key: "character" | "account" | "clan";
        label: string;
        disabled?: boolean;
    }> = [
        { key: "character", label: "Personal" },
        { key: "account", label: "Cuenta" },
        {
            key: "clan",
            label: clanName ? `Clan ${clanName}` : "Clan",
            disabled: !hasClanVault,
        },
    ];

    return (
        <div className="game-modal-backdrop fixed inset-0 z-[90] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
            <div className="game-modal-panel w-full max-w-4xl overflow-hidden rounded-[28px] border border-[#5f4630] bg-[linear-gradient(180deg,#2b1d13_0%,#18110c_100%)] text-stone-100 shadow-[0_32px_120px_rgba(0,0,0,0.55)]">
                <div className="border-b border-[#6a4f39] bg-[#120d09]/85 px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/15 bg-black/30">
                                {previewItem ? (
                                    <ItemGraphic
                                        graphicData={
                                            graphicsDB?.[
                                                previewItem.grhIndex.toString()
                                            ]
                                        }
                                        name={previewItem.name}
                                    />
                                ) : null}
                            </div>
                            <div className="min-w-0">
                                <p className="text-[11px] uppercase tracking-[0.28em] text-amber-300/75">
                                    {localizeText(isBank ? "Banco" : "Comerciante")}
                                </p>
                                <h2 className="truncate text-xl font-semibold text-stone-50">
                                    {localizeText(previewItem?.name ?? "Selecciona un item")}
                                </h2>
                                <p className="mt-1 text-sm text-stone-400">
                                    {previewItem
                                        ? selectedMerchantItem
                                            ? isBank
                                                ? `${localizeText("Guardados")}: ${formatNumber(previewItem.amount)}`
                                                : `${formatNumber(Math.floor(previewItem.value / 2))} ${localizeText("oro por unidad")}`
                                            : isBank
                                              ? localizeText("Guarda o retira items desde tu banco.")
                                              : `${formatNumber(previewItem.value)} ${localizeText("oro por unidad")}`
                                        : isBank
                                          ? localizeText("Guarda o retira items desde este panel.")
                                          : localizeText("Compra o vende items desde este panel.")}
                                </p>
                                {previewItem && !previewItem.validForUser ? (
                                    <p className="mt-1 text-xs font-medium text-rose-300">
                                        {localizeText("No lo puede usar tu personaje.")}
                                    </p>
                                ) : null}
                                {previewDetails.length > 0 ? (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {previewDetails.map((detail) => (
                                            <span
                                                key={detail}
                                                className="rounded-full border border-stone-100/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-stone-200"
                                            >
                                                {localizeItemDetails(detail, locale)}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-2xl border border-stone-700 bg-stone-950/60 px-3 py-2 text-sm text-stone-300 transition hover:border-stone-500 hover:text-white"
                        >{localizeKey("common.close")}</button>
                    </div>

                    {isBank ? (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.key}
                                    type="button"
                                    disabled={tab.disabled}
                                    onClick={() => onBankTabChange?.(tab.key)}
                                    className={`rounded-full px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                                        bankTab === tab.key
                                            ? "border border-amber-300/40 bg-amber-300/12 text-amber-100"
                                            : "border border-stone-700 bg-stone-950/40 text-stone-300 hover:border-stone-500 hover:text-white"
                                    }`}
                                >
                                    {localizeText(tab.label)}
                                </button>
                            ))}
                        </div>
                    ) : null}

                    {!isBank ? (
                        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-sm text-amber-100">
                            <span className="text-base">{localizeText("Oro:")}</span>
                            <span className="font-semibold">
                                {formatNumber(gold)}
                            </span>
                        </div>
                    ) : isSharedVault ? (
                        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-stone-300">
                            <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-amber-100">
                                <span>{localizeText("Tu oro:")}</span>
                                <span className="font-semibold">
                                    {formatNumber(gold)}
                                </span>
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-cyan-100">
                                <span>{localizeText(vaultGoldLabel)}:</span>
                                <span className="font-semibold">
                                    {formatNumber(vaultGold)}
                                </span>
                            </span>
                        </div>
                    ) : null}
                </div>

                <div className="grid gap-4 p-4 md:grid-cols-2">
                    <section className="rounded-[22px] border border-amber-300/10 bg-black/20 p-3">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-300">
                                {localizeText(isBank ? "Banco" : "Comerciante")}
                            </h3>
                            <span className="text-xs text-stone-500">
                                {merchantItems.length} items
                            </span>
                        </div>
                        <div
                            ref={merchantGridContainerRef}
                            className={
                                shouldScrollMerchantGrid
                                    ? "overflow-y-auto pr-1"
                                    : undefined
                            }
                            style={
                                merchantGridMaxHeight
                                    ? { maxHeight: merchantGridMaxHeight }
                                    : undefined
                            }
                        >
                            <div className="grid grid-cols-5 gap-1.5">
                                {merchantSlots.map((item, index) => (
                                    <button
                                        key={`merchant-slot-${index + 1}`}
                                        type="button"
                                        data-bank-slot={
                                            isBank
                                                ? String(
                                                      item?.slot ?? index + 1,
                                                  )
                                                : undefined
                                        }
                                        onMouseDown={(event) => {
                                            if (
                                                !isBank ||
                                                event.button !== 2 ||
                                                !item
                                            ) {
                                                return;
                                            }

                                            event.preventDefault();
                                            setSelectedMerchantSlot(item.slot);
                                            setSelectedPlayerSlot(null);
                                            setDraggedBankItem(item);
                                            setDragPointer({
                                                x: event.clientX,
                                                y: event.clientY,
                                            });
                                        }}
                                        onContextMenu={(event) => {
                                            if (isBank) {
                                                event.preventDefault();
                                            }
                                        }}
                                        onClick={() => {
                                            if (!item) {
                                                return;
                                            }

                                            setSelectedMerchantSlot(item.slot);
                                            setSelectedPlayerSlot(null);
                                        }}
                                        className={`relative flex aspect-square items-center justify-center rounded-[8px] border transition ${
                                            item
                                                ? getSlotStateClasses({
                                                      isSelected:
                                                          selectedMerchantSlot ===
                                                          item.slot,
                                                      isInvalid:
                                                          !item.validForUser,
                                                      palette: "merchant",
                                                  })
                                                : "border-[#3a2a1e] bg-[#0f0a07]"
                                        }`}
                                    >
                                        {item ? (
                                            <>
                                                <ItemGraphic
                                                    graphicData={
                                                        graphicsDB?.[
                                                            item.grhIndex.toString()
                                                        ]
                                                    }
                                                    name={item.name}
                                                />
                                                <ItemOverlayMeta
                                                    details={item.details}
                                                    goldLabel={
                                                        isBank
                                                            ? null
                                                            : formatNumber(
                                                                  Math.floor(
                                                                      item.value /
                                                                          2,
                                                                  ),
                                                              )
                                                    }
                                                    amountLabel={
                                                        isBank
                                                            ? formatNumber(
                                                                  item.amount,
                                                              )
                                                            : null
                                                    }
                                                    forceAmountLabel={isBank}
                                                />
                                                {!item.validForUser ? (
                                                    <span className="pointer-events-none absolute inset-0 rounded-[8px] bg-[linear-gradient(135deg,rgba(244,63,94,0.2),rgba(0,0,0,0))]" />
                                                ) : null}
                                            </>
                                        ) : null}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="rounded-[22px] border border-cyan-300/10 bg-black/20 p-3">
                        <div className="mb-3 flex items-center justify-between">
                            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-300">{localizeKey("hud.inventory")}</h3>
                            <span className="text-xs text-stone-500">
                                {playerItems.length} items
                            </span>
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                            {playerSlots.map((item, index) => (
                                <button
                                    key={`player-slot-${index + 1}`}
                                    type="button"
                                    onClick={() => {
                                        if (!item) {
                                            return;
                                        }

                                        setSelectedPlayerSlot(item.slot);
                                        setSelectedMerchantSlot(null);
                                    }}
                                    className={`relative flex aspect-square items-center justify-center rounded-[8px] border transition ${
                                        item
                                            ? getSlotStateClasses({
                                                  isSelected:
                                                      selectedPlayerSlot ===
                                                      item.slot,
                                                  isInvalid: !item.validForUser,
                                                  palette: "player",
                                              })
                                            : "border-[#252f33] bg-[#0b1114]"
                                    }`}
                                >
                                    {item ? (
                                        <>
                                            <ItemGraphic
                                                graphicData={
                                                    graphicsDB?.[
                                                        item.grhIndex.toString()
                                                    ]
                                                }
                                                name={item.name}
                                            />
                                            {isBank || item.amount > 1 ? (
                                                <span className="pointer-events-none absolute left-1 top-1 rounded border border-white/10 bg-black/90 px-1.5 py-0.5 text-[9px] font-black leading-none text-stone-50 shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                                                    {formatNumber(item.amount)}
                                                </span>
                                            ) : null}
                                            {item.equipped ? (
                                                <span className="pointer-events-none absolute bottom-0.5 right-0.5 rounded bg-amber-300 px-1 text-[9px] font-black leading-4 text-stone-950 shadow-sm">
                                                    E
                                                </span>
                                            ) : null}
                                            {!item.validForUser ? (
                                                <span className="pointer-events-none absolute inset-0 rounded-[8px] bg-[linear-gradient(135deg,rgba(244,63,94,0.18),rgba(0,0,0,0))]" />
                                            ) : null}
                                        </>
                                    ) : null}
                                </button>
                            ))}
                        </div>
                    </section>
                </div>

                <div className="border-t border-[#6a4f39] bg-[#0f0b09]/92 px-4 py-4">
                    {isSharedVault ? (
                        <div className="mb-4 rounded-[20px] border border-amber-300/10 bg-black/20 p-3">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-300"><LocalizedText source={"Oro compartido "} /></p>
                                </div>
                                <div className="flex items-center gap-2 rounded-2xl border border-stone-700 bg-black/30 px-3 py-2">
                                    <input
                                        type="number"
                                        min={1}
                                        value={goldText}
                                        onChange={(event) =>
                                            setGoldText(event.target.value)
                                        }
                                        className="w-28 rounded-xl border border-stone-700 bg-stone-950/90 px-3 py-2 text-center text-base outline-none transition focus:border-amber-400"
                                    />
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onDepositGoldRequest?.(
                                                Math.min(safeGoldAmount, gold),
                                            )
                                        }
                                        disabled={gold < 1}
                                        className="flex h-11 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#8c3418_0%,#661b0d_100%)] px-5 text-sm font-semibold uppercase tracking-[0.14em] text-amber-50 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                                    ><LocalizedText source={"Depositar oro "} /></button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onWithdrawGoldRequest?.(
                                                Math.min(
                                                    safeGoldAmount,
                                                    vaultGold,
                                                ),
                                            )
                                        }
                                        disabled={vaultGold < 1}
                                        className="flex h-11 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-5 text-sm font-semibold uppercase tracking-[0.14em] text-cyan-50 transition hover:border-cyan-200/40 hover:bg-cyan-300/16 disabled:cursor-not-allowed disabled:opacity-40"
                                    ><LocalizedText source={"Retirar oro "} /></button>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {bankStatusMessage ? (
                        <div className="mb-4 rounded-2xl border border-rose-300/20 bg-rose-950/30 px-4 py-3 text-sm text-rose-100">
                            <LocalizedText source={bankStatusMessage} />
                        </div>
                    ) : null}

                    <div
                        className={`flex flex-col items-stretch gap-3 md:flex-row md:items-center ${
                            isBank ? "md:justify-between" : "md:justify-start"
                        }`}
                    >
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => {
                                    if (!selectedMerchantItem) {
                                        return;
                                    }

                                    onBuyRequest(
                                        selectedMerchantItem.slot,
                                        clampedAmount,
                                    );
                                }}
                                disabled={!selectedMerchantItem}
                                className={`flex h-12 w-full items-center justify-center rounded-2xl px-5 text-sm font-semibold uppercase tracking-[0.14em] text-amber-50 transition hover:brightness-110 sm:w-[156px] disabled:cursor-not-allowed disabled:opacity-40 ${
                                    isBank
                                        ? "bg-[linear-gradient(180deg,#a53a16_0%,#7a210e_100%)]"
                                        : "bg-[linear-gradient(180deg,#8c3418_0%,#661b0d_100%)]"
                                }`}
                            >
                                {isBank ? localizeText("Retirar") : localizeKey("hud.buy")}
                            </button>
                            {isBank ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!selectedMerchantItem) {
                                            return;
                                        }

                                        onBuyRequest(
                                            selectedMerchantItem.slot,
                                            maxMerchantActionAmount,
                                        );
                                    }}
                                    disabled={!selectedMerchantItem}
                                    className="flex h-12 w-full items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 text-sm font-semibold uppercase tracking-[0.14em] text-amber-100 transition hover:border-amber-200/50 hover:bg-amber-300/16 sm:w-[156px] disabled:cursor-not-allowed disabled:opacity-40"
                                ><LocalizedText source={"Retirar todo "} /></button>
                            ) : null}
                        </div>

                        <div className="flex items-center justify-center gap-2 rounded-2xl border border-stone-700 bg-black/30 px-3 py-2 md:self-start">
                            <button
                                type="button"
                                onClick={() =>
                                    setAmountText(
                                        String(Math.max(1, clampedAmount - 1)),
                                    )
                                }
                                className="h-9 w-9 rounded-xl border border-stone-700 bg-stone-900/90 text-lg text-stone-200 transition hover:border-stone-500"
                            >
                                -
                            </button>
                            <input
                                type="number"
                                min={1}
                                max={maxSelectableAmount}
                                value={amountText}
                                onChange={(event) =>
                                    setAmountText(event.target.value)
                                }
                                className="w-20 rounded-xl border border-stone-700 bg-stone-950/90 px-3 py-2 text-center text-base outline-none transition focus:border-amber-400"
                            />
                            <button
                                type="button"
                                onClick={() =>
                                    setAmountText(
                                        String(
                                            Math.min(
                                                maxSelectableAmount,
                                                clampedAmount + 1,
                                            ),
                                        ),
                                    )
                                }
                                className="h-9 w-9 rounded-xl border border-stone-700 bg-stone-900/90 text-lg text-stone-200 transition hover:border-stone-500"
                            >
                                +
                            </button>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => {
                                    if (!selectedPlayerItem) {
                                        return;
                                    }

                                    onSellRequest(
                                        selectedPlayerItem.slot,
                                        Math.min(
                                            clampedAmount,
                                            selectedPlayerItem.amount,
                                        ),
                                    );
                                }}
                                disabled={!selectedPlayerItem}
                                className="flex h-12 w-full items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#8c3418_0%,#661b0d_100%)] px-5 text-sm font-semibold uppercase tracking-[0.14em] text-amber-50 transition hover:brightness-110 sm:w-[156px] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {isBank ? localizeText("Guardar") : localizeKey("hud.sell")}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!selectedPlayerItem) {
                                        return;
                                    }

                                    onSellRequest(
                                        selectedPlayerItem.slot,
                                        maxPlayerActionAmount,
                                    );
                                }}
                                disabled={!selectedPlayerItem}
                                className="flex h-12 w-full items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-5 text-sm font-semibold uppercase tracking-[0.14em] text-cyan-50 transition hover:border-cyan-200/40 hover:bg-cyan-300/16 sm:w-[156px] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {isBank ? localizeText("Guardar todo") : localizeText("Vender todo")}
                            </button>
                        </div>
                    </div>

                    <div className="mt-3 min-h-12 rounded-2xl border border-white/8 bg-white/3 px-4 py-3 text-sm text-stone-300">
                        {selectedMerchantItem ? (
                            <div className="flex flex-col gap-1.5">
                                <p>
                                    {isBank ? localizeText("Retirar") : localizeKey("hud.buy")}{" "}
                                    <span className="font-semibold text-stone-100">
                                        {localizeText(selectedMerchantItem.name)}
                                    </span>{" "}
                                    {isBank ? (
                                        "."
                                    ) : (
                                        <>
                                            {localizeText("por")} {formatNumber(buyTotalPrice)}{" "}
                                            {localizeText("oro.")}
                                        </>
                                    )}
                                    {!selectedMerchantItem.validForUser
                                        ? localizeText(" No lo puede usar tu personaje.")
                                        : ""}
                                    {isSharedVault
                                        ? localizeText(` Oro en la bÃ³veda: ${formatNumber(vaultGold)}.`)
                                        : ""}
                                </p>
                            </div>
                        ) : selectedPlayerItem ? (
                            <div className="flex flex-col gap-1.5">
                                <p>
                                    {isBank ? localizeText("Guardar") : localizeKey("hud.sell")}{" "}
                                    <span className="font-semibold text-stone-100">
                                        {localizeText(selectedPlayerItem.name)}
                                    </span>{" "}
                                    {isBank ? (
                                        "."
                                    ) : (
                                        <>
                                            {localizeText("por")} {formatNumber(sellTotalPrice)}{" "}
                                            {localizeText("oro.")}
                                        </>
                                    )}
                                    {selectedPlayerItem.equipped
                                        ? isBank
                                            ? localizeText(" Primero debes desequiparlo para guardarlo.")
                                            : localizeText(" Primero debes desequiparlo.")
                                        : ""}
                                </p>
                                {selectedPlayerItem.details ? (
                                    <p className="text-xs text-stone-400">
                                        {localizeItemDetails(selectedPlayerItem.details, locale)}
                                    </p>
                                ) : null}
                            </div>
                        ) : (
                            <p>
                                {isBank
                                    ? localizeText("Selecciona un item del banco o de tu inventario.")
                                    : localizeText("Selecciona un item del comerciante o de tu inventario.")}
                            </p>
                        )}
                    </div>
                </div>
            </div>
            {draggedBankItem ? (
                <div
                    className="pointer-events-none fixed z-[95] -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-amber-300/35 bg-[#20130d]/95 p-2 shadow-2xl"
                    style={{ left: dragPointer.x, top: dragPointer.y }}
                >
                    <ItemGraphic
                        graphicData={
                            graphicsDB?.[draggedBankItem.grhIndex.toString()]
                        }
                        name={draggedBankItem.name}
                    />
                </div>
            ) : null}
        </div>
    );
}
