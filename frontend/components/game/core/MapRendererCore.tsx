"use client";
import { LocalizedText } from '@/components/LocalizedText';
/* eslint-disable react-hooks/immutability */

import React, { useEffect, useRef } from "react";
import {
    Container,
    Text,
    TextStyle,
    CanvasTextMetrics,
    Graphics,
} from "pixi.js";
import { GraphicData, MapTile, SpellData } from "../../../types/game";
import { getTileAt } from "../../../utils/gameLoader";
import {
    createDialogPacket,
    type ChatChannel,
    type CharacterStatsSnapshot,
    type PanelSnapshot,
    type BailOffer,
    type CraftingState,
    type CharacterSnapshot,
    type ClanHudMember,
    type MarketState,
    type PartyHudMember,
    type PlayerHudState,
    type RetosState,
    type TradeState,
} from "../../../lib/aowProtocol";
import {
    VIEWPORT_PIXEL_HEIGHT,
    VIEWPORT_PIXEL_WIDTH,
} from "../../../lib/viewport";
import {
    DEFAULT_HOTKEY_SETTINGS,
    type HotkeySettings,
} from "../../../lib/hotkeys";
import {
    DEFAULT_RUNTIME_TIMING,
    type RuntimeTimingConfig,
} from "../../../lib/runtime-config";
import type { StoredMacro } from "../../../lib/character-settings";
import { GameSoundManager, type SoundPosition } from "../../../lib/sound";
import { DebugCombatOverlay } from "../overlays/DebugCombatOverlay";
import { LoadingOverlay } from "../overlays/LoadingOverlay";
import { NpcContextMenu } from "../overlays/NpcContextMenu";
import { NpcInspectorModal } from "../overlays/NpcInspectorModal";
import {
    setTextIfChanged,
    setVisibilityIfChanged,
} from "../rendering/textStyles";
import {
    destroyDisplayObjectSafely,
    unregisterContainerCullEntries,
} from "../rendering/pixiUtils";
import { Engine, type Character } from "../engine/Engine";
import {
    destroySharedTextureCaches,
    type SharedTextureCaches,
} from "../rendering/textureCaches";
import { useOutgoingRequests } from "../session/useOutgoingRequests";
import { useGameSession } from "../session/useGameSession";
import { useI18n } from "@/components/I18nProvider";
import { handleIncomingGamePacket } from "../session/handleIncomingGamePacket";
import { useRendererBootstrap } from "./useRendererBootstrap";
import { useAssetPipeline } from "./useAssetPipeline";
import { useMovementSync, type LocalPendingMove } from "./useMovementSync";
import { useCombatController, type TargetingMode } from "./useCombatController";
import { useKeyboardGameplay } from "./useKeyboardGameplay";
import { useNpcAdminTools } from "./useNpcAdminTools";
import { useHudStateController } from "./useHudStateController";
import { useSceneController } from "./useSceneController";
import { useRemoteEntityController } from "./useRemoteEntityController";
import { createEntityOverlays } from "../rendering/entityOverlays";
import {
    collectSpellGraphicIds,
    resolveNakedBodyIdFromHeadId,
} from "../assets/scenePreload";
import {
    getKeyboardKeyCandidatesFromCode,
    normalizeKeyboardEventKey,
    useClientInputDiagnostics,
} from "../diagnostics/useClientInputDiagnostics";
import {
    formatNpcDropChance,
    formatNpcNumber,
    isAdminInspector,
    renderInspectableNpcItemGraphic,
    type InspectableNpc,
    type RevivableCharacter,
} from "../admin/npcInspector";

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

type SpellTargetSnapSample = {
    at: number;
    clickedTileX: number;
    clickedTileY: number;
    resolvedX: number;
    resolvedY: number;
    tileDistance: number;
    resolvedEntityId: number | null;
    resolvedEntityType: "player" | "npc" | "self" | "none";
    resolvedSource:
        | "pointer_entity"
        | "exact_tile_entity"
        | "self_pointer"
        | "raw_tile";
};

type PerformanceSample = {
    fps: number | null;
    pingMs: number | null;
};

interface MapRendererProps {
    mapNumber: number;
    width?: number;
    height?: number;
    embedded?: boolean;
    connection?: ManualConnectionConfig | null;
    equipRequest?: { slot: number; token: number } | null;
    useItemClickRequest?: { slot: number; token: number } | null;
    useItemURequest?: { slot: number; token: number } | null;
    dropRequest?: { slot: number; amount: number; token: number } | null;
    buyRequest?: { slot: number; amount: number; token: number } | null;
    sellRequest?: { slot: number; amount: number; token: number } | null;
    changeBankTabRequest?: {
        tab: "character" | "account" | "clan";
        token: number;
    } | null;
    depositBankGoldRequest?: { amount: number; token: number } | null;
    withdrawBankGoldRequest?: { amount: number; token: number } | null;
    closeTradeRequest?: { token: number } | null;
    marketActionRequest?: {
        action: "refresh" | "create" | "buy" | "cancel" | "claim";
        payload?: Record<string, unknown>;
        token: number;
    } | null;
    retosActionRequest?: {
        action: "refresh" | "create" | "join" | "cancel";
        payload?: Record<string, unknown>;
        token: number;
    } | null;
    craftRequest?: {
        profession: "carpentry" | "blacksmith" | "tailoring";
        itemId: number;
        amount: number;
        token: number;
    } | null;
    reorderInventoryRequest?: {
        sourceSlot: number;
        targetSlot: number;
        token: number;
    } | null;
    reorderSpellRequest?: {
        sourceSlot: number;
        targetSlot: number;
        token: number;
    } | null;
    reorderBankRequest?: {
        sourceSlot: number;
        targetSlot: number;
        token: number;
    } | null;
    rangeAttackRequest?: { token: number } | null;
    spellTargetRequest?: {
        slot: number;
        manaRequired: number;
        name: string;
        token: number;
    } | null;
    chatRequest?: { message: string; token: number } | null;
    runtimeTiming?: RuntimeTimingConfig;
    hotkeySettings?: HotkeySettings;
    macros?: Array<StoredMacro | null>;
    soundVolume?: number;
    onMapChange?: (mapNumber: number) => void;
    onStatusChange?: (status: RendererStatus) => void;
    onHudChange?: (hud: PlayerHudState | null) => void;
    onConsoleMessage?: (message: ConsoleMessage) => void;
    onGlobalNotice?: (notice: { text: string; durationMs: number }) => void;
    onTradeStateChange?: (tradeState: TradeState | null) => void;
    onMarketStateChange?: (marketState: MarketState | null) => void;
    onRetosStateChange?: (retosState: RetosState | null) => void;
    onBailStateChange?: (bailState: BailOffer | null) => void;
    onCraftingStateChange?: (craftingState: CraftingState | null) => void;
    onAdminIntervalsOpen?: () => void;
    onAdminOverviewSnapshot?: (snapshot: PanelSnapshot) => void;
    onCharacterStatsSnapshot?: (snapshot: CharacterStatsSnapshot) => void;
    onPerformanceSample?: (sample: PerformanceSample) => void;
}

interface ManualConnectionConfig {
    wsUrl: string;
    ticket: string;
    typeGame?: number;
    idChar?: number;
    sessionKey: string;
}

interface RendererStatus {
    connected: boolean;
    connecting: boolean;
    worldName?: string;
    error?: string;
    consoleLine?: string;
}

type LoadingStage =
    | "Preparando cliente"
    | "Cargando escena inicial"
    | "Cargando personaje"
    | "Cargando hechizos"
    | "Renderizando mundo"
    | "Precargando alrededores";

interface LoadingState {
    active: boolean;
    stage: LoadingStage;
    detail: string;
    progress: number;
}

interface ConsoleMessage {
    text: string;
    color?: string;
    source: "console" | "dialog" | "system";
    speakerType?: "npc" | "user";
    channel?: ChatChannel;
    senderName?: string;
    npcName?: string;
}

