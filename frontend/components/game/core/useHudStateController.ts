import {
    useCallback,
    useEffect,
    useRef,
    type Dispatch,
    type RefObject,
    type SetStateAction,
} from "react";
import type {
    BailOffer,
    CraftingState,
    InventoryItem,
    MarketState,
    PlayerHudState,
    RetosState,
    SpellEntry,
    TradeState,
} from "../../../lib/aowProtocol";
import type { Engine } from "../engine/Engine";
import {
    CLAN_TAG_HIGHLIGHT_COLOR,
    createCharacterClanTextStyle,
    getHudStatusTextStyle,
    setStyleIfChanged,
    setTextIfChanged,
    setVisibilityIfChanged,
} from "../rendering/textStyles";
import { shouldHighlightClanTag } from "../rendering/visibility";
import {useI18n} from '../../I18nProvider';

type UseHudStateControllerOptions = {
    playerHudRef: RefObject<PlayerHudState | null>;
    partyMemberIdsRef: RefObject<Set<string>>;
    engineRef: RefObject<Engine | null>;
    seguroTextRef: RefObject<any>;
    clanSeguroTextRef: RefObject<any>;
    setIsDeadWorldActive: Dispatch<SetStateAction<boolean>>;
    onHudChange?: ((hud: PlayerHudState | null) => void) | undefined;
    onTradeStateChange?: ((tradeState: TradeState | null) => void) | undefined;
    onMarketStateChange?:
        | ((marketState: MarketState | null) => void)
        | undefined;
    onRetosStateChange?: ((retosState: RetosState | null) => void) | undefined;
    onBailStateChange?: ((bailState: BailOffer | null) => void) | undefined;
    onCraftingStateChange?:
        | ((craftingState: CraftingState | null) => void)
        | undefined;
    preloadGraphicIds: (engine: Engine, graphicIds: string[]) => Promise<void>;
    collectSpellGraphicIds: (engine: Engine, spells: SpellEntry[]) => string[];
};

