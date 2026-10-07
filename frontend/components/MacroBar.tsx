"use client";
import { LocalizedText, LocalizedLabel } from '@/components/LocalizedText';
/* eslint-disable @next/next/no-img-element */


import React from "react";
import { useI18n } from "./I18nProvider";
import {
    OBJECT_TYPE,
    type InventoryItem,
    type PlayerHudState,
    type SpellEntry,
} from "../lib/aowProtocol";
import type { MacroTargetType, StoredMacro } from "../lib/character-settings";
import { formatNumber } from "../lib/number-format";
import {
    expandHotkeyCode,
    formatHotkeyCode,
    type HotkeySettings,
} from "../lib/hotkeys";
import {
    getTexturePath,
    loadGraphicsDB,
    loadObjectsDB,
} from "../utils/gameLoader";
import type { GraphicData, ObjectsDB } from "../types/game";

const SPELL_MACRO_ICON_URL = "/graphics/22031.png";

type MacroBarProps = {
    hud: PlayerHudState | null;
    connected?: boolean;
    hotkeySettings: HotkeySettings;
    macros: Array<StoredMacro | null>;
    useItemRepeatMs: number;
    onMacrosChange: React.Dispatch<
        React.SetStateAction<Array<StoredMacro | null>>
    >;
    onUseItem: (slot: number) => void;
    onRangeAttackRequest: () => void;
    onCastSpell: (spell: SpellEntry) => void;
    onSendCommand: (command: string) => void;
};

