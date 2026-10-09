import {
    Application,
    AnimatedSprite,
    Container,
    Graphics,
    Sprite,
    Text,
    Texture,
    Ticker,
} from "pixi.js";
import type {
    GraphicData,
    GraphicsDB,
    MapData,
    ObjectsDB,
    NPCsDB,
    BodiesDB,
    HeadsDB,
    WeaponsDB,
    ShieldsDB,
    HelmetsDB,
    FXsDB,
    SpellsDB,
} from "../../../types/game";
import {
    getMapDimensions,
    getTileAt,
    loadBodiesDB,
    loadFXsDB,
    loadGraphicsDB,
    loadHeadsDB,
    loadHelmetsDB,
    loadMapData,
    loadNPCsDB,
    loadObjectsDB,
    loadShieldsDB,
    loadSpellsDB,
    loadWeaponsDB,
} from "../../../utils/gameLoader";
import { type CharacterSnapshot } from "../../../lib/aowProtocol";
import {
    DEFAULT_RUNTIME_TIMING,
    type RuntimeTimingConfig,
} from "../../../lib/runtime-config";
import { TILE_SIZE } from "../../../lib/viewport";
import {
    BODY_ANIMATION_CYCLE_MS,
    SHIELD_ANIMATION_CYCLE_MS,
    WEAPON_ANIMATION_CYCLE_MS,
} from "../config/animationTiming";
import {
    getDebugPositionLabelPosition,
    getHeadSpritePosition,
    getHelmetSpritePosition,
    getNameLabelPosition,
    type BodyRenderMetrics,
    updateAnimatedCharacterLayer,
} from "../rendering/characterLayout";
import {
    CLAN_TAG_HIGHLIGHT_COLOR,
    createCharacterClanTextStyle,
    setStyleIfChanged,
    setTextIfChanged,
    setVisibilityIfChanged,
} from "../rendering/textStyles";
import {
    CULL_BUCKET_SIZE,
    destroyDisplayObjectSafely,
    type CullEntry,
    unregisterContainerCullEntries,
} from "../rendering/pixiUtils";
import type { SharedTextureCaches } from "../rendering/textureCaches";
import { getRowZIndex, Z_INDEX_LAYERS } from "../rendering/mapLayers";
import {
    getCharacterClanLabel,
    getCharacterNameLabel,
    getCharacterRenderAlpha,
    hasPulsingInvisibility,
    isTreeObjectData,
    shouldHideRemoteCharacterName,
    shouldHighlightClanTag,
    type TreeSpriteEntry,
} from "../rendering/visibility";
import {
    syncCharacterContainerToRenderRow,
    syncDisplayObjectToEntityFXRow,
} from "../rendering/rowLayerContainers";

const TREE_FADE_ALPHA = 0.25;
const WATER_ANIMATION_SPEED_MULTIPLIER = 10;
const VIEW_CULLING_PADDING = TILE_SIZE * 4;

function getInterpolatedCharacterAxis(
    character: Character | null | undefined,
    axis: "x" | "y",
    currentPixelOffset: number,
): number {
    if (!character) {
        return 0;
    }

    const stepDelta = character.addtoUserPos[axis];
    const basePosition = character.pos[axis] - stepDelta;

    if (!stepDelta) {
        return basePosition;
    }

    const totalDistance = TILE_SIZE * Math.abs(stepDelta);
    const traveledDistance = Math.min(
        Math.abs(currentPixelOffset),
        totalDistance,
    );
    const progress = totalDistance > 0 ? traveledDistance / totalDistance : 0;

    return basePosition + stepDelta * progress;
}

function getInterpolatedCharacterPosition(
    character: Character | null | undefined,
    currentPixelOffsetX: number,
    currentPixelOffsetY: number,
): { x: number; y: number } {
    return {
        x: getInterpolatedCharacterAxis(character, "x", currentPixelOffsetX),
        y: getInterpolatedCharacterAxis(character, "y", currentPixelOffsetY),
    };
}

function shouldFadeObjectTree(
    playerPosition: { x: number; y: number },
    treeX: number,
    treeY: number,
): boolean {
    return (
        Math.abs(playerPosition.x - treeX) < 3 &&
        Math.abs(playerPosition.y - treeY) < 8 &&
        playerPosition.y < treeY
    );
}

function shouldFadeLayer3Tree(
    playerPosition: { x: number; y: number },
    treeX: number,
    treeY: number,
): boolean {
    return (
        Math.abs(playerPosition.x - treeX) <= 3 &&
        Math.abs(playerPosition.y - treeY) < 12 &&
        playerPosition.y < treeY
    );
}

function getInterpolatedCharacterRow(
    character: Character | null | undefined,
    currentPixelOffsetY: number,
): number {
    if (!character) {
        return 0;
    }

    const baseRow = character.pos.y - character.addtoUserPos.y;
    const stepDeltaY = character.addtoUserPos.y;

    if (!stepDeltaY) {
        return baseRow;
    }

    const totalDistance = TILE_SIZE * Math.abs(stepDeltaY);
    const traveledDistance = Math.min(
        Math.abs(currentPixelOffsetY),
        totalDistance,
    );
    const progress = totalDistance > 0 ? traveledDistance / totalDistance : 0;

    return baseRow + stepDeltaY * progress;
}

export interface Character {
    id: number;
    map: number;
    nameCharacter?: string;
    pos: { x: number; y: number };
    pixelX: number;
    pixelY: number;
    heading: number; // 1=Up, 2=Down, 3=Right, 4=Left
    moving: boolean;
    moveOffsetX: number;
    moveOffsetY: number;
    scrollDirectionX: number;
    scrollDirectionY: number;
    addtoUserPos: { x: number; y: number };
    frameCounter: number;
    frameCounterWeapon: number;
    frameCounterShield: number;
    bodyAnimationStartedAt?: number;
    weaponAnimationStartedAt?: number;
    shieldAnimationStartedAt?: number;
    movementStartedAt?: number;
    movementDurationMs?: number;
    animationIdleStartedAt?: number;
    idBody: number;
    idHead: number;
    idWeapon?: number;
    idShield?: number;
    idHelmet?: number;
    isNpc?: boolean;
    privileges?: number;
    dead?: boolean;
    invisibleAdmin?: boolean;
    invisibleSpell?: boolean;
    hiddenSkill?: boolean;
    invisibilityCycleStartedAt?: number;
    isPartyMember?: boolean;
    color?: string;
    clan?: string;
    zonaSegura?: number;
    navegando?: boolean;
    stateVersion?: number;
    hp?: number;
    tHp?: number;
    maxHp?: number;
    mana?: number;
    tMana?: number;
    maxMana?: number;
    adminSummonedBot?: boolean;
    tthoney?: boolean;
    tthoneyExpiresAt?: number;
    currentTargetId?: number;
    lastAggressorId?: number;
    pendingHeading?: number;
    inmovilizado?: boolean;
    paralizado?: boolean;
    tInmo?: boolean;
    tParalizado?: boolean;
    crowdControlStartedAt?: number;
    crowdControlExpiresAt?: number;
    crowdControlKind?: "inmovilizado" | "paralizado";
}

function isBodyAnimationDebugEnabled(): boolean {
    if (typeof window === "undefined") {
        return false;
    }

    return window.localStorage.getItem("aowebug:body-animation") === "1";
}

function debugBodyAnimation(
    event: string,
    payload: Record<string, unknown>,
): void {
    if (!isBodyAnimationDebugEnabled()) {
        return;
    }

    console.debug(`[BodyAnimation] ${event}`, payload);
}

function getBodyAnimationSpeed(bodyGraphicData: GraphicData): number {
    const frameCount = Math.max(bodyGraphicData.numFrames || 1, 1);

    if (frameCount <= 1) {
        return Math.max(bodyGraphicData.speed || 500, 1);
    }

    return Math.max(Math.round(BODY_ANIMATION_CYCLE_MS / frameCount), 1);
}

function getEquipmentAnimationSpeed(
    graphicData: GraphicData,
    kind: "weapon" | "shield",
): number {
    const frameCount = Math.max(graphicData.numFrames || 1, 1);

    if (frameCount <= 1) {
        return Math.max(graphicData.speed || 500, 1);
    }

    const cycleMs =
        kind === "weapon"
            ? WEAPON_ANIMATION_CYCLE_MS
            : SHIELD_ANIMATION_CYCLE_MS;

    return Math.max(Math.round(cycleMs / frameCount), 1);
}

// Player character (extends Character)
export interface PlayerCharacter extends Character {
    inmovilizado?: boolean;
    paralizado?: boolean;
    tInmo?: boolean;
    tParalizado?: boolean;
}

function isCharacterInmovilizado(movementRestriction?: number): boolean {
    return movementRestriction === 1;
}

function isCharacterParalizado(movementRestriction?: number): boolean {
    return movementRestriction === 2;
}

export function syncCharacterCrowdControlState(
    character: Character,
    movementRestriction: number | undefined,
    runtimeTiming: RuntimeTimingConfig,
    now: number,
    remainingMs?: number,
): void {
    const inmovilizado = isCharacterInmovilizado(movementRestriction);
    const paralizado = isCharacterParalizado(movementRestriction);
    const hasCrowdControl = inmovilizado || paralizado;

    character.inmovilizado = inmovilizado;
    character.paralizado = paralizado;
    character.tInmo = inmovilizado;
    character.tParalizado = paralizado;

    if (!hasCrowdControl) {
        character.crowdControlStartedAt = undefined;
        character.crowdControlExpiresAt = undefined;
        character.crowdControlKind = undefined;
        return;
    }

    const nextKind = paralizado ? "paralizado" : "inmovilizado";
    const durationMs = character.isNpc
        ? runtimeTiming.statusDurations.crowdControlNpcMs
        : runtimeTiming.statusDurations.crowdControlUserMs;
    const hasExplicitRemaining = Number.isFinite(remainingMs);
    const normalizedRemainingMs = hasExplicitRemaining
        ? Math.max(0, Math.min(durationMs, Math.round(remainingMs ?? 0)))
        : durationMs;

    if (
        !hasExplicitRemaining &&
        character.crowdControlKind === nextKind &&
        typeof character.crowdControlExpiresAt === "number" &&
        character.crowdControlExpiresAt > now
    ) {
        return;
    }

    character.crowdControlKind = nextKind;
    character.crowdControlExpiresAt = now + normalizedRemainingMs;
    character.crowdControlStartedAt =
        character.crowdControlExpiresAt - durationMs;
}

export function getCharacterCrowdControlProgress(
    character:
        | Pick<Character, "crowdControlStartedAt" | "crowdControlExpiresAt">
        | null
        | undefined,
    nowWallTime: number,
): number {
    const expiresAt = character?.crowdControlExpiresAt ?? 0;
    const startedAt = character?.crowdControlStartedAt ?? 0;
    const durationMs = Math.max(expiresAt - startedAt, 0);
    const remainingMs = Math.max(0, expiresAt - nowWallTime);

    if (durationMs <= 0) {
        return 0;
    }

    return Math.min(1, Math.max(0, remainingMs / durationMs));
}

function getCharacterCrowdControlBarLayout(
    bodyMetrics: BodyRenderMetrics,
    options?: {
        isNpc?: boolean;
        showNameplate?: boolean;
        showClanLabel?: boolean;
    },
): { x: number; y: number } {
    const barWidth = 50;
    const namePosition = getNameLabelPosition(bodyMetrics);
    const baseY = options?.isNpc
        ? bodyMetrics.y + bodyMetrics.height + 4
        : options?.showNameplate
          ? namePosition.y + (options.showClanLabel ? 30 : 17)
          : bodyMetrics.y + bodyMetrics.height + 4;
    const centerX = options?.isNpc
        ? TILE_SIZE / 2
        : bodyMetrics.x + bodyMetrics.width / 2;

    return {
        x: Math.round(centerX - barWidth / 2),
        y: Math.round(baseY),
    };
}