type ActiveDialogMessage = {
    text: string;
    color?: string;
    timeoutId: number;
    variant: "bubble" | "floatingCombat";
    startedAt: number;
    durationMs: number;
};

type ActiveCastBar = {
    startedAt: number;
    durationMs: number;
};

type PendingTileState = {
    objInfo?: MapTile["objInfo"] | null;
    blocked?: MapTile["blocked"] | null;
};

const FPS_TEXT_OFFSET_X = 10;
const FPS_TEXT_OFFSET_Y = 8;
const PING_TEXT_OFFSET_Y = 22;
const SEGURO_TEXT_OFFSET_Y = 36;
const CLAN_SEGURO_TEXT_OFFSET_Y = 50;
const DEBUG_COMBAT_TEXT_OFFSET_Y = 50;
const PROJECTILE_BASE_ANGLE_RADIANS = -Math.PI / 4;
const PROJECTILE_MIN_DURATION_MS = 90;
const PROJECTILE_MAX_DURATION_MS = 280;
const PROJECTILE_PIXELS_PER_MS = 1.1;
const DIALOG_MESSAGE_BASE_DURATION_MS = 4000;
const DIALOG_MESSAGE_EXTRA_PER_CHARACTER_MS = 45;
const DIALOG_MESSAGE_MAX_DURATION_MS = 8000;
const DIALOG_BUBBLE_MAX_WIDTH = 180;
const CAST_BAR_WIDTH = 40;
const CAST_BAR_HEIGHT = 5;
const DEFAULT_ENTITY_FX_DURATION_MS = 450;
const PERSISTENT_ENTITY_FX_IDS = new Set([4, 5, 6, 16, 34]);
const ENTITY_FX_ALPHA = 0.75;

const getDialogMessageDuration = (text: string): number =>
    Math.min(
        DIALOG_MESSAGE_MAX_DURATION_MS,
        DIALOG_MESSAGE_BASE_DURATION_MS +
            text.trim().length * DIALOG_MESSAGE_EXTRA_PER_CHARACTER_MS,
    );

const isCombatDialogMessage = (text: string, color?: string): boolean => {
    if ((color || "").trim().toLowerCase() !== "red") {
        return false;
    }

    const normalized = text.trim();
    if (!normalized) {
        return false;
    }

    if (/^[!¡]?(?:\d+)[!¡]?$/.test(normalized)) {
        return true;
    }

    return /^.?(?:fallas|you miss).?$/i.test(normalized);
};

const getGraphicImagePaths = (imageFile: string | number): string[] => [
    `/graphics/${imageFile}.png`,
    `/static/graphics/${imageFile}.png`,
];

function shouldHideRemoteCharacterBody(
    character: Character | null | undefined,
    localUserId?: number,
    localPartyMemberIds?: ReadonlySet<string>,
): boolean {
    void localUserId;
    void localPartyMemberIds;

    return false;
}

const STEP_SOUNDS = {
    bosque: [201, 69],
    nieve: [199, 200],
    caballo: [70, 71],
    dungeon: [23, 24],
    desierto: [197, 198],
    piso: [23, 24],
    agua: [50, 50],
} as const;

const MIN_STEP_SOUND_INTERVAL_MS = 70;

type StepTerrain = keyof typeof STEP_SOUNDS;

function isCharacterInmovilizado(movementRestriction?: number): boolean {
    return movementRestriction === 1;
}

function isCharacterParalizado(movementRestriction?: number): boolean {
    return movementRestriction === 2;
}

function resolveEntitySoundPosition(
    engine: Engine,
    entityId?: number,
): SoundPosition | undefined {
    if (entityId == null) {
        return;
    }

    const entity =
        entityId === engine.user?.id
            ? engine.user
            : engine.personajes[entityId];

    if (!entity) {
        return;
    }

    return {
        map: entity.map,
        x: entity.pos.x,
        y: entity.pos.y,
    };
}

function getTileTerrainFileNumber(
    engine: Engine,
    mapNumber: number,
    x: number,
    y: number,
): number {
    if (!engine.mapData || !engine.graphicsDB) {
        return 0;
    }

    const tile = getTileAt(engine.mapData, mapNumber, x, y);
    const layer1 = tile?.graphics?.["1"];

    if (!layer1) {
        return 0;
    }

    return Number(engine.graphicsDB[layer1.toString()]?.numFile ?? 0);
}

function resolveStepTerrain(engine: Engine, character: Character): StepTerrain {
    if (character.navegando) {
        return "agua";
    }

    const tile = engine.mapData
        ? getTileAt(
              engine.mapData,
              character.map,
              character.pos.x,
              character.pos.y,
          )
        : undefined;
    const terrainFileNum = getTileTerrainFileNumber(
        engine,
        character.map,
        character.pos.x,
        character.pos.y,
    );
    const layer2 = Number(tile?.graphics?.["2"] ?? 0);

    if (
        (terrainFileNum >= 6000 && terrainFileNum <= 6004) ||
        (terrainFileNum >= 550 && terrainFileNum <= 552) ||
        (terrainFileNum >= 6018 && terrainFileNum <= 6020)
    ) {
        return "bosque";
    }

    if (
        (terrainFileNum >= 7501 && terrainFileNum <= 7507) ||
        terrainFileNum === 7500 ||
        terrainFileNum === 7508 ||
        terrainFileNum === 1533 ||
        terrainFileNum === 2508
    ) {
        return "dungeon";
    }

    if (terrainFileNum >= 5000 && terrainFileNum <= 5004) {
        return "nieve";
    }

    if (
        (terrainFileNum >= 6018 && terrainFileNum <= 6021) ||
        terrainFileNum === 186 ||
        terrainFileNum === 8007
    ) {
        return "desierto";
    }

    if (terrainFileNum === 20 && layer2 === 0) {
        return "agua";
    }

    return "piso";
}

function resolveStepSoundId(
    engine: Engine,
    character: Character,
    nextStepVariant: 0 | 1,
): any {
    return STEP_SOUNDS[resolveStepTerrain(engine, character)][nextStepVariant];
}

/**
 * Create debug grid to show tile boundaries
 */
function isContainerActive(
    container: Container | null | undefined,
): container is Container {
    return Boolean(
        container && !(container as { destroyed?: boolean }).destroyed,
    );
}

function canUseEngineContainer(
    engine: Engine,
    container: Container | null | undefined,
): container is Container {
    return (
        !engine.isDestroyed &&
        Boolean(engine.app) &&
        isContainerActive(container)
    );
}

function formatDebugPositionLabel(position: { x: number; y: number }): string {
    return `(${position.x}, ${position.y})`;
}

function formatCharacterAnimationDebugLabel(character: Character): string {
    const frameCounter = Number.isFinite(character.frameCounter)
        ? character.frameCounter
        : 1;

    return [
        formatDebugPositionLabel(character.pos),
        `mov:${character.moving ? "1" : "0"} fc:${frameCounter.toFixed(2)}`,
        `idle:${
            typeof character.animationIdleStartedAt === "number"
                ? "hold"
                : "none"
        }`,
    ].join("\n");
}

function createDebugPositionLabel(text: string): Text {
    const label = new Text({
        text,
        style: new TextStyle({
            fontFamily: "Courier New",
            fontSize: 10,
            fill: 0x86efac,
            stroke: { color: 0x000000, width: 2 },
        }),
    });
    label.anchor.set(0.5, 0);
    (label as any).isDebugPosition = true;
    return label;
}

function setDebugPositionLabelsVisibility(
    container: Container,
    visible: boolean,
): void {
    for (const child of container.children) {
        if ((child as any).isDebugPosition) {
            child.visible = visible;
        }

        if (child instanceof Container) {
            setDebugPositionLabelsVisibility(child, visible);
        }
    }
}