export function useHudStateController({
    playerHudRef,
    partyMemberIdsRef,
    engineRef,
    seguroTextRef,
    clanSeguroTextRef,
    setIsDeadWorldActive,
    onHudChange,
    onTradeStateChange,
    onMarketStateChange,
    onRetosStateChange,
    onBailStateChange,
    onCraftingStateChange,
    preloadGraphicIds,
    collectSpellGraphicIds,
}: UseHudStateControllerOptions) {
    const {locale}=useI18n();
    const localeRef=useRef(locale);localeRef.current=locale;
    const updateSeguroIndicators = useCallback(
        (hud: PlayerHudState | null) => {
            if (seguroTextRef.current) {
                const combatSeguroActive = Boolean(hud?.seguroActivado);
                const nextSeguroText = `${localeRef.current==='en'?'Safety':'Seguro'}: ${combatSeguroActive ? "ON" : "OFF"}`;
                const nextSeguroStyle = getHudStatusTextStyle(
                    combatSeguroActive ? 0x34c759 : 0xff3b30,
                );

                setTextIfChanged(seguroTextRef.current, nextSeguroText);
                setStyleIfChanged(seguroTextRef.current, nextSeguroStyle);
            }

            if (clanSeguroTextRef.current) {
                const hasClan = Boolean(hud?.clan);
                const clanSeguroActive = Boolean(hud?.seguroClanActivado);
                const nextClanSeguroText = hasClan
                    ? `Clan: ${clanSeguroActive ? "ON" : "OFF"}`
                    : "";
                const nextClanSeguroStyle = getHudStatusTextStyle(
                    clanSeguroActive ? 0x34c759 : 0xff3b30,
                );

                setVisibilityIfChanged(clanSeguroTextRef.current, hasClan);
                setTextIfChanged(clanSeguroTextRef.current, nextClanSeguroText);
                setStyleIfChanged(
                    clanSeguroTextRef.current,
                    nextClanSeguroStyle,
                );
            }
        },
        [clanSeguroTextRef, seguroTextRef],
    );
    useEffect(()=>{updateSeguroIndicators(playerHudRef.current);},[locale,playerHudRef,updateSeguroIndicators]);

    const refreshVisibleClanTagStyles = useCallback(
        (
            engine: Engine,
            hud: Pick<PlayerHudState, "zonaSegura"> | null,
        ): void => {
            const playerClanLabel = engine.playerContainer?.children.find(
                (child) => (child as any).isPlayerClan,
            ) as any;

            if (playerClanLabel && engine.user) {
                setStyleIfChanged(
                    playerClanLabel,
                    createCharacterClanTextStyle(
                        shouldHighlightClanTag(
                            engine.user,
                            engine.user.clan,
                            hud,
                        )
                            ? CLAN_TAG_HIGHLIGHT_COLOR
                            : engine.user.color || 0xffffff,
                    ),
                );
            }

            for (const [
                entityId,
                container,
            ] of engine.remoteEntities.entries()) {
                const entity = engine.personajes[entityId];
                if (!entity || !container) {
                    continue;
                }

                const clanLabel = container.children.find(
                    (child) => (child as any).isRemoteClan,
                ) as any;

                if (!clanLabel) {
                    continue;
                }

                setStyleIfChanged(
                    clanLabel,
                    createCharacterClanTextStyle(
                        shouldHighlightClanTag(entity, engine.user?.clan, hud)
                            ? CLAN_TAG_HIGHLIGHT_COLOR
                            : entity.color || 0xffffff,
                    ),
                );
            }
        },
        [],
    );

    const emitHud = useCallback(
        (hud: PlayerHudState | null) => {
            playerHudRef.current = hud;
            setIsDeadWorldActive(Boolean(hud?.deadWorldActive));
            const nextPartyMemberIds = new Set(
                (hud?.partyMembers ?? [])
                    .map((member) => String(member.id))
                    .filter((memberId) => memberId !== String(hud?.id ?? "")),
            );
            partyMemberIdsRef.current = nextPartyMemberIds;
            if (engineRef.current) {
                engineRef.current.partyMemberIds = nextPartyMemberIds;
                if (engineRef.current.user) {
                    engineRef.current.user.zonaSegura = hud?.zonaSegura;
                }
                refreshVisibleClanTagStyles(engineRef.current, hud);
            }
            updateSeguroIndicators(hud);
            onHudChange?.(hud);
        },
        [
            engineRef,
            onHudChange,
            partyMemberIdsRef,
            playerHudRef,
            refreshVisibleClanTagStyles,
            setIsDeadWorldActive,
            updateSeguroIndicators,
        ],
    );

    const mergeHud = useCallback(
        (patch: Partial<PlayerHudState>) => {
            const currentHud = playerHudRef.current;
            if (!currentHud) {
                return;
            }

            emitHud({ ...currentHud, ...patch });
        },
        [emitHud, playerHudRef],
    );

    const upsertInventoryItem = useCallback(
        (item: InventoryItem) => {
            const currentHud = playerHudRef.current;
            if (!currentHud) {
                return;
            }

            const nextInventory = currentHud.inventory.filter(
                (entry) => entry.slot !== item.slot,
            );
            nextInventory.push(item);
            nextInventory.sort((left, right) => left.slot - right.slot);
            emitHud({ ...currentHud, inventory: nextInventory });
        },
        [emitHud, playerHudRef],
    );

    const removeInventoryItem = useCallback(
        (slot: number, amount: number) => {
            const currentHud = playerHudRef.current;
            if (!currentHud) {
                return;
            }

            const nextInventory = currentHud.inventory
                .map((entry) => {
                    if (entry.slot !== slot) {
                        return entry;
                    }

                    return {
                        ...entry,
                        amount: Math.max(0, entry.amount - amount),
                    };
                })
                .filter((entry) => entry.amount > 0);

            emitHud({
                ...currentHud,
                inventory: nextInventory,
            });
        },
        [emitHud, playerHudRef],
    );

    const reorderInventoryItems = useCallback(
        (sourceSlot: number, targetSlot: number) => {
            const currentHud = playerHudRef.current;
            if (!currentHud || sourceSlot === targetSlot) {
                return;
            }

            const sourceItem =
                currentHud.inventory.find(
                    (entry) => entry.slot === sourceSlot,
                ) ?? null;

            if (!sourceItem) {
                return;
            }

            const nextInventory = currentHud.inventory.map((entry) => {
                if (entry.slot === sourceSlot) {
                    return { ...entry, slot: targetSlot };
                }

                if (entry.slot === targetSlot) {
                    return { ...entry, slot: sourceSlot };
                }

                return entry;
            });

            nextInventory.sort((left, right) => left.slot - right.slot);
            emitHud({ ...currentHud, inventory: nextInventory });
        },
        [emitHud, playerHudRef],
    );

    const upsertSpell = useCallback(
        (spell: SpellEntry) => {
            const currentHud = playerHudRef.current;
            if (!currentHud) {
                return;
            }

            const nextSpells = currentHud.spells.filter(
                (entry) => entry.slot !== spell.slot,
            );
            nextSpells.push(spell);
            nextSpells.sort((left, right) => left.slot - right.slot);
            emitHud({ ...currentHud, spells: nextSpells });

            const engine = engineRef.current;
            if (engine) {
                preloadGraphicIds(
                    engine,
                    collectSpellGraphicIds(engine, [spell]),
                ).catch((error) => {
                    console.warn(
                        `Failed to preload spell assets for ${spell.name}:`,
                        error,
                    );
                });
            }
        },
        [
            collectSpellGraphicIds,
            emitHud,
            engineRef,
            playerHudRef,
            preloadGraphicIds,
        ],
    );

    const updateEquippedInventoryByType = useCallback(
        (objType: number, equippedSlot: number | null) => {
            const currentHud = playerHudRef.current;
            if (!currentHud) {
                return;
            }

            emitHud({
                ...currentHud,
                inventory: currentHud.inventory.map((item) =>
                    item.objType === objType
                        ? {
                              ...item,
                              equipped:
                                  equippedSlot !== null &&
                                  item.slot === equippedSlot,
                          }
                        : item,
                ),
            });
        },
        [emitHud, playerHudRef],
    );

    const reorderSpells = useCallback(
        (sourceSlot: number, targetSlot: number) => {
            const currentHud = playerHudRef.current;
            if (!currentHud || sourceSlot === targetSlot) {
                return;
            }

            const sourceSpell =
                currentHud.spells.find((entry) => entry.slot === sourceSlot) ??
                null;

            if (!sourceSpell) {
                return;
            }

            const nextSpells = currentHud.spells.map((entry) => {
                if (entry.slot === sourceSlot) {
                    return { ...entry, slot: targetSlot };
                }

                if (entry.slot === targetSlot) {
                    return { ...entry, slot: sourceSlot };
                }

                return entry;
            });

            nextSpells.sort((left, right) => left.slot - right.slot);
            emitHud({ ...currentHud, spells: nextSpells });
        },
        [emitHud, playerHudRef],
    );

    const clearEquippedInventory = useCallback(() => {
        const currentHud = playerHudRef.current;
        if (!currentHud) {
            return;
        }

        emitHud({
            ...currentHud,
            inventory: currentHud.inventory.map((item) => ({
                ...item,
                equipped: false,
            })),
        });
    }, [emitHud, playerHudRef]);

    const emitTradeState = useCallback(
        (tradeState: TradeState | null) => {
            onTradeStateChange?.(tradeState);
        },
        [onTradeStateChange],
    );

    const emitMarketState = useCallback(
        (marketState: MarketState | null) => {
            onMarketStateChange?.(marketState);
        },
        [onMarketStateChange],
    );

    const emitRetosState = useCallback(
        (retosState: RetosState | null) => {
            onRetosStateChange?.(retosState);
        },
        [onRetosStateChange],
    );

    const emitBailState = useCallback(
        (bailState: BailOffer | null) => {
            onBailStateChange?.(bailState);
        },
        [onBailStateChange],
    );

    const emitCraftingState = useCallback(
        (craftingState: CraftingState | null) => {
            onCraftingStateChange?.(craftingState);
        },
        [onCraftingStateChange],
    );

    return {
        clearEquippedInventory,
        emitBailState,
        emitCraftingState,
        emitHud,
        emitMarketState,
        emitRetosState,
        emitTradeState,
        mergeHud,
        refreshVisibleClanTagStyles,
        removeInventoryItem,
        reorderInventoryItems,
        reorderSpells,
        updateEquippedInventoryByType,
        updateSeguroIndicators,
        upsertInventoryItem,
        upsertSpell,
    };
}