function redrawCrowdControlBarFill(fill: Graphics, progress: number): void {
    const fillPadding = 1;
    const width = 50;
    const height = 6;
    const innerWidth = Math.max(0, width - fillPadding * 2);
    const innerHeight = Math.max(0, height - fillPadding * 2);
    const fillWidth = Math.round(innerWidth * progress);

    fill.clear();
    fill.scale.set(1, 1);

    if (fillWidth <= 0) {
        return;
    }

    fill.roundRect(fillPadding, fillPadding, fillWidth, innerHeight, 3).fill({
        color: 0xfacc15,
        alpha: 0.98,
    });

    if (fillWidth > 4 && innerHeight > 2) {
        fill.roundRect(
            fillPadding + 1,
            fillPadding + 1,
            fillWidth - 2,
            1,
            1,
        ).fill({
            color: 0xffffff,
            alpha: 0.18,
        });
    }
}

type ProjectileVisualDisplayObject = Container | Sprite | AnimatedSprite;

export type ActiveProjectileVisual = {
    id: number;
    sprite: ProjectileVisualDisplayObject;
    startedAt: number;
    durationMs: number;
    startWorldX: number;
    startWorldY: number;
    endWorldX: number;
    endWorldY: number;
    updateVisual?: (progress: number, worldX: number, worldY: number) => void;
    cleanupVisual?: () => void;
};

type CharacterDisplayRefsContainer = Container & {
    bodySprite?: AnimatedSprite;
    headSprite?: Sprite;
    helmetSprite?: Sprite;
    weaponSprite?: AnimatedSprite;
    shieldSprite?: AnimatedSprite;
    nameLabel?: Text;
    clanLabel?: Text;
    debugPositionLabel?: Text;
    crowdControlBarBg?: Graphics;
    crowdControlBarFill?: Graphics;
};

function getStoredCharacterDisplayChild<
    T extends AnimatedSprite | Sprite | Text | Graphics,
>(
    container: CharacterDisplayRefsContainer,
    key: keyof CharacterDisplayRefsContainer,
    tag: string,
): T | undefined {
    const storedChild = container[key] as T | undefined;

    if (storedChild && !storedChild.destroyed) {
        return storedChild;
    }

    const child = container.children.find((candidate) =>
        Boolean((candidate as any)[tag]),
    ) as T | undefined;

    if (child) {
        (container as any)[key] = child;
    }

    return child;
}

function formatDebugPositionLabel(position: { x: number; y: number }): string {
    return `(${position.x}, ${position.y})`;
}

function formatCharacterAnimationDebugLabel(character: Character): string {
    return [
        formatDebugPositionLabel(character.pos),
        `mov:${character.moving ? "1" : "0"} fc:${character.frameCounter.toFixed(2)}`,
        `idle:${
            typeof character.animationIdleStartedAt === "number"
                ? "hold"
                : "none"
        }`,
    ].join("\n");
}

export class Engine {
    // Configuration
    engineBaseSpeed = 0.018;
    scrollPixelsPerFrameX = 8.5;
    scrollPixelsPerFrameY = 8.5;
    timeWalkMS = DEFAULT_RUNTIME_TIMING.walkStepMs;
    runtimeTiming: RuntimeTimingConfig = DEFAULT_RUNTIME_TIMING;

    // Timing
    delta = 0;
    timerTicksPerFrame = 0;
    timeWalk = 0;

    // Camera offsets (like engine.js offsetCounterX/Y)
    offsetCounterX = 0;
    offsetCounterY = 0;

    // Data stores (like engine.js inits)
    graphicsDB: GraphicsDB | null = null;
    objectsDB: ObjectsDB | null = null;
    npcsDB: NPCsDB | null = null;
    bodiesDB: BodiesDB | null = null;
    headsDB: HeadsDB | null = null;
    weaponsDB: WeaponsDB | null = null;
    shieldsDB: ShieldsDB | null = null;
    helmetsDB: HelmetsDB | null = null;
    fxsDB: FXsDB | null = null;
    spellsDB: SpellsDB | null = null;
    mapData: MapData | null = null;

    // Map configuration
    mapNumber: number;
    mapDimensions: { width: number; height: number } = { width: 0, height: 0 };

    // Characters
    personajes: Record<number, Character> = {};
    user: PlayerCharacter | null = null;
    isServerDriven = false;
    partyMemberIds: Set<string> = new Set();
    healthBarEntityIds: Set<number> = new Set();
    remoteEntities: Map<number, Container> = new Map();
    worldName = "";
    sendPositionPacket?: (heading: number) => void;
    sendHeadingPacket?: (heading: number) => void;
    sendMeleeAttackPacket?: () => void;
    canProcessMovementInput?: () => boolean;
    onPlayerPositionChange?: (position: { x: number; y: number }) => void;
    onCharacterStep?: (entityId: number) => void;
    requestCharacterRerender?: (entityId: number) => void;

    // PixiJS
    app: Application | null = null;
    mapContainer: Container | null = null;
    groundLayerContainer: Container | null = null;
    belowLayerContainer: Container | null = null;
    playerContainer: Container | null = null;
    roofContainer: Container | null = null;
    mapRowLayerContainers: Map<string, Container> = new Map();
    roofRowContainers: Map<number, Container> = new Map();
    entityFXRowContainers: Map<number, Container> = new Map();
    entityFXOverlayContainer: Container | null = null;
    dialogOverlayContainer: Container | null = null;
    debugGrid: Container | null = null;
    isDebugMode = false;
    isDestroyed = false;
    loadedAssetPaths: Set<string> = new Set();
    baseTextureCache: Map<string, Texture>;
    remoteEntityRenderRequestIds: Map<number, number> = new Map();
    tileObjectRenderRequestIds: Map<string, number> = new Map();
    pendingTileObjectVisualSyncs: Set<string> = new Set();
    tileObjectVisualFlushFrameId: number | null = null;
    isFlushingTileObjectVisuals = false;
    pendingAssetLoads: Map<string, Promise<Texture>>;
    activeCullEntries: Set<CullEntry> = new Set();
    cullBuckets: Map<string, Set<CullEntry>> = new Map();
    cullEntriesByDisplayObject: Map<Sprite | AnimatedSprite | Text, CullEntry> =
        new Map();
    cullingDirty = true;
    lastCullCameraX: number | null = null;
    lastCullCameraY: number | null = null;
    lastCullScreenWidth: number | null = null;
    lastCullScreenHeight: number | null = null;

    // Texture caches
    textureCache: Map<string, Texture>;
    animatedTextureCache: Map<string, Texture[]>;
    sceneLayerSprites: Map<string, Sprite | AnimatedSprite> = new Map();
    objectSprites: Map<string, Sprite | AnimatedSprite> = new Map();
    treeSprites: Map<string, TreeSpriteEntry[]> = new Map();
    treeSpritesByRow: Map<number, TreeSpriteEntry[]> = new Map();
    treeGraphicIds: Set<number> = new Set();
    fadedTreeSprites: Set<TreeSpriteEntry> = new Set();

    // Roof tracking - stores roof sprites keyed by tile coordinates "x,y"
    roofSprites: Map<string, (Sprite | AnimatedSprite)[]> = new Map();
    // Track which tiles have roofs for quick lookup
    roofTiles: Set<string> = new Set();
    roofVisibilityDirty = true;
    lastRoofVisibilityPlayerX: number | null = null;
    lastRoofVisibilityPlayerY: number | null = null;
    lastRoofVisibilityHidden: boolean | null = null;

    treeTransparencyDirty = true;
    lastTreeTransparencyX: number | null = null;
    lastTreeTransparencyY: number | null = null;

    // Frame counters for animated map sprites (like engine.js)
    animatedSpriteFrameCounters: Map<
        AnimatedSprite,
        { graphicId: string; graphicData: GraphicData; loop?: boolean }
    > = new Map();
    entityEffects: Map<number, Sprite | AnimatedSprite> = new Map();
    entityEffectGraphicIds: Map<number, number> = new Map();
    entityEffectStartedAt: Map<number, number> = new Map();
    entityEffectTimeouts: Map<number, number> = new Map();
    entityEffectExpiresAt: Map<number, number> = new Map();
    projectileVisuals: Map<number, ActiveProjectileVisual> = new Map();
    nextProjectileVisualId = 1;
    dialogBubbleTicker?: () => void;
    fpsTicker?: () => void;
    movementCheckTimeoutId: number | null = null;
    movementCheckScheduledAt = 0;

    // Key handling
    keydown: Record<number, boolean> = {};
    movementKeyPriority: number[] = [];

    // Directions (matching engine.js)
    DIRECTIONS = {
        UP: 1,
        DOWN: 2,
        RIGHT: 3,
        LEFT: 4,
    };

    // Key codes
    KEY_CODES = {
        W: 87,
        A: 65,
        S: 83,
        D: 68,
        ARROW_UP: 38,
        ARROW_DOWN: 40,
        ARROW_LEFT: 37,
        ARROW_RIGHT: 39,
    };

    constructor(mapNumber: number, sharedTextureCaches: SharedTextureCaches) {
        this.mapNumber = mapNumber;
        this.baseTextureCache = sharedTextureCaches.baseTextureCache;
        this.pendingAssetLoads = sharedTextureCaches.pendingAssetLoads;
        this.textureCache = sharedTextureCaches.textureCache;
        this.animatedTextureCache = sharedTextureCaches.animatedTextureCache;
    }

    createCharacterFromSnapshot(snapshot: CharacterSnapshot): PlayerCharacter {
        const hasActiveInvisibility = Boolean(
            snapshot.invisibleSpell || snapshot.hiddenSkill,
        );

        const movementRestriction = snapshot.tInmo ?? snapshot.inmovilizado;

        const character: PlayerCharacter = {
            id: snapshot.id,
            map: snapshot.map,
            nameCharacter: snapshot.nameCharacter,
            pos: { ...snapshot.pos },
            pixelX: snapshot.pos.x,
            pixelY: snapshot.pos.y,
            heading: snapshot.heading || 2,
            moving: false,
            moveOffsetX: 0,
            moveOffsetY: 0,
            scrollDirectionX: 0,
            scrollDirectionY: 0,
            addtoUserPos: { x: 0, y: 0 },
            frameCounter: 1,
            frameCounterWeapon: 1,
            frameCounterShield: 1,
            bodyAnimationStartedAt: undefined,
            weaponAnimationStartedAt: undefined,
            shieldAnimationStartedAt: undefined,
            movementStartedAt: undefined,
            movementDurationMs: undefined,
            idBody: snapshot.idBody ?? 1,
            idHead: snapshot.idHead ?? 1,
            idWeapon: snapshot.idWeapon ?? 0,
            idShield: snapshot.idShield ?? 0,
            idHelmet: snapshot.idHelmet ?? 0,
            isNpc: snapshot.isNpc,
            privileges: snapshot.privileges,
            dead: snapshot.dead,
            invisibleAdmin: snapshot.invisibleAdmin,
            invisibleSpell: snapshot.invisibleSpell,
            hiddenSkill: snapshot.hiddenSkill,
            invisibilityCycleStartedAt: hasActiveInvisibility
                ? Date.now()
                : undefined,
            isPartyMember: snapshot.isPartyMember,
            color: snapshot.color,
            clan: snapshot.clan,
            zonaSegura: snapshot.zonaSegura,
            navegando: Boolean(snapshot.navegando),
            stateVersion: snapshot.stateVersion,
            hp: snapshot.hp,
            tHp: snapshot.tHp ?? snapshot.hp,
            maxHp: snapshot.maxHp,
            mana: snapshot.mana,
            tMana: snapshot.tMana ?? snapshot.mana,
            maxMana: snapshot.maxMana,
            adminSummonedBot: snapshot.adminSummonedBot,
            tthoney: snapshot.tt === 1,
            tthoneyExpiresAt: snapshot.tt === 1 ? Date.now() + 5000 : undefined,
        };

        syncCharacterCrowdControlState(
            character,
            movementRestriction,
            this.runtimeTiming,
            Date.now(),
            snapshot.crowdControlRemainingMs,
        );

        return character;
    }

