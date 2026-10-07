"use client";
import { LocalizedText, LocalizedLabel } from '@/components/LocalizedText';
import { useI18n } from "@/components/I18nProvider";

import React from "react";
import {
    OBJECT_TYPE,
    type InventoryItem,
    type MarketListingGroupEntry,
    type MarketPriceSort,
    type MarketState,
} from "../lib/aowProtocol";
import { formatNumber } from "../lib/number-format";
import type { GraphicData } from "../types/game";
import { getTexturePath, loadGraphicsDB } from "../utils/gameLoader";

type MarketModalProps = {
    marketState: MarketState;
    inventory: InventoryItem[];
    gold: number;
    currentCharacterName: string | null;
    onClose: () => void;
    onRefresh: (browse: MarketBrowsePayload) => void;
    onCreateListing: (
        slot: number,
        quantity: number,
        price: number,
        durationHours: number,
        browse: MarketBrowsePayload,
    ) => void;
    onBuyListing: (
        listingId: string,
        expected: { itemId: number; quantity: number; price: number },
        browse: MarketBrowsePayload,
    ) => void;
    onCancelListing: (listingId: string, browse: MarketBrowsePayload) => void;
    onClaim: (browse: MarketBrowsePayload) => void;
};

type MarketTab = "browse" | "sell" | "mine" | "claims";

type MarketBrowsePayload = {
    listingLimit: number;
    search?: string;
    objType?: number | null;
    sortPrice?: MarketPriceSort;
};

type PendingMarketPurchase = {
    listingId: string;
    itemId: number;
    itemName: string;
    itemGrhIndex: number | null;
    quantity: number;
    price: number;
    sellerName: string;
    browse: MarketBrowsePayload;
};

const MARKET_PAGE_SIZE = 20;
const MARKET_MIN_SEARCH_LENGTH = 4;
const MARKET_MAX_ACTIVE_LISTINGS = 20;
const MARKET_MIN_LISTING_HOURS = 1;

const MARKET_OBJECT_TYPE_OPTIONS = [
    { value: null, label: "Todos" },
    { value: 1, label: "Comida" },
    { value: OBJECT_TYPE.armas, label: "Armas" },
    { value: OBJECT_TYPE.armaduras, label: "Armaduras" },
    { value: OBJECT_TYPE.escudos, label: "Escudos" },
    { value: OBJECT_TYPE.cascos, label: "Cascos" },
    { value: OBJECT_TYPE.anillos, label: "Anillos" },
    { value: OBJECT_TYPE.pociones, label: "Pociones" },
    { value: OBJECT_TYPE.lenia, label: "LeÃ±as" },
    { value: OBJECT_TYPE.metales, label: "Minerales" },
    { value: OBJECT_TYPE.lingotes, label: "Lingotes" },
    { value: OBJECT_TYPE.gemas, label: "Gemas" },
    { value: OBJECT_TYPE.instrumentosMusicales, label: "Instrumentos" },
    { value: OBJECT_TYPE.flechas, label: "Flechas" },
];

function formatRemainingTime(isoDate: string) {
    const diffMs = new Date(isoDate).getTime() - Date.now();

    if (!Number.isFinite(diffMs) || diffMs <= 0) {
        return "Expirada";
    }

    const totalMinutes = Math.max(1, Math.floor(diffMs / 60000));

    if (totalMinutes >= 60) {
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }

    return `${totalMinutes}m`;
}

function formatListingStatus(
    status: "active" | "sold" | "expired" | "cancelled",
) {
    switch (status) {
        case "active":
            return "Activa";
        case "sold":
            return "Vendida";
        case "expired":
            return "Expirada";
        case "cancelled":
            return "Cancelada";
    }
}

function formatClaimDate(isoDate: string) {
    const date = new Date(isoDate);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear());
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function formatDecimal(value: number) {
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(value);
}

