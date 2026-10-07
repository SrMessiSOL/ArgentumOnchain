import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
    OBJECT_TYPE,
    type InventoryItem,
} from "../../../lib/aowProtocol";
import { sendClientSignal } from "../../../lib/clientDiagnostics";
import {
    findVisibleEntityAtExactTile,
    getSpellDataForTargeting,
} from "../admin/npcInspector";
import { Engine, type Character } from "../engine/Engine";
import {
    getCombatTileDistance,
    getCombatTileMatchRank,
    getPointerTargetPriority,
    isPointerOverMarkedSprite,
    isSelfFirstSupportSpell,
} from "../input/combatTargeting";

type ResourceKind = "hp" | "mana";

type ResourceChangeSample = {
    at: number;
    resource: ResourceKind;
    previous: number;
    current: number;
    max: number | null;
    percent: number | null;
};

type ResourceReactionSample = ResourceChangeSample & {
    reactionMs: number;
    slot: number;
    itemId: number | null;
    itemName: string | null;
    trustedInputAgeMs: number | null;
    untrustedInputAgeMs: number | null;
};

type PointerEntityTarget = {
    entity: Character;
    isSelf: boolean;
    isNpc: boolean;
    priority: number;
    tileMatchRank: number;
    columnDistance: number;
    tileDistance: number;
    zIndex: number;
};

export type TargetingMode =
    | { type: "range" }
    | { type: "spell"; slot: number; manaRequired: number; name: string }
    | { type: "fishing"; name: string }
    | { type: "woodcutting"; name: string }
    | { type: "mining"; name: string }
    | { type: "smelting"; name: string }
    | { type: "blacksmith"; name: string };

export type ResolvedSpellReleaseTarget = {
    x: number;
    y: number;
    preferSelfIfEmpty: boolean;
    resolvedEntityId: number | null;
    resolvedEntityType: "player" | "npc" | "self" | "none";
    resolvedSource:
        | "pointer_entity"
        | "exact_tile_entity"
        | "self_pointer"
        | "raw_tile";
};

const SPELL_TOO_FAST_MESSAGE = "No puedes lanzar hechizos tan rápido.";
const SPELL_AFTER_HIT_MESSAGE =
    "No puedes lanzar tan rápido después de un golpe.";
const RANGE_TOO_FAST_MESSAGE = "No puedes disparar flechas tan rápido.";
const RANGE_AFTER_HIT_MESSAGE =
    "No puedes disparar tan rápido después de un golpe.";
const RANGE_AFTER_SPELL_MESSAGE =
    "No puedes disparar tan rápido después de un hechizo.";
const CLIENT_RESOURCE_REACTION_WINDOW_MS = 10 * 60 * 1000;
const CLIENT_RESOURCE_REACTION_MS_THRESHOLD = 90;
const CLIENT_RESOURCE_REACTION_JITTER_MS = 60;
const CLIENT_RESOURCE_REACTION_MIN_SAMPLES = 6;
type UseCombatControllerOptions = {
    engineRef: RefObject<Engine | null>;
    websocketRef: RefObject<WebSocket | null>;
    connectionSessionKey?: string;
    playerHudRef: RefObject<any>;
    runtimeTimingRef: RefObject<any>;
    targetingModeRef: RefObject<TargetingMode | null>;
    lastServerConfirmedSelfPositionRef: RefObject<any>;
    lastWorldPointerTileRef: RefObject<any>;
    lastTrustedInputAtRef: RefObject<number | null>;
    lastUntrustedInputAtRef: RefObject<number | null>;
    nextMapClickAtRef: RefObject<number>;
    nextUseItemAtRef: RefObject<number>;
    combatCooldownsRef: RefObject<any>;
    lastResourceDropRef: RefObject<
        Record<ResourceKind, ResourceChangeSample | null>
    >;
    resourceReactionSamplesRef: RefObject<
        Record<ResourceKind, ResourceReactionSample[]>
    >;
    lastSpellAttemptAtRef: RefObject<number | null>;
    lastSpellAttemptIntervalMsRef: RefObject<number | null>;
    debugCombatTextRef: RefObject<any>;
    debugCombatOverlayTextRef: RefObject<string>;
    getEntityContainer: (engine: Engine, entityId: number) => any;
    setDebugCombatOverlayText: (text: string) => void;
    isDebugMode: boolean;
    onConsoleMessage?: ((message: any) => void) | undefined;
    recordClientGameAction: (
        action: string,
        details?: Record<string, unknown>,
    ) => void;
    setTextIfChanged: (text: any, value: string) => void;
    setVisibilityIfChanged: (text: any, visible: boolean) => void;
    recordSpellTargetSnap: (sample: any) => void;
};