    applySnapshotToCharacter(
        character: Character,
        snapshot: CharacterSnapshot,
        options?: { preservePosition?: boolean },
    ): void {
        character.pos ??= { ...snapshot.pos };
        character.pixelX ??= snapshot.pos.x;
        character.pixelY ??= snapshot.pos.y;
        character.moving ??= false;
        character.addtoUserPos ??= { x: 0, y: 0 };
        character.moveOffsetX ??= 0;
        character.moveOffsetY ??= 0;
        character.scrollDirectionX ??= 0;
        character.scrollDirectionY ??= 0;
        character.frameCounter ??= 1;
        character.frameCounterWeapon ??= 1;
        character.frameCounterShield ??= 1;
        const hadActiveInvisibility = hasPulsingInvisibility(character);
        const hasActiveInvisibility = Boolean(
            snapshot.invisibleSpell || snapshot.hiddenSkill,
        );
        const nextWeaponId = snapshot.idWeapon ?? 0;
        const nextShieldId = snapshot.idShield ?? 0;

        character.map = snapshot.map;
        character.nameCharacter = snapshot.nameCharacter;
        character.idBody = snapshot.idBody ?? character.idBody;
        character.idHead = snapshot.idHead ?? character.idHead;
        if (character.idWeapon !== nextWeaponId) {
            character.frameCounterWeapon = 1;
            character.weaponAnimationStartedAt = undefined;
        }
        if (character.idShield !== nextShieldId) {
            character.frameCounterShield = 1;
            character.shieldAnimationStartedAt = undefined;
        }
        character.idWeapon = nextWeaponId;
        character.idShield = nextShieldId;
        character.idHelmet = snapshot.idHelmet ?? 0;
        character.heading = snapshot.heading || character.heading;
        if (!options?.preservePosition) {
            character.pos = { ...snapshot.pos };
            character.pixelX = snapshot.pos.x;
            character.pixelY = snapshot.pos.y;
        }
        character.isNpc = snapshot.isNpc;
        character.privileges = snapshot.privileges;
        character.dead = snapshot.dead;
        character.invisibleAdmin = snapshot.invisibleAdmin;
        character.invisibleSpell = snapshot.invisibleSpell;
        character.hiddenSkill = snapshot.hiddenSkill;
        character.invisibilityCycleStartedAt = hasActiveInvisibility
            ? hadActiveInvisibility
                ? (character.invisibilityCycleStartedAt ?? Date.now())
                : Date.now()
            : undefined;
        character.isPartyMember = snapshot.isPartyMember;
        character.color = snapshot.color;
        character.clan = snapshot.clan;
        character.zonaSegura = snapshot.zonaSegura;
        character.navegando = Boolean(snapshot.navegando);
        character.stateVersion = snapshot.stateVersion;
        syncCharacterCrowdControlState(
            character,
            snapshot.tInmo ?? snapshot.inmovilizado,
            this.runtimeTiming,
            Date.now(),
            snapshot.crowdControlRemainingMs,
        );
        character.hp = snapshot.hp;
        character.tHp = snapshot.tHp ?? snapshot.hp;
        character.maxHp = snapshot.maxHp;
        character.mana = snapshot.mana;
        character.tMana = snapshot.tMana ?? snapshot.mana;
        character.maxMana = snapshot.maxMana;
        character.adminSummonedBot = snapshot.adminSummonedBot;
        character.tthoney = snapshot.tt === 1;
        character.tthoneyExpiresAt =
            snapshot.tt === 1 ? Date.now() + 5000 : undefined;
    }

    // Initialize resources (like engine.js initCanvas)
    async initResources(initialSnapshot?: CharacterSnapshot): Promise<void> {
        console.log("Loading resources...");

        const [
            graphicsDB,
            objectsDB,
            npcsDB,
            bodiesDB,
            headsDB,
            weaponsDB,
            shieldsDB,
            helmetsDB,
            fxsDB,
            spellsDB,
            mapData,
        ] = await Promise.all([
            loadGraphicsDB(),
            loadObjectsDB(),
            loadNPCsDB(),
            loadBodiesDB(),
            loadHeadsDB(),
            loadWeaponsDB(),
            loadShieldsDB(),
            loadHelmetsDB(),
            loadFXsDB(),
            loadSpellsDB(),
            loadMapData(this.mapNumber),
        ]);

        this.graphicsDB = graphicsDB;
        this.objectsDB = objectsDB;
        this.npcsDB = npcsDB;
        this.bodiesDB = bodiesDB;
        this.headsDB = headsDB;
        this.weaponsDB = weaponsDB;
        this.shieldsDB = shieldsDB;
        this.helmetsDB = helmetsDB;
        this.fxsDB = fxsDB;
        this.spellsDB = spellsDB;
        this.mapData = mapData;

        this.mapDimensions = getMapDimensions(mapData, this.mapNumber);
        this.treeGraphicIds = new Set(
            Object.values(objectsDB)
                .filter((objectData) => isTreeObjectData(objectData))
                .map((objectData) => Number(objectData.grhIndex))
                .filter(
                    (graphicId) => Number.isFinite(graphicId) && graphicId > 0,
                ),
        );
        // console.log("Map dimensions:", this.mapDimensions);

        if (initialSnapshot) {
            this.user = this.createCharacterFromSnapshot(initialSnapshot);
            this.personajes = { [this.user.id]: this.user };
            return;
        }

        this.user = null;
        this.personajes = {};
    }

    private isWaterGraphic(layer1: number): boolean {
        return (
            (layer1 >= 1505 && layer1 <= 1520) ||
            (layer1 >= 5665 && layer1 <= 5680) ||
            (layer1 >= 13547 && layer1 <= 13562)
        );
    }

    isWaterTile(tX: number, tY: number): boolean {
        if (!this.mapData) return false;

        const tile = getTileAt(this.mapData, this.mapNumber, tX, tY);
        const layer1 = tile?.graphics?.["1"];
        const layer2 = tile?.graphics?.["2"];

        return Boolean(layer1 && this.isWaterGraphic(layer1) && !layer2);
    }

    // Get timestamp (like engine.js timestamp)
    timestamp(): number {
        return window.performance && window.performance.now
            ? window.performance.now()
            : Date.now();
    }

    clearScheduledMovementCheck(): void {
        if (this.movementCheckTimeoutId !== null) {
            window.clearTimeout(this.movementCheckTimeoutId);
            this.movementCheckTimeoutId = null;
        }

        this.movementCheckScheduledAt = 0;
    }

    scheduleMovementCheck(delayMs: number): void {
        if (this.isDestroyed) {
            return;
        }

        const normalizedDelayMs = Math.max(0, Math.ceil(delayMs));
        const scheduledAt = this.timestamp() + normalizedDelayMs;

        if (
            this.movementCheckTimeoutId !== null &&
            this.movementCheckScheduledAt > 0 &&
            this.movementCheckScheduledAt <= scheduledAt
        ) {
            return;
        }

        this.clearScheduledMovementCheck();
        this.movementCheckScheduledAt = scheduledAt;
        this.movementCheckTimeoutId = window.setTimeout(() => {
            this.movementCheckTimeoutId = null;
            this.movementCheckScheduledAt = 0;
            this.check();
        }, normalizedDelayMs);
    }

    // Sign function (like engine.js sign)
    sign(x: number): number {
        return x > 0 ? 1 : x < 0 ? -1 : 0;
    }

    getWalkDurationMs(overrideMs?: number): number {
        return Math.max(1, overrideMs ?? this.timeWalkMS);
    }

    getCharacterMovementProgress(character: Character, now: number): number {
        const startedAt = character.movementStartedAt;
        const durationMs = this.getWalkDurationMs(character.movementDurationMs);

        if (typeof startedAt !== "number") {
            return character.moving ? 0 : 1;
        }

        return Math.max(0, Math.min(1, (now - startedAt) / durationMs));
    }

    hasQueuedMovementInput(): boolean {
        return this.movementKeyPriority.some(
            (keyCode) => this.keydown[keyCode],
        );
    }

    shouldHoldMovementAnimation(character: Character, now: number): boolean {
        if (character.moving) {
            return true;
        }

        if (character.id === this.user?.id && !this.hasQueuedMovementInput()) {
            return false;
        }

        const idleStartedAt = character.animationIdleStartedAt;
        if (typeof idleStartedAt !== "number") {
            return false;
        }

        return (
            now - idleStartedAt <=
            this.getWalkDurationMs(character.movementDurationMs)
        );
    }

    getBodyAnimationFrameCounter(
        character: Character,
        bodyGraphicData: GraphicData,
        now: number,
    ): number {
        const frameCount = Math.max(bodyGraphicData.numFrames || 1, 1);
        if (frameCount <= 1) {
            return 1;
        }

        if (typeof character.bodyAnimationStartedAt !== "number") {
            character.bodyAnimationStartedAt = now;
        }

        const speed = getBodyAnimationSpeed(bodyGraphicData);
        const elapsedFrames = Math.floor(
            Math.max(0, now - character.bodyAnimationStartedAt) / speed,
        );

        return (elapsedFrames % frameCount) + 1;
    }

    getEquipmentAnimationFrameCounter(
        character: Character,
        graphicData: GraphicData,
        now: number,
        kind: "weapon" | "shield",
    ): number {
        const frameCount = Math.max(graphicData.numFrames || 1, 1);
        if (frameCount <= 1) {
            return 1;
        }

        const startedAtKey =
            kind === "weapon"
                ? "weaponAnimationStartedAt"
                : "shieldAnimationStartedAt";

        if (typeof character[startedAtKey] !== "number") {
            character[startedAtKey] = now;
        }

        const speed = getEquipmentAnimationSpeed(graphicData, kind);
        const elapsedFrames = Math.floor(
            Math.max(0, now - character[startedAtKey]) / speed,
        );

        return (elapsedFrames % frameCount) + 1;
    }

    startCharacterMovement(
        character: Character,
        deltaX: number,
        deltaY: number,
        options?: {
            startedAt?: number;
            durationMs?: number;
        },
    ): void {
        const durationMs = this.getWalkDurationMs(options?.durationMs);
        const now = this.timestamp();
        const startedAt = options?.startedAt ?? now;
        const elapsedMs = Math.max(0, now - startedAt);
        const progress = Math.max(0, Math.min(1, elapsedMs / durationMs));
        const idleStartedAt = character.animationIdleStartedAt;

        if (
            typeof idleStartedAt === "number" &&
            now - idleStartedAt > durationMs
        ) {
            character.bodyAnimationStartedAt = startedAt;
            character.weaponAnimationStartedAt = startedAt;
            character.shieldAnimationStartedAt = startedAt;
            character.frameCounter = 1;
            character.frameCounterWeapon = 1;
            character.frameCounterShield = 1;
        }

        character.movementStartedAt = startedAt;
        character.movementDurationMs = durationMs;
        if (typeof character.bodyAnimationStartedAt !== "number") {
            character.bodyAnimationStartedAt = startedAt;
        }
        if (typeof character.weaponAnimationStartedAt !== "number") {
            character.weaponAnimationStartedAt = startedAt;
        }
        if (typeof character.shieldAnimationStartedAt !== "number") {
            character.shieldAnimationStartedAt = startedAt;
        }
        character.animationIdleStartedAt = undefined;
        character.moving = progress < 1;
        character.addtoUserPos = { x: deltaX, y: deltaY };
        character.scrollDirectionX = this.sign(deltaX);
        character.scrollDirectionY = this.sign(deltaY);
        character.moveOffsetX = -1 * (TILE_SIZE * deltaX) * (1 - progress);
        character.moveOffsetY = -1 * (TILE_SIZE * deltaY) * (1 - progress);

        if (!character.moving) {
            this.resetMovement(character);
        }

        debugBodyAnimation("startMovement", {
            id: character.id,
            frameCounter: character.frameCounter,
            progress,
            durationMs,
            deltaX,
            deltaY,
        });
    }

    private getCharacterAtPosition(
        tX: number,
        tY: number,
        ignoreCharacterIds: number[] = [],
    ): Character | undefined {
        const ignoredIds = new Set(ignoreCharacterIds);

        return Object.values(this.personajes).find(
            (personaje) =>
                !ignoredIds.has(personaje.id) &&
                !personaje.tthoney &&
                personaje.map === this.mapNumber &&
                personaje.pos.x === tX &&
                personaje.pos.y === tY,
        );
    }