function createDialogBubble(text: string, color?: string): Container {
    const bubble = new Container();
    const labelStyleOptions = {
        fontFamily: "Georgia",
        fontSize: 12,
        fill: color || 0xffffff,
        align: "center" as const,
    };
    const singleLineMetrics = CanvasTextMetrics.measureText(
        text,
        new TextStyle(labelStyleOptions),
    );
    const label = new Text({
        text,
        style: new TextStyle({
            ...labelStyleOptions,
            wordWrap: singleLineMetrics.width > DIALOG_BUBBLE_MAX_WIDTH,
            wordWrapWidth: DIALOG_BUBBLE_MAX_WIDTH,
        }),
    });
    const background = new Graphics();
    const paddingX = 6;
    const paddingY = 4;
    const tailWidth = 10;
    const tailHeight = 8;
    const radius = 10;
    const labelBounds = label.getLocalBounds();
    const bubbleWidth = Math.max(
        tailWidth + paddingX * 2,
        labelBounds.width + paddingX * 2,
    );
    const bubbleHeight = Math.max(18, labelBounds.height + paddingY * 2);

    background
        .roundRect(
            -bubbleWidth / 2,
            -bubbleHeight,
            bubbleWidth,
            bubbleHeight,
            radius,
        )
        .fill({ color: 0x111827, alpha: 0.9 })
        .stroke({ color: 0xfde68a, alpha: 0.7, width: 1 })
        .poly([-tailWidth / 2, 0, 0, tailHeight, tailWidth / 2, 0])
        .fill({ color: 0x111827, alpha: 0.9 })
        .stroke({ color: 0xfde68a, alpha: 0.7, width: 1 });

    label.anchor.set(0.5, 1);
    label.x = 0;
    label.y = -paddingY;

    bubble.addChild(background);
    bubble.addChild(label);
    bubble.zIndex = 0.85;
    (bubble as any).isDialogBubble = true;

    return bubble;
}

function createCastBar(): Container {
    const bar = new Container();
    const background = new Graphics();
    const fill = new Graphics();

    background
        .roundRect(
            -CAST_BAR_WIDTH / 2,
            -CAST_BAR_HEIGHT,
            CAST_BAR_WIDTH,
            CAST_BAR_HEIGHT,
            3,
        )
        .fill({ color: 0x111827, alpha: 0.92 })
        .stroke({ color: 0xfde68a, alpha: 0.9, width: 1 });

    fill.roundRect(
        0,
        -CAST_BAR_HEIGHT,
        CAST_BAR_WIDTH,
        CAST_BAR_HEIGHT,
        3,
    ).fill({ color: 0xf59e0b, alpha: 0.95 });

    fill.position.set(-CAST_BAR_WIDTH / 2, 0);

    bar.addChild(background);
    bar.addChild(fill);
    bar.zIndex = 0.84;
    (bar as any).isCastBar = true;
    (bar as any).castBarFill = fill;

    return bar;
}

function createFloatingCombatText(text: string, color?: string): Text {
    const label = new Text({
        text,
        style: new TextStyle({
            fontFamily: "Verdana",
            fontSize: 12,
            fontWeight: "700",
            fill: color || 0xcc1b1b,
            align: "center",
            // stroke: { color: 0x5a0000, width: 1.5 },
            dropShadow: {
                alpha: 1,
                angle: Math.PI / 5,
                blur: 0,
                color: 0x000000,
                distance: 1,
            },
        }),
    });

    label.anchor.set(0.5, 1);
    label.zIndex = 0.9;
    (label as any).isDialogBubble = true;
    (label as any).dialogVariant = "floatingCombat";

    return label;
}