export function useCombatController(options: UseCombatControllerOptions) {
    const isDebugModeRef = useRef(options.isDebugMode);
    const {
        combatCooldownsRef,
        debugCombatOverlayTextRef,
        debugCombatTextRef,
        engineRef,
        isDebugMode,
        lastResourceDropRef,
        lastServerConfirmedSelfPositionRef,
        lastSpellAttemptAtRef,
        lastSpellAttemptIntervalMsRef,
        lastTrustedInputAtRef,
        lastUntrustedInputAtRef,
        nextUseItemAtRef,
        onConsoleMessage,
        playerHudRef,
        resourceReactionSamplesRef,
        runtimeTimingRef,
        setDebugCombatOverlayText,
        setTextIfChanged,
        setVisibilityIfChanged,
        targetingModeRef,
    } = options;

    const pushSystemMessage = useCallback(
        (text: string, color = "#fcd34d") => {
            onConsoleMessage?.({
                text,
                color,
                source: "system",
            });
        },
        [onConsoleMessage],
    );

    useEffect(() => {
        isDebugModeRef.current = isDebugMode;
    }, [isDebugMode]);

    const clearExpiredCombatCooldowns = useCallback(() => {
        const now = Date.now();
        const cooldowns = combatCooldownsRef.current;

        if (cooldowns.nextMeleeAt > 0 && now >= cooldowns.nextMeleeAt) {
            cooldowns.nextMeleeAt = 0;
        }
        if (cooldowns.nextRangeAt > 0 && now >= cooldowns.nextRangeAt) {
            cooldowns.nextRangeAt = 0;
        }
        if (cooldowns.nextSpellAt > 0 && now >= cooldowns.nextSpellAt) {
            cooldowns.nextSpellAt = 0;
        }
        if (
            cooldowns.nextSpellAfterMeleeAt > 0 &&
            now >= cooldowns.nextSpellAfterMeleeAt
        ) {
            cooldowns.nextSpellAfterMeleeAt = 0;
        }
        if (
            cooldowns.nextMeleeAfterSpellAt > 0 &&
            now >= cooldowns.nextMeleeAfterSpellAt
        ) {
            cooldowns.nextMeleeAfterSpellAt = 0;
        }
        if (
            cooldowns.nextUseItemAfterMeleeAt > 0 &&
            now >= cooldowns.nextUseItemAfterMeleeAt
        ) {
            cooldowns.nextUseItemAfterMeleeAt = 0;
        }
    }, [combatCooldownsRef]);

    const recordResourceValue = useCallback(
        (resource: ResourceKind, value: number, maxValue?: number | null) => {
            const currentHud = playerHudRef.current;
            const previousValue =
                resource === "hp" ? currentHud?.hp : currentHud?.mana;
            const resolvedMax =
                maxValue ??
                (resource === "hp" ? currentHud?.maxHp : currentHud?.maxMana) ??
                null;

            if (
                typeof previousValue !== "number" ||
                !Number.isFinite(previousValue) ||
                value >= previousValue
            ) {
                return;
            }

            lastResourceDropRef.current[resource] = {
                at: Date.now(),
                resource,
                previous: previousValue,
                current: value,
                max: resolvedMax,
                percent:
                    typeof resolvedMax === "number" && resolvedMax > 0
                        ? Math.round((value / resolvedMax) * 1000) / 10
                        : null,
            };
        },
        [lastResourceDropRef, playerHudRef],
    );

    const recordResourceUseItem = useCallback(
        (slot: number, item: InventoryItem | null, sentAt: number) => {
            if (!item || item.objType !== OBJECT_TYPE.pociones) {
                return;
            }

            const normalizedName = item.name.toLowerCase();
            const resource: ResourceKind | null = /azul|mana/.test(
                normalizedName,
            )
                ? "mana"
                : /roja|vida|hp/.test(normalizedName)
                  ? "hp"
                  : null;

            if (!resource) {
                return;
            }

            const resourceDrop = lastResourceDropRef.current[resource];
            if (!resourceDrop) {
                return;
            }

            const reactionMs = sentAt - resourceDrop.at;
            if (
                reactionMs < 0 ||
                reactionMs > CLIENT_RESOURCE_REACTION_MS_THRESHOLD
            ) {
                return;
            }

            const trustedInputAgeMs = lastTrustedInputAtRef.current
                ? sentAt - lastTrustedInputAtRef.current
                : null;
            const untrustedInputAgeMs = lastUntrustedInputAtRef.current
                ? sentAt - lastUntrustedInputAtRef.current
                : null;
            const samples = resourceReactionSamplesRef.current[resource].filter(
                (sample) =>
                    sentAt - sample.at <= CLIENT_RESOURCE_REACTION_WINDOW_MS,
            );
            const nextSample: ResourceReactionSample = {
                ...resourceDrop,
                reactionMs,
                slot,
                itemId: item.idItem,
                itemName: item.name,
                trustedInputAgeMs:
                    trustedInputAgeMs !== null &&
                    trustedInputAgeMs >= 0 &&
                    trustedInputAgeMs <= 3000
                        ? trustedInputAgeMs
                        : null,
                untrustedInputAgeMs:
                    untrustedInputAgeMs !== null &&
                    untrustedInputAgeMs >= 0 &&
                    untrustedInputAgeMs <= 3000
                        ? untrustedInputAgeMs
                        : null,
            };

            if (
                nextSample.trustedInputAgeMs !== null &&
                nextSample.trustedInputAgeMs <= 120
            ) {
                return;
            }

            samples.push(nextSample);
            resourceReactionSamplesRef.current[resource] = samples;

            if (samples.length < CLIENT_RESOURCE_REACTION_MIN_SAMPLES) {
                return;
            }

            const reactionValues = samples.map((sample) => sample.reactionMs);
            const minReactionMs = Math.min(...reactionValues);
            const maxReactionMs = Math.max(...reactionValues);
            const percentValues = samples
                .map((sample) => sample.percent)
                .filter((value): value is number => typeof value === "number");

            if (
                maxReactionMs - minReactionMs >
                CLIENT_RESOURCE_REACTION_JITTER_MS
            ) {
                return;
            }

            sendClientSignal(
                {
                    action: "resource_response_timing",
                    severity: resource === "hp" ? "medium" : "low",
                    suspicionScore: resource === "hp" ? 18 : 12,
                    confidence: resource === "hp" ? 0.84 : 0.78,
                    details: {
                        resource,
                        sampleCount: samples.length,
                        minReactionMs,
                        maxReactionMs,
                        avgReactionMs: Math.round(
                            reactionValues.reduce(
                                (sum, value) => sum + value,
                                0,
                            ) / reactionValues.length,
                        ),
                        percentMin:
                            percentValues.length > 0
                                ? Math.min(...percentValues)
                                : null,
                        percentMax:
                            percentValues.length > 0
                                ? Math.max(...percentValues)
                                : null,
                        lastSlot: slot,
                        lastItemId: item.idItem,
                        lastItemName: item.name,
                        lastTrustedInputAgeMs: nextSample.trustedInputAgeMs,
                        lastUntrustedInputAgeMs: nextSample.untrustedInputAgeMs,
                    },
                },
                {
                    throttleKey: `resource_response_timing:${resource}`,
                    throttleMs: CLIENT_RESOURCE_REACTION_WINDOW_MS,
                },
            );
        },
        [
            lastResourceDropRef,
            lastTrustedInputAtRef,
            lastUntrustedInputAtRef,
            resourceReactionSamplesRef,
        ],
    );

    const canStartLocalCombatAction = useCallback(
        (action: "melee" | "range" | "spell") => {
            clearExpiredCombatCooldowns();

            const now = Date.now();
            const cooldowns = combatCooldownsRef.current;

            if (action === "melee") {
                return (
                    cooldowns.nextMeleeAt <= now &&
                    cooldowns.nextMeleeAfterSpellAt <= now
                );
            }

            if (action === "range") {
                if (cooldowns.nextSpellAfterMeleeAt > now) {
                    pushSystemMessage(RANGE_AFTER_HIT_MESSAGE, "#fca5a5");
                    return false;
                }
                if (cooldowns.nextMeleeAfterSpellAt > now) {
                    pushSystemMessage(RANGE_AFTER_SPELL_MESSAGE, "#fca5a5");
                    return false;
                }
                if (cooldowns.nextRangeAt > now) {
                    pushSystemMessage(RANGE_TOO_FAST_MESSAGE, "#fca5a5");
                    return false;
                }
                return true;
            }

            if (cooldowns.nextSpellAfterMeleeAt > now) {
                pushSystemMessage(SPELL_AFTER_HIT_MESSAGE, "#fca5a5");
                return false;
            }
            if (cooldowns.nextSpellAt > now) {
                pushSystemMessage(SPELL_TOO_FAST_MESSAGE, "#fca5a5");
                return false;
            }
            return true;
        },
        [clearExpiredCombatCooldowns, combatCooldownsRef, pushSystemMessage],
    );

    const registerLocalCombatAction = useCallback(
        (action: "melee" | "range" | "spell") => {
            const now = Date.now();
            const cooldowns = combatCooldownsRef.current;

            if (action === "melee") {
                cooldowns.nextMeleeAt =
                    now + runtimeTimingRef.current.actionCooldowns.meleeMs;
                cooldowns.nextSpellAfterMeleeAt =
                    now +
                    runtimeTimingRef.current.actionCooldowns.meleeToSpellMs;
                cooldowns.nextUseItemAfterMeleeAt =
                    now +
                    runtimeTimingRef.current.actionCooldowns.meleeToUseItemMs;
                return;
            }

            if (action === "range") {
                cooldowns.nextRangeAt =
                    now + runtimeTimingRef.current.actionCooldowns.rangeMs;
                cooldowns.nextMeleeAt =
                    now + runtimeTimingRef.current.actionCooldowns.meleeMs;
                cooldowns.nextSpellAt =
                    now + runtimeTimingRef.current.actionCooldowns.spellMs;
                return;
            }

            cooldowns.nextSpellAt =
                now + runtimeTimingRef.current.actionCooldowns.spellMs;
            cooldowns.nextMeleeAfterSpellAt =
                now + runtimeTimingRef.current.actionCooldowns.spellToMeleeMs;
        },
        [combatCooldownsRef, runtimeTimingRef],
    );

    const updateDebugCombatText = useCallback(() => {
        const debugText = debugCombatTextRef.current;
        if (!debugText) {
            return;
        }
        if (!isDebugModeRef.current) {
            setVisibilityIfChanged(debugText, false);
            return;
        }

        clearExpiredCombatCooldowns();

        const now = Date.now();
        const cooldowns = combatCooldownsRef.current;
        const remaining = (target: number) => Math.max(0, target - now);
        const spellAttemptIntervalMs = lastSpellAttemptIntervalMsRef.current;

        const nextDebugText = [
            `Combat Debug [${isDebugModeRef.current ? "ON" : "OFF"}]`,
            `melee: ${remaining(cooldowns.nextMeleeAt)}ms`,
            `range: ${remaining(cooldowns.nextRangeAt)}ms`,
            `spell: ${remaining(cooldowns.nextSpellAt)}ms`,
            `melee->spell: ${remaining(cooldowns.nextSpellAfterMeleeAt)}ms`,
            `spell->melee: ${remaining(cooldowns.nextMeleeAfterSpellAt)}ms`,
            `item: ${remaining(nextUseItemAtRef.current)}ms`,
            `melee->item: ${remaining(cooldowns.nextUseItemAfterMeleeAt)}ms`,
            `spell->spell click: ${spellAttemptIntervalMs ?? "--"}ms`,
        ].join("\n");

        setTextIfChanged(debugText, nextDebugText);
        if (debugCombatOverlayTextRef.current !== nextDebugText) {
            debugCombatOverlayTextRef.current = nextDebugText;
            setDebugCombatOverlayText(nextDebugText);
        }
        setVisibilityIfChanged(debugText, true);
    }, [
        clearExpiredCombatCooldowns,
        combatCooldownsRef,
        debugCombatOverlayTextRef,
        debugCombatTextRef,
        lastSpellAttemptIntervalMsRef,
        nextUseItemAtRef,
        setDebugCombatOverlayText,
        setTextIfChanged,
        setVisibilityIfChanged,
    ]);

    const registerDebugSpellAttempt = useCallback(() => {
        const now = Date.now();
        const previousAttemptAt = lastSpellAttemptAtRef.current;
        if (previousAttemptAt !== null) {
            lastSpellAttemptIntervalMsRef.current = now - previousAttemptAt;
        }
        lastSpellAttemptAtRef.current = now;
        updateDebugCombatText();
    }, [
        lastSpellAttemptAtRef,
        lastSpellAttemptIntervalMsRef,
        updateDebugCombatText,
    ]);

    const updateCanvasCursor = useCallback(() => {
        const canvas = engineRef.current?.app?.canvas;
        const isTargeting = Boolean(targetingModeRef.current);
        const cursor = isTargeting ? "crosshair" : "default";

        if (canvas) {
            // eslint-disable-next-line react-hooks/immutability
            canvas.style.cursor = cursor;
        }

        document.body.style.cursor = cursor;
        document.documentElement.style.cursor = cursor;
        document.documentElement.classList.toggle(
            "game-targeting",
            isTargeting,
        );
    }, [engineRef, targetingModeRef]);

    const clearTargetingMode = useCallback(() => {
        targetingModeRef.current = null;
        updateCanvasCursor();
    }, [targetingModeRef, updateCanvasCursor]);

    const setTargetingMode = useCallback(
        (mode: TargetingMode) => {
            targetingModeRef.current = mode;
            updateCanvasCursor();

            if (mode.type === "fishing") {
                pushSystemMessage(
                    `${mode.name} lista. Haz click sobre una casilla de agua cercana para pescar.`,
                );
                return;
            }
            if (mode.type === "woodcutting") {
                pushSystemMessage(
                    `${mode.name} lista. Haz click sobre un árbol cercano para talar.`,
                );
                return;
            }
            if (mode.type === "mining") {
                pushSystemMessage(
                    `${mode.name} listo. Haz click sobre un yacimiento cercano para minar.`,
                );
                return;
            }
            if (mode.type === "smelting") {
                pushSystemMessage(
                    `${mode.name} listo. Haz click sobre una fragua cercana para fundirlo.`,
                );
                return;
            }
            if (mode.type === "blacksmith") {
                pushSystemMessage(
                    `${mode.name} listo. Haz click sobre un yunque cercano para trabajar herrería.`,
                );
            }
        },
        [targetingModeRef, pushSystemMessage, updateCanvasCursor],
    );

    const isFishingRodItem = useCallback((item: InventoryItem | null) => {
        if (!item) return false;
        return /cañ?a de pesca/i.test(item.name);
    }, []);
    const isWoodcuttingToolItem = useCallback((item: InventoryItem | null) => {
        if (!item) return false;
        return /hacha de leñador|hacha de leña/i.test(item.name);
    }, []);
    const isMiningToolItem = useCallback((item: InventoryItem | null) => {
        if (!item) return false;
        return /piquete de minero|pico de minero|piqueta de minero/i.test(
            item.name,
        );
    }, []);
    const isSmeltingMineralItem = useCallback((item: InventoryItem | null) => {
        if (!item) return false;
        return /minerales? de hierro|minerales? de plata|minerales? de oro/i.test(
            item.name,
        );
    }, []);

    const getEquippedWeaponItem = useCallback((): InventoryItem | null => {
        const currentHud = playerHudRef.current;
        return (
            currentHud?.inventory.find(
                (item: InventoryItem) =>
                    item.equipped && item.objType === OBJECT_TYPE.armas,
            ) ?? null
        );
    }, [playerHudRef]);

    const hasEquippedMeleeWeapon = useCallback(() => {
        const weapon = getEquippedWeaponItem();
        const objectsDB = engineRef.current?.objectsDB;
        if (!weapon || !objectsDB) {
            return false;
        }
        return !objectsDB[weapon.idItem.toString()]?.proyectil;
    }, [engineRef, getEquippedWeaponItem]);

    const hasEquippedRangedWeapon = useCallback(() => {
        const weapon = getEquippedWeaponItem();
        const objectsDB = engineRef.current?.objectsDB;
        if (!weapon || !objectsDB) {
            return false;
        }
        return Boolean(objectsDB[weapon.idItem.toString()]?.proyectil);
    }, [engineRef, getEquippedWeaponItem]);

    const resolveEntityTargetFromPointer = useCallback(
        (
            engine: Engine,
            event: any,
            preferSelfFirst: boolean,
            targetTileX: number,
            targetTileY: number,
        ): PointerEntityTarget | null => {
            const pointerX = event.global.x;
            const pointerY = event.global.y;
            let matchedTarget: PointerEntityTarget | null = null;

            const considerTarget = (
                entity: Character | null | undefined,
                container: any,
                hitMarkers: Array<
                    | "isPlayerBody"
                    | "isPlayerHead"
                    | "isPlayerHelmet"
                    | "isRemoteBody"
                    | "isRemoteHead"
                    | "isRemoteHelmet"
                >,
                isSelf: boolean,
            ) => {
                if (!entity || !container || container.destroyed) {
                    return;
                }

                const isPointerOverSprite = isPointerOverMarkedSprite(
                    container,
                    hitMarkers,
                    pointerX,
                    pointerY,
                );

                if (!isPointerOverSprite) {
                    return;
                }

                const candidate = {
                    entity,
                    isSelf,
                    isNpc: Boolean(entity.isNpc),
                    priority: getPointerTargetPriority(
                        entity,
                        isSelf,
                        preferSelfFirst,
                    ),
                    tileMatchRank: getCombatTileMatchRank(
                        entity,
                        targetTileX,
                        targetTileY,
                    ),
                    columnDistance: Math.abs(entity.pos.x - targetTileX),
                    tileDistance: getCombatTileDistance(
                        entity,
                        targetTileX,
                        targetTileY,
                    ),
                    zIndex: Number(container.zIndex ?? 0),
                };

                if (
                    !matchedTarget ||
                    candidate.tileMatchRank < matchedTarget.tileMatchRank ||
                    (candidate.tileMatchRank === matchedTarget.tileMatchRank &&
                        candidate.columnDistance <
                            matchedTarget.columnDistance) ||
                    (candidate.tileMatchRank === matchedTarget.tileMatchRank &&
                        candidate.columnDistance ===
                            matchedTarget.columnDistance &&
                        candidate.tileDistance < matchedTarget.tileDistance) ||
                    (candidate.tileMatchRank === matchedTarget.tileMatchRank &&
                        candidate.columnDistance ===
                            matchedTarget.columnDistance &&
                        candidate.tileDistance === matchedTarget.tileDistance &&
                        candidate.priority < matchedTarget.priority) ||
                    (candidate.tileMatchRank === matchedTarget.tileMatchRank &&
                        candidate.columnDistance ===
                            matchedTarget.columnDistance &&
                        candidate.tileDistance === matchedTarget.tileDistance &&
                        candidate.priority === matchedTarget.priority &&
                        candidate.zIndex >= matchedTarget.zIndex)
                ) {
                    matchedTarget = candidate;
                }
            };

            considerTarget(
                engine.user,
                engine.playerContainer,
                ["isPlayerBody", "isPlayerHead", "isPlayerHelmet"],
                true,
            );

            for (const [
                entityId,
                container,
            ] of engine.remoteEntities.entries()) {
                considerTarget(
                    engine.personajes[entityId],
                    container,
                    ["isRemoteBody", "isRemoteHead", "isRemoteHelmet"],
                    false,
                );
            }

            return matchedTarget;
        },
        [],
    );

    const resolveCombatReleaseTarget = useCallback(
        (
            engine: Engine,
            event: any,
            interaction: { targetTileX: number; targetTileY: number },
        ) => {
            const entityTarget = resolveEntityTargetFromPointer(
                engine,
                event,
                false,
                interaction.targetTileX,
                interaction.targetTileY,
            );
            if (entityTarget) {
                return {
                    x: entityTarget.entity.pos.x,
                    y: entityTarget.entity.pos.y,
                };
            }
            const exactTileEntity = findVisibleEntityAtExactTile(
                engine,
                interaction.targetTileX,
                interaction.targetTileY,
            );
            if (exactTileEntity) {
                return { x: exactTileEntity.pos.x, y: exactTileEntity.pos.y };
            }
            return { x: interaction.targetTileX, y: interaction.targetTileY };
        },
        [resolveEntityTargetFromPointer],
    );

    const resolveSpellReleaseTarget = useCallback(
        (
            engine: Engine,
            event: any,
            interaction: { targetTileX: number; targetTileY: number },
        ): ResolvedSpellReleaseTarget => {
            const spellData = getSpellDataForTargeting(
                engine,
                targetingModeRef.current?.type === "spell"
                    ? targetingModeRef.current.slot
                    : 0,
                playerHudRef.current?.spells,
            );
            const preferSelfFirst = isSelfFirstSupportSpell(spellData);
            const entityTarget = resolveEntityTargetFromPointer(
                engine,
                event,
                preferSelfFirst,
                interaction.targetTileX,
                interaction.targetTileY,
            );

            if (entityTarget) {
                if (entityTarget.isSelf) {
                    const user = engine.user;
                    if (user) {
                        const confirmedPosition =
                            lastServerConfirmedSelfPositionRef.current;
                        const fallbackPosition =
                            confirmedPosition &&
                            confirmedPosition.map === user.map
                                ? confirmedPosition
                                : { x: user.pos.x, y: user.pos.y };
                        return {
                            x: fallbackPosition.x,
                            y: fallbackPosition.y,
                            preferSelfIfEmpty: true,
                            resolvedEntityId: Number(user.id),
                            resolvedEntityType: "self",
                            resolvedSource: "self_pointer",
                        };
                    }
                }

                return {
                    x: entityTarget.entity.pos.x,
                    y: entityTarget.entity.pos.y,
                    preferSelfIfEmpty: false,
                    resolvedEntityId: Number(entityTarget.entity.id),
                    resolvedEntityType: entityTarget.entity.isNpc
                        ? "npc"
                        : "player",
                    resolvedSource: "pointer_entity",
                };
            }

            const exactTileEntity = findVisibleEntityAtExactTile(
                engine,
                interaction.targetTileX,
                interaction.targetTileY,
            );
            if (exactTileEntity) {
                return {
                    x: exactTileEntity.pos.x,
                    y: exactTileEntity.pos.y,
                    preferSelfIfEmpty: exactTileEntity.id === engine.user?.id,
                    resolvedEntityId: Number(exactTileEntity.id),
                    resolvedEntityType:
                        exactTileEntity.id === engine.user?.id
                            ? "self"
                            : exactTileEntity.isNpc
                              ? "npc"
                              : "player",
                    resolvedSource: "exact_tile_entity",
                };
            }

            if (
                engine.user &&
                isPointerOverMarkedSprite(
                    engine.playerContainer,
                    ["isPlayerBody", "isPlayerHead", "isPlayerHelmet"],
                    event.global.x,
                    event.global.y,
                )
            ) {
                const confirmedPosition =
                    lastServerConfirmedSelfPositionRef.current;
                const fallbackPosition =
                    confirmedPosition &&
                    confirmedPosition.map === engine.user.map
                        ? confirmedPosition
                        : { x: engine.user.pos.x, y: engine.user.pos.y };

                return {
                    x: fallbackPosition.x,
                    y: fallbackPosition.y,
                    preferSelfIfEmpty: true,
                    resolvedEntityId: Number(engine.user.id),
                    resolvedEntityType: "self",
                    resolvedSource: "self_pointer",
                };
            }

            return {
                x: interaction.targetTileX,
                y: interaction.targetTileY,
                preferSelfIfEmpty: false,
                resolvedEntityId: null,
                resolvedEntityType: "none",
                resolvedSource: "raw_tile",
            };
        },
        [
            lastServerConfirmedSelfPositionRef,
            playerHudRef,
            targetingModeRef,
            resolveEntityTargetFromPointer,
        ],
    );

    return {
        canStartLocalCombatAction,
        clearExpiredCombatCooldowns,
        clearTargetingMode,
        getEquippedWeaponItem,
        hasEquippedMeleeWeapon,
        hasEquippedRangedWeapon,
        isFishingRodItem,
        isMiningToolItem,
        isSmeltingMineralItem,
        isWoodcuttingToolItem,
        pushSystemMessage,
        recordResourceUseItem,
        recordResourceValue,
        registerDebugSpellAttempt,
        registerLocalCombatAction,
        resolveCombatReleaseTarget,
        resolveSpellReleaseTarget,
        setTargetingMode,
        updateCanvasCursor,
        updateDebugCombatText,
    };
}