    private isTileWalkableForCharacter(
        character: Character | null | undefined,
        tX: number,
        tY: number,
        inferDeadWaterMovement: boolean = false,
    ): boolean {
        if (!this.mapData) {
            return false;
        }

        if (
            tX < 1 ||
            tX > this.mapDimensions.width ||
            tY < 1 ||
            tY > this.mapDimensions.height
        ) {
            return false;
        }

        const tile = getTileAt(this.mapData, this.mapNumber, tX, tY);
        const isWaterTile = this.isWaterTile(tX, tY);
        const usesWaterMovement = Boolean(
            character?.navegando ||
            (inferDeadWaterMovement &&
                character?.dead &&
                this.isWaterTile(character.pos.x, character.pos.y)),
        );

        if (usesWaterMovement) {
            return isWaterTile && tile?.blocked !== 1;
        }

        if (tile?.objInfo?.objIndex === 378) {
            return true;
        }

        if (tile?.blocked === 1) {
            return false;
        }

        return !isWaterTile;
    }

    private getGhostDisplacementHeadings(heading: number): number[] {
        switch (heading) {
            case this.DIRECTIONS.UP:
                return [
                    this.DIRECTIONS.DOWN,
                    this.DIRECTIONS.LEFT,
                    this.DIRECTIONS.RIGHT,
                    this.DIRECTIONS.UP,
                ];
            case this.DIRECTIONS.DOWN:
                return [
                    this.DIRECTIONS.UP,
                    this.DIRECTIONS.RIGHT,
                    this.DIRECTIONS.LEFT,
                    this.DIRECTIONS.DOWN,
                ];
            case this.DIRECTIONS.RIGHT:
                return [
                    this.DIRECTIONS.LEFT,
                    this.DIRECTIONS.UP,
                    this.DIRECTIONS.DOWN,
                    this.DIRECTIONS.RIGHT,
                ];
            case this.DIRECTIONS.LEFT:
                return [
                    this.DIRECTIONS.RIGHT,
                    this.DIRECTIONS.UP,
                    this.DIRECTIONS.DOWN,
                    this.DIRECTIONS.LEFT,
                ];
            default:
                return [
                    this.DIRECTIONS.UP,
                    this.DIRECTIONS.RIGHT,
                    this.DIRECTIONS.DOWN,
                    this.DIRECTIONS.LEFT,
                ];
        }
    }

    private getHeadingOffset(heading: number): { x: number; y: number } {
        switch (heading) {
            case this.DIRECTIONS.RIGHT:
                return { x: 1, y: 0 };
            case this.DIRECTIONS.LEFT:
                return { x: -1, y: 0 };
            case this.DIRECTIONS.DOWN:
                return { x: 0, y: 1 };
            case this.DIRECTIONS.UP:
                return { x: 0, y: -1 };
            default:
                return { x: 0, y: 0 };
        }
    }

    private findGhostDisplacementTile(
        ghost: Character,
        heading: number,
        moverId: number,
    ): { x: number; y: number } | null {
        for (const candidateHeading of this.getGhostDisplacementHeadings(
            heading,
        )) {
            const offset = this.getHeadingOffset(candidateHeading);
            const nextX = ghost.pos.x + offset.x;
            const nextY = ghost.pos.y + offset.y;

            if (!this.isTileWalkableForCharacter(ghost, nextX, nextY, true)) {
                continue;
            }

            const occupant = this.getCharacterAtPosition(nextX, nextY, [
                ghost.id,
                moverId,
            ]);

            if (!occupant) {
                return { x: nextX, y: nextY };
            }
        }

        return null;
    }

    private canAliveCharacterPassThroughGhost(
        mover: Character | null | undefined,
        tX: number,
        tY: number,
        heading: number,
    ): boolean {
        if (!mover || mover.dead) {
            return false;
        }

        const occupant = this.getCharacterAtPosition(tX, tY, [mover.id]);

        if (!occupant?.dead) {
            return false;
        }

        return (
            this.findGhostDisplacementTile(occupant, heading, mover.id) !== null
        );
    }

    private relocateGhostForAliveMover(
        mover: Character | null | undefined,
        tX: number,
        tY: number,
        heading: number,
    ): void {
        if (!mover || mover.dead) {
            return;
        }

        const ghost = this.getCharacterAtPosition(tX, tY, [mover.id]);

        if (!ghost?.dead) {
            return;
        }

        const targetTile = this.findGhostDisplacementTile(
            ghost,
            heading,
            mover.id,
        );

        if (!targetTile) {
            return;
        }

        this.snapCharacter(ghost.id, targetTile.x, targetTile.y, ghost.heading);
    }

    // Check if position is legal (like engine.js legalPos)
    legalPos(
        tX: number,
        tY: number,
        heading: number = this.user?.heading ?? 0,
    ): boolean {
        try {
            if (!this.isTileWalkableForCharacter(this.user, tX, tY)) {
                return false;
            }

            const occupant = this.getCharacterAtPosition(tX, tY, [
                this.user?.id ?? -1,
            ]);

            if (!occupant) {
                return true;
            }

            return this.canAliveCharacterPassThroughGhost(
                this.user,
                tX,
                tY,
                heading,
            );
        } catch {
            return false;
        }
    }

    resetMovement(
        character: Character,
        options?: { preserveAnimationFrame?: boolean },
    ): void {
        const wasMoving = character.moving;
        const now = this.timestamp();
        character.moving = false;
        character.moveOffsetX = 0;
        character.moveOffsetY = 0;
        character.scrollDirectionX = 0;
        character.scrollDirectionY = 0;
        character.addtoUserPos = { x: 0, y: 0 };
        if (!options?.preserveAnimationFrame) {
            character.frameCounter = 1;
            character.frameCounterWeapon = 1;
            character.frameCounterShield = 1;
            character.bodyAnimationStartedAt = undefined;
            character.weaponAnimationStartedAt = undefined;
            character.shieldAnimationStartedAt = undefined;
            character.animationIdleStartedAt = undefined;
        } else if (typeof character.animationIdleStartedAt !== "number") {
            character.animationIdleStartedAt = now;
        }
        character.movementStartedAt = undefined;
        character.movementDurationMs = undefined;

        debugBodyAnimation("resetMovement", {
            id: character.id,
            wasMoving,
            preserveAnimationFrame: Boolean(options?.preserveAnimationFrame),
            frameCounter: character.frameCounter,
            idleStartedAt: character.animationIdleStartedAt,
        });
    }

    snapCharacter(
        id: number,
        x: number,
        y: number,
        heading?: number,
        options?: { preserveAnimationFrame?: boolean },
    ): void {
        const character = this.personajes[id];
        if (!character) return;

        character.pos.x = x;
        character.pos.y = y;
        character.pixelX = x;
        character.pixelY = y;
        if (heading) {
            character.heading = heading;
        }

        this.resetMovement(character, options);

        debugBodyAnimation("snapCharacter", {
            id,
            x,
            y,
            heading,
            preserveAnimationFrame: Boolean(options?.preserveAnimationFrame),
            frameCounter: character.frameCounter,
        });

        if (this.user?.id === id) {
            this.offsetCounterX = 0;
            this.offsetCounterY = 0;
            this.onPlayerPositionChange?.({ x, y });
        }
    }

    removeAllRemoteEntities(): void {
        this.healthBarEntityIds.clear();

        for (const [id, container] of this.remoteEntities.entries()) {
            unregisterContainerCullEntries(this, container);
            container.parent?.removeChild(container);
            container.destroy({ children: true });
            this.remoteEntities.delete(id);
            this.remoteEntityRenderRequestIds.delete(id);
            this.entityEffects.delete(id);
            this.entityEffectGraphicIds.delete(id);
            this.entityEffectStartedAt.delete(id);
            this.entityEffectExpiresAt.delete(id);
            const timeoutId = this.entityEffectTimeouts.get(id);
            if (typeof timeoutId === "number") {
                window.clearTimeout(timeoutId);
                this.entityEffectTimeouts.delete(id);
            }
            delete this.personajes[id];
        }

        this.cullingDirty = true;
    }

    addHealthBarEntity(targetId: number | null | undefined): void {
        if (typeof targetId !== "number" || !Number.isFinite(targetId)) {
            return;
        }

        if (this.healthBarEntityIds.has(targetId)) {
            return;
        }

        this.healthBarEntityIds.add(targetId);
        this.requestCharacterRerender?.(targetId);
    }

    clearHealthBarEntity(targetId?: number): void {
        if (typeof targetId !== "number") {
            if (this.healthBarEntityIds.size === 0) {
                return;
            }

            const entityIds = Array.from(this.healthBarEntityIds);
            this.healthBarEntityIds.clear();
            for (const entityId of entityIds) {
                this.requestCharacterRerender?.(entityId);
            }
            return;
        }

        if (!this.healthBarEntityIds.delete(targetId)) {
            return;
        }

        this.requestCharacterRerender?.(targetId);
    }

    // Move character by heading (like engine.js moveCharByHead)
    moveCharByHead(
        idPj: number,
        heading: number,
        dontSend: boolean = false,
        options?: {
            startedAt?: number;
            durationMs?: number;
        },
    ): void {
        const personaje = this.personajes[idPj];
        if (!personaje) return;

        const oldX = personaje.pos.x;
        const oldY = personaje.pos.y;

        let newX = 0;
        let newY = 0;

        if (heading === this.DIRECTIONS.RIGHT) {
            newX = 1;
        } else if (heading === this.DIRECTIONS.LEFT) {
            newX = -1;
        } else if (heading === this.DIRECTIONS.DOWN) {
            newY = 1;
        } else if (heading === this.DIRECTIONS.UP) {
            newY = -1;
        }

        const posX = oldX + newX;
        const posY = oldY + newY;

        this.relocateGhostForAliveMover(personaje, posX, posY, heading);

        personaje.heading = heading;
        personaje.moving = true;
        personaje.pos.x = posX;
        personaje.pos.y = posY;
        this.startCharacterMovement(personaje, newX, newY, options);

        if (!dontSend) {
            this.timeWalk = this.timestamp();
            this.sendPositionPacket?.(heading);
            this.scheduleMovementCheck(
                this.getWalkDurationMs(options?.durationMs),
            );
        }

        if (this.user?.id === idPj) {
            this.onPlayerPositionChange?.({ x: posX, y: posY });
            this.onCharacterStep?.(idPj);
        }
    }

    moveCharByPos(
        idPj: number,
        posX: number,
        posY: number,
        options?: {
            heading?: number;
            startedAt?: number;
            durationMs?: number;
        },
    ): void {
        const personaje = this.personajes[idPj];
        if (!personaje) return;

        const oldX = personaje.pos.x;
        const oldY = personaje.pos.y;
        const deltaX = posX - oldX;
        const deltaY = posY - oldY;
        let heading = options?.heading ?? personaje.heading;

        if (
            (Math.abs(deltaX) === 1 && deltaY === 0) ||
            (Math.abs(deltaY) === 1 && deltaX === 0)
        ) {
            if (deltaX === 1) {
                heading = this.DIRECTIONS.RIGHT;
            } else if (deltaX === -1) {
                heading = this.DIRECTIONS.LEFT;
            } else if (deltaY === 1) {
                heading = this.DIRECTIONS.DOWN;
            } else if (deltaY === -1) {
                heading = this.DIRECTIONS.UP;
            }

            this.relocateGhostForAliveMover(personaje, posX, posY, heading);

            personaje.heading = heading;
            personaje.moving = true;
            personaje.pos.x = posX;
            personaje.pos.y = posY;
            personaje.pixelX = posX;
            personaje.pixelY = posY;
            this.startCharacterMovement(personaje, deltaX, deltaY, options);
            return;
        }

        this.snapCharacter(idPj, posX, posY);
    }

    moveScreen(direccion: number, dontSend: boolean = false): void {
        if (!this.user) return;

        let x = 0;
        let y = 0;

        switch (direccion) {
            case this.DIRECTIONS.UP:
                y = -1;
                break;
            case this.DIRECTIONS.RIGHT:
                x = 1;
                break;
            case this.DIRECTIONS.DOWN:
                y = 1;
                break;
            case this.DIRECTIONS.LEFT:
                x = -1;
                break;
        }

        const tX = this.user.pos.x + x;
        const tY = this.user.pos.y + y;

        if (this.legalPos(tX, tY, direccion)) {
            // Don't update position here - let moveCharByHead do it
            // Just set the direction and call moveCharByHead
            this.user.heading = direccion;
            this.moveCharByHead(this.user.id, direccion, dontSend);
        } else {
            // Can't move, just update direction
            this.user.heading = direccion;
            if (!dontSend) {
                this.timeWalk = this.timestamp();
                this.sendHeadingPacket?.(direccion);
                this.scheduleMovementCheck(this.timeWalkMS);
            }
        }
    }