function ItemGraphic({
    graphicData,
    name,
}: {
    graphicData?: GraphicData;
    name: string;
}) {
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

function SectionCard({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200/80">
                <LocalizedText source={title} />
            </h3>
            {children}
        </section>
    );
}

function getInventorySlotClasses(isSelected: boolean) {
    if (isSelected) {
        return "border-cyan-300/85 bg-[#3a2817] shadow-[0_0_0_1px_rgba(103,232,249,0.25),inset_0_1px_0_rgba(255,218,180,0.08)]";
    }

    return "border-amber-500/25 bg-[#2b2016] shadow-[inset_0_1px_0_rgba(255,218,180,0.08)] hover:border-amber-300/60 hover:bg-[#35271b]";
}

export default function MarketModal({
    marketState,
    inventory,
    gold,
    currentCharacterName,
    onClose,
    onRefresh,
    onCreateListing,
    onBuyListing,
    onCancelListing,
    onClaim,
}: MarketModalProps) {
    const { t: localizeKey, text: localizeText } = useI18n();

    const [graphicsDB, setGraphicsDB] = React.useState<Record<
        string,
        GraphicData
    > | null>(null);
    const [tab, setTab] = React.useState<MarketTab>("browse");
    const [selectedInventorySlot, setSelectedInventorySlot] = React.useState<
        number | null
    >(inventory[0]?.slot ?? null);
    const [quantityText, setQuantityText] = React.useState("1");
    const [priceText, setPriceText] = React.useState("100");
    const [durationText, setDurationText] = React.useState(
        String(marketState.defaultDurationHours),
    );
    const [listingLimit, setListingLimit] = React.useState(MARKET_PAGE_SIZE);
    const [searchText, setSearchText] = React.useState("");
    const [selectedObjType, setSelectedObjType] = React.useState<number | null>(
        null,
    );
    const [sortPrice, setSortPrice] = React.useState<MarketPriceSort>("recent");
    const [selectedGroupItemId, setSelectedGroupItemId] = React.useState<
        number | null
    >(null);
    const [pendingPurchase, setPendingPurchase] =
        React.useState<PendingMarketPurchase | null>(null);
    const deferredSearchText = React.useDeferredValue(searchText.trim());
    const [debouncedSearchText, setDebouncedSearchText] = React.useState("");
    const initialBrowseEffectSkippedRef = React.useRef(false);
    const onRefreshRef = React.useRef(onRefresh);

    React.useEffect(() => {
        let active = true;

        loadGraphicsDB()
            .then((data) => {
                if (active) {
                    setGraphicsDB(data);
                }
            })
            .catch(() => {
                if (active) {
                    setGraphicsDB({});
                }
            });

        return () => {
            active = false;
        };
    }, []);

    React.useEffect(() => {
        onRefreshRef.current = onRefresh;
    }, [onRefresh]);

    React.useLayoutEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                if (pendingPurchase) {
                    setPendingPurchase(null);
                    return;
                }

                onClose();
            }
        };

        document.addEventListener("keydown", handleKeyDown, true);
        return () =>
            document.removeEventListener("keydown", handleKeyDown, true);
    }, [onClose, pendingPurchase]);

    React.useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setDebouncedSearchText(deferredSearchText);
        }, 350);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [deferredSearchText]);

    React.useEffect(() => {
        if (
            selectedInventorySlot !== null &&
            !inventory.some((item) => item.slot === selectedInventorySlot)
        ) {
            setSelectedInventorySlot(inventory[0]?.slot ?? null);
        }
    }, [inventory, selectedInventorySlot]);

    const selectedInventoryItem =
        inventory.find((item) => item.slot === selectedInventorySlot) ?? null;
    const quantity = Math.max(1, Number.parseInt(quantityText || "1", 10) || 1);
    const price = Math.max(1, Number.parseInt(priceText || "1", 10) || 1);
    const durationHours = Math.min(
        marketState.maxDurationHours,
        Math.max(
            MARKET_MIN_LISTING_HOURS,
            Number.parseInt(durationText || "1", 10) ||
                MARKET_MIN_LISTING_HOURS,
        ),
    );
    const publicationFee = Math.max(
        1,
        Math.floor((price * marketState.publicationFeeBps) / 10000),
    );
    const normalizedSearchText =
        debouncedSearchText.length >= MARKET_MIN_SEARCH_LENGTH
            ? debouncedSearchText
            : "";
    const browsePayload = React.useMemo<MarketBrowsePayload>(
        () => ({
            listingLimit,
            search: normalizedSearchText || undefined,
            objType: selectedObjType,
            sortPrice,
        }),
        [listingLimit, normalizedSearchText, selectedObjType, sortPrice],
    );
    const activeListingsCount = React.useMemo(
        () =>
            marketState.myListings.filter(
                (listing) => listing.status === "active",
            ).length,
        [marketState.myListings],
    );
    const selectedListingGroup = React.useMemo<MarketListingGroupEntry | null>(
        () =>
            marketState.listingGroups.find(
                (group) => group.itemId === selectedGroupItemId,
            ) ?? null,
        [marketState.listingGroups, selectedGroupItemId],
    );

    React.useEffect(() => {
        setListingLimit(MARKET_PAGE_SIZE);
        setSelectedGroupItemId(null);
    }, [normalizedSearchText, selectedObjType, sortPrice]);

    React.useEffect(() => {
        if (selectedGroupItemId === null) {
            return;
        }

        if (
            !marketState.listingGroups.some(
                (group) => group.itemId === selectedGroupItemId,
            )
        ) {
            setSelectedGroupItemId(null);
        }
    }, [marketState.listingGroups, selectedGroupItemId]);

    React.useEffect(() => {
        if (!initialBrowseEffectSkippedRef.current) {
            initialBrowseEffectSkippedRef.current = true;
            return;
        }

        onRefreshRef.current({
            listingLimit: MARKET_PAGE_SIZE,
            search: normalizedSearchText || undefined,
            objType: selectedObjType,
            sortPrice,
        });
    }, [normalizedSearchText, selectedObjType, sortPrice]);

    return (
        <div className="game-modal-backdrop fixed inset-0 z-[95] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
            <div className="game-modal-panel flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-amber-200/20 bg-[linear-gradient(180deg,rgba(35,23,14,0.97),rgba(15,10,8,0.97))] text-stone-100 shadow-[0_24px_120px_rgba(0,0,0,0.6)]">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.3em] text-amber-200/70"><LocalizedText source={"Mercado Global "} /></p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onRefresh(browsePayload)}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-stone-200 transition hover:bg-white/10"
                        ><LocalizedText source={"Actualizar "} /></button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-stone-200 transition hover:bg-white/10"
                        >{localizeKey("common.close")}</button>
                    </div>
                </div>

                <div className="grid gap-4 px-5 py-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                    <aside className="flex flex-col gap-3">
                        <SectionCard title="Estado">
                            <div className="space-y-2 text-sm text-stone-300">
                                <p><LocalizedText source={"Oro disponible: "} />{formatNumber(gold)}</p>
                                <p><LocalizedText source={"Tasa publicaciÃ³n:"} />{" "}
                                    {marketState.publicationFeeBps / 100}%
                                </p>
                                <p><LocalizedText source={"Reclamos: "} />{marketState.claims.length}</p>
                            </div>
                        </SectionCard>
                        {[
                            ["browse", "Mercado"],
                            ["sell", "Publicar"],
                            ["mine", "Mis ventas"],
                            ["claims", "Reclamos"],
                        ].map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setTab(key as MarketTab)}
                                className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                                    tab === key
                                        ? "border-amber-300/50 bg-amber-300/10 text-amber-100"
                                        : "border-white/10 bg-white/5 text-stone-300 hover:bg-white/10"
                                }`}
                            >
                                <LocalizedText source={label} />
                            </button>
                        ))}
                    </aside>

                    <div className="min-h-[520px] overflow-y-auto pr-1">
                        {tab === "browse" ? (
                            <SectionCard title="Publicaciones Activas">
                                <div className="mb-3 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_180px_200px]">
                                    <LocalizedLabel><input
                                        value={searchText}
                                        onChange={(event) => {
                                            setSelectedGroupItemId(null);
                                            setSearchText(event.target.value);
                                        }}
                                        placeholder="Buscar item"
                                        className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-stone-100 outline-none"
                                    /></LocalizedLabel>
                                    <select
                                        value={selectedObjType ?? ""}
                                        onChange={(event) => {
                                            setSelectedGroupItemId(null);
                                            setSelectedObjType(
                                                event.target.value
                                                    ? Number(event.target.value)
                                                    : null,
                                            );
                                        }}
                                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-stone-100 outline-none"
                                    >
                                        {MARKET_OBJECT_TYPE_OPTIONS.map(
                                            (option) => (
                                                <option
                                                    key={option.label}
                                                    value={option.value ?? ""}
                                                >
                                                    <LocalizedText source={option.label} />
                                                </option>
                                            ),
                                        )}
                                    </select>
                                    <select
                                        value={sortPrice}
                                        onChange={(event) => {
                                            setSelectedGroupItemId(null);
                                            setSortPrice(
                                                event.target
                                                    .value as MarketPriceSort,
                                            );
                                        }}
                                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-stone-100 outline-none"
                                    >
                                        <option value="recent"><LocalizedText source={"Ultimos publicados "} /></option>
                                        <option value="asc"><LocalizedText source={"Oro: menor a mayor "} /></option>
                                        <option value="desc"><LocalizedText source={"Oro: mayor a menor "} /></option>
                                    </select>
                                </div>
                                <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
                                    {marketState.listingGroups.length === 0 ? (
                                        <p className="text-sm text-stone-400"><LocalizedText source={"No hay publicaciones activas. "} /></p>
                                    ) : null}
                                    {selectedListingGroup ? (
                                        <div className="space-y-3 rounded-2xl border border-white/8 bg-white/5 p-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-xs uppercase tracking-[0.2em] text-stone-400"><LocalizedText source={"Vendedores de"} />{" "}
                                                        {
                                                            localizeText(selectedListingGroup.itemName)
                                                        }
                                                    </p>
                                                    <p className="text-sm text-stone-300">
                                                        {
                                                            selectedListingGroup.totalListings
                                                        }{" "}<LocalizedText source={"publicaciones |"} />{" "}
                                                        {formatNumber(
                                                            selectedListingGroup.totalQuantity,
                                                        )}{" "}<LocalizedText source={"unidades | desde"} />{" "}
                                                        {formatDecimal(
                                                            selectedListingGroup.minUnitPrice,
                                                        )}{" "}<LocalizedText source={"oro c/u "} /></p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setSelectedGroupItemId(
                                                            null,
                                                        )
                                                    }
                                                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-stone-200 transition hover:bg-white/10"
                                                >{localizeKey("common.back")}</button>
                                            </div>
                                            {selectedListingGroup.listings.map(
                                                (listing) => {
                                                    const isOwnListing =
                                                        currentCharacterName !==
                                                            null &&
                                                        listing.sellerName
                                                            .trim()
                                                            .toLocaleLowerCase() ===
                                                            currentCharacterName
                                                                .trim()
                                                                .toLocaleLowerCase();
                                                    const graphicData =
                                                        graphicsDB?.[
                                                            String(
                                                                listing.itemGrhIndex,
                                                            )
                                                        ];
                                                    const unitPrice =
                                                        listing.price /
                                                        Math.max(
                                                            1,
                                                            listing.quantity,
                                                        );

                                                    return (
                                                        <div
                                                            key={listing.id}
                                                            className="flex w-full flex-col gap-3 rounded-2xl border border-white/8 bg-black/15 p-3 text-left md:flex-row md:items-center md:justify-between"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <ItemGraphic
                                                                    graphicData={
                                                                        graphicData
                                                                    }
                                                                    name={
                                                                        listing.itemName
                                                                    }
                                                                />
                                                                <div>
                                                                    <p className="font-semibold text-stone-100">
                                                                        {
                                                                            localizeText(listing.itemName)
                                                                        }{" "}
                                                                        x
                                                                        {
                                                                            listing.quantity
                                                                        }
                                                                    </p>
                                                                    <p className="text-sm text-stone-400">
                                                                        {
                                                                            listing.sellerName
                                                                        }{" "}<LocalizedText source={"| vence en"} />{" "}
                                                                        {localizeText(formatRemainingTime(
                                                                            listing.expiresAt,
                                                                        ))}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-4">
                                                                <div>
                                                                    <p className="text-sm font-semibold text-amber-200">
                                                                        {formatNumber(
                                                                            listing.price,
                                                                        )}{" "}<LocalizedText source={"oro "} /></p>
                                                                    <p className="text-xs text-stone-400">
                                                                        {formatDecimal(
                                                                            unitPrice,
                                                                        )}{" "}<LocalizedText source={"oro c/u "} /></p>
                                                                </div>
                                                                {isOwnListing ? (
                                                                    <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-stone-300"><LocalizedText source={"Tu publicaciÃ³n "} /></span>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            setPendingPurchase(
                                                                                {
                                                                                    listingId:
                                                                                        listing.id,
                                                                                    itemId: selectedListingGroup.itemId,
                                                                                    itemName:
                                                                                        listing.itemName,
                                                                                    itemGrhIndex:
                                                                                        listing.itemGrhIndex,
                                                                                    quantity:
                                                                                        listing.quantity,
                                                                                    price: listing.price,
                                                                                    sellerName:
                                                                                        listing.sellerName,
                                                                                    browse: browsePayload,
                                                                                },
                                                                            )
                                                                        }
                                                                        className="rounded-xl bg-amber-300 px-3 py-2 text-sm font-semibold text-stone-950 transition hover:bg-amber-200"
                                                                    >{localizeKey("hud.buy")}</button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                },
                                            )}
                                        </div>
                                    ) : null}
                                    {selectedListingGroup === null
                                        ? marketState.listingGroups.map(
                                              (group) => {
                                                  const graphicData =
                                                      graphicsDB?.[
                                                          String(
                                                              group.itemGrhIndex,
                                                          )
                                                      ];
                                                  return (
                                                      <button
                                                          key={group.itemId}
                                                          type="button"
                                                          onClick={() =>
                                                              setSelectedGroupItemId(
                                                                  group.itemId,
                                                              )
                                                          }
                                                          className="flex w-full flex-col gap-3 rounded-2xl border border-white/8 bg-white/5 p-3 text-left transition hover:bg-white/10 md:flex-row md:items-center md:justify-between"
                                                      >
                                                          <div className="flex items-center gap-3">
                                                              <ItemGraphic
                                                                  graphicData={
                                                                      graphicData
                                                                  }
                                                                  name={
                                                                      group.itemName
                                                                  }
                                                              />
                                                              <div>
                                                                  <p className="font-semibold text-stone-100">
                                                                      {
                                                                          localizeText(group.itemName)
                                                                      }
                                                                  </p>
                                                                  <p className="text-sm text-stone-400">
                                                                      {
                                                                          group.totalListings
                                                                      }{" "}<LocalizedText source={"publicaciones |"} />{" "}
                                                                      {formatNumber(
                                                                          group.totalQuantity,
                                                                      )}{" "}<LocalizedText source={"unidades "} /></p>
                                                              </div>
                                                          </div>
                                                          <div className="flex items-center gap-4">
                                                              <div>
                                                                  <p className="text-sm font-semibold text-amber-200"><LocalizedText source={"Desde"} />{" "}
                                                                      {formatDecimal(
                                                                          group.minUnitPrice,
                                                                      )}{" "}<LocalizedText source={"oro c/u "} /></p>
                                                              </div>
                                                              <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-stone-200"><LocalizedText source={"Ver vendedores "} /></span>
                                                          </div>
                                                      </button>
                                                  );
                                              },
                                          )
                                        : null}
                                    {marketState.hasMoreListings ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const nextLimit =
                                                    listingLimit +
                                                    MARKET_PAGE_SIZE;
                                                setListingLimit(nextLimit);
                                                onRefresh({
                                                    ...browsePayload,
                                                    listingLimit: nextLimit,
                                                });
                                            }}
                                            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-stone-200 transition hover:bg-white/10"
                                        ><LocalizedText source={"Traer mÃ¡s "} /></button>
                                    ) : null}
                                </div>
                            </SectionCard>
                        ) : null}

                        {tab === "sell" ? (
                            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_320px]">
                                <SectionCard title={localizeKey("hud.inventory")}>
                                    <div className="max-h-[58vh] overflow-y-auto pr-1">
                                        <div className="grid grid-cols-7 gap-1">
                                            {inventory.map((item) => {
                                                const graphicData =
                                                    graphicsDB?.[
                                                        String(item.grhIndex)
                                                    ];
                                                return (
                                                    <LocalizedLabel><button
                                                        key={item.slot}
                                                        type="button"
                                                        onClick={() =>
                                                            setSelectedInventorySlot(
                                                                item.slot,
                                                            )
                                                        }
                                                        className={`relative flex aspect-square items-center justify-center rounded-[6px] border text-left transition ${getInventorySlotClasses(
                                                            selectedInventorySlot ===
                                                                item.slot,
                                                        )}`}
                                                        title={`${localizeText(item.name)} x${formatNumber(item.amount)}`}
                                                    >
                                                        <div className="flex items-center justify-center">
                                                            <ItemGraphic
                                                                graphicData={
                                                                    graphicData
                                                                }
                                                                name={item.name}
                                                            />
                                                        </div>
                                                        <span className="pointer-events-none absolute left-1 top-0.5 text-[10px] font-bold text-stone-100 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                                                            {formatNumber(
                                                                item.amount,
                                                            )}
                                                        </span>
                                                        {item.equipped ? (
                                                            <span className="pointer-events-none absolute bottom-0.5 right-0.5 rounded bg-amber-300 px-1 text-[9px] font-black leading-4 text-stone-950 shadow-sm">
                                                                E
                                                            </span>
                                                        ) : null}
                                                    </button></LocalizedLabel>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </SectionCard>

                                <SectionCard title="Nueva PublicaciÃ³n">
                                    <div className="space-y-3 text-sm text-stone-300">
                                        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.16em] text-stone-300"><LocalizedText source={"Activas: "} />{activeListingsCount}/
                                            {MARKET_MAX_ACTIVE_LISTINGS}
                                        </div>
                                        <p>
                                            Item:{" "}
                                            <LocalizedText source={selectedInventoryItem?.name ?? "Selecciona un item"} />
                                        </p>
                                        <label className="block">
                                            <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-stone-400">{localizeKey("hud.amount")}</span>
                                            <input
                                                value={quantityText}
                                                onChange={(event) =>
                                                    setQuantityText(
                                                        event.target.value,
                                                    )
                                                }
                                                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-stone-100 outline-none"
                                                inputMode="numeric"
                                            />
                                        </label>
                                        <label className="block">
                                            <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-stone-400"><LocalizedText source={"Precio total "} /></span>
                                            <input
                                                value={priceText}
                                                onChange={(event) =>
                                                    setPriceText(
                                                        event.target.value,
                                                    )
                                                }
                                                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-stone-100 outline-none"
                                                inputMode="numeric"
                                            />
                                        </label>
                                        <label className="block">
                                            <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-stone-400"><LocalizedText source={"DuraciÃ³n (horas) "} /></span>
                                            <input
                                                type="number"
                                                value={durationText}
                                                onChange={(event) =>
                                                    setDurationText(
                                                        event.target.value,
                                                    )
                                                }
                                                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-stone-100 outline-none"
                                                min={MARKET_MIN_LISTING_HOURS}
                                                max={
                                                    marketState.maxDurationHours
                                                }
                                                inputMode="numeric"
                                            />
                                            <span className="mt-1 block text-xs text-stone-500">
                                                Min {MARKET_MIN_LISTING_HOURS}h,
                                                max{" "}
                                                {marketState.maxDurationHours}h.
                                            </span>
                                        </label>
                                        <div className="rounded-xl border border-amber-200/15 bg-amber-950/25 px-3 py-2 text-amber-100"><LocalizedText source={"Tasa de publicaciÃ³n:"} />{" "}
                                            {formatNumber(publicationFee)}<LocalizedText source={" oro "} /></div>
                                        <button
                                            type="button"
                                            disabled={!selectedInventoryItem}
                                            onClick={() => {
                                                if (!selectedInventoryItem) {
                                                    return;
                                                }

                                                onCreateListing(
                                                    selectedInventoryItem.slot,
                                                    quantity,
                                                    price,
                                                    durationHours,
                                                    browsePayload,
                                                );
                                            }}
                                            className="w-full rounded-xl bg-cyan-300 px-4 py-2 font-semibold text-stone-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-stone-600"
                                        ><LocalizedText source={"Publicar "} /></button>
                                    </div>
                                </SectionCard>
                            </div>
                        ) : null}

                        {tab === "mine" ? (
                            <SectionCard title="Mis Ventas">
                                <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
                                    {marketState.myListings.length === 0 ? (
                                        <p className="text-sm text-stone-400"><LocalizedText source={"No tienes publicaciones todavÃ­a. "} /></p>
                                    ) : null}
                                    {marketState.myListings.map((listing) => {
                                        const graphicData =
                                            graphicsDB?.[
                                                String(listing.itemGrhIndex)
                                            ];
                                        return (
                                            <div
                                                key={listing.id}
                                                className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-white/5 p-3 md:flex-row md:items-center md:justify-between"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <ItemGraphic
                                                        graphicData={
                                                            graphicData
                                                        }
                                                        name={listing.itemName}
                                                    />
                                                    <div>
                                                        <p className="font-semibold text-stone-100">
                                                            {localizeText(listing.itemName)} x
                                                            {listing.quantity}
                                                        </p>
                                                        <p className="text-sm text-stone-400">
                                                            {localizeText(formatListingStatus(
                                                                listing.status,
                                                            ))}{" "}
                                                            |{" "}
                                                            {formatNumber(
                                                                listing.price,
                                                            )}{" "}<LocalizedText source={"oro "} /></p>
                                                        <p className="text-xs text-stone-500">
                                                            {formatClaimDate(
                                                                listing.createdAt,
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                                {listing.status === "active" ? (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            onCancelListing(
                                                                listing.id,
                                                                browsePayload,
                                                            )
                                                        }
                                                        className="rounded-xl border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-300/20"
                                                    >{localizeKey("common.cancel")}</button>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            </SectionCard>
                        ) : null}

                        {tab === "claims" ? (
                            <SectionCard title="Reclamos Pendientes">
                                <div className="space-y-3">
                                    <button
                                        type="button"
                                        onClick={() => onClaim(browsePayload)}
                                        disabled={
                                            marketState.claims.length === 0
                                        }
                                        className="rounded-xl bg-amber-300 px-4 py-2 font-semibold text-stone-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-stone-600"
                                    ><LocalizedText source={"Reclamar todo "} /></button>
                                    <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
                                        {marketState.claims.length === 0 ? (
                                            <p className="text-sm text-stone-400"><LocalizedText source={"No tienes reclamos pendientes. "} /></p>
                                        ) : null}
                                        {marketState.claims.map((claim) => {
                                            const graphicData =
                                                claim.itemGrhIndex
                                                    ? graphicsDB?.[
                                                          String(
                                                              claim.itemGrhIndex,
                                                          )
                                                      ]
                                                    : undefined;
                                            return (
                                                <div
                                                    key={claim.id}
                                                    className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/5 p-3"
                                                >
                                                    {claim.claimType ===
                                                    "item" ? (
                                                        <ItemGraphic
                                                            graphicData={
                                                                graphicData
                                                            }
                                                            name={
                                                                claim.itemName ??
                                                                "Item"
                                                            }
                                                        />
                                                    ) : (
                                                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-950/60 text-lg">
                                                            $
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className="font-semibold text-stone-100">
                                                            {claim.claimType ===
                                                            "gold"
                                                                ? `${formatNumber(claim.goldAmount)} ${localizeText("oro")}`
                                                                : `${localizeText(claim.itemName ?? "Item")} x${claim.itemQuantity ?? 0}`}
                                                        </p>
                                                        {claim.claimType ===
                                                            "gold" &&
                                                        claim.itemName ? (
                                                            <p className="text-sm text-stone-300"><LocalizedText source={"Venta de"} />{" "}
                                                                {localizeText(claim.itemName ??
                                                                    "Item")}{" "}
                                                                x
                                                                {claim.itemQuantity ??
                                                                    0}
                                                            </p>
                                                        ) : null}
                                                        {claim.claimType ===
                                                        "item" ? (
                                                            <p className="text-sm text-stone-300"><LocalizedText source={"Retorno pendiente para guardar en inventario "} /></p>
                                                        ) : null}
                                                        <p className="text-xs text-stone-500">
                                                            {formatClaimDate(
                                                                claim.createdAt,
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </SectionCard>
                        ) : null}
                    </div>
                </div>
            </div>
            {pendingPurchase ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-3xl border border-amber-200/25 bg-[#1d140d] p-5 text-stone-100 shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200/80"><LocalizedText source={"Confirmar compra "} /></p>
                        <div className="mt-4 flex items-center gap-3">
                            <ItemGraphic
                                graphicData={
                                    pendingPurchase.itemGrhIndex
                                        ? graphicsDB?.[
                                              String(
                                                  pendingPurchase.itemGrhIndex,
                                              )
                                          ]
                                        : undefined
                                }
                                name={pendingPurchase.itemName}
                            />
                            <div>
                                <p className="font-semibold">
                                    {localizeText(pendingPurchase.itemName)} x
                                    {pendingPurchase.quantity}
                                </p>
                                <p className="text-sm text-stone-400"><LocalizedText source={"Vendedor: "} />{pendingPurchase.sellerName}
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 rounded-2xl border border-amber-200/15 bg-amber-950/25 px-4 py-3">
                            <p className="text-sm text-stone-300"><LocalizedText source={"Vas a gastar "} /></p>
                            <p className="text-2xl font-bold text-amber-200">
                                {formatNumber(pendingPurchase.price)}<LocalizedText source={" oro "} /></p>
                        </div>
                        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => setPendingPurchase(null)}
                                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-stone-200 transition hover:bg-white/10"
                            >{localizeKey("common.cancel")}</button>
                            <button
                                type="button"
                                onClick={() => {
                                    onBuyListing(
                                        pendingPurchase.listingId,
                                        {
                                            itemId: pendingPurchase.itemId,
                                            quantity: pendingPurchase.quantity,
                                            price: pendingPurchase.price,
                                        },
                                        pendingPurchase.browse,
                                    );
                                    setPendingPurchase(null);
                                }}
                                className="rounded-xl bg-amber-300 px-4 py-2 text-sm font-bold text-stone-950 transition hover:bg-amber-200"
                            ><LocalizedText source={"Confirmar compra "} /></button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