function ItemGraphic({
    graphicData,
    name,
    size = 38,
}: {
    graphicData?: GraphicData;
    name: string;
    size?: number;
}) {
    if (!graphicData?.numFile) {
        return (
            <div
                className="rounded-md bg-black/30"
                style={{ height: size, width: size }}
            />
        );
    }

    const scale = Math.min(
        1,
        size / Math.max(graphicData.width, graphicData.height, 1),
    );

    return (
        <div
            className="relative overflow-hidden rounded-sm"
            style={{ height: size, width: size }}
        >
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

function findAssignedHotkeyLabel(
    keyCode: string,
    hotkeySettings: HotkeySettings,
): string | null {
    const expandedCodeSet = new Set(expandHotkeyCode(keyCode));

    for (const codes of Object.values(hotkeySettings)) {
        const overlaps = codes.some((code) =>
            expandHotkeyCode(code).some((expandedCode) =>
                expandedCodeSet.has(expandedCode),
            ),
        );

        if (overlaps) {
            return formatHotkeyCode(keyCode);
        }
    }

    return null;
}

function resolveMacroItem(
    items: InventoryItem[],
    macro: StoredMacro | null,
): InventoryItem | null {
    if (!macro || macro.targetType !== "item") {
        return null;
    }

    return (
        items.find(
            (item) =>
                item.slot === macro.targetSlot &&
                item.idItem === macro.targetId,
        ) ??
        items.find((item) => item.idItem === macro.targetId) ??
        null
    );
}

function resolveMacroSpell(
    spells: SpellEntry[],
    macro: StoredMacro | null,
): SpellEntry | null {
    if (!macro || macro.targetType !== "spell") {
        return null;
    }

    return (
        spells.find(
            (spell) =>
                spell.slot === macro.targetSlot &&
                spell.idSpell === macro.targetId,
        ) ??
        spells.find((spell) => spell.idSpell === macro.targetId) ??
        null
    );
}

export default function MacroBar({
    hud,
    connected = false,
    hotkeySettings,
    macros,
    useItemRepeatMs,
    onMacrosChange,
    onUseItem,
    onRangeAttackRequest,
    onCastSpell,
    onSendCommand,
}: MacroBarProps) {
    const { locale } = useI18n();
    const items = React.useMemo(
        () => (hud?.inventory ?? []).slice().sort((a, b) => a.slot - b.slot),
        [hud?.inventory],
    );
    const spells = React.useMemo(
        () => (hud?.spells ?? []).slice().sort((a, b) => a.slot - b.slot),
        [hud?.spells],
    );
    const [graphicsDB, setGraphicsDB] = React.useState<Record<
        string,
        GraphicData
    > | null>(null);
    const [objectsDB, setObjectsDB] = React.useState<ObjectsDB | null>(null);
    const [rangedWeaponIds, setRangedWeaponIds] = React.useState<Set<number>>(
        new Set(),
    );
    const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
    const [listeningForKey, setListeningForKey] = React.useState(false);
    const [draftKeyCode, setDraftKeyCode] = React.useState("");
    const [draftTargetType, setDraftTargetType] =
        React.useState<MacroTargetType>("item");
    const [draftTargetSlot, setDraftTargetSlot] = React.useState<number | null>(
        null,
    );
    const [draftCommand, setDraftCommand] = React.useState("");
    const [error, setError] = React.useState<string | null>(null);
    const rootRef = React.useRef<HTMLDivElement | null>(null);

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
        let isActive = true;

        loadObjectsDB()
            .then((data) => {
                if (!isActive) {
                    return;
                }

                setObjectsDB(data);

                const nextIds = new Set<number>();

                Object.entries(data).forEach(([id, objectData]) => {
                    if (objectData.proyectil) {
                        nextIds.add(Number(id));
                    }
                });

                setRangedWeaponIds(nextIds);
            })
            .catch(() => {
                if (isActive) {
                    setObjectsDB({});
                    setRangedWeaponIds(new Set());
                }
            });

        return () => {
            isActive = false;
        };
    }, []);

    React.useEffect(() => {
        if (editingIndex === null) {
            setListeningForKey(false);
            setError(null);
        }
    }, [editingIndex]);

    React.useEffect(() => {
        if (editingIndex === null) {
            return;
        }

        const handlePointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setEditingIndex(null);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        return () =>
            document.removeEventListener("mousedown", handlePointerDown);
    }, [editingIndex]);

    const resolvedTargets = React.useMemo(
        () =>
            macros.map((macro) => ({
                item: resolveMacroItem(items, macro),
                spell: resolveMacroSpell(spells, macro),
            })),
        [items, macros, spells],
    );

    const draftItem = React.useMemo(
        () => items.find((item) => item.slot === draftTargetSlot) ?? null,
        [draftTargetSlot, items],
    );
    const draftSpell = React.useMemo(
        () => spells.find((spell) => spell.slot === draftTargetSlot) ?? null,
        [draftTargetSlot, spells],
    );

    const hasKeyConflict = React.useCallback(
        (keyCode: string) => {
            const assignedHotkey = findAssignedHotkeyLabel(
                keyCode,
                hotkeySettings,
            );
            if (assignedHotkey) {
                return `La tecla ${assignedHotkey} ya esta usada por una hotkey.`;
            }

            const expandedCodeSet = new Set(expandHotkeyCode(keyCode));
            const collisionIndex = macros.findIndex((macro, index) => {
                if (!macro || index === editingIndex) {
                    return false;
                }

                return expandHotkeyCode(macro.keyCode).some((code) =>
                    expandedCodeSet.has(code),
                );
            });

            if (collisionIndex >= 0) {
                return `La tecla ${formatHotkeyCode(keyCode)} ya esta usada por otro macro.`;
            }

            return null;
        },
        [editingIndex, hotkeySettings, macros],
    );

    React.useEffect(() => {
        if (!listeningForKey || editingIndex === null) {
            return;
        }

        const handleCapture = (event: KeyboardEvent) => {
            event.preventDefault();
            event.stopPropagation();

            if (event.code === "Escape") {
                setListeningForKey(false);
                setError(null);
                return;
            }

            if (event.code === "Backspace" || event.code === "Delete") {
                setDraftKeyCode("");
                setListeningForKey(false);
                setError(null);
                return;
            }

            const conflict = hasKeyConflict(event.code);
            if (conflict) {
                setError(conflict);
                return;
            }

            setDraftKeyCode(event.code);
            setListeningForKey(false);
            setError(null);
        };

        window.addEventListener("keydown", handleCapture, true);
        return () => window.removeEventListener("keydown", handleCapture, true);
    }, [editingIndex, hasKeyConflict, listeningForKey]);

    const activateMacro = React.useCallback(
        (index: number) => {
            const macro = macros[index];
            const resolved = resolvedTargets[index];

            if (!macro) {
                return;
            }

            if (macro.targetType === "item") {
                if (resolved?.item) {
                    if (
                        resolved.item.equipped &&
                        rangedWeaponIds.has(resolved.item.idItem) &&
                        objectsDB?.[resolved.item.idItem.toString()]?.proyectil
                    ) {
                        onRangeAttackRequest();
                    } else {
                        onUseItem(resolved.item.slot);
                    }
                }
                return;
            }

            if (macro.targetType === "command") {
                if (macro.command) {
                    onSendCommand(macro.command);
                }
                return;
            }

            if (resolved?.spell) {
                onCastSpell(resolved.spell);
            }
        },
        [
            macros,
            objectsDB,
            onCastSpell,
            onSendCommand,
            onRangeAttackRequest,
            onUseItem,
            rangedWeaponIds,
            resolvedTargets,
        ],
    );

    const activateMacroRef = React.useRef(activateMacro);
    const heldMacroTimerRef = React.useRef<number | null>(null);
    const heldMacroKeyRef = React.useRef<string | null>(null);
    const macrosRef = React.useRef(macros);
    const resolvedTargetsRef = React.useRef(resolvedTargets);

    React.useEffect(() => {
        activateMacroRef.current = activateMacro;
    }, [activateMacro]);

    React.useEffect(() => {
        macrosRef.current = macros;
    }, [macros]);

    React.useEffect(() => {
        resolvedTargetsRef.current = resolvedTargets;
    }, [resolvedTargets]);

    const stopHeldMacro = React.useCallback(() => {
        if (heldMacroTimerRef.current !== null) {
            window.clearInterval(heldMacroTimerRef.current);
            heldMacroTimerRef.current = null;
        }

        heldMacroKeyRef.current = null;
    }, []);

    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!connected || editingIndex !== null) {
                return;
            }

            if (!document.hasFocus()) {
                return;
            }

            if (!event.isTrusted) {
                return;
            }

            const target = event.target;
            const isTypingTarget =
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target instanceof HTMLSelectElement ||
                (target instanceof HTMLElement && target.isContentEditable);

            if (isTypingTarget) {
                return;
            }

            const macroIndex = macrosRef.current.findIndex(
                (macro) => macro?.keyCode === event.code,
            );
            if (macroIndex < 0) {
                return;
            }

            event.preventDefault();
            if (event.repeat) {
                return;
            }

            activateMacroRef.current(macroIndex);

            const item = resolvedTargetsRef.current[macroIndex]?.item ?? null;
            if (item?.objType === OBJECT_TYPE.pociones) {
                stopHeldMacro();
                heldMacroKeyRef.current = event.code;
                heldMacroTimerRef.current = window.setInterval(() => {
                    activateMacroRef.current(macroIndex);
                }, useItemRepeatMs);
            }
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (heldMacroKeyRef.current === event.code) {
                stopHeldMacro();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        window.addEventListener("blur", stopHeldMacro);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            window.removeEventListener("blur", stopHeldMacro);
            stopHeldMacro();
        };
    }, [connected, editingIndex, stopHeldMacro, useItemRepeatMs]);

    const openEditor = React.useCallback(
        (index: number) => {
            const macro = macros[index];
            const fallbackType: MacroTargetType =
                items.length > 0
                    ? "item"
                    : spells.length > 0
                      ? "spell"
                      : "command";
            const nextType = macro?.targetType ?? fallbackType;
            const nextSlot =
                macro?.targetSlot ??
                (nextType === "item"
                    ? (items[0]?.slot ?? null)
                    : nextType === "spell"
                      ? (spells[0]?.slot ?? null)
                      : null);

            setEditingIndex(index);
            setDraftKeyCode(macro?.keyCode ?? "");
            setDraftTargetType(nextType);
            setDraftTargetSlot(nextSlot);
            setDraftCommand(
                macro?.targetType === "command" ? (macro.command ?? "") : "",
            );
            setListeningForKey(false);
            setError(null);
        },
        [items, macros, spells],
    );

    const saveMacro = React.useCallback(() => {
        if (editingIndex === null) {
            return;
        }

        if (!draftKeyCode) {
            setError("Tenes que asignar una tecla al macro.");
            return;
        }

        const conflict = hasKeyConflict(draftKeyCode);
        if (conflict) {
            setError(conflict);
            return;
        }

        if (draftTargetType === "item") {
            if (!draftItem) {
                setError("Selecciona un item para el macro.");
                return;
            }

            onMacrosChange((current) => {
                const next = [...current];
                next[editingIndex] = {
                    keyCode: draftKeyCode,
                    targetType: "item",
                    targetSlot: draftItem.slot,
                    targetId: draftItem.idItem,
                    label: draftItem.name,
                    grhIndex: draftItem.grhIndex,
                };
                return next;
            });
        } else if (draftTargetType === "command") {
            const rawCommand = draftCommand.trim();

            if (!rawCommand) {
                setError("Escribi un comando para el macro.");
                return;
            }

            const normalizedCommandText = rawCommand.startsWith("/")
                ? rawCommand.slice(1)
                : rawCommand;

            if (!/^[a-zA-Z]{1,15}$/.test(normalizedCommandText)) {
                setError(
                    "El comando solo admite letras de la A a la Z y hasta 15 caracteres.",
                );
                return;
            }

            const normalizedCommand = `/${normalizedCommandText.toLowerCase()}`;

            onMacrosChange((current) => {
                const next = [...current];
                next[editingIndex] = {
                    keyCode: draftKeyCode,
                    targetType: "command",
                    label: normalizedCommand,
                    command: normalizedCommand,
                };
                return next;
            });
        } else {
            if (!draftSpell) {
                setError("Selecciona un hechizo para el macro.");
                return;
            }

            onMacrosChange((current) => {
                const next = [...current];
                next[editingIndex] = {
                    keyCode: draftKeyCode,
                    targetType: "spell",
                    targetSlot: draftSpell.slot,
                    targetId: draftSpell.idSpell,
                    label: draftSpell.name,
                };
                return next;
            });
        }

        setEditingIndex(null);
    }, [
        draftCommand,
        draftItem,
        draftKeyCode,
        draftSpell,
        draftTargetType,
        editingIndex,
        hasKeyConflict,
        onMacrosChange,
    ]);

    const deleteMacro = React.useCallback(() => {
        if (editingIndex === null) {
            return;
        }

        onMacrosChange((current) => {
            const next = [...current];
            next[editingIndex] = null;
            return next;
        });
        setEditingIndex(null);
    }, [editingIndex, onMacrosChange]);

    React.useEffect(() => {
        if (editingIndex === null) {
            return;
        }

        if (
            draftTargetType === "item" &&
            draftTargetSlot !== null &&
            !draftItem
        ) {
            setDraftTargetSlot(items[0]?.slot ?? null);
        }

        if (
            draftTargetType === "spell" &&
            draftTargetSlot !== null &&
            !draftSpell
        ) {
            setDraftTargetSlot(spells[0]?.slot ?? null);
        }
    }, [
        draftItem,
        draftSpell,
        draftTargetSlot,
        draftTargetType,
        editingIndex,
        items,
        spells,
    ]);

    const draftPreviewGraphic =
        draftTargetType === "item" && draftItem
            ? graphicsDB?.[draftItem.grhIndex.toString()]
            : undefined;

    return (
        <div
            ref={rootRef}
            className="relative pointer-events-auto mx-auto w-[90%] rounded-[22px] border border-[#6d5336] bg-[linear-gradient(180deg,rgba(45,30,20,0.96),rgba(19,13,10,0.98))] px-2 py-1.5 shadow-[0_20px_45px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,220,180,0.08)]"
        >
            <div className="grid grid-cols-8 gap-1">
                {macros.map((macro, index) => {
                    const resolved = resolvedTargets[index];
                    const isEditing = editingIndex === index;
                    const resolvedItem = resolved?.item ?? null;
                    const resolvedSpell = resolved?.spell ?? null;
                    const displayLabel =
                        resolvedItem?.name ??
                        resolvedSpell?.name ??
                        macro?.label ??
                        "";
                    const displayGraphic =
                        macro?.targetType === "item" &&
                        (resolvedItem || macro?.grhIndex)
                            ? graphicsDB?.[
                                  (
                                      resolvedItem?.grhIndex ??
                                      macro?.grhIndex ??
                                      0
                                  ).toString()
                              ]
                            : undefined;
                    const isMissingTarget = Boolean(
                        macro &&
                        ((macro.targetType === "item" && !resolvedItem) ||
                            (macro.targetType === "spell" && !resolvedSpell)),
                    );

                    return (
                        <div
                            key={`macro-${index}`}
                            className="relative min-w-0"
                        >
                            <LocalizedLabel><button
                                type="button"
                                onClick={() => {
                                    if (macro) {
                                        activateMacro(index);
                                        return;
                                    }

                                    openEditor(index);
                                }}
                                onContextMenu={(event) => {
                                    event.preventDefault();
                                    if (macro) {
                                        openEditor(index);
                                    }
                                }}
                                className={`group relative mx-auto flex aspect-square w-[calc(100%-5px)] items-center justify-center overflow-hidden rounded-[10px] border transition focus:outline-none focus-visible:outline-none ${
                                    macro
                                        ? isMissingTarget
                                            ? "border-rose-500/50 bg-[#221112] hover:border-rose-400/70"
                                            : "border-[#816142] bg-[linear-gradient(180deg,#18100d,#070505)] hover:border-amber-300/70"
                                        : "border-[#5a422b] bg-[linear-gradient(180deg,#120d0a,#050404)] hover:border-[#9b744c]"
                                } ${isEditing ? "ring-2 ring-amber-300/65" : ""}`}
                                title={displayLabel || `Macro ${index + 1}`}
                            >
                                <span className="pointer-events-none absolute inset-[2px] rounded-[8px] border border-white/5" />
                                {macro ? (
                                    macro.targetType === "item" ? (
                                        <ItemGraphic
                                            graphicData={displayGraphic}
                                            name={displayLabel}
                                            size={40}
                                        />
                                    ) : macro.targetType === "command" ? (
                                        <LocalizedLabel><img
                                            src={SPELL_MACRO_ICON_URL}
                                            alt={displayLabel || "Comando"}
                                            className="h-8 w-8 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.7)]"
                                            draggable={false}
                                        /></LocalizedLabel>
                                    ) : (
                                        <LocalizedLabel><img
                                            src={SPELL_MACRO_ICON_URL}
                                            alt={displayLabel || "Hechizo"}
                                            className="h-8 w-8 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.7)]"
                                            draggable={false}
                                        /></LocalizedLabel>
                                    )
                                ) : (
                                    <span className="text-xl text-stone-700">
                                        +
                                    </span>
                                )}

                                {macro?.keyCode ? (
                                    <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-amber-100 shadow-lg">
                                        <LocalizedText source={formatHotkeyCode(macro.keyCode)} />
                                    </span>
                                ) : null}
                            </button></LocalizedLabel>

                            {isEditing ? (
                                <div className="absolute bottom-full left-1/2 z-50 mb-3 w-[240px] -translate-x-1/2 rounded-[18px] border border-[#8a633d] bg-[linear-gradient(180deg,rgba(32,22,16,0.99),rgba(15,10,8,0.99))] p-3 shadow-[0_20px_40px_rgba(0,0,0,0.65)]">
                                    <div className="mb-3 flex items-center justify-between">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100/90">
                                            Macro {index + 1}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setEditingIndex(null)
                                            }
                                            className="text-xs text-stone-400 transition hover:text-stone-100"
                                        ><LocalizedText source={"Cerrar "} /></button>
                                    </div>

                                    <div className="space-y-3">
                                        <div>
                                            <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-stone-400"><LocalizedText source={"Tecla "} /></p>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setListeningForKey(true);
                                                    setError(null);
                                                }}
                                                className="flex w-full items-center justify-between rounded-xl border border-[#765838] bg-black/25 px-3 py-2 text-left text-sm text-stone-100 transition hover:border-amber-300/60"
                                            >
                                                <span>
                                                    <LocalizedText source={listeningForKey
                                                        ? "Presiona una tecla"
                                                        : draftKeyCode
                                                          ? formatHotkeyCode(
                                                                draftKeyCode,
                                                            )
                                                          : "Sin asignar"} />
                                                </span>
                                                <span className="text-[10px] uppercase tracking-[0.16em] text-stone-400">
                                                    <LocalizedText source={listeningForKey
                                                        ? "Esc cancela"
                                                        : "Cambiar"} />
                                                </span>
                                            </button>
                                        </div>

                                        <div>
                                            <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-stone-400"><LocalizedText source={"Tipo "} /></p>
                                            <div className="grid grid-cols-3 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setDraftTargetType(
                                                            "item",
                                                        );
                                                        setDraftTargetSlot(
                                                            items[0]?.slot ??
                                                                null,
                                                        );
                                                        setError(null);
                                                    }}
                                                    className={`rounded-xl border px-1.5 py-2 text-[11px] font-semibold transition ${
                                                        draftTargetType ===
                                                        "item"
                                                            ? "border-amber-300/70 bg-[#5c2411] text-amber-50"
                                                            : "border-[#5a422b] bg-[#1a120f] text-stone-300 hover:border-amber-400/35"
                                                    }`}
                                                >
                                                    Item
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setDraftTargetType(
                                                            "spell",
                                                        );
                                                        setDraftTargetSlot(
                                                            spells[0]?.slot ??
                                                                null,
                                                        );
                                                        setError(null);
                                                    }}
                                                    className={`rounded-xl border px-1.5 py-2 text-[11px] font-semibold transition ${
                                                        draftTargetType ===
                                                        "spell"
                                                            ? "border-amber-300/70 bg-[#5c2411] text-amber-50"
                                                            : "border-[#5a422b] bg-[#1a120f] text-stone-300 hover:border-amber-400/35"
                                                    }`}
                                                ><LocalizedText source={"Hechizo "} /></button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setDraftTargetType(
                                                            "command",
                                                        );
                                                        setDraftTargetSlot(
                                                            null,
                                                        );
                                                        setError(null);
                                                    }}
                                                    className={`rounded-xl border px-1.5 py-2 text-[11px] font-semibold transition ${
                                                        draftTargetType ===
                                                        "command"
                                                            ? "border-amber-300/70 bg-[#5c2411] text-amber-50"
                                                            : "border-[#5a422b] bg-[#1a120f] text-stone-300 hover:border-amber-400/35"
                                                    }`}
                                                ><LocalizedText source={"Comando "} /></button>
                                            </div>
                                        </div>

                                        <div>
                                            <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-stone-400"><LocalizedText source={"Seleccion "} /></p>
                                            <div className="mb-2 flex h-16 items-center gap-3 rounded-xl border border-[#6f5334] bg-black/30 px-3">
                                                <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/8 bg-black/35">
                                                    {draftTargetType ===
                                                    "item" ? (
                                                        <ItemGraphic
                                                            graphicData={
                                                                draftPreviewGraphic
                                                            }
                                                            name={
                                                                draftItem?.name ??
                                                                "Item"
                                                            }
                                                            size={34}
                                                        />
                                                    ) : draftTargetType ===
                                                      "command" ? (
                                                        <LocalizedLabel><img
                                                            src={
                                                                SPELL_MACRO_ICON_URL
                                                            }
                                                            alt="Comando"
                                                            className="h-8 w-8 object-contain"
                                                            draggable={false}
                                                        /></LocalizedLabel>
                                                    ) : draftSpell ? (
                                                        <LocalizedLabel><img
                                                            src={
                                                                SPELL_MACRO_ICON_URL
                                                            }
                                                            alt={
                                                                draftSpell.name
                                                            }
                                                            className="h-8 w-8 object-contain"
                                                            draggable={false}
                                                        /></LocalizedLabel>
                                                    ) : (
                                                        <span className="text-stone-600">
                                                            ?
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-stone-100">
                                                        {draftTargetType ===
                                                        "item"
                                                            ? <LocalizedText source={draftItem?.name ?? "Sin item seleccionado"} />
                                                            : draftTargetType ===
                                                                "spell"
                                                              ? <LocalizedText source={draftSpell?.name ?? "Sin hechizo seleccionado"} />
                                                              : draftCommand || <LocalizedText source="Sin comando" />}
                                                    </p>
                                                    <p className="text-[11px] text-stone-400">
                                                        {draftTargetType ===
                                                        "item"
                                                            ? draftItem
                                                                ? `Slot ${draftItem.slot}${draftItem.amount > 1 ? ` x${formatNumber(draftItem.amount)}` : ""}`
                                                                : <LocalizedText source={"Elegi un item del inventario"} />
                                                            : draftTargetType ===
                                                                "spell"
                                                              ? draftSpell
                                                                  ? `Slot ${draftSpell.slot}`
                                                                  : <LocalizedText source={"Elegi un hechizo disponible"} />
                                                              : locale === 'en' ? "Example: /meditate" : "Ejemplo: /meditar"}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-[#5f472e] bg-black/20 p-1.5">
                                                {draftTargetType === "item"
                                                    ? items.map((item) => {
                                                          const itemGraphic =
                                                              graphicsDB?.[
                                                                  item.grhIndex.toString()
                                                              ];

                                                          return (
                                                              <button
                                                                  key={`macro-item-${item.slot}`}
                                                                  type="button"
                                                                  onClick={() => {
                                                                      setDraftTargetSlot(
                                                                          item.slot,
                                                                      );
                                                                      setError(
                                                                          null,
                                                                      );
                                                                  }}
                                                                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                                                                      draftTargetSlot ===
                                                                      item.slot
                                                                          ? "bg-[#6b2b16] text-amber-50"
                                                                          : "text-stone-200 hover:bg-white/8"
                                                                  }`}
                                                              >
                                                                  <ItemGraphic
                                                                      graphicData={
                                                                          itemGraphic
                                                                      }
                                                                      name={item.name}
                                                                      size={26}
                                                                  />
                                                                  <span className="min-w-0 flex-1 truncate">
                                                                      <LocalizedText source={item.name} />
                                                                  </span>
                                                                  <span className="text-[10px] text-stone-400">
                                                                      {item.amount >
                                                                      1
                                                                          ? `x${formatNumber(item.amount)}`
                                                                          : `#${item.slot}`}
                                                                  </span>
                                                              </button>
                                                          );
                                                      })
                                                    : draftTargetType ===
                                                        "spell"
                                                      ? spells.map((spell) => (
                                                            <button
                                                                key={`macro-spell-${spell.slot}`}
                                                                type="button"
                                                                onClick={() => {
                                                                    setDraftTargetSlot(
                                                                        spell.slot,
                                                                    );
                                                                    setError(
                                                                        null,
                                                                    );
                                                                }}
                                                                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                                                                    draftTargetSlot ===
                                                                    spell.slot
                                                                        ? "bg-[#6b2b16] text-amber-50"
                                                                        : "text-stone-200 hover:bg-white/8"
                                                                }`}
                                                            >
                                                                <LocalizedLabel><img
                                                                    src={
                                                                        SPELL_MACRO_ICON_URL
                                                                    }
                                                                    alt={
                                                                        spell.name
                                                                    }
                                                                    className="h-[26px] w-[26px] object-contain"
                                                                    draggable={
                                                                        false
                                                                    }
                                                                /></LocalizedLabel>
                                                                <span className="min-w-0 flex-1 truncate">
                                                                    <LocalizedText source={spell.name} />
                                                                </span>
                                                                <span className="text-[10px] text-stone-400">
                                                                    #
                                                                    {spell.slot}
                                                                </span>
                                                            </button>
                                                        ))
                                                      : null}

                                                {draftTargetType ===
                                                "command" ? (
                                                    <div className="space-y-2 p-1">
                                                        <LocalizedLabel><input
                                                            type="text"
                                                            value={draftCommand}
                                                            maxLength={16}
                                                            onChange={(
                                                                event,
                                                            ) => {
                                                                setDraftCommand(
                                                                    event.target
                                                                        .value,
                                                                );
                                                                setError(null);
                                                            }}
                                                            placeholder={locale === 'en' ? '/meditate' : '/meditar'}
                                                            className="w-full rounded-lg border border-[#765838] bg-black/35 px-3 py-2 text-sm text-stone-100 outline-none placeholder:text-stone-500"
                                                        /></LocalizedLabel>
                                                        <p className="px-1 text-[11px] text-stone-400"><LocalizedText source={"Solo letras A-Z, maximo 15 caracteres. "} /></p>
                                                    </div>
                                                ) : null}

                                                {draftTargetType === "item" &&
                                                items.length === 0 ? (
                                                    <div className="px-2 py-4 text-center text-sm text-stone-500"><LocalizedText source={"No hay items para asignar. "} /></div>
                                                ) : null}

                                                {draftTargetType === "spell" &&
                                                spells.length === 0 ? (
                                                    <div className="px-2 py-4 text-center text-sm text-stone-500"><LocalizedText source={"No hay hechizos para asignar. "} /></div>
                                                ) : null}
                                            </div>
                                        </div>

                                        {error ? (
                                            <p className="rounded-lg border border-rose-500/35 bg-rose-950/25 px-2 py-1.5 text-xs text-rose-200">
                                                <LocalizedText source={error} />
                                            </p>
                                        ) : null}

                                        <div className="flex gap-2">
                                            {macro ? (
                                                <button
                                                    type="button"
                                                    onClick={deleteMacro}
                                                    className="rounded-xl border border-rose-500/40 bg-rose-950/20 px-3 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-400/65 hover:bg-rose-900/30"
                                                ><LocalizedText source={"Borrar "} /></button>
                                            ) : null}
                                            <button
                                                type="button"
                                                onClick={saveMacro}
                                                className="ml-auto rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-stone-950 transition hover:bg-amber-200"
                                            ><LocalizedText source="Guardar macro" /></button>
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