    // Move to (like engine.js moveTo)
    moveTo(userId: number, direccion: number): void {
        const currentTime = this.timestamp();

        if (this.canProcessMovementInput && !this.canProcessMovementInput()) {
            return;
        }

        // Time-based throttle
        if (currentTime - this.timeWalk < this.timeWalkMS) {
            this.scheduleMovementCheck(
                this.timeWalkMS - (currentTime - this.timeWalk),
            );
            return;
        }

        if (!this.user || !this.personajes[userId]) {
            this.clearScheduledMovementCheck();
            return;
        }

        if (this.user.tInmo) {
            this.resetMovement(this.user);
            this.offsetCounterX = 0;
            this.offsetCounterY = 0;
        }

        if (this.user.tParalizado) {
            this.clearScheduledMovementCheck();
            return;
        }

        if (!this.user.tInmo) {
            this.moveScreen(direccion, false);
            return;
        }

        this.sendHeadingPacket?.(direccion);
        this.personajes[userId].heading = direccion;
        this.timeWalk = currentTime;
        this.clearScheduledMovementCheck();
    }

    // Check function (like engine.js check)
    check(): void {
        if (!this.user) {
            this.clearScheduledMovementCheck();
            return;
        }

        if (this.user.moving) {
            const now = this.timestamp();
            const progress = this.getCharacterMovementProgress(this.user, now);

            if (progress >= 1) {
                this.offsetCounterX = 0;
                this.offsetCounterY = 0;
                this.resetMovement(this.user, {
                    preserveAnimationFrame: this.hasQueuedMovementInput(),
                });
            } else {
                const movementStartedAt = this.user.movementStartedAt ?? now;
                const remainingMs = Math.max(
                    0,
                    this.getWalkDurationMs(this.user.movementDurationMs) -
                        (now - movementStartedAt),
                );

                this.scheduleMovementCheck(remainingMs);
                return;
            }
        }

        if (!this.user.moving && this.user.pos.x > 0 && this.user.pos.y > 0) {
            for (const keyCode of this.movementKeyPriority) {
                if (!this.keydown[keyCode]) {
                    continue;
                }

                if (
                    keyCode === this.KEY_CODES.A ||
                    keyCode === this.KEY_CODES.ARROW_LEFT
                ) {
                    this.moveTo(this.user.id, this.DIRECTIONS.LEFT);
                    return;
                }

                if (
                    keyCode === this.KEY_CODES.D ||
                    keyCode === this.KEY_CODES.ARROW_RIGHT
                ) {
                    this.moveTo(this.user.id, this.DIRECTIONS.RIGHT);
                    return;
                }

                if (
                    keyCode === this.KEY_CODES.W ||
                    keyCode === this.KEY_CODES.ARROW_UP
                ) {
                    this.moveTo(this.user.id, this.DIRECTIONS.UP);
                    return;
                }

                if (
                    keyCode === this.KEY_CODES.S ||
                    keyCode === this.KEY_CODES.ARROW_DOWN
                ) {
                    this.moveTo(this.user.id, this.DIRECTIONS.DOWN);
                    return;
                }
            }
        }

        this.clearScheduledMovementCheck();
    }

    // Show next frame (like engine.js showNextFrame)
    showNextFrame(now: number): void {
        if (!this.user) return;

        if (this.user.moving) {
            const progress = this.getCharacterMovementProgress(this.user, now);

            this.offsetCounterX =
                this.user.addtoUserPos.x === 0
                    ? 0
                    : -1 * TILE_SIZE * this.user.addtoUserPos.x * progress;
            this.offsetCounterY =
                this.user.addtoUserPos.y === 0
                    ? 0
                    : -1 * TILE_SIZE * this.user.addtoUserPos.y * progress;

            if (progress >= 1) {
                this.offsetCounterX = 0;
                this.offsetCounterY = 0;
                this.resetMovement(this.user, {
                    preserveAnimationFrame: true,
                });
            }
        }

        // Keep the body animation alive briefly between chained tile steps.
        if (!this.shouldHoldMovementAnimation(this.user, now)) {
            this.user.frameCounter = 1;
            this.user.frameCounterWeapon = 1;
            this.user.frameCounterShield = 1;
            this.user.bodyAnimationStartedAt = undefined;
            this.user.weaponAnimationStartedAt = undefined;
            this.user.shieldAnimationStartedAt = undefined;
            this.user.animationIdleStartedAt = undefined;
        }
    }

    // Render function (like engine.js render)
    render(): void {
        const now = this.timestamp();

        // Keep the legacy timer value updated for systems that still read it.
        this.timerTicksPerFrame = this.delta * this.engineBaseSpeed;
        this.showNextFrame(now);
        this.updateRemoteEntityMovement(now);
    }

    updateRemoteEntityMovement(now: number): void {
        if (!this.graphicsDB || !this.bodiesDB) return;

        for (const [id, container] of this.remoteEntities.entries()) {
            const entity = this.personajes[id];
            if (!entity) continue;

            container.alpha = getCharacterRenderAlpha(
                entity,
                this.runtimeTiming,
                {
                    localPartyMemberIds: this.partyMemberIds,
                    localClanTag: this.user?.clan,
                    isAdminViewer: this.user?.privileges === 1,
                },
            );

            if (entity.moving) {
                const progress = this.getCharacterMovementProgress(entity, now);

                entity.moveOffsetX =
                    -1 * TILE_SIZE * entity.addtoUserPos.x * (1 - progress);
                entity.moveOffsetY =
                    -1 * TILE_SIZE * entity.addtoUserPos.y * (1 - progress);

                if (progress >= 1) {
                    this.resetMovement(entity, {
                        preserveAnimationFrame: true,
                    });

                    if (typeof entity.pendingHeading === "number") {
                        const pendingHeading = entity.pendingHeading;
                        entity.pendingHeading = undefined;

                        if (pendingHeading !== entity.heading) {
                            entity.heading = pendingHeading;
                            this.requestCharacterRerender?.(id);
                        }
                    }
                }
            }

            syncCharacterContainerToRenderRow(this, entity, container);

            const direction = entity.heading.toString();
            const bodyData = this.bodiesDB[entity.idBody.toString()];
            const weaponData = entity.idWeapon
                ? this.weaponsDB?.[entity.idWeapon.toString()]
                : undefined;
            const shieldData = entity.idShield
                ? this.shieldsDB?.[entity.idShield.toString()]
                : undefined;
            const bodyGraphicId =
                bodyData?.[direction as keyof typeof bodyData];
            const bodyGraphicData = bodyGraphicId
                ? this.graphicsDB[bodyGraphicId.toString()]
                : undefined;
            const weaponGraphicId =
                weaponData?.[direction as keyof typeof weaponData];
            const shieldGraphicId =
                shieldData?.[direction as keyof typeof shieldData];
            const weaponGraphicData = weaponGraphicId
                ? this.graphicsDB[weaponGraphicId.toString()]
                : undefined;
            const shieldGraphicData = shieldGraphicId
                ? this.graphicsDB[shieldGraphicId.toString()]
                : undefined;

            if (bodyGraphicData && this.delta > 0) {
                const shouldAnimateBody = entity.moving;

                if (shouldAnimateBody) {
                    entity.frameCounter = this.getBodyAnimationFrameCounter(
                        entity,
                        bodyGraphicData,
                        now,
                    );

                    if (weaponGraphicData) {
                        entity.frameCounterWeapon =
                            this.getEquipmentAnimationFrameCounter(
                                entity,
                                weaponGraphicData,
                                now,
                                "weapon",
                            );
                    }

                    if (shieldGraphicData) {
                        entity.frameCounterShield =
                            this.getEquipmentAnimationFrameCounter(
                                entity,
                                shieldGraphicData,
                                now,
                                "shield",
                            );
                    }
                }
            }

            container.x = Math.round(
                (entity.pos.x - 1) * TILE_SIZE + entity.moveOffsetX,
            );
            container.y = Math.round(
                (entity.pos.y - 1) * TILE_SIZE + entity.moveOffsetY,
            );
            container.zIndex = getRowZIndex(
                entity.pos.y - entity.addtoUserPos.y,
                Z_INDEX_LAYERS.CHARACTER,
            );

            const displayContainer = container as CharacterDisplayRefsContainer;
            const bodySprite = getStoredCharacterDisplayChild<AnimatedSprite>(
                displayContainer,
                "bodySprite",
                "isRemoteBody",
            );
            const headSprite = getStoredCharacterDisplayChild<Sprite>(
                displayContainer,
                "headSprite",
                "isRemoteHead",
            );
            const weaponSprite = getStoredCharacterDisplayChild<AnimatedSprite>(
                displayContainer,
                "weaponSprite",
                "isRemoteWeapon",
            );
            const shieldSprite = getStoredCharacterDisplayChild<AnimatedSprite>(
                displayContainer,
                "shieldSprite",
                "isRemoteShield",
            );
            const nameLabel = getStoredCharacterDisplayChild<Text>(
                displayContainer,
                "nameLabel",
                "isRemoteName",
            );
            const clanLabel = getStoredCharacterDisplayChild<Text>(
                displayContainer,
                "clanLabel",
                "isRemoteClan",
            );
            const debugPositionLabel = getStoredCharacterDisplayChild<Text>(
                displayContainer,
                "debugPositionLabel",
                "isDebugPosition",
            );
            const crowdControlBarBg = getStoredCharacterDisplayChild<Graphics>(
                displayContainer,
                "crowdControlBarBg",
                "isCrowdControlBarBg",
            );
            const crowdControlBarFill =
                getStoredCharacterDisplayChild<Graphics>(
                    displayContainer,
                    "crowdControlBarFill",
                    "isCrowdControlBarFill",
                );

            if (bodySprite && bodySprite.textures.length > 0) {
                const shouldAnimateBody = entity.moving;
                const previousBodyFrame = bodySprite.currentFrame;
                const nextBodyFrameCounter = shouldAnimateBody
                    ? entity.frameCounter
                    : 1;
                updateAnimatedCharacterLayer(bodySprite, nextBodyFrameCounter);
                updateAnimatedCharacterLayer(
                    weaponSprite,
                    shouldAnimateBody ? entity.frameCounterWeapon : 1,
                );
                updateAnimatedCharacterLayer(
                    shieldSprite,
                    shouldAnimateBody ? entity.frameCounterShield : 1,
                );

                if (bodySprite.currentFrame !== previousBodyFrame) {
                    debugBodyAnimation("remoteFrame", {
                        id: entity.id,
                        isNpc: Boolean(entity.isNpc),
                        frameIndex: bodySprite.currentFrame,
                        frameCounter: entity.frameCounter,
                        moving: entity.moving,
                        holdingAnimation: shouldAnimateBody && !entity.moving,
                        idleStartedAt: entity.animationIdleStartedAt,
                        bodyAnimationStartedAt: entity.bodyAnimationStartedAt,
                    });
                }

                if (bodyData && headSprite) {
                    const headPosition = getHeadSpritePosition(
                        bodySprite,
                        bodyData,
                        headSprite.texture,
                    );
                    headSprite.x = Math.round(headPosition.x);
                    headSprite.y = Math.round(headPosition.y);
                }

                if (nameLabel) {
                    const labelPosition = getNameLabelPosition(bodySprite);
                    const nextNameLabelText = getCharacterNameLabel(entity);
                    const nextNameLabelVisible = !shouldHideRemoteCharacterName(
                        entity,
                        this.partyMemberIds,
                        this.user?.clan,
                        this.user?.privileges === 1,
                    );

                    nameLabel.x = Math.round(labelPosition.x);
                    nameLabel.y = Math.round(labelPosition.y);
                    setTextIfChanged(nameLabel, nextNameLabelText);
                    setVisibilityIfChanged(nameLabel, nextNameLabelVisible);
                }


                if (clanLabel) {
                    const labelPosition = getNameLabelPosition(bodySprite);
                    const nextClanLabelText =
                        getCharacterClanLabel(entity) ?? "";
                    const nextClanLabelStyle = createCharacterClanTextStyle(
                        shouldHighlightClanTag(
                            entity,
                            this.user?.clan,
                            this.user,
                        )
                            ? CLAN_TAG_HIGHLIGHT_COLOR
                            : entity.color || 0xffffff,
                    );
                    const nextClanLabelVisible =
                        Boolean(nextClanLabelText) &&
                        !shouldHideRemoteCharacterName(
                            entity,
                            this.partyMemberIds,
                            this.user?.clan,
                            this.user?.privileges === 1,
                        );

                    clanLabel.x = Math.round(labelPosition.x);
                    clanLabel.y = Math.round(labelPosition.y + 13);
                    setTextIfChanged(clanLabel, nextClanLabelText);
                    setStyleIfChanged(clanLabel, nextClanLabelStyle);
                    setVisibilityIfChanged(clanLabel, nextClanLabelVisible);
                }

                if (debugPositionLabel) {
                    const labelPosition =
                        getDebugPositionLabelPosition(bodySprite);
                    debugPositionLabel.x = Math.round(labelPosition.x);
                    debugPositionLabel.y = Math.round(labelPosition.y);
                    setVisibilityIfChanged(
                        debugPositionLabel,
                        this.isDebugMode,
                    );
                    if (this.isDebugMode) {
                        setTextIfChanged(
                            debugPositionLabel,
                            formatCharacterAnimationDebugLabel(entity),
                        );
                    }
                }

                if (crowdControlBarBg && crowdControlBarFill) {
                    const progress = getCharacterCrowdControlProgress(
                        entity,
                        Date.now(),
                    );
                    const crowdControlPosition =
                        getCharacterCrowdControlBarLayout(bodySprite, {
                            isNpc: Boolean(entity.isNpc),
                            showNameplate: !entity.isNpc ? true : undefined,
                            showClanLabel: !entity.isNpc
                                ? Boolean(clanLabel?.text)
                                : undefined,
                        });
                    const shouldShowCrowdControlBar =
                        !entity.dead &&
                        progress > 0 &&
                        Boolean(entity.inmovilizado || entity.paralizado);

                    crowdControlBarBg.position.set(
                        crowdControlPosition.x,
                        crowdControlPosition.y,
                    );
                    crowdControlBarFill.position.set(
                        crowdControlPosition.x,
                        crowdControlPosition.y,
                    );
                    crowdControlBarBg.visible = shouldShowCrowdControlBar;
                    crowdControlBarFill.visible = shouldShowCrowdControlBar;

                    if (shouldShowCrowdControlBar) {
                        redrawCrowdControlBarFill(
                            crowdControlBarFill,
                            progress,
                        );
                    }
                }
            }
        }
    }

