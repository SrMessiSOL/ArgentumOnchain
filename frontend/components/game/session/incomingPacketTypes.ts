import type {
    CharacterStatsSnapshot,
    CharacterStatsSnapshotChunk,
    ClanHudStateDelta,
    PanelSnapshot,
    PanelSnapshotChunk,
    PartyHudStateDelta,
} from "../../../lib/aowProtocol";

type MutableRef<T> = { current: T };

export type IncomingPacketHandlerContext = {
    localizeNpcDialog?: (text: string) => string;
    pendingUserSnapshotRef: MutableRef<any>;
    lastServerConfirmedSelfPositionRef: MutableRef<any>;
    latestServerStateVersionRef: MutableRef<number>;
    pendingPartyMembersRef: MutableRef<any[]>;
    pendingClanMembersRef: MutableRef<any[]>;
    hasAnnouncedConnectionRef: MutableRef<boolean>;
    pendingRemoteSnapshotsRef: MutableRef<Map<number, any>>;
    activeCastBarsRef: MutableRef<Map<number, any>>;
    panelSnapshotChunkBufferRef: MutableRef<string>;
    panelSnapshotChunkExpectedIndexRef: MutableRef<number>;
    panelSnapshotChunkTotalRef: MutableRef<number>;
    characterStatsChunkBufferRef: MutableRef<string>;
    characterStatsChunkExpectedIndexRef: MutableRef<number>;
    characterStatsChunkTotalRef: MutableRef<number>;
    runtimeTimingRef: MutableRef<any>;
    emitHud: (hud: any) => void;
    retainPendingRemoteSnapshotsForMap: (mapNumber: number) => void;
    startMapChangeTransition: (
        targetMap: number,
        engine: any,
        detail: string,
    ) => void;
    applyOwnCharacterSnapshot: (engine: any, payload: any) => Promise<void>;
    emitStatus: (status: any) => void;
    onConsoleMessage?: ((message: any) => void) | undefined;
    applyEquipmentVisualChange: (id: number, patch: any) => Promise<void>;
    updateEquippedInventoryByType: (
        objType: number,
        equippedSlot: number | null,
    ) => void;
    mergeHud: (patch: any) => void;
    clearEquippedInventory: () => void;
    applyCharacterAppearanceChange: (id: number, patch: any) => Promise<void>;
    syncCastBar: (engine: any, entityId: number) => void;
    removeCastBarFromOverlay: (engine: any, entityId: number) => void;
    syncTtEntity: (engine: any, payload: any) => void;
    canRenderRemoteEntities: (engine: any) => boolean;
    syncRemoteEntity: (engine: any, payload: any) => Promise<void>;
    syncRemoteEntitiesBatch: (
        engine: any,
        payload: any[],
        options?: { preloadBodies?: boolean },
    ) => Promise<void>;
    flushBufferedRemoteEntities: (engine: any) => Promise<void>;
    playStepSound: (engine: any, entityId: number) => void;
    reconcileOwnPositionWithServer: (
        engine: any,
        payload: any,
    ) => Promise<void>;
    consumeAcknowledgedLocalMoves: (lastProcessedMoveId: number) => void;
    clearPendingLocalMoves: () => void;
    lockMovementInput: (engine: any, durationMs?: number) => void;
    isCharacterInmovilizado: (value?: number) => boolean;
    isCharacterParalizado: (value?: number) => boolean;
    recordResourceValue: (
        resource: "hp" | "mana",
        value: number,
        maxValue?: number | null,
    ) => void;
    applyCharacterColorChange: (id: number, color: string) => Promise<void>;
    removeInventoryItem: (slot: number, amount: number) => void;
    upsertInventoryItem: (payload: any) => void;
    updatePendingTileState: (
        map: number,
        x: number,
        y: number,
        updater: (current: any) => any,
    ) => void;
    ensureMapTile: (engine: any, map: number, x: number, y: number) => any;
    queueTileObjectVisualSync: (
        engine: any,
        map: number,
        x: number,
        y: number,
    ) => void;
    removeObjectSprite: (engine: any, tileKey: string) => void;
    emitTradeState: (tradeState: any) => void;
    emitMarketState: (marketState: any) => void;
    emitRetosState: (retosState: any) => void;
    emitBailState: (bailState: any) => void;
    emitCraftingState: (craftingState: any) => void;
    onAdminIntervalsOpen?: (() => void) | undefined;
    onAdminOverviewSnapshot?: ((snapshot: any) => void) | undefined;
    onCharacterStatsSnapshot?: ((snapshot: any) => void) | undefined;
    upsertSpell: (payload: any) => void;
    clearTargetingMode: () => void;
    showDialogBubble: (id: number, msg: string, color?: string) => void;
    onGlobalNotice?:
        | ((notice: { text: string; durationMs: number }) => void)
        | undefined;
    renderEntityFX: (engine: any, id: number, fxGrh: number) => Promise<void>;
    renderSpellProjectileVisual: (
        engine: any,
        start: { x: number; y: number },
        end: { x: number; y: number },
        spellData: any,
    ) => Promise<void> | void;
    renderProjectileVisual: (
        engine: any,
        start: { x: number; y: number },
        end: { x: number; y: number },
        grhIndex: number,
    ) => Promise<void>;
    soundManagerRef: MutableRef<any>;
    resolveEntitySoundPosition: (engine: any, entityId?: number) => any;
    setIsSceneReady: (ready: boolean) => void;
    disconnectSocket: () => void;
    removeRemoteEntity: (engine: any, entityId: number) => void;
};

export type IncomingPacketHandlerArgs = {
    packet: any;
    engine: any;
    renderedMapNumber: number;
    ctx: IncomingPacketHandlerContext;
};

export type ChunkedPanelSnapshot = PanelSnapshotChunk;
export type ChunkedCharacterStatsSnapshot = CharacterStatsSnapshotChunk;
export type PartyStateDelta = PartyHudStateDelta;
export type ClanStateDelta = ClanHudStateDelta;
export type FullPanelSnapshot = PanelSnapshot;
export type FullCharacterStatsSnapshot = CharacterStatsSnapshot;