export default function MapRenderer({
    mapNumber,
    width,
    height,
    embedded = false,
    connection,
    equipRequest,
    useItemClickRequest,
    useItemURequest,
    dropRequest,
    buyRequest,
    sellRequest,
    changeBankTabRequest,
    depositBankGoldRequest,
    withdrawBankGoldRequest,
    closeTradeRequest,
    marketActionRequest,
    retosActionRequest,
    craftRequest,
    reorderInventoryRequest,
    reorderSpellRequest,
    reorderBankRequest,
    rangeAttackRequest,
    spellTargetRequest,
    chatRequest,
    runtimeTiming = DEFAULT_RUNTIME_TIMING,
    hotkeySettings = DEFAULT_HOTKEY_SETTINGS,
    macros = [],
    soundVolume = 1,
    onMapChange,
    onStatusChange,
    onHudChange,
    onConsoleMessage,
    onGlobalNotice,
    onTradeStateChange,
    onMarketStateChange,
    onRetosStateChange,
    onBailStateChange,
    onCraftingStateChange,
    onAdminIntervalsOpen,
    onAdminOverviewSnapshot,
    onCharacterStatsSnapshot,
    onPerformanceSample,
}: MapRendererProps) {
    const {text: localizeNpcText} = useI18n();
    const npcTextRef = useRef(localizeNpcText);
    npcTextRef.current = localizeNpcText;
    const canvasRef = useRef<HTMLDivElement>(null);
    const rendererRootRef = useRef<HTMLDivElement>(null);
    const [isDeadWorldActive, setIsDeadWorldActive] = React.useState(false);
    const engineRef = useRef<Engine | null>(null);
    const websocketRef = useRef<WebSocket | null>(null);
    const npcContextMenuRef = useRef<HTMLDivElement>(null);
    const pingIntervalRef = useRef<number | null>(null);
    const pendingPingRef = useRef<{ token: number; sentAt: number } | null>(
        null,
    );
    const recentPingSamplesRef = useRef<number[]>([]);
    const nextPingTokenRef = useRef(1);
    const pingTextRef = useRef<Text | null>(null);
    const pingDisplayTextRef = useRef("Ping: -- ms");
    const seguroTextRef = useRef<Text | null>(null);
    const clanSeguroTextRef = useRef<Text | null>(null);
    const debugCombatTextRef = useRef<Text | null>(null);
    const debugCombatOverlayTextRef = useRef("");
    const fpsDisplayTextRef = useRef("FPS: 0");
    const latestChatRequestRef = useRef<MapRendererProps["chatRequest"]>(null);
    const lastSentChatTokenRef = useRef<number | null>(null);
    const pendingUserSnapshotRef = useRef<CharacterSnapshot | null>(null);
    const lastServerConfirmedSelfPositionRef = useRef<{
        map: number;
        x: number;
        y: number;
    } | null>(null);
    const pendingRemoteSnapshotsRef = useRef<Map<number, CharacterSnapshot>>(
        new Map(),
    );
    const tthoneyCleanupTimeoutsRef = useRef<Map<number, number>>(new Map());
    const pendingTileStatesRef = useRef<Map<string, PendingTileState>>(
        new Map(),
    );
    const incomingPacketQueueRef = useRef<
        Array<Blob | ArrayBuffer | ArrayBufferView>
    >([]);
    const isProcessingIncomingPacketsRef = useRef(false);
    const activeSessionKeyRef = useRef<string | null>(null);
    const currentMapRef = useRef(mapNumber);
    const sharedTextureCachesRef = useRef<SharedTextureCaches>({
        baseTextureCache: new Map(),
        pendingAssetLoads: new Map(),
        textureCache: new Map(),
        animatedTextureCache: new Map(),
    });
    const localPendingMovesRef = useRef<LocalPendingMove[]>([]);
    const nextMoveIdRef = useRef(1);
    const latestServerStateVersionRef = useRef(0);
    const movementInputLockedUntilRef = useRef(0);
    const movementInputResumeTimeoutRef = useRef<number | null>(null);
    const isMapChangeTransitionRef = useRef(false);
    const hotkeySettingsRef = useRef(hotkeySettings);
    const macroKeyCodesRef = useRef<Set<string>>(new Set());
    const blockedKeyboardCodesRef = useRef<Map<string, number>>(new Map());
    const blockedKeyboardKeysRef = useRef<Map<string, number>>(new Map());
    const movementKeyMapRef = useRef<Map<string, number>>(new Map());
    const movementPressCountsRef = useRef<Map<number, number>>(new Map());
    const movementKeyPriorityRef = useRef<number[]>([]);
    const soundManagerRef = useRef<GameSoundManager | null>(null);
    const stepVariantRef = useRef<Map<number, 0 | 1>>(new Map());
    const lastStepSoundAtRef = useRef<Map<number, number>>(new Map());
    const runtimeTimingRef = useRef<RuntimeTimingConfig>(runtimeTiming);
    const panelSnapshotChunkBufferRef = useRef("");
    const panelSnapshotChunkExpectedIndexRef = useRef(0);
    const panelSnapshotChunkTotalRef = useRef(0);
    const characterStatsChunkBufferRef = useRef("");
    const characterStatsChunkExpectedIndexRef = useRef(0);
    const characterStatsChunkTotalRef = useRef(0);
    const activeSocketInstanceRef = useRef(0);
    const npcContextMenuOpenedAtRef = useRef(0);
    const performanceSampleRef = useRef<PerformanceSample>({
        fps: null,
        pingMs: null,
    });
    const onPerformanceSampleRef = useRef(onPerformanceSample);
    const renderSpellProjectileVisualRef = useRef<
        (
            engine: Engine,
            startPos: { x: number; y: number },
            endPos: { x: number; y: number },
            spellData: SpellData | null | undefined,
        ) => void
    >(() => {});
    const [isAdminUi, setIsAdminUi] = React.useState(false);

    const flushPendingChatRequest = () => {
        const pendingChatRequest = latestChatRequestRef.current;

        if (!pendingChatRequest) {
            return;
        }

        if (lastSentChatTokenRef.current === pendingChatRequest.token) {
            return;
        }

        const socket = websocketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            return;
        }

        socket.send(createDialogPacket(pendingChatRequest.message));
        lastSentChatTokenRef.current = pendingChatRequest.token;
    };

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        if (soundManagerRef.current == null) {
            soundManagerRef.current = new GameSoundManager();
        }

        soundManagerRef.current?.setMasterVolume(soundVolume);
    }, [soundVolume]);

    useEffect(() => {
        setIsAdminUi((current) => {
            const next = isAdminInspector(
                engineRef.current,
                playerHudRef.current,
            );
            return current === next ? current : next;
        });
    }, [connection?.sessionKey]);

    useEffect(() => {
        runtimeTimingRef.current = runtimeTiming;

        if (engineRef.current) {
            engineRef.current.timeWalkMS = runtimeTiming.walkStepMs;
        }
    }, [runtimeTiming]);

    useEffect(() => {
        onPerformanceSampleRef.current = onPerformanceSample;
    }, [onPerformanceSample]);

    const emitPerformanceSample = React.useCallback(
        (patch: Partial<PerformanceSample>) => {
            const nextSample: PerformanceSample = {
                fps:
                    "fps" in patch
                        ? (patch.fps ?? null)
                        : performanceSampleRef.current.fps,
                pingMs:
                    "pingMs" in patch
                        ? (patch.pingMs ?? null)
                        : performanceSampleRef.current.pingMs,
            };

            performanceSampleRef.current = nextSample;
            onPerformanceSampleRef.current?.(nextSample);
        },
        [],
    );

    useEffect(() => {
        const stepVariant = stepVariantRef.current;
        const lastStepSoundAt = lastStepSoundAtRef.current;

        return () => {
            if (movementInputResumeTimeoutRef.current !== null) {
                window.clearTimeout(movementInputResumeTimeoutRef.current);
                movementInputResumeTimeoutRef.current = null;
            }
            soundManagerRef.current?.destroy();
            soundManagerRef.current = null;
            stepVariant.clear();
            lastStepSoundAt.clear();
        };
    }, []);

    const playStepSound = React.useCallback(
        (engine: Engine, entityId: number) => {
            const character = engine.personajes[entityId];

            if (!character || character.dead || character.invisibleAdmin) {
                return;
            }

            const now = performance.now();
            const lastStepSoundAt =
                lastStepSoundAtRef.current.get(entityId) ?? -Infinity;

            if (now - lastStepSoundAt < MIN_STEP_SOUND_INTERVAL_MS) {
                return;
            }

            lastStepSoundAtRef.current.set(entityId, now);

            const currentVariant = stepVariantRef.current.get(entityId) ?? 1;
            const nextVariant = (currentVariant === 0 ? 1 : 0) as 0 | 1;
            stepVariantRef.current.set(entityId, nextVariant);

            soundManagerRef.current?.play({
                soundId: resolveStepSoundId(engine, character, nextVariant),
                listener: resolveEntitySoundPosition(engine, engine.user?.id),
                source: resolveEntitySoundPosition(engine, entityId),
                fadeInMs: 8,
                fadeOutMs: 10,
            });
        },
        [],
    );

    useEffect(() => {
        hotkeySettingsRef.current = hotkeySettings;
    }, [hotkeySettings]);

    useEffect(() => {
        macroKeyCodesRef.current = new Set(
            macros.map((macro) => macro?.keyCode?.trim() ?? "").filter(Boolean),
        );
    }, [macros]);

    const resolveBlockedGameplayKeyboardReason = React.useCallback(
        (
            event: KeyboardEvent,
        ): "document_not_focused" | "untrusted_event" | null => {
            const settings = hotkeySettingsRef.current;
            const normalizedEventKey = normalizeKeyboardEventKey(event.key);
            const matchesHotkey = Object.values(settings).some((codes) =>
                codes.some(
                    (code) =>
                        code === event.code ||
                        getKeyboardKeyCandidatesFromCode(code).includes(
                            normalizedEventKey,
                        ),
                ),
            );
            const matchesMacro = Array.from(macroKeyCodesRef.current).some(
                (code) =>
                    code === event.code ||
                    getKeyboardKeyCandidatesFromCode(code).includes(
                        normalizedEventKey,
                    ),
            );
            const matchesInternalHotkey =
                event.code === "KeyL" || normalizedEventKey === "l";

            if (!matchesHotkey && !matchesMacro && !matchesInternalHotkey) {
                return null;
            }

            if (!document.hasFocus()) {
                return "document_not_focused";
            }

            if (!event.isTrusted) {
                return "untrusted_event";
            }

            return null;
        },
        [],
    );

    const getBlockedKeyboardSequenceUntil = React.useCallback(
        (event: KeyboardEvent): number => {
            const codeBlockedUntil = event.code
                ? (blockedKeyboardCodesRef.current.get(event.code) ?? 0)
                : 0;
            const normalizedKey = normalizeKeyboardEventKey(event.key);
            const keyBlockedUntil = normalizedKey
                ? (blockedKeyboardKeysRef.current.get(normalizedKey) ?? 0)
                : 0;
            return Math.max(codeBlockedUntil, keyBlockedUntil);
        },
        [],
    );

    useEffect(() => {
        combatCooldownsRef.current = {
            nextMeleeAt: 0,
            nextRangeAt: 0,
            nextSpellAt: 0,
            nextSpellAfterMeleeAt: 0,
            nextMeleeAfterSpellAt: 0,
            nextUseItemAfterMeleeAt: 0,
        };
        lastSpellAttemptAtRef.current = null;
        lastSpellAttemptIntervalMsRef.current = null;
        nextMapClickAtRef.current = 0;
        nextDropItemAtRef.current = 0;
        nextUseItemAtRef.current = 0;
        nextEquipToggleAtRef.current = 0;
        lastResourceDropRef.current = { hp: null, mana: null };
        resourceReactionSamplesRef.current = { hp: [], mana: [] };
        lastWorldPointerTileRef.current = null;
        hasAnnouncedConnectionRef.current = false;
        pendingPartyMembersRef.current = [];
        pendingClanMembersRef.current = [];
    }, [connection?.sessionKey]);

    const playerHudRef = useRef<PlayerHudState | null>(null);
    const {
        deadCharacterContextMenu,
        inspectedNpc,
        npcContextMenu,
        removeNpcFromMap,
        removeNpcFromMapPermanently,
        removingNpcEntityId,
        reviveCharacter,
        setDeadCharacterContextMenu,
        setInspectedNpc,
        setNpcContextMenu,
    } = useNpcAdminTools({
        websocketRef,
        engineRef,
        playerHudRef,
        npcContextMenuRef,
        npcContextMenuOpenedAtRef,
        connectionSessionKey: connection?.sessionKey,
    });
    const partyMemberIdsRef = useRef<Set<string>>(new Set());
    const pendingPartyMembersRef = useRef<PartyHudMember[]>([]);
    const pendingClanMembersRef = useRef<ClanHudMember[]>([]);
    const targetingModeRef = useRef<TargetingMode | null>(null);
    const nextMapClickAtRef = useRef(0);
    const nextUseItemAtRef = useRef(0);
    const nextDropItemAtRef = useRef(0);
    const nextEquipToggleAtRef = useRef(0);
    const combatCooldownsRef = useRef({
        nextMeleeAt: 0,
        nextRangeAt: 0,
        nextSpellAt: 0,
        nextSpellAfterMeleeAt: 0,
        nextMeleeAfterSpellAt: 0,
        nextUseItemAfterMeleeAt: 0,
    });
    const lastResourceDropRef = useRef<
        Record<ResourceKind, ResourceChangeSample | null>
    >({
        hp: null,
        mana: null,
    });
    const resourceReactionSamplesRef = useRef<
        Record<ResourceKind, ResourceReactionSample[]>
    >({
        hp: [],
        mana: [],
    });
    const lastWorldPointerTileRef = useRef<{
        at: number;
        x: number;
        y: number;
        button: number;
        trusted: boolean;
    } | null>(null);
    const lastSpellAttemptAtRef = useRef<number | null>(null);
    const lastSpellAttemptIntervalMsRef = useRef<number | null>(null);
    const activeDialogMessagesRef = useRef<Map<number, ActiveDialogMessage>>(
        new Map(),
    );
    const activeCastBarsRef = useRef<Map<number, ActiveCastBar>>(new Map());
    const hasAnnouncedConnectionRef = useRef(false);
    const [isLoading, setIsLoading] = React.useState(false);
    const [isSceneReady, setIsSceneReady] = React.useState(false);
    const [clientReadySessionKey, setClientReadySessionKey] = React.useState<
        string | null
    >(null);
    const [error, setError] = React.useState<string | null>(null);
    const [isMounted, setIsMounted] = React.useState(false);
    const [isDebugMode, setIsDebugMode] = React.useState(false);
    const [debugCombatOverlayText, setDebugCombatOverlayText] =
        React.useState<string>("");
    const [hasCompletedInitialLoad, setHasCompletedInitialLoad] =
        React.useState(false);
    const latestStatusRef = useRef<RendererStatus>({
        connected: false,
        connecting: false,
    });
    const [loadingState, setLoadingState] = React.useState<LoadingState>({
        active: false,
        stage: "Preparando cliente",
        detail: "Inicializando recursos...",
        progress: 0,
    });
    const isClientReadyForConnection =
        connection?.sessionKey != null &&
        clientReadySessionKey === connection.sessionKey;
    const [screenSize, setScreenSize] = React.useState({
        width: VIEWPORT_PIXEL_WIDTH,
        height: VIEWPORT_PIXEL_HEIGHT,
    });
    const [canvasDisplaySize, setCanvasDisplaySize] = React.useState({
        width: VIEWPORT_PIXEL_WIDTH,
        height: VIEWPORT_PIXEL_HEIGHT,
    });

    const getCanvasDisplaySize = React.useCallback(() => {
        return {
            width: width ?? VIEWPORT_PIXEL_WIDTH,
            height: height ?? VIEWPORT_PIXEL_HEIGHT,
        };
    }, [height, width]);

    const {
        lastTrustedInputAtRef,
        lastUntrustedInputAtRef,
        recordClientGameAction,
    } = useClientInputDiagnostics({
        connectionSessionKey: connection?.sessionKey,
        getBlockedKeyboardSequenceUntil,
        resolveBlockedGameplayKeyboardReason,
        macroKeyCodesRef,
        blockedKeyboardCodesRef,
        blockedKeyboardKeysRef,
    });

    const recordSpellTargetSnap = React.useCallback(
        (sample: SpellTargetSnapSample) => {
            void sample;
            return;
        },
        [],
    );

    const emitStatus = React.useCallback(
        (status: RendererStatus) => {
            latestStatusRef.current = status;
            onStatusChange?.(status);
        },
        [onStatusChange],
    );

    const updateLoadingProgress = React.useCallback(
        (stage: LoadingStage, progress: number, detail: string) => {
            setLoadingState({
                active: true,
                stage,
                detail,
                progress: Math.max(0, Math.min(100, Math.round(progress))),
            });
        },
        [],
    );

    const clearLoadingProgress = React.useCallback(() => {
        setLoadingState((current) => ({
            ...current,
            active: false,
            progress: 100,
        }));
    }, []);

    const {
        loadTextures,
        loadCharacterTextures,
        loadSingleTexture,
        preloadGraphicIds,
        preloadCurrentSceneAssets,
        preloadInitialVisibleMapAssets,
        prefetchNearbyMaps,
        warmCommonCharacterAssets,
    } = useAssetPipeline({
        getGraphicImagePaths,
        updateLoadingProgress,
    });

    const {
        applyPendingTileStates,
        ensureMapTile,
        queueTileObjectVisualSync,
        removeObjectSprite,
        renderMap,
        setWorldVisibility,
        startMapChangeTransition,
        updatePendingTileState,
    } = useSceneController({
        pendingTileStatesRef,
        isMapChangeTransitionRef,
        setIsSceneReady,
        setIsLoading,
        updateLoadingProgress,
        onMapChange,
        canUseEngineContainer,
        preloadGraphicIds,
        loadTextures,
    });

    const {
        clearEquippedInventory,
        emitBailState,
        emitCraftingState,
        emitHud,
        emitMarketState,
        emitRetosState,
        emitTradeState,
        mergeHud,
        removeInventoryItem,
        reorderInventoryItems,
        reorderSpells,
        updateEquippedInventoryByType,
        updateSeguroIndicators,
        upsertInventoryItem,
        upsertSpell,
    } = useHudStateController({
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
    });
    const getEntityContainer = React.useCallback(
        (engine: Engine, entityId: number): Container | null => {
            if (engine.user?.id === entityId) {
                return engine.playerContainer;
            }

            return engine.remoteEntities.get(entityId) ?? null;
        },
        [],
    );

    const {
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
    } = useCombatController({
        engineRef,
        websocketRef,
        connectionSessionKey: connection?.sessionKey,
        playerHudRef,
        runtimeTimingRef,
        targetingModeRef,
        lastServerConfirmedSelfPositionRef,
        lastWorldPointerTileRef,
        lastTrustedInputAtRef,
        lastUntrustedInputAtRef,
        nextMapClickAtRef,
        nextUseItemAtRef,
        combatCooldownsRef,
        lastResourceDropRef,
        resourceReactionSamplesRef,
        lastSpellAttemptAtRef,
        lastSpellAttemptIntervalMsRef,
        debugCombatTextRef,
        debugCombatOverlayTextRef,
        getEntityContainer,
        setDebugCombatOverlayText,
        isDebugMode,
        onConsoleMessage,
        recordClientGameAction,
        setTextIfChanged,
        setVisibilityIfChanged,
        recordSpellTargetSnap,
    });

    const {
        canProcessMovementInput,
        clearMovementInputState,
        clearPendingLocalMoves,
        consumeAcknowledgedLocalMoves,
        lockMovementInput,
        reconcileOwnPositionWithServer,
        resetMovementSyncState,
        retainPendingRemoteSnapshotsForMap,
        syncMovementState,
    } = useMovementSync({
        engineRef,
        localPendingMovesRef,
        nextMoveIdRef,
        latestServerStateVersionRef,
        movementInputLockedUntilRef,
        movementInputResumeTimeoutRef,
        isMapChangeTransitionRef,
        movementKeyMapRef,
        movementPressCountsRef,
        movementKeyPriorityRef,
        pendingRemoteSnapshotsRef,
        pendingUserSnapshotRef,
        lastServerConfirmedSelfPositionRef,
        runtimeTimingRef,
        startMapChangeTransition,
        mergeHud,
    });

    useKeyboardGameplay({
        isMounted,
        engineRef,
        websocketRef,
        hotkeySettingsRef,
        playerHudRef,
        movementKeyMapRef,
        movementPressCountsRef,
        movementKeyPriorityRef,
        canProcessMovementInput,
        clearMovementInputState,
        clearTargetingMode,
        hasEquippedMeleeWeapon,
        hasEquippedRangedWeapon,
        recordClientGameAction,
        resolveBlockedGameplayKeyboardReason,
        setTargetingMode: (mode) => setTargetingMode(mode),
        syncMovementState,
        setIsDebugMode,
    });

    const { clearUseItemQueues } = useOutgoingRequests({
        websocketRef,
        engineRef,
        playerHudRef,
        runtimeTimingRef,
        combatCooldownsRef,
        nextUseItemAtRef,
        nextDropItemAtRef,
        nextEquipToggleAtRef,
        setTargetingMode,
        clearTargetingMode,
        getEquippedWeaponItem,
        pushSystemMessage,
        isFishingRodItem,
        isWoodcuttingToolItem,
        isMiningToolItem,
        isSmeltingMineralItem,
        reorderInventoryItems,
        reorderSpells,
        clearExpiredCombatCooldowns,
        recordResourceUseItem,
        recordClientGameAction,
        equipRequest,
        useItemClickRequest,
        useItemURequest,
        dropRequest,
        buyRequest,
        sellRequest,
        changeBankTabRequest,
        depositBankGoldRequest,
        withdrawBankGoldRequest,
        closeTradeRequest,
        marketActionRequest,
        retosActionRequest,
        craftRequest,
        reorderInventoryRequest,
        reorderSpellRequest,
        reorderBankRequest,
        rangeAttackRequest,
        spellTargetRequest,
    });

    useEffect(() => {
        setIsMounted(true);
        setScreenSize({
            width: VIEWPORT_PIXEL_WIDTH,
            height: VIEWPORT_PIXEL_HEIGHT,
        });
        setCanvasDisplaySize(getCanvasDisplaySize());
    }, [getCanvasDisplaySize]);

    useEffect(() => {
        if (!isMounted) return;

        const handleResize = () => {
            setCanvasDisplaySize(getCanvasDisplaySize());
        };

        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [getCanvasDisplaySize, isMounted]);

    useEffect(() => {
        currentMapRef.current = mapNumber;
    }, [mapNumber]);

    useEffect(() => {
        const sharedTextureCaches = sharedTextureCachesRef.current;

        return () => {
            destroySharedTextureCaches(sharedTextureCaches);
        };
    }, []);

    useEffect(() => {
        latestChatRequestRef.current = chatRequest;
        flushPendingChatRequest();
    }, [chatRequest]);

    useEffect(() => {
        const engine = engineRef.current;
        const app = engine?.app;
        const fpsText = (engine as any)?.fpsText as Text | undefined;
        const pingText = pingTextRef.current;
        const seguroText = seguroTextRef.current;
        const clanSeguroText = clanSeguroTextRef.current;

        if (!engine || !app) return;

        app.renderer.resize(screenSize.width, screenSize.height);
        if (fpsText) {
            fpsText.x = FPS_TEXT_OFFSET_X;
            fpsText.y = FPS_TEXT_OFFSET_Y;
        }
        if (pingText) {
            pingText.x = FPS_TEXT_OFFSET_X;
            pingText.y = PING_TEXT_OFFSET_Y;
        }
        if (seguroText) {
            seguroText.x = FPS_TEXT_OFFSET_X;
            seguroText.y = SEGURO_TEXT_OFFSET_Y;
        }
        if (clanSeguroText) {
            clanSeguroText.x = FPS_TEXT_OFFSET_X;
            clanSeguroText.y = CLAN_SEGURO_TEXT_OFFSET_Y;
        }
        if (debugCombatTextRef.current) {
            debugCombatTextRef.current.x = FPS_TEXT_OFFSET_X;
            debugCombatTextRef.current.y = DEBUG_COMBAT_TEXT_OFFSET_Y;
        }
        engine.updateCamera();
        engine.updateCulling();
    }, [screenSize.height, screenSize.width]);

    useEffect(() => {
        if (engineRef.current) {
            engineRef.current.isDebugMode = isDebugMode;
            if (engineRef.current.mapContainer) {
                setDebugPositionLabelsVisibility(
                    engineRef.current.mapContainer,
                    isDebugMode,
                );
            }
            setWorldVisibility(engineRef.current, isSceneReady);
            engineRef.current.updateCulling();
        }
        updateDebugCombatText();
    }, [isDebugMode, isSceneReady, setWorldVisibility, updateDebugCombatText]);

    const shouldMaskScene =
        !connection ||
        (!hasCompletedInitialLoad && (isLoading || !isSceneReady));

    const entityOverlays = React.useMemo(
        () =>
            // eslint-disable-next-line react-hooks/refs
            createEntityOverlays({
                getActiveDialogMessages: () => activeDialogMessagesRef.current,
                getActiveCastBars: () => activeCastBarsRef.current,
                getEngine: () => engineRef.current,
                destroyDisplayObjectSafely,
                canUseEngineContainer,
                loadTextures,
                createCastBar,
                createDialogBubble,
                createFloatingCombatText: (text, color) => createFloatingCombatText(npcTextRef.current(text), color),
                isCombatDialogMessage,
                getDialogMessageDuration,
                getEntityContainer,
                getPersistentEntityFxIds: () => PERSISTENT_ENTITY_FX_IDS,
                defaultEntityFxDurationMs: DEFAULT_ENTITY_FX_DURATION_MS,
                entityFxAlpha: ENTITY_FX_ALPHA,
                projectileBaseAngleRadians: PROJECTILE_BASE_ANGLE_RADIANS,
                projectileMinDurationMs: PROJECTILE_MIN_DURATION_MS,
                projectileMaxDurationMs: PROJECTILE_MAX_DURATION_MS,
                projectilePixelsPerMs: PROJECTILE_PIXELS_PER_MS,
            }),
        [getEntityContainer, loadTextures],
    );

    const clearAllDialogMessages = React.useCallback(
        () => entityOverlays.clearAllDialogMessages(),
        [entityOverlays],
    );

    const clearAllCastBars = React.useCallback(
        () => entityOverlays.clearAllCastBars(),
        [entityOverlays],
    );

    const lastRenderedMapRef = useRef(mapNumber);

    useEffect(() => {
        if (lastRenderedMapRef.current !== mapNumber) {
            clearAllDialogMessages();
            clearAllCastBars();
            setNpcContextMenu(null);
            setDeadCharacterContextMenu(null);
        }

        lastRenderedMapRef.current = mapNumber;
    }, [
        clearAllCastBars,
        clearAllDialogMessages,
        mapNumber,
        setDeadCharacterContextMenu,
        setNpcContextMenu,
    ]);

    const removeDialogBubbleFromContainer = React.useCallback(
        (container: Container | null | undefined) =>
            entityOverlays.removeDialogBubbleFromContainer(container),
        [entityOverlays],
    );

    const removeDialogBubbleFromOverlay = React.useCallback(
        (engine: Engine, entityId: number) =>
            entityOverlays.removeDialogBubbleFromOverlay(engine, entityId),
        [entityOverlays],
    );

    const removeCastBarFromOverlay = React.useCallback(
        (engine: Engine, entityId: number) =>
            entityOverlays.removeCastBarFromOverlay(engine, entityId),
        [entityOverlays],
    );

    const clearEntityFX = React.useCallback(
        (
            engine: Engine,
            entityId: number,
            options?: { clearStoredGraphic?: boolean },
        ) => entityOverlays.clearEntityFX(engine, entityId, options),
        [entityOverlays],
    );

    const renderEntityFX = React.useCallback(
        (engine: Engine, entityId: number, graphicId: number) =>
            entityOverlays.renderEntityFX(engine, entityId, graphicId),
        [entityOverlays],
    );

    const syncEntityFX = React.useCallback(
        (engine: Engine, entityId: number) =>
            entityOverlays.syncEntityFX(engine, entityId),
        [entityOverlays],
    );

    const renderProjectileVisual = React.useCallback(
        (
            engine: Engine,
            startPos: { x: number; y: number },
            endPos: { x: number; y: number },
            graphicId: number,
        ) =>
            entityOverlays.renderProjectileVisual(
                engine,
                startPos,
                endPos,
                graphicId,
            ),
        [entityOverlays],
    );

    const renderSpellProjectileVisual = React.useCallback(
        (
            engine: Engine,
            startPos: { x: number; y: number },
            endPos: { x: number; y: number },
            spellData: SpellData | null | undefined,
        ) =>
            entityOverlays.renderSpellProjectileVisual(
                engine,
                startPos,
                endPos,
                spellData,
            ),
        [entityOverlays],
    );

    useEffect(() => {
        renderSpellProjectileVisualRef.current = renderSpellProjectileVisual;
    }, [renderSpellProjectileVisual]);

    const syncCastBar = React.useCallback(
        (engine: Engine, entityId: number) =>
            entityOverlays.syncCastBar(engine, entityId),
        [entityOverlays],
    );

    const syncDialogBubble = React.useCallback(
        (engine: Engine, entityId: number) =>
            entityOverlays.syncDialogBubble(engine, entityId),
        [entityOverlays],
    );

    const showDialogBubble = React.useCallback(
        (entityId: number, text: string, color?: string) =>
            entityOverlays.showDialogBubble(entityId, text, color),
        [entityOverlays],
    );

    const updateActiveDialogBubblePositions = React.useCallback(
        (engine: Engine) =>
            entityOverlays.updateActiveDialogBubblePositions(engine),
        [entityOverlays],
    );

    const updateActiveCastBarPositions = React.useCallback(
        (engine: Engine) => entityOverlays.updateActiveCastBarPositions(engine),
        [entityOverlays],
    );

    const updateEntityFXPositions = React.useCallback(
        (engine: Engine) => entityOverlays.updateEntityFXPositions(engine),
        [entityOverlays],
    );

    const {
        applyCharacterAppearanceChange,
        applyCharacterColorChange,
        applyEquipmentVisualChange,
        applyOwnCharacterSnapshot,
        canRenderRemoteEntities,
        clearTtEntities,
        flushBufferedRemoteEntities,
        removeRemoteEntity,
        renderPlayer,
        renderRemoteEntity,
        syncRemoteEntity,
        syncRemoteEntitiesBatch,
        syncTtEntity,
    } = useRemoteEntityController({
        engineRef,
        playerHudRef,
        partyMemberIdsRef,
        pendingUserSnapshotRef,
        pendingRemoteSnapshotsRef,
        lastServerConfirmedSelfPositionRef,
        latestServerStateVersionRef,
        isMapChangeTransitionRef,
        tthoneyCleanupTimeoutsRef,
        activeCastBarsRef,
        canUseEngineContainer,
        loadCharacterTextures,
        loadSingleTexture,
        resolveNakedBodyIdFromHeadId,
        preloadGraphicIds,
        syncEntityFX,
        syncDialogBubble,
        removeDialogBubbleFromContainer,
        removeDialogBubbleFromOverlay,
        removeCastBarFromOverlay,
        unregisterContainerCullEntries,
        destroyDisplayObjectSafely,
        createDebugPositionLabel,
        formatCharacterAnimationDebugLabel,
        shouldHideRemoteCharacterBody,
        syncMovementState,
        setWorldVisibility,
        setIsSceneReady,
        mergeHud,
        clearEntityFX,
    });

    useRendererBootstrap({
        isMounted,
        canvasRef,
        rendererRootRef,
        connection,
        mapNumber,
        screenSize,
        sharedTextureCachesRef,
        runtimeTimingRef,
        partyMemberIdsRef,
        engineRef,
        pendingUserSnapshotRef,
        websocketRef,
        nextMoveIdRef,
        localPendingMovesRef,
        playerHudRef,
        pingTextRef,
        seguroTextRef,
        clanSeguroTextRef,
        debugCombatTextRef,
        fpsDisplayTextRef,
        pingDisplayTextRef,
        onFpsSample: (fps) => emitPerformanceSample({ fps }),
        activeDialogMessagesRef,
        activeCastBarsRef,
        latestStatusRef,
        currentMapRef,
        lastWorldPointerTileRef,
        targetingModeRef,
        isMapChangeTransitionRef,
        movementInputLockedUntilRef,
        movementInputResumeTimeoutRef,
        setNpcContextMenu,
        setDeadCharacterContextMenu,
        npcContextMenuOpenedAtRef,
        setIsSceneReady,
        setError,
        setIsLoading,
        setHasCompletedInitialLoad,
        setClientReadySessionKey,
        preloadInitialVisibleMapAssets,
        preloadCurrentSceneAssets,
        applyPendingTileStates,
        updateLoadingProgress,
        clearLoadingProgress,
        renderMap,
        flushBufferedRemoteEntities,
        renderPlayer,
        setWorldVisibility,
        updateSeguroIndicators,
        updateDebugCombatText,
        warmCommonCharacterAssets,
        prefetchNearbyMaps,
        applyOwnCharacterSnapshot,
        syncMovementState,
        mergeHud,
        playStepSound,
        renderRemoteEntity,
        canProcessMovementInput,
        recordClientGameAction,
        canStartLocalCombatAction,
        registerLocalCombatAction,
        updateCanvasCursor,
        clearTargetingMode,
        getEquippedWeaponItem,
        pushSystemMessage,
        resolveCombatReleaseTarget,
        resolveSpellReleaseTarget,
        recordSpellTargetSnap,
        registerDebugSpellAttempt,
        clearUseItemQueues,
        resetMovementSyncState,
        updateActiveDialogBubblePositions,
        updateActiveCastBarPositions,
        updateEntityFXPositions,
        debugCombatOverlayTextRef,
        setInspectedNpc,
    });

    const handleSessionPacketRef = useRef<
        (args: {
            packet: unknown;
            engine: Engine | null;
            renderedMapNumber: number;
            disconnectSocket: () => void;
        }) => Promise<void>
    >(async () => {});

    useEffect(() => {
        handleSessionPacketRef.current = async ({
            packet,
            engine,
            renderedMapNumber,
            disconnectSocket,
        }: {
            packet: unknown;
            engine: Engine | null;
            renderedMapNumber: number;
            disconnectSocket: () => void;
        }) => {
            await handleIncomingGamePacket(packet, engine, renderedMapNumber, {
                pendingUserSnapshotRef,
                lastServerConfirmedSelfPositionRef,
                latestServerStateVersionRef,
                pendingPartyMembersRef,
                pendingClanMembersRef,
                hasAnnouncedConnectionRef,
                pendingRemoteSnapshotsRef,
                activeCastBarsRef,
                panelSnapshotChunkBufferRef,
                panelSnapshotChunkExpectedIndexRef,
                panelSnapshotChunkTotalRef,
                characterStatsChunkBufferRef,
                characterStatsChunkExpectedIndexRef,
                characterStatsChunkTotalRef,
                runtimeTimingRef,
                emitHud,
                retainPendingRemoteSnapshotsForMap,
                startMapChangeTransition,
                applyOwnCharacterSnapshot,
                emitStatus,
                onConsoleMessage,
                applyEquipmentVisualChange,
                updateEquippedInventoryByType,
                mergeHud,
                clearEquippedInventory,
                applyCharacterAppearanceChange,
                syncCastBar,
                removeCastBarFromOverlay,
                syncTtEntity,
                canRenderRemoteEntities,
                syncRemoteEntity,
                syncRemoteEntitiesBatch,
                flushBufferedRemoteEntities,
                playStepSound,
                reconcileOwnPositionWithServer,
                consumeAcknowledgedLocalMoves,
                clearPendingLocalMoves,
                lockMovementInput,
                isCharacterInmovilizado,
                isCharacterParalizado,
                recordResourceValue,
                applyCharacterColorChange,
                removeInventoryItem,
                upsertInventoryItem,
                updatePendingTileState,
                ensureMapTile,
                queueTileObjectVisualSync,
                removeObjectSprite,
                emitTradeState,
                emitMarketState,
                emitRetosState,
                emitBailState,
                emitCraftingState,
                onAdminIntervalsOpen,
                onAdminOverviewSnapshot,
                onCharacterStatsSnapshot,
                upsertSpell,
                clearTargetingMode,
                showDialogBubble,
                localizeNpcDialog: (text: string) => npcTextRef.current(text),
                onGlobalNotice,
                renderEntityFX,
                renderSpellProjectileVisual,
                renderProjectileVisual,
                soundManagerRef,
                resolveEntitySoundPosition,
                setIsSceneReady,
                disconnectSocket,
                removeRemoteEntity,
            });
        };
    }, [
        applyCharacterAppearanceChange,
        applyCharacterColorChange,
        applyEquipmentVisualChange,
        applyOwnCharacterSnapshot,
        canRenderRemoteEntities,
        clearEquippedInventory,
        clearPendingLocalMoves,
        clearTargetingMode,
        consumeAcknowledgedLocalMoves,
        emitBailState,
        emitCraftingState,
        emitHud,
        emitMarketState,
        emitRetosState,
        emitStatus,
        emitTradeState,
        ensureMapTile,
        flushBufferedRemoteEntities,
        lockMovementInput,
        mergeHud,
        onAdminIntervalsOpen,
        onAdminOverviewSnapshot,
        onCharacterStatsSnapshot,
        onConsoleMessage,
        onGlobalNotice,
        playStepSound,
        queueTileObjectVisualSync,
        reconcileOwnPositionWithServer,
        recordResourceValue,
        removeCastBarFromOverlay,
        removeInventoryItem,
        removeObjectSprite,
        removeRemoteEntity,
        renderEntityFX,
        renderProjectileVisual,
        renderRemoteEntity,
        renderSpellProjectileVisual,
        retainPendingRemoteSnapshotsForMap,
        setIsSceneReady,
        showDialogBubble,
        startMapChangeTransition,
        syncCastBar,
        syncRemoteEntitiesBatch,
        syncRemoteEntity,
        syncTtEntity,
        updateEquippedInventoryByType,
        updatePendingTileState,
        upsertInventoryItem,
        upsertSpell,
    ]);

    const handleSessionPacket = React.useCallback(
        async (args: {
            packet: unknown;
            engine: Engine | null;
            renderedMapNumber: number;
            disconnectSocket: () => void;
        }) => handleSessionPacketRef.current(args),
        [],
    );

    useGameSession({
        connection,
        isClientReadyForConnection,
        activeSocketInstanceRef,
        websocketRef,
        activeSessionKeyRef,
        pingIntervalRef,
        pendingPingRef,
        recentPingSamplesRef,
        nextPingTokenRef,
        pingTextRef,
        pingDisplayTextRef,
        fpsDisplayTextRef,
        onPingSample: (pingMs) => emitPerformanceSample({ pingMs }),
        clearUseItemQueues,
        clearTargetingMode,
        resetMovementSyncState,
        lastServerConfirmedSelfPositionRef,
        clearMovementInputState,
        clearTtEntities,
        incomingPacketQueueRef,
        isProcessingIncomingPacketsRef,
        lastSentChatTokenRef,
        pendingUserSnapshotRef,
        pendingRemoteSnapshotsRef,
        setIsSceneReady,
        setClientReadySessionKey,
        emitHud,
        emitStatus,
        flushPendingChatRequest,
        currentMapRef,
        engineRef,
        latestStatusRef,
        clearAllDialogMessages,
        clearAllCastBars,
        emitTradeState,
        emitMarketState,
        emitRetosState,
        emitBailState,
        emitCraftingState,
        panelSnapshotChunkBufferRef,
        panelSnapshotChunkExpectedIndexRef,
        panelSnapshotChunkTotalRef,
        characterStatsChunkBufferRef,
        characterStatsChunkExpectedIndexRef,
        characterStatsChunkTotalRef,
        onPacket: handleSessionPacket,
    });

    const rendererContainerClassName = embedded
        ? "map-renderer flex items-center justify-center"
        : "map-renderer fixed inset-0 flex items-center justify-center";

    if (!isMounted) {
        return (
            <div
                className={rendererContainerClassName}
                style={{ touchAction: "none" }}
            >
                <div
                    className="relative overflow-hidden bg-black"
                    style={{
                        width: canvasDisplaySize.width,
                        height: canvasDisplaySize.height,
                    }}
                />
            </div>
        );
    }

    if (error) {
        return (
            <div className={rendererContainerClassName}>
                <div className="text-red-400 text-center">
                    <p className="mb-2">Error loading map:</p>
                    <p className="text-sm"><LocalizedText source={error} /></p>
                </div>
            </div>
        );
    }

    return (
        <div
            className={rendererContainerClassName}
            onContextMenu={(event) => {
                event.preventDefault();
            }}
            style={{
                touchAction: "none",
            }}
        >
            <div
                ref={rendererRootRef}
                className="relative overflow-hidden rounded-[22px] bg-black"
                style={{
                    width: canvasDisplaySize.width,
                    height: canvasDisplaySize.height,
                }}
            >
                {shouldMaskScene && (
                    <LoadingOverlay
                        active={loadingState.active}
                        detail={loadingState.detail}
                        progress={loadingState.progress}
                        stage={loadingState.stage}
                    />
                )}
                <DebugCombatOverlay
                    enabled={isDebugMode}
                    text={debugCombatOverlayText}
                />
                <div
                    ref={canvasRef}
                    style={{
                        width: canvasDisplaySize.width,
                        height: canvasDisplaySize.height,
                        filter: isDeadWorldActive ? "grayscale(1)" : "none",
                        transition: "filter 220ms ease",
                    }}
                />
                <NpcContextMenu
                    deadCharacterContextMenu={deadCharacterContextMenu}
                    isAdmin={isAdminUi}
                    menuRef={npcContextMenuRef}
                    npcContextMenu={npcContextMenu}
                    onInspectNpc={(npc) => {
                        setInspectedNpc(npc as InspectableNpc);
                        setNpcContextMenu(null);
                    }}
                    onRemoveNpc={(npc) =>
                        removeNpcFromMap(npc as InspectableNpc)
                    }
                    onRemoveNpcPermanently={(npc) =>
                        removeNpcFromMapPermanently(npc as InspectableNpc)
                    }
                    onReviveCharacter={(character) =>
                        reviveCharacter(character as RevivableCharacter)
                    }
                    removingNpcEntityId={removingNpcEntityId}
                />
                <NpcInspectorModal
                    formatDropChance={formatNpcDropChance}
                    formatNumber={formatNpcNumber}
                    isAdmin={isAdminUi}
                    npc={inspectedNpc}
                    onClose={() => setInspectedNpc(null)}
                    onRemoveNpc={(npc) =>
                        removeNpcFromMap(npc as InspectableNpc)
                    }
                    onRemoveNpcPermanently={(npc) =>
                        removeNpcFromMapPermanently(npc as InspectableNpc)
                    }
                    removingNpcEntityId={removingNpcEntityId}
                    renderItemGraphic={(graphicData, name) =>
                        renderInspectableNpcItemGraphic(
                            graphicData as GraphicData | undefined,
                            name,
                        )
                    }
                />
            </div>
        </div>
    );
}