    // Main loop (like engine.js loop)
    loop = (ticker: Ticker): void => {
        if (this.isDestroyed || !this.app || !this.user) return;

        this.delta = Math.min(ticker.elapsedMS, 100);

        this.check();
        this.render();

        this.updateCamera();
        this.updateCulling();
        this.updateAnimatedMapSprites();
        this.updateCharacterAnimations();
        this.updateProjectileVisuals();
        this.updatePlayerSprite();
        this.updateRoofVisibility();
        this.updateTreeTransparency();
    };

    updateCulling(): void {
        if (!this.app || !this.mapContainer) return;

        if (
            !this.cullingDirty &&
            this.lastCullCameraX === this.mapContainer.x &&
            this.lastCullCameraY === this.mapContainer.y &&
            this.lastCullScreenWidth === this.app.screen.width &&
            this.lastCullScreenHeight === this.app.screen.height
        ) {
            return;
        }

        this.lastCullCameraX = this.mapContainer.x;
        this.lastCullCameraY = this.mapContainer.y;
        this.lastCullScreenWidth = this.app.screen.width;
        this.lastCullScreenHeight = this.app.screen.height;
        this.cullingDirty = false;

        const viewLeft = -this.mapContainer.x - VIEW_CULLING_PADDING;
        const viewTop = -this.mapContainer.y - VIEW_CULLING_PADDING;
        const viewRight =
            viewLeft + this.app.screen.width + VIEW_CULLING_PADDING * 2;
        const viewBottom =
            viewTop + this.app.screen.height + VIEW_CULLING_PADDING * 2;

        const minBucketX = Math.floor(viewLeft / CULL_BUCKET_SIZE);
        const maxBucketX = Math.floor((viewRight - 1) / CULL_BUCKET_SIZE);
        const minBucketY = Math.floor(viewTop / CULL_BUCKET_SIZE);
        const maxBucketY = Math.floor((viewBottom - 1) / CULL_BUCKET_SIZE);
        const nextActiveCullEntries = new Set<CullEntry>();
        const applyCullVisibility = (entry: CullEntry, isVisible: boolean) => {
            const { displayObject, kind } = entry;

            if (kind === "roof") {
                (displayObject as any).__inViewport = isVisible;
                displayObject.visible = isVisible && displayObject.alpha > 0.05;
            } else if ((displayObject as any).isDebugPosition) {
                displayObject.visible = isVisible && this.isDebugMode;
            } else {
                displayObject.visible = isVisible;
            }
        };

        for (let bucketY = minBucketY; bucketY <= maxBucketY; bucketY++) {
            for (let bucketX = minBucketX; bucketX <= maxBucketX; bucketX++) {
                const bucketEntries = this.cullBuckets.get(
                    `${bucketX},${bucketY}`,
                );

                if (!bucketEntries) {
                    continue;
                }

                for (const entry of bucketEntries) {
                    if (nextActiveCullEntries.has(entry)) {
                        continue;
                    }

                    const { bounds } = entry;
                    const isVisible =
                        bounds.x < viewRight &&
                        bounds.x + bounds.width > viewLeft &&
                        bounds.y < viewBottom &&
                        bounds.y + bounds.height > viewTop;

                    if (!isVisible) {
                        continue;
                    }

                    nextActiveCullEntries.add(entry);
                    applyCullVisibility(entry, true);
                }
            }
        }

        for (const entry of this.activeCullEntries) {
            if (nextActiveCullEntries.has(entry)) {
                continue;
            }

            applyCullVisibility(entry, false);
        }

        this.activeCullEntries = nextActiveCullEntries;
    }

    updateProjectileVisuals(): void {
        const overlay = this.entityFXOverlayContainer;
        if (!overlay || this.projectileVisuals.size === 0) {
            return;
        }

        const now = performance.now();
        for (const [projectileId, projectile] of this.projectileVisuals) {
            const progress = Math.min(
                1,
                (now - projectile.startedAt) /
                    Math.max(1, projectile.durationMs),
            );
            const x =
                projectile.startWorldX +
                (projectile.endWorldX - projectile.startWorldX) * progress;
            const y =
                projectile.startWorldY +
                (projectile.endWorldY - projectile.startWorldY) * progress;

            projectile.sprite.x = Math.round(x);
            projectile.sprite.y = Math.round(y);
            syncDisplayObjectToEntityFXRow(
                this,
                projectile.sprite.y,
                projectile.sprite,
            );
            projectile.updateVisual?.(progress, x, y);

            if (progress >= 1) {
                projectile.cleanupVisual?.();

                if (projectile.sprite instanceof AnimatedSprite) {
                    this.animatedSpriteFrameCounters.delete(projectile.sprite);
                }

                if (projectile.sprite.parent) {
                    projectile.sprite.parent.removeChild(projectile.sprite);
                }

                destroyDisplayObjectSafely(projectile.sprite);
                this.projectileVisuals.delete(projectileId);
            }
        }
    }

    // Update camera position (like engine.js renderBackground with offsets)
    updateCamera(): void {
        if (!this.user || !this.mapContainer || !this.app) return;

        // Calculate camera position based on user position and camera offsets
        // engine.js renders from (pos.x - addtoUserPos.x, pos.y - addtoUserPos.y)
        // and applies offsetCounterX/Y as pixel offsets (line 596-597: (ScreenX - 1) * 32 + pixelOffsetX)
        const tileX = this.user.pos.x - this.user.addtoUserPos.x;
        const tileY = this.user.pos.y - this.user.addtoUserPos.y;

        // In engine.js, tiles are rendered at position (x-1)*32, (y-1)*32 in world space
        // So tile at position (50, 50) renders at pixel (49*32, 49*32) = (1568, 1568)
        // Our tiles are already rendered at (x-1)*32 from renderMap (line 1288-1289)

        // The player tile position in world pixels (matching engine.js rendering)
        // Since tiles render at (x-1)*32, the player at tile (50,50) is at pixel (1568, 1568)
        const playerWorldX = (tileX - 1) * TILE_SIZE;
        const playerWorldY = (tileY - 1) * TILE_SIZE;

        // Apply camera offsets (like engine.js line 596: tempPixelOffsetX = (ScreenX - 1) * 32 + pixelOffsetX)
        // The offsetCounter provides smooth scrolling between tiles
        const cameraOffsetX = this.offsetCounterX;
        const cameraOffsetY = this.offsetCounterY;

        // Center camera on player with offsets applied
        // We want the player tile to be at screen center, so camera moves opposite to player world position
        const targetCameraX =
            this.app.screen.width / 2 -
            TILE_SIZE / 2 -
            playerWorldX +
            cameraOffsetX;
        const targetCameraY =
            this.app.screen.height / 2 -
            TILE_SIZE / 2 -
            playerWorldY +
            cameraOffsetY;

        // Direct camera positioning (no smoothing - engine.js updates immediately)
        this.mapContainer.x = targetCameraX;
        this.mapContainer.y = targetCameraY;

        // Round camera position to whole pixels to prevent flickering
        this.mapContainer.x = Math.round(this.mapContainer.x);
        this.mapContainer.y = Math.round(this.mapContainer.y);

        // Update debug grid position to match map
        if (this.debugGrid) {
            this.debugGrid.x = this.mapContainer.x;
            this.debugGrid.y = this.mapContainer.y;
        }

        // Update roof container to follow camera (roofs are in screen space)
        if (this.roofContainer) {
            this.roofContainer.x = this.mapContainer.x;
            this.roofContainer.y = this.mapContainer.y;
        }

        if (this.dialogOverlayContainer) {
            this.dialogOverlayContainer.x = this.mapContainer.x;
            this.dialogOverlayContainer.y = this.mapContainer.y;
        }

        if (this.entityFXOverlayContainer) {
            this.entityFXOverlayContainer.x = this.mapContainer.x;
            this.entityFXOverlayContainer.y = this.mapContainer.y;
        }
    }

    // Update roof visibility based on player position.
    // Large roofs use trigger 1 on interior tiles instead of layer 4 on every tile.
    updateRoofVisibility(): void {
        if (!this.user || !this.roofContainer || !this.mapData) return;

        const playerX = this.user.pos.x;
        const playerY = this.user.pos.y;
        const playerTile = getTileAt(
            this.mapData,
            this.mapNumber,
            playerX,
            playerY,
        );
        const shouldHideRoofs =
            playerTile?.trigger === 1 || Boolean(playerTile?.graphics?.["4"]);

        if (
            !this.roofVisibilityDirty &&
            this.lastRoofVisibilityPlayerX === playerX &&
            this.lastRoofVisibilityPlayerY === playerY &&
            this.lastRoofVisibilityHidden === shouldHideRoofs
        ) {
            return;
        }

        this.lastRoofVisibilityPlayerX = playerX;
        this.lastRoofVisibilityPlayerY = playerY;
        this.lastRoofVisibilityHidden = shouldHideRoofs;
        this.roofVisibilityDirty = false;

        // Check all roof tiles and update visibility
        for (const tileKey of this.roofTiles) {
            const sprites = this.roofSprites.get(tileKey);

            if (!sprites || sprites.length === 0) continue;
            if (
                !sprites.some(
                    (sprite) => (sprite as any).__inViewport !== false,
                )
            ) {
                continue;
            }

            const targetAlpha = shouldHideRoofs ? 0 : 1;

            // Apply to all sprites for this roof tile
            for (const sprite of sprites) {
                if (!sprite.parent) continue;

                sprite.alpha = targetAlpha;

                // Update visibility (hide completely when alpha is very low)
                const inViewport = (sprite as any).__inViewport !== false;
                sprite.visible = inViewport && sprite.alpha > 0.05;
            }
        }
    }

    updateTreeTransparency(): void {
        if (!this.user || this.treeSprites.size === 0) {
            return;
        }

        const playerPosition = getInterpolatedCharacterPosition(
            this.user,
            Math.abs(this.offsetCounterX),
            Math.abs(this.offsetCounterY),
        );

        if (
            !this.treeTransparencyDirty &&
            this.lastTreeTransparencyX === playerPosition.x &&
            this.lastTreeTransparencyY === playerPosition.y
        ) {
            return;
        }

        this.lastTreeTransparencyX = playerPosition.x;
        this.lastTreeTransparencyY = playerPosition.y;
        this.treeTransparencyDirty = false;

        const nextFadedTrees = new Set<TreeSpriteEntry>();
        const minCandidateRow = Math.floor(playerPosition.y) - 11;
        const maxCandidateRow = Math.ceil(playerPosition.y) + 11;

        for (
            let candidateRow = minCandidateRow;
            candidateRow <= maxCandidateRow;
            candidateRow++
        ) {
            const treeEntries = this.treeSpritesByRow.get(candidateRow);

            if (!treeEntries || treeEntries.length === 0) {
                continue;
            }

            for (const treeEntry of treeEntries) {
                if (!treeEntry.sprite.parent) {
                    continue;
                }

                const shouldFade =
                    treeEntry.source === "object"
                        ? shouldFadeObjectTree(
                              playerPosition,
                              treeEntry.x,
                              treeEntry.y,
                          )
                        : shouldFadeLayer3Tree(
                              playerPosition,
                              treeEntry.x,
                              treeEntry.y,
                          );

                if (!shouldFade) {
                    continue;
                }

                nextFadedTrees.add(treeEntry);

                if (!treeEntry.isFaded) {
                    treeEntry.sprite.alpha = TREE_FADE_ALPHA;
                    treeEntry.isFaded = true;
                }
            }
        }

        for (const treeEntry of this.fadedTreeSprites) {
            if (nextFadedTrees.has(treeEntry)) {
                continue;
            }

            if (treeEntry.sprite.parent && treeEntry.isFaded) {
                treeEntry.sprite.alpha = 1;
            }

            treeEntry.isFaded = false;
        }

        this.fadedTreeSprites = nextFadedTrees;
    }

    // Update character animations (like engine.js drawChar frame counter logic)
    updateCharacterAnimations(): void {
        if (!this.user || !this.graphicsDB || !this.bodiesDB) return;

        const bodyData = this.bodiesDB[this.user.idBody.toString()];
        if (!bodyData) return;

        const direction = this.user.heading.toString();
        const grhRopa = bodyData[direction as keyof typeof bodyData] as number;
        const grhRopaData = this.graphicsDB[grhRopa.toString()];
        const weaponData = this.user.idWeapon
            ? this.weaponsDB?.[this.user.idWeapon.toString()]
            : undefined;
        const shieldData = this.user.idShield
            ? this.shieldsDB?.[this.user.idShield.toString()]
            : undefined;
        const grhWeapon = weaponData?.[direction as keyof typeof weaponData];
        const grhShield = shieldData?.[direction as keyof typeof shieldData];
        const grhWeaponData = grhWeapon
            ? this.graphicsDB[grhWeapon.toString()]
            : undefined;
        const grhShieldData = grhShield
            ? this.graphicsDB[grhShield.toString()]
            : undefined;

        // Only update if we have valid data and delta time
        if (grhRopaData && this.delta > 0) {
            const now = this.timestamp();
            const shouldAnimateBody = this.shouldHoldMovementAnimation(
                this.user,
                now,
            );

            if (shouldAnimateBody) {
                this.user.frameCounter = this.getBodyAnimationFrameCounter(
                    this.user,
                    grhRopaData,
                    now,
                );

                if (grhWeaponData) {
                    this.user.frameCounterWeapon =
                        this.getEquipmentAnimationFrameCounter(
                            this.user,
                            grhWeaponData,
                            now,
                            "weapon",
                        );
                }

                if (grhShieldData) {
                    this.user.frameCounterShield =
                        this.getEquipmentAnimationFrameCounter(
                            this.user,
                            grhShieldData,
                            now,
                            "shield",
                        );
                }
            } else {
                // Reset frame counter when not moving (like engine.js)
                this.user.frameCounter = 1;
                this.user.frameCounterWeapon = 1;
                this.user.frameCounterShield = 1;
                this.user.bodyAnimationStartedAt = undefined;
                this.user.weaponAnimationStartedAt = undefined;
                this.user.shieldAnimationStartedAt = undefined;
                this.user.animationIdleStartedAt = undefined;
            }
        }
    }

    // Update animated map sprites (like engine.js renderScreen frame counter logic)
    updateAnimatedMapSprites(): void {
        if (!this.mapContainer || this.delta <= 0) return;

        // Iterate through all animated sprites and update their frame counters
        for (const [
            sprite,
            data,
        ] of this.animatedSpriteFrameCounters.entries()) {
            // Check if sprite is still in the container (hasn't been destroyed)
            if (!sprite.parent || !sprite.visible) continue;

            const { graphicData, loop = true } = data;
            const baseSpeed = graphicData.speed || 500; // Default 500ms per frame
            const speed = this.isWaterGraphic(Number(data.graphicId))
                ? baseSpeed * WATER_ANIMATION_SPEED_MULTIPLIER
                : baseSpeed;

            // Get or initialize frame counter for this sprite (like engine.js stores in graphicData.frameCounter)
            // frameCounter starts at a small positive value (0.1) so Math.ceil gives 1 (first frame)
            let frameCounter = (sprite as any).frameCounter;
            if (frameCounter === undefined || frameCounter === null) {
                frameCounter = 0.1; // Start at small value so Math.ceil(0.1) = 1
            }

            // Update frame counter based on delta and speed (like engine.js)
            // delta is in milliseconds, speed is milliseconds per frame
            frameCounter += this.delta / speed;

            // Wrap frame counter if it exceeds numFrames (like engine.js)
            if (Math.ceil(frameCounter) > graphicData.numFrames) {
                if (loop) {
                    // Reset to small positive value so Math.ceil gives 1 (first frame)
                    frameCounter = 0.1;
                    frameCounter += this.delta / speed;
                } else {
                    if ((sprite as any).isEntityFX) {
                        const entityId = Number((sprite as any).entityId ?? 0);
                        if (sprite.parent) {
                            sprite.parent.removeChild(sprite);
                        }

                        this.animatedSpriteFrameCounters.delete(sprite);

                        if (entityId > 0) {
                            this.entityEffects.delete(entityId);
                            this.entityEffectGraphicIds.delete(entityId);
                            this.entityEffectStartedAt.delete(entityId);
                            this.entityEffectExpiresAt.delete(entityId);

                            const timeoutId =
                                this.entityEffectTimeouts.get(entityId);
                            if (typeof timeoutId === "number") {
                                window.clearTimeout(timeoutId);
                                this.entityEffectTimeouts.delete(entityId);
                            }
                        }

                        destroyDisplayObjectSafely(sprite);
                        continue;
                    }

                    frameCounter = graphicData.numFrames;
                }
            }

            // Store updated frame counter
            (sprite as any).frameCounter = frameCounter;

            // Update sprite frame based on frameCounter (like engine.js uses Math.ceil(frameCounter))
            // engine.js uses: frames[Math.ceil(frameCounter)] where frames are 1-based (1, 2, 3...)
            // So Math.ceil(frameCounter) gives 1-based frame number, convert to 0-based index
            const frameNumber = Math.ceil(frameCounter); // 1-based frame number
            const frameIndex = Math.max(
                0,
                Math.min(frameNumber - 1, sprite.textures.length - 1),
            );

            // Only update if frame changed to avoid unnecessary redraws
            if (sprite.currentFrame !== frameIndex) {
                sprite.currentFrame = frameIndex;
            }
        }
    }

    // Update player sprite position and animation (like engine.js charRender)
    updatePlayerSprite(): void {
        if (!this.user || !this.playerContainer || !this.app) {
            return;
        }

        const displayContainer = this
            .playerContainer as CharacterDisplayRefsContainer;
        const bodySprite = displayContainer.bodySprite as
            | AnimatedSprite
            | undefined;
        const lastDirection = (this.playerContainer as any).lastDirection as
            | string
            | undefined;

        // Body sprite can be temporarily unavailable while the player is still
        // rendering or being re-rendered for a direction/equipment change.
        // Avoid warning in that transient empty-container state.
        let actualBodySprite = bodySprite;
        if (!actualBodySprite) {
            if (this.playerContainer.children.length === 0) {
                return;
            }

            // Try to find sprite from container children
            actualBodySprite = getStoredCharacterDisplayChild<AnimatedSprite>(
                displayContainer,
                "bodySprite",
                "isPlayerBody",
            );

            if (actualBodySprite) {
                // Update stored reference
                displayContainer.bodySprite = actualBodySprite;
            }
        }

        // Check if direction changed - need to re-render player
        if (
            lastDirection !== undefined &&
            lastDirection !== this.user.heading.toString()
        ) {
            // Direction changed, re-render player
            const renderPlayerFn = (this as any).renderPlayerFn as
                | ((engine: Engine) => Promise<void>)
                | undefined;
            if (renderPlayerFn) {
                // Re-render player with new direction (async, but we don't await in ticker)
                renderPlayerFn(this).catch((err) => {
                    console.error("Error re-rendering player:", err);
                });
            }
        }

        // Position player container at screen center while it lives in map space
        const centerX = this.app.screen.width / 2 - TILE_SIZE / 2;
        const centerY = this.app.screen.height / 2 - TILE_SIZE / 2;
        if (this.mapContainer) {
            this.playerContainer.x = centerX - this.mapContainer.x;
            this.playerContainer.y = centerY - this.mapContainer.y;
        } else {
            this.playerContainer.x = centerX;
            this.playerContainer.y = centerY;
        }

        const zRow = getInterpolatedCharacterRow(
            this.user,
            Math.abs(this.offsetCounterY),
        );
        syncCharacterContainerToRenderRow(
            this,
            this.user,
            this.playerContainer,
        );
        this.playerContainer.zIndex = getRowZIndex(
            zRow,
            Z_INDEX_LAYERS.CHARACTER,
        );
        this.playerContainer.alpha = getCharacterRenderAlpha(
            this.user,
            this.runtimeTiming,
            { isLocalCharacter: true, localClanTag: this.user?.clan },
        );

        // Use actualBodySprite if we found it, otherwise use stored reference
        const spriteToUpdate = actualBodySprite || bodySprite;

        // DEBUG: Always log sprite status (throttled)
        // const debugStatusTime =
        //     (this.playerContainer as any).debugStatusTime || 0;
        // if (Date.now() - debugStatusTime > 1000) {
        //     console.log("DEBUG: updatePlayerSprite status", {
        //         hasSprite: !!spriteToUpdate,
        //         hasParent: spriteToUpdate ? !!spriteToUpdate.parent : false,
        //         texturesCount: spriteToUpdate?.textures?.length || 0,
        //         currentFrame: spriteToUpdate?.currentFrame,
        //         moving: this.user.moving,
        //         containerChildren: this.playerContainer.children.length,
        //     });
        //     (this.playerContainer as any).debugStatusTime = Date.now();
        // }

        if (spriteToUpdate && spriteToUpdate.parent) {
            // DEBUG: Log every frame when moving (throttled)
            // if (this.user.moving) {
            //     const debugLogTime =
            //         (this.playerContainer as any).debugLogTime || 0;
            //     if (debugLogTime === 0 || Date.now() - debugLogTime > 500) {
            //         console.log("DEBUG: Player moving", {
            //             moving: this.user.moving,
            //             texturesCount: spriteToUpdate.textures?.length || 0,
            //             currentFrame: spriteToUpdate.currentFrame,
            //             hasParent: !!spriteToUpdate.parent,
            //             visible: spriteToUpdate.visible,
            //             alpha: spriteToUpdate.alpha,
            //         });
            //         (this.playerContainer as any).debugLogTime = Date.now();
            //     }
            // }

            // Animate only while moving using frameCounter; show first frame when idle
            if (
                spriteToUpdate &&
                spriteToUpdate.textures &&
                spriteToUpdate.textures.length > 0
            ) {
                const now = this.timestamp();
                const shouldAnimateBody = this.shouldHoldMovementAnimation(
                    this.user,
                    now,
                );

                if (shouldAnimateBody) {
                    const totalFrames = spriteToUpdate.textures.length;
                    const frameIndex = Math.max(
                        0,
                        Math.min(
                            Math.ceil(this.user.frameCounter) - 1,
                            totalFrames - 1,
                        ),
                    );
                    if (spriteToUpdate.currentFrame !== frameIndex) {
                        spriteToUpdate.currentFrame = frameIndex;
                        const tex = spriteToUpdate.textures[frameIndex];
                        if (tex instanceof Texture) {
                            spriteToUpdate.texture = tex;
                        }
                        debugBodyAnimation("playerFrame", {
                            id: this.user.id,
                            frameIndex,
                            frameCounter: this.user.frameCounter,
                            bodyAnimationCycleMs: BODY_ANIMATION_CYCLE_MS,
                            moving: this.user.moving,
                            holdingAnimation: !this.user.moving,
                            idleStartedAt: this.user.animationIdleStartedAt,
                        });
                    }
                } else {
                    if (spriteToUpdate.currentFrame !== 0) {
                        spriteToUpdate.currentFrame = 0;
                        const first = spriteToUpdate.textures[0];
                        if (first instanceof Texture) {
                            spriteToUpdate.texture = first;
                        }
                    }
                }
            }

            // Original frame counter logic (commented out for debugging)
            /*
            // Update animation frame based on frameCounter (like engine.js)
            // frameCounter is 1-based (like engine.js), convert to 0-based index
            if (
                this.user.moving &&
                this.user.frameCounter >= 1 &&
                bodySprite.textures.length > 0
            ) {
                // Convert from 1-based to 0-based frame index
                // Math.ceil(frameCounter) gives us the current frame number (1-based)
                // Subtract 1 to get 0-based index for PixiJS
                const frameIndex = Math.max(
                    0,
                    Math.min(
                        Math.ceil(this.user.frameCounter) - 1,
                        bodySprite.textures.length - 1
                    )
                );

                // Only update if frame changed to avoid unnecessary redraws
                if (bodySprite.currentFrame !== frameIndex) {
                    bodySprite.currentFrame = frameIndex;
                }
            } else {
                // Show first frame when not moving (frameCounter should be 1, which is frame 0)
                if (bodySprite.currentFrame !== 0) {
                    bodySprite.currentFrame = 0;
                }
            }
            */

            // Update head position relative to body (head sprite position is relative to container)
            const headSprite = getStoredCharacterDisplayChild<Sprite>(
                displayContainer,
                "headSprite",
                "isPlayerHead",
            );
            const helmetSprite = getStoredCharacterDisplayChild<Sprite>(
                displayContainer,
                "helmetSprite",
                "isPlayerHelmet",
            );
            const weaponSprite = getStoredCharacterDisplayChild<AnimatedSprite>(
                displayContainer,
                "weaponSprite",
                "isPlayerWeapon",
            );
            const shieldSprite = getStoredCharacterDisplayChild<AnimatedSprite>(
                displayContainer,
                "shieldSprite",
                "isPlayerShield",
            );
            const shouldAnimateEquipment = this.shouldHoldMovementAnimation(
                this.user,
                this.timestamp(),
            );

            updateAnimatedCharacterLayer(
                weaponSprite,
                shouldAnimateEquipment ? this.user.frameCounterWeapon : 1,
            );
            updateAnimatedCharacterLayer(
                shieldSprite,
                shouldAnimateEquipment ? this.user.frameCounterShield : 1,
            );

            if (headSprite && this.bodiesDB && spriteToUpdate) {
                const bodyData = this.bodiesDB[this.user.idBody.toString()];
                const bodyMetrics = (spriteToUpdate as any).renderMetrics as
                    | BodyRenderMetrics
                    | undefined;
                if (bodyData) {
                    const headPosition = getHeadSpritePosition(
                        bodyMetrics || {
                            x: 0,
                            y: 0,
                            width: 0,
                            height: 0,
                        },
                        bodyData,
                        headSprite.texture,
                    );
                    headSprite.x = Math.round(headPosition.x);
                    headSprite.y = Math.round(headPosition.y);
                }
            }

            if (
                helmetSprite &&
                this.bodiesDB &&
                this.helmetsDB &&
                spriteToUpdate
            ) {
                const bodyData = this.bodiesDB[this.user.idBody.toString()];
                const helmetData =
                    this.helmetsDB[this.user.idHelmet?.toString() || ""];
                if (bodyData && helmetData) {
                    const bodyMetrics = (spriteToUpdate as any)
                        .renderMetrics as BodyRenderMetrics | undefined;
                    const helmetPosition = getHelmetSpritePosition(
                        bodyMetrics || {
                            x: 0,
                            y: 0,
                            width: 0,
                            height: 0,
                        },
                        bodyData,
                        helmetSprite.texture,
                        helmetData,
                    );
                    helmetSprite.x = Math.round(helmetPosition.x);
                    helmetSprite.y = Math.round(helmetPosition.y);
                }
            }

            const bodyMetrics = (spriteToUpdate as any).renderMetrics as
                | BodyRenderMetrics
                | undefined;
            const nameLabel = getStoredCharacterDisplayChild<Text>(
                displayContainer,
                "nameLabel",
                "isPlayerName",
            );
            const clanLabel = getStoredCharacterDisplayChild<Text>(
                displayContainer,
                "clanLabel",
                "isPlayerClan",
            );
            const debugPositionLabel = getStoredCharacterDisplayChild<Text>(
                displayContainer,
                "debugPositionLabel",
                "isDebugPosition",
            );
            const crowdControlBarBg = getStoredCharacterDisplayChild<Graphics>(
                displayContainer,
                "crowdControlBarBg",
                "isCrowdControlBarBg",
            );
            const crowdControlBarFill =
                getStoredCharacterDisplayChild<Graphics>(
                    displayContainer,
                    "crowdControlBarFill",
                    "isCrowdControlBarFill",
                );

            if (nameLabel && bodyMetrics) {
                const labelPosition = getNameLabelPosition(bodyMetrics);
                const nextNameLabelText = getCharacterNameLabel(this.user);

                setTextIfChanged(nameLabel, nextNameLabelText);
                nameLabel.x = Math.round(labelPosition.x);
                nameLabel.y = Math.round(labelPosition.y);
            }


            if (clanLabel && bodyMetrics) {
                const labelPosition = getNameLabelPosition(bodyMetrics);
                const nextClanLabelText =
                    getCharacterClanLabel(this.user) ?? "";
                const nextClanLabelStyle = createCharacterClanTextStyle(
                    shouldHighlightClanTag(
                        this.user,
                        this.user?.clan,
                        this.user,
                    )
                        ? CLAN_TAG_HIGHLIGHT_COLOR
                        : this.user.color || 0xffffff,
                );

                setTextIfChanged(clanLabel, nextClanLabelText);
                setStyleIfChanged(clanLabel, nextClanLabelStyle);
                clanLabel.x = Math.round(labelPosition.x);
                clanLabel.y = Math.round(labelPosition.y + 13);
                setVisibilityIfChanged(clanLabel, Boolean(nextClanLabelText));
            }

            if (debugPositionLabel && bodyMetrics) {
                const labelPosition =
                    getDebugPositionLabelPosition(bodyMetrics);
                debugPositionLabel.x = Math.round(labelPosition.x);
                debugPositionLabel.y = Math.round(labelPosition.y);
                setVisibilityIfChanged(debugPositionLabel, this.isDebugMode);
                if (this.isDebugMode) {
                    setTextIfChanged(
                        debugPositionLabel,
                        formatCharacterAnimationDebugLabel(this.user),
                    );
                }
            }

            if (crowdControlBarBg && crowdControlBarFill && bodyMetrics) {
                const progress = getCharacterCrowdControlProgress(
                    this.user,
                    Date.now(),
                );
                const crowdControlPosition = getCharacterCrowdControlBarLayout(
                    bodyMetrics,
                    {
                        showNameplate: true,
                        showClanLabel: Boolean(clanLabel?.visible),
                    },
                );
                const shouldShowCrowdControlBar =
                    !this.user.dead &&
                    progress > 0 &&
                    Boolean(this.user.inmovilizado || this.user.paralizado);

                crowdControlBarBg.position.set(
                    crowdControlPosition.x,
                    crowdControlPosition.y,
                );
                crowdControlBarFill.position.set(
                    crowdControlPosition.x,
                    crowdControlPosition.y,
                );
                crowdControlBarBg.visible = shouldShowCrowdControlBar;
                crowdControlBarFill.visible = shouldShowCrowdControlBar;

                if (shouldShowCrowdControlBar) {
                    redrawCrowdControlBarFill(crowdControlBarFill, progress);
                }
            }
        }
    }

    // Cleanup
    destroy(): void {
        if (this.isDestroyed) {
            return;
        }

        this.isDestroyed = true;
        this.loadedAssetPaths.clear();

        for (const timeoutId of this.entityEffectTimeouts.values()) {
            window.clearTimeout(timeoutId);
        }
        if (this.tileObjectVisualFlushFrameId !== null) {
            window.cancelAnimationFrame(this.tileObjectVisualFlushFrameId);
            this.tileObjectVisualFlushFrameId = null;
        }
        this.isFlushingTileObjectVisuals = false;

        for (const projectile of this.projectileVisuals.values()) {
            projectile.cleanupVisual?.();

            if (projectile.sprite instanceof AnimatedSprite) {
                this.animatedSpriteFrameCounters.delete(projectile.sprite);
            }

            if (projectile.sprite.parent) {
                projectile.sprite.parent.removeChild(projectile.sprite);
            }

            destroyDisplayObjectSafely(projectile.sprite);
        }
        this.projectileVisuals.clear();

        const app = this.app;
        this.app = null;
        this.mapContainer = null;
        this.playerContainer = null;
        this.roofContainer = null;
        this.entityFXOverlayContainer = null;
        this.dialogOverlayContainer = null;
        this.debugGrid = null;

        if (app) {
            app.ticker.remove(this.loop);
            if (this.dialogBubbleTicker) {
                app.ticker.remove(this.dialogBubbleTicker);
                this.dialogBubbleTicker = undefined;
            }
            if (this.fpsTicker) {
                app.ticker.remove(this.fpsTicker);
                this.fpsTicker = undefined;
            }
            this.clearScheduledMovementCheck();
            app.stop();
            app.destroy({ removeView: true }, { children: true });
        }

        this.pendingTileObjectVisualSyncs.clear();
        this.animatedSpriteFrameCounters.clear();
        this.entityEffects.clear();
        this.entityEffectGraphicIds.clear();
        this.entityEffectStartedAt.clear();
        this.entityEffectTimeouts.clear();
        this.entityEffectExpiresAt.clear();
        this.sceneLayerSprites.clear();
        this.objectSprites.clear();
        this.treeSprites.clear();
        this.treeSpritesByRow.clear();
        this.treeGraphicIds.clear();
        this.fadedTreeSprites.clear();
        this.mapRowLayerContainers.clear();
        this.roofRowContainers.clear();
        this.entityFXRowContainers.clear();
        this.groundLayerContainer = null;
        this.belowLayerContainer = null;
        this.roofSprites.clear();
        this.roofTiles.clear();
        this.roofVisibilityDirty = true;
        this.lastRoofVisibilityPlayerX = null;
        this.lastRoofVisibilityPlayerY = null;
        this.lastRoofVisibilityHidden = null;
        this.treeTransparencyDirty = true;
        this.lastTreeTransparencyX = null;
        this.lastTreeTransparencyY = null;
        this.remoteEntityRenderRequestIds.clear();
        this.tileObjectRenderRequestIds.clear();
        this.activeCullEntries.clear();
        this.cullBuckets.clear();
        this.cullEntriesByDisplayObject.clear();
        this.cullingDirty = true;
        this.lastCullCameraX = null;
        this.lastCullCameraY = null;
        this.lastCullScreenWidth = null;
        this.lastCullScreenHeight = null;
    }
}
