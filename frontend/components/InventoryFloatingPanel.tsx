"use client";
import { LocalizedText, LocalizedLabel } from '@/components/LocalizedText';
/* eslint-disable @next/next/no-img-element */


import {localizeItemDetails} from '../lib/game-i18n';
import { useI18n } from "@/components/I18nProvider";

import Image from "next/image";
import React from "react";
import { createPortal } from "react-dom";
import { formatNumber } from "../lib/number-format";
import {
    ChevronDown,
    ChevronUp,
    Settings,
    Settings2,
    Volume2,
    Keyboard,
    X,
    Crown,
    DoorOpen,
    Users,
    UserRoundX,
    Shield,
    Trash2,
    MoreHorizontal,
} from "lucide-react";
import type {
    CharacterStatsSnapshot,
    InventoryItem,
    PlayerHudState,
    SpellEntry,
} from "../lib/aowProtocol";
import type { GraphicData, ObjectsDB, SpellData } from "../types/game";
import { OBJECT_TYPE } from "../lib/aowProtocol";
import {
    getTexturePath,
    loadGraphicsDB,
    loadObjectsDB,
    loadSpellsDB,
} from "../utils/gameLoader";
import {
    cloneHotkeySettings,
    expandHotkeyCode,
    formatHotkeyBinding,
    formatHotkeyCode,
    isHotkeyMatch,
    sanitizeHotkeyCodes,
    type HotkeyAction,
    type HotkeySettings,
} from "../lib/hotkeys";
import {
    detectHardwareAccelerationDiagnostics,
    type BrowserHardwareAccelerationHelp,
} from "../lib/hardware-acceleration";

type InventoryFloatingPanelProps = {
    hud: PlayerHudState | null;
    mapName?: string;
    connected?: boolean;
    characterStatsSnapshot?: CharacterStatsSnapshot | null;
    panelHeight?: number | string;
    portalTarget?: HTMLElement | null;
    selectedSpellSlot: number | null;
    hotkeySettings: HotkeySettings;
    useItemRepeatMs: number;
    soundVolume: number;
    onHotkeySettingsChange: (settings: HotkeySettings) => void;
    onSoundVolumeChange: (volume: number) => void;
    onSelectSpell: (slot: number | null) => void;
    onCastSpell: (spell: SpellEntry) => void;
    onMoveSpell?: (slot: number, direction: "up" | "down") => void;
    onMoveInventoryItem?: (sourceSlot: number, targetSlot: number) => void;
    onEquipRequest?: (slot: number) => void;
    onUseItemClickRequest?: (slot: number) => void;
    onUseItemURequest?: (slot: number) => void;
    onRangeAttackRequest?: () => void;
    onDropRequest?: (slot: number, amount: number) => void;
    onSendCommand?: (message: string) => void;
    selectedCharacterId?: string | null;
};

type HardwareAccelerationWarning = {
    details: string;
    help: BrowserHardwareAccelerationHelp;
};

type ClanAlignment = "citizen" | "criminal";

const MAX_LEVEL = 50;

type ClanSummary = {
    id: string;
    name: string;
    alignment: ClanAlignment;
    minJoinLevel: number;
    memberCount: number;
    leaderName: string;
};

type ClanMember = {
    characterId: string;
    name: string;
    classId: number;
    level: number;
    criminal: boolean;
    online: boolean | null;
    role: "leader" | "co_leader" | "member";
};

type ClanRequest = {
    id: string;
    characterId: string;
    name: string;
    classId: number;
    level: number;
    criminal: boolean;
    online: boolean;
    message: string;
    createdAt: string;
};

type ClanDetails = {
    id: string;
    name: string;
    alignment: ClanAlignment;
    minJoinLevel: number;
    leaderCharacterId: string;
    leaderName: string;
    memberCount: number;
    members: ClanMember[];
    requests: ClanRequest[];
};

type ClanOverview = {
    currentClan: ClanDetails | null;
    clans: ClanSummary[];
    pendingRequestClanId: string | null;
};

function detectHardwareAccelerationWarning(): HardwareAccelerationWarning | null {
    const diagnostics = detectHardwareAccelerationDiagnostics();

    if (!diagnostics.browserHelp || diagnostics.enabled !== false) {
        return null;
    }

    return {
        details:
            diagnostics.details ??
            "Parece que la aceleración por hardware no está disponible.",
        help: diagnostics.browserHelp,
    };
}

function inferFactionFromHud(
    hud: PlayerHudState | null,
    snapshot?: CharacterStatsSnapshot | null,
): "none" | "armada" | "caos" {
    if (snapshot?.factions.activeFaction) {
        return snapshot.factions.activeFaction;
    }

    const normalizedColor = String(hud?.color ?? "")
        .trim()
        .toLowerCase();

    if (normalizedColor === "#00afff") {
        return "armada";
    }

    if (normalizedColor === "#9b0000") {
        return "caos";
    }

    return "none";
}

const classLabels: Record<number, string> = {
    1: "Mago",
    2: "Clerigo",
    3: "Guerrero",
    4: "Asesino",
    6: "Bardo",
    7: "Druida",
    8: "Paladin",
    9: "Cazador",
};

const clanNamePattern = /^[A-Za-z ]+$/;
const CLAN_CREATION_LEVEL_REQUIRED = 30;
const CLAN_CREATION_COST = 1_500_000;

type HotkeySection = {
    title: string;
    items: Array<{
        action: HotkeyAction;
        label: string;
        description: string;
        slots: number;
    }>;
};

const HOTKEY_SECTIONS: HotkeySection[] = [
    {
        title: "Movimiento",
        items: [
            {
                action: "moveUp",
                label: "Mover arriba",
                description: "",
                slots: 1,
            },
            {
                action: "moveLeft",
                label: "Mover izquierda",
                description: "",
                slots: 1,
            },
            {
                action: "moveDown",
                label: "Mover abajo",
                description: "",
                slots: 1,
            },
            {
                action: "moveRight",
                label: "Mover derecha",
                description: "",
                slots: 1,
            },
        ],
    },
    {
        title: "Mundo y combate",
        items: [
            {
                action: "toggleWorldMap",
                label: "Abrir / cerrar mapa",
                description: "Alterna el mapa del mundo.",
                slots: 1,
            },
            {
                action: "toggleSeguro",
                label: "Activar / desactivar seguro",
                description: "Alterna el modo seguro del personaje.",
                slots: 1,
            },
            {
                action: "toggleClanSeguro",
                label: "Activar / desactivar seguro de clan",
                description: "Alterna el seguro contra companeros de clan.",
                slots: 1,
            },
            {
                action: "toggleHiddenSkill",
                label: "Ocultarse",
                description: "Intenta usar la habilidad de ocultarse.",
                slots: 1,
            },
            {
                action: "pickupItem",
                label: "Agarrar item",
                description: "Levanta el item del suelo.",
                slots: 1,
            },
            {
                action: "attackOrTarget",
                label: "Atacar / apuntar",
                description: "Ataca con melee o inicia apuntado a distancia.",
                slots: 1,
            },
            {
                action: "meditate",
                label: "Meditar",
                description: "Envía el comando /meditar.",
                slots: 1,
            },
        ],
    },
    {
        title: "Inventario y hechizos",
        items: [
            {
                action: "equipItem",
                label: "Equipar item",
                description: "",
                slots: 1,
            },
            {
                action: "useItem",
                label: "Usar item",
                description: "",
                slots: 1,
            },
            {
                action: "dropItem",
                label: "Tirar item",
                description: "",
                slots: 1,
            },
        ],
    },
];

const MIN_SLOTS = 21;
const HOVER_DELAY_MS = 450;
const DOUBLE_ACTIVATE_WINDOW_MS = 240;
const MINIMAP_PREVIEW_SIZE = 92;
const DYNAMIC_INSTANCE_MAP_START = 30_000;
const DYNAMIC_INSTANCE_MAP_STRIDE = 50;

function resolveBaseInstanceMapId(mapId: number | null | undefined): number | null {
    if (typeof mapId !== "number") {
        return null;
    }

    if (mapId < DYNAMIC_INSTANCE_MAP_START) {
        return mapId;
    }

    return Math.floor(
        (mapId - DYNAMIC_INSTANCE_MAP_START) / DYNAMIC_INSTANCE_MAP_STRIDE,
    );
}
const DEFAULT_MAP_GRID_SIZE = 100;
const MINIMAP_MARKER_MARGIN = 2;
const WORLD_MAP_MARKER_SIZE = 10;
const SPELL_LIST_ROW_HEIGHT = 24;
const SPELL_LIST_AUTOSCROLL_EDGE_PX = 22;
const SPELL_LIST_AUTOSCROLL_STEP = 12;
const WORLD_MAP_GRID_URL = "/init/world-map.json";
const WORLD_MAP_GENERAL_GRID_URL = "/init/world-map-grid-general.json";
const WORLD_MAP_SRC = "/imgs/world-map.png";
const WORLD_MAP_GENERAL_SRC = "/imgs/world-map-general.png";

type WorldMapLayoutEntry = {
    id: number;
    gridX: number;
    gridY: number;
};

type WorldMapGridData = {
    generatedAt?: string;
    totalCols: number;
    totalRows: number;
    maps: WorldMapLayoutEntry[];
};

type WorldMapConnectedPlayer = {
    name: string;
    map: number;
    pos: { x: number; y: number };
};

type WorldMapGrid = {
    maps: Map<number, { gridX: number; gridY: number }>;
    mapIdsByGrid: Map<string, number>;
    totalCols: number;
    totalRows: number;
};

const worldMapGridPromises = new Map<string, Promise<WorldMapGridData>>();

function loadWorldMapGrid(url: string) {
    if (!worldMapGridPromises.has(url)) {
        worldMapGridPromises.set(
            url,
            fetch(url, {
                cache: "force-cache",
            }).then(async (response) => {
                if (!response.ok) {
                    throw new Error(
                        `No se pudo cargar ${url}: ${response.status}`,
                    );
                }

                return (await response.json()) as WorldMapGridData;
            }),
        );
    }

    return worldMapGridPromises.get(url)!;
}

function buildWorldMapGrid(worldMapGridData: WorldMapGridData): WorldMapGrid {
    const maps = new Map<number, { gridX: number; gridY: number }>();
    const mapIdsByGrid = new Map<string, number>();

    for (const map of worldMapGridData.maps) {
        maps.set(map.id, { gridX: map.gridX, gridY: map.gridY });
        mapIdsByGrid.set(`${map.gridX}:${map.gridY}`, map.id);
    }

    return {
        maps,
        mapIdsByGrid,
        totalCols: worldMapGridData.totalCols,
        totalRows: worldMapGridData.totalRows,
    };
}

function getMinimapFrame(aspectRatio: number) {
    const safeAspectRatio =
        Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;

    if (safeAspectRatio >= 1) {
        const width = MINIMAP_PREVIEW_SIZE;
        const height = MINIMAP_PREVIEW_SIZE / safeAspectRatio;

        return {
            width,
            height,
            leftOffset: 0,
            topOffset: (MINIMAP_PREVIEW_SIZE - height) / 2,
        };
    }

    const width = MINIMAP_PREVIEW_SIZE * safeAspectRatio;
    const height = MINIMAP_PREVIEW_SIZE;

    return {
        width,
        height,
        leftOffset: (MINIMAP_PREVIEW_SIZE - width) / 2,
        topOffset: 0,
    };
}

function getMinimapMarkerStyle(
    pos: { x: number; y: number } | null | undefined,
    aspectRatio: number,
) {
    if (!pos) {
        return null;
    }

    const maxCoordinate = DEFAULT_MAP_GRID_SIZE;
    const normalizedX = Math.max(
        0,
        Math.min(1, (pos.x - 1) / Math.max(1, maxCoordinate - 1)),
    );
    const normalizedY = Math.max(
        0,
        Math.min(1, (pos.y - 1) / Math.max(1, maxCoordinate - 1)),
    );
    const frame = getMinimapFrame(aspectRatio);
    const usableWidth = Math.max(0, frame.width - MINIMAP_MARKER_MARGIN * 2);
    const usableHeight = Math.max(0, frame.height - MINIMAP_MARKER_MARGIN * 2);

    return {
        left: `${frame.leftOffset + MINIMAP_MARKER_MARGIN + normalizedX * usableWidth}px`,
        top: `${frame.topOffset + MINIMAP_MARKER_MARGIN + normalizedY * usableHeight}px`,
    };
}

function getWorldMapMarkerStyle(
    worldMapGrid: WorldMapGrid | null,
    mapId: number | null,
    pos: { x: number; y: number } | null | undefined,
) {
    if (!worldMapGrid || !mapId || !pos) {
        return null;
    }

    const mapLayout = worldMapGrid.maps.get(mapId);

    if (!mapLayout) {
        return null;
    }

    const normalizedX = Math.max(
        0,
        Math.min(1, (pos.x - 0.5) / DEFAULT_MAP_GRID_SIZE),
    );
    const normalizedY = Math.max(
        0,
        Math.min(1, (pos.y - 0.5) / DEFAULT_MAP_GRID_SIZE),
    );
    const left =
        ((mapLayout.gridX + normalizedX) / worldMapGrid.totalCols) * 100;
    const top =
        ((mapLayout.gridY + normalizedY) / worldMapGrid.totalRows) * 100;

    return {
        left: `${left}%`,
        top: `${top}%`,
    };
}

function ItemGraphic({
    graphicData,
    name,
}: {
    graphicData?: GraphicData;
    name: string;
}) {
    const {text: localizeText} = useI18n();
    if (!graphicData?.numFile) {
        return <div className="h-8 w-8 rounded-md bg-black/20" />;
    }

    const scale = Math.min(
        1,
        28 / Math.max(graphicData.width, graphicData.height, 1),
    );

    return (
        <div className="relative h-8 w-8 overflow-hidden rounded-sm">
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

function VitalBarsCanvas({
    hp,
    maxHp,
    mana,
    maxMana,
}: {
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
}) {
    const {t: localizeKey}=useI18n();
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        const cssWidth = 156;
        const cssHeight = 70;
        canvas.width = Math.floor(cssWidth * dpr);
        canvas.height = Math.floor(cssHeight * dpr);

        const context = canvas.getContext("2d");
        if (!context) {
            return;
        }

        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.clearRect(0, 0, cssWidth, cssHeight);

        const drawBar = ({
            y,
            label,
            value,
            max,
            startColor,
            endColor,
        }: {
            y: number;
            label: string;
            value: number;
            max: number;
            startColor: string;
            endColor: string;
        }) => {
            const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;

            context.font = "600 10px Inter, system-ui, sans-serif";
            context.textBaseline = "top";
            context.letterSpacing = "0.14em";
            context.fillStyle = "rgba(214, 211, 209, 0.8)";
            context.fillText(label.toUpperCase(), 0, y);

            context.letterSpacing = "0";
            context.font = "600 10px Inter, system-ui, sans-serif";
            context.fillStyle = "#f5f5f4";
            const valueLabel = `${value}/${max}`;
            const valueMetrics = context.measureText(valueLabel);
            context.fillText(valueLabel, cssWidth - valueMetrics.width, y);

            const barY = y + 14;
            const barHeight = 12;
            const barRadius = 6;
            const barWidth = cssWidth;

            context.fillStyle = "rgba(0, 0, 0, 0.35)";
            context.strokeStyle = "rgba(0, 0, 0, 0.35)";
            context.lineWidth = 1;
            context.beginPath();
            context.roundRect(
                0.5,
                barY + 0.5,
                barWidth - 1,
                barHeight - 1,
                barRadius,
            );
            context.fill();
            context.stroke();

            const innerX = 2;
            const innerY = barY + 2;
            const innerWidth = barWidth - 4;
            const innerHeight = barHeight - 4;
            context.fillStyle = "rgba(12, 10, 9, 0.85)";
            context.beginPath();
            context.roundRect(innerX, innerY, innerWidth, innerHeight, 4);
            context.fill();

            if (ratio <= 0) {
                return;
            }

            const fillWidth = Math.max(4, innerWidth * ratio);
            const gradient = context.createLinearGradient(
                0,
                innerY,
                fillWidth,
                innerY,
            );
            gradient.addColorStop(0, startColor);
            gradient.addColorStop(1, endColor);
            context.fillStyle = gradient;
            context.beginPath();
            context.roundRect(
                innerX,
                innerY,
                Math.min(innerWidth, fillWidth),
                innerHeight,
                4,
            );
            context.fill();
        };

        drawBar({
            y: 0,
            label: localizeKey("hud.health"),
            value: hp,
            max: maxHp,
            startColor: "#951212",
            endColor: "#f06b34",
        });
        drawBar({
            y: 35,
            label: "Mana",
            value: mana,
            max: maxMana,
            startColor: "#0e436f",
            endColor: "#2fb8ed",
        });
    }, [hp, mana, maxHp, maxMana, localizeKey]);

    return (
        <canvas
            ref={canvasRef}
            width={156}
            height={70}
            className="block h-[70px] w-[156px] max-w-full"
            aria-hidden="true"
        />
    );
}

function HudGlyph({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex h-4 w-4 items-center justify-center text-[#ccb08d]">
            {children}
        </span>
    );
}

function StatLine({
    icon,
    value,
    rightValue,
    accent = "text-stone-100",
}: {
    icon: React.ReactNode;
    value: string | number;
    rightValue?: string | number | null;
    accent?: string;
}) {
    return (
        <div className="flex items-center gap-1.5 text-sm font-semibold leading-none text-stone-100">
            {icon}
            <span className={accent}>{value}</span>
            {rightValue !== null && rightValue !== undefined ? (
                <span className="ml-1 inline-flex items-center self-center text-[11px] font-semibold leading-none text-amber-200/85">
                    {rightValue}
                </span>
            ) : null}
        </div>
    );
}

function formatBuffSecondsLabel(seconds: number) {
    return `(${seconds}s)`;
}

export default function InventoryFloatingPanel({
    hud,
    mapName,
    characterStatsSnapshot,
    panelHeight,
    portalTarget,
    selectedSpellSlot,
    hotkeySettings,
    useItemRepeatMs,
    soundVolume,
    onHotkeySettingsChange,
    onSoundVolumeChange,
    onSelectSpell,
    onCastSpell,
    onMoveSpell,
    onMoveInventoryItem,
    onEquipRequest,
    onUseItemClickRequest,
    onUseItemURequest,
    onRangeAttackRequest,
    onDropRequest,
    onSendCommand,
    selectedCharacterId,
}: InventoryFloatingPanelProps) {
    const { t: localizeKey, text: localizeText, locale } = useI18n();

    const items = React.useMemo(() => hud?.inventory ?? [], [hud?.inventory]);
    const spells = React.useMemo(() => hud?.spells ?? [], [hud?.spells]);
    const [buffExpiryAt, setBuffExpiryAt] = React.useState({
        fuerza: 0,
        agilidad: 0,
    });
    const [buffNow, setBuffNow] = React.useState(() => Date.now());
    const [graphicsDB, setGraphicsDB] = React.useState<Record<
        string,
        GraphicData
    > | null>(null);
    const [activeTab, setActiveTab] = React.useState<"inventory" | "spells">(
        "inventory",
    );
    const [rangedWeaponIds, setRangedWeaponIds] = React.useState<Set<number>>(
        new Set(),
    );
    const [objectsDB, setObjectsDB] = React.useState<ObjectsDB | null>(null);
    const [spellsDB, setSpellsDB] = React.useState<Record<
        string,
        SpellData
    > | null>(null);
    const [hoveredItem, setHoveredItem] = React.useState<InventoryItem | null>(
        null,
    );
    const [draggedInventoryItem, setDraggedInventoryItem] =
        React.useState<InventoryItem | null>(null);
    const [dragPointer, setDragPointer] = React.useState({ x: 0, y: 0 });
    const [isSpellInfoOpen, setIsSpellInfoOpen] = React.useState(false);
    const [isPartyModalOpen, setIsPartyModalOpen] = React.useState(false);
    const [isClanModalOpen, setIsClanModalOpen] = React.useState(false);
    const [clanOverview, setClanOverview] = React.useState<ClanOverview | null>(
        null,
    );
    const [clanView, setClanView] = React.useState<
        "list" | "detail" | "manage" | "create"
    >("list");
    const [clanLoading, setClanLoading] = React.useState(false);
    const [clanError, setClanError] = React.useState<string | null>(null);
    const [selectedClanId, setSelectedClanId] = React.useState<string | null>(
        null,
    );
    const [selectedClanDetails, setSelectedClanDetails] =
        React.useState<ClanDetails | null>(null);
    const [clanCreateName, setClanCreateName] = React.useState("");
    const [clanCreateMinLevel, setClanCreateMinLevel] = React.useState("1");
    const [clanRequestMessage, setClanRequestMessage] = React.useState("");
    const [clanRequestSubmitting, setClanRequestSubmitting] =
        React.useState(false);
    const [clanReviewActionId, setClanReviewActionId] = React.useState<
        string | null
    >(null);
    const [clanKickActionId, setClanKickActionId] = React.useState<
        string | null
    >(null);
    const [clanMemberActionMenu, setClanMemberActionMenu] = React.useState<{
        characterId: string;
        memberName: string;
        left: number;
        top: number;
    } | null>(null);
    const [clanRoleActionId, setClanRoleActionId] = React.useState<
        string | null
    >(null);
    const [clanLeadershipTransferActionId, setClanLeadershipTransferActionId] =
        React.useState<string | null>(null);
    const [clanLeaveSubmitting, setClanLeaveSubmitting] = React.useState(false);
    const [clanDeleteSubmitting, setClanDeleteSubmitting] =
        React.useState(false);
    const [isClanDeleteDialogOpen, setIsClanDeleteDialogOpen] =
        React.useState(false);
    const [clanDeleteConfirmationText, setClanDeleteConfirmationText] =
        React.useState("");
    const panelRef = React.useRef<HTMLDivElement | null>(null);

    const getPanelScale = React.useCallback(() => {
        const panelElement = panelRef.current;
        if (!panelElement || !panelElement.offsetWidth) {
            return 1;
        }

        const bounds = panelElement.getBoundingClientRect();
        const measuredScale = bounds.width / panelElement.offsetWidth;

        return Number.isFinite(measuredScale) && measuredScale > 0
            ? measuredScale
            : 1;
    }, []);

    React.useEffect(() => {
        const now = Date.now();

        setBuffExpiryAt({
            fuerza:
                (hud?.buffFuerzaSeconds ?? 0) > 0
                    ? now + (hud?.buffFuerzaSeconds ?? 0) * 1000
                    : 0,
            agilidad:
                (hud?.buffAgilidadSeconds ?? 0) > 0
                    ? now + (hud?.buffAgilidadSeconds ?? 0) * 1000
                    : 0,
        });
    }, [
        hud?.buffAgilidadSeconds,
        hud?.buffFuerzaSeconds,
        hud?.buffAgilidadUpdatedAt,
        hud?.buffFuerzaUpdatedAt,
    ]);

    React.useEffect(() => {
        const interval = window.setInterval(() => {
            setBuffNow(Date.now());
        }, 1000);

        return () => window.clearInterval(interval);
    }, []);

    const refreshClanOverview = React.useCallback(async () => {
        if (!selectedCharacterId) {
            setClanOverview(null);
            setClanError(null);
            return;
        }

        setClanLoading(true);
        setClanError(null);

        try {
            const response = await fetch("/api/clans", {
                cache: "no-store",
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    typeof result?.error === "string"
                        ? result.error
                        : "No se pudieron cargar los clanes.",
                );
            }

            const nextOverview = result as ClanOverview;
            setClanOverview(nextOverview);
            setSelectedClanId((current) => {
                if (
                    current &&
                    nextOverview.clans.some((clan) => clan.id === current)
                ) {
                    return current;
                }

                return nextOverview.clans[0]?.id ?? null;
            });
        } catch (error) {
            setClanOverview(null);
            setSelectedClanId(null);
            setSelectedClanDetails(null);
            setClanError(
                error instanceof Error
                    ? error.message
                    : "No se pudieron cargar los clanes.",
            );
        } finally {
            setClanLoading(false);
        }
    }, [selectedCharacterId]);

    React.useEffect(() => {
        if (!isClanModalOpen) {
            return;
        }

        void refreshClanOverview();
    }, [isClanModalOpen, refreshClanOverview]);

    const scheduleClanRefresh = React.useCallback(() => {
        window.setTimeout(() => {
            void refreshClanOverview();
        }, 700);
    }, [refreshClanOverview]);

    const buffCountdown = React.useMemo(
        () => ({
            fuerza:
                buffExpiryAt.fuerza > 0
                    ? Math.max(
                          0,
                          Math.ceil((buffExpiryAt.fuerza - buffNow) / 1000),
                      )
                    : 0,
            agilidad:
                buffExpiryAt.agilidad > 0
                    ? Math.max(
                          0,
                          Math.ceil((buffExpiryAt.agilidad - buffNow) / 1000),
                      )
                    : 0,
        }),
        [buffExpiryAt.agilidad, buffExpiryAt.fuerza, buffNow],
    );
    const [selectedSlot, setSelectedSlot] = React.useState<number | null>(null);
    const [dropAmount, setDropAmount] = React.useState("1");
    const [dropSlot, setDropSlot] = React.useState<number | null>(null);
    const [mapPreviewErrored, setMapPreviewErrored] = React.useState(false);
    const [mapPreviewAspectRatio, setMapPreviewAspectRatio] = React.useState(1);
    const [worldMapGridData, setWorldMapGridData] =
        React.useState<WorldMapGridData | null>(null);
    const [worldMapPlayers, setWorldMapPlayers] = React.useState<
        WorldMapConnectedPlayer[]
    >([]);
    const [worldMapPlayersSampledAt, setWorldMapPlayersSampledAt] =
        React.useState<string | null>(null);
    const [worldMapPlayersLoading, setWorldMapPlayersLoading] =
        React.useState(false);
    const [worldMapPlayersError, setWorldMapPlayersError] = React.useState<
        string | null
    >(null);
    const [isWorldMapOpen, setIsWorldMapOpen] = React.useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
    const [hardwareAccelerationWarning, setHardwareAccelerationWarning] =
        React.useState<HardwareAccelerationWarning | null>(null);
    const [isHotkeySettingsOpen, setIsHotkeySettingsOpen] =
        React.useState(false);
    const [hotkeyError, setHotkeyError] = React.useState<string | null>(null);
    const [listeningBinding, setListeningBinding] = React.useState<{
        action: HotkeyAction;
        slotIndex: number;
    } | null>(null);
    const [isSpellListDragging, setIsSpellListDragging] = React.useState(false);
    const hoverTimerRef = React.useRef<number | null>(null);
    const spellListRef = React.useRef<HTMLDivElement | null>(null);
    const spellListScrollTopRef = React.useRef(0);
    const heldUseItemTimerRef = React.useRef<number | null>(null);
    const heldUseItemKeyRef = React.useRef<string | null>(null);
    const lastClickedSlotRef = React.useRef<{
        slot: number;
        timestamp: number;
    } | null>(null);

    const selectedItem = React.useMemo(
        () => items.find((item) => item.slot === selectedSlot) ?? null,
        [items, selectedSlot],
    );

    const selectedSpell = React.useMemo(
        () => spells.find((spell) => spell.slot === selectedSpellSlot) ?? null,
        [selectedSpellSlot, spells],
    );
    const selectedSpellData = React.useMemo(() => {
        if (!selectedSpell || !spellsDB) {
            return null;
        }

        return spellsDB[selectedSpell.idSpell.toString()] ?? null;
    }, [selectedSpell, spellsDB]);

    const stopHeldUseItem = React.useCallback(() => {
        if (heldUseItemTimerRef.current !== null) {
            window.clearInterval(heldUseItemTimerRef.current);
            heldUseItemTimerRef.current = null;
        }

        heldUseItemKeyRef.current = null;
    }, []);

    const selectedItemRef = React.useRef<InventoryItem | null>(selectedItem);
    const hotkeySettingsRef = React.useRef(hotkeySettings);
    const rangedWeaponIdsRef = React.useRef(rangedWeaponIds);
    const onRangeAttackRequestRef = React.useRef(onRangeAttackRequest);
    const onUseItemURequestRef = React.useRef(onUseItemURequest);

    React.useEffect(() => {
        selectedItemRef.current = selectedItem;
    }, [selectedItem]);

    React.useEffect(() => {
        hotkeySettingsRef.current = hotkeySettings;
    }, [hotkeySettings]);

    React.useEffect(() => {
        rangedWeaponIdsRef.current = rangedWeaponIds;
    }, [rangedWeaponIds]);

    React.useEffect(() => {
        onRangeAttackRequestRef.current = onRangeAttackRequest;
    }, [onRangeAttackRequest]);

    React.useEffect(() => {
        onUseItemURequestRef.current = onUseItemURequest;
    }, [onUseItemURequest]);

    const requestHeldSelectedPotionUse = React.useCallback(() => {
        const item = selectedItemRef.current;

        if (!item || item.objType !== OBJECT_TYPE.pociones) {
            stopHeldUseItem();
            return;
        }

        onUseItemURequestRef.current?.(item.slot);
    }, [stopHeldUseItem]);

    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (
                isHotkeySettingsOpen ||
                !isHotkeyMatch(event, hotkeySettingsRef.current.useItem)
            ) {
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

            const item = selectedItemRef.current;
            if (!item) {
                return;
            }

            event.preventDefault();
            if (event.repeat) {
                return;
            }

            if (rangedWeaponIdsRef.current.has(item.idItem) && item.equipped) {
                onRangeAttackRequestRef.current?.();
                return;
            }

            onUseItemURequestRef.current?.(item.slot);

            if (item.objType !== OBJECT_TYPE.pociones) {
                return;
            }

            stopHeldUseItem();
            heldUseItemKeyRef.current = event.code;
            heldUseItemTimerRef.current = window.setInterval(() => {
                requestHeldSelectedPotionUse();
            }, useItemRepeatMs);
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (
                heldUseItemKeyRef.current !== null &&
                isHotkeyMatch(event, hotkeySettingsRef.current.useItem)
            ) {
                stopHeldUseItem();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        window.addEventListener("blur", stopHeldUseItem);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            window.removeEventListener("blur", stopHeldUseItem);
            stopHeldUseItem();
        };
    }, [
        isHotkeySettingsOpen,
        requestHeldSelectedPotionUse,
        stopHeldUseItem,
        useItemRepeatMs,
    ]);

    const sortedSpells = React.useMemo(
        () => spells.slice().sort((a, b) => a.slot - b.slot),
        [spells],
    );

    const selectedSpellIndex = React.useMemo(
        () =>
            selectedSpellSlot === null
                ? -1
                : sortedSpells.findIndex(
                      (spell) => spell.slot === selectedSpellSlot,
                  ),
        [selectedSpellSlot, sortedSpells],
    );
    const canMoveSelectedSpellUp = selectedSpellIndex > 0;
    const canMoveSelectedSpellDown =
        selectedSpellIndex >= 0 && selectedSpellIndex < sortedSpells.length - 1;
    const selectedSpellDamageLabel = React.useMemo(() => {
        if (
            !selectedSpellData ||
            selectedSpellData.subeHp !== 2 ||
            typeof selectedSpellData.minHp !== "number" ||
            typeof selectedSpellData.maxHp !== "number"
        ) {
            return null;
        }

        return `${selectedSpellData.minHp} - ${selectedSpellData.maxHp}`;
    }, [selectedSpellData]);
    const selectedSpellRequiredLevel = React.useMemo(() => {
        if (
            !selectedSpellData ||
            typeof selectedSpellData.minSkill !== "number" ||
            selectedSpellData.minSkill <= 0
        ) {
            return null;
        }

        return Math.ceil(selectedSpellData.minSkill / 3);
    }, [selectedSpellData]);

    const dropItem = React.useMemo(
        () => items.find((item) => item.slot === dropSlot) ?? null,
        [dropSlot, items],
    );

    const expPercent = hud?.expNextLevel
        ? Math.max(0, Math.min(100, ((hud.exp || 0) / hud.expNextLevel) * 100))
        : 0;
    const expLabel = hud
        ? `${Math.round(expPercent)}% (${formatNumber(hud.exp || 0)} / ${formatNumber(hud.expNextLevel || 0)})`
        : "-";
    const isMaxLevelCharacter = (hud?.level ?? 0) >= MAX_LEVEL;
    const currentClan = clanOverview?.currentClan ?? null;
    const detailClan =
        selectedClanDetails ??
        (selectedClanId === currentClan?.id ? currentClan : null);
    const currentLevel = hud?.level ?? 0;
    const isCurrentCharacterCriminal =
        String(hud?.color ?? "").toLowerCase() === "red";
    const currentFaction = inferFactionFromHud(hud, characterStatsSnapshot);
    const missingClanJoinRequirements = React.useMemo(() => {
        if (!detailClan || currentClan) {
            return [] as string[];
        }

        const issues: string[] = [];

        if (currentLevel < detailClan.minJoinLevel) {
            issues.push(
                `Necesitas nivel ${detailClan.minJoinLevel} para postularte a este clan.`,
            );
        }

        const isCitizenCompatible =
            currentFaction === "armada" ||
            (!isCurrentCharacterCriminal && currentFaction === "none");
        const isCriminalCompatible =
            currentFaction === "caos" ||
            (isCurrentCharacterCriminal && currentFaction === "none");

        if (detailClan.alignment === "citizen" && !isCitizenCompatible) {
            issues.push("Tu faccion no puede ingresar a un clan ciudadano.");
        }

        if (detailClan.alignment === "criminal" && !isCriminalCompatible) {
            issues.push("Tu faccion no puede ingresar a un clan criminal.");
        }

        return issues;
    }, [
        currentClan,
        currentFaction,
        currentLevel,
        detailClan,
        isCurrentCharacterCriminal,
    ]);
    const canRequestJoinSelectedClan = missingClanJoinRequirements.length === 0;
    const hasPendingRequestToSelectedClan = Boolean(
        !currentClan &&
        detailClan &&
        clanOverview?.pendingRequestClanId === detailClan.id,
    );
    const isClanLeader = currentClan?.members.some(
        (member) =>
            member.role === "leader" &&
            member.characterId === selectedCharacterId,
    );
    const isClanCoLeader = currentClan?.members.some(
        (member) =>
            member.role === "co_leader" &&
            member.characterId === selectedCharacterId,
    );
    const canReviewClanRequests = Boolean(isClanLeader || isClanCoLeader);
    const clanMemberActionTarget = clanMemberActionMenu
        ? (currentClan?.members.find(
              (member) =>
                  member.characterId === clanMemberActionMenu.characterId,
          ) ?? null)
        : null;

    React.useEffect(() => {
        if (!isClanModalOpen) {
            return;
        }

        setClanView(currentClan ? "manage" : "list");
    }, [currentClan, isClanModalOpen]);

    function formatClanAlignment(alignment: ClanAlignment) {
        switch (alignment) {
            case "citizen":
                return localizeText("Ciudadano");
            case "criminal":
                return localizeText("Criminal");
        }
    }

    function formatClassName(classId: number) {
        return localizeText(classLabels[classId] ?? `Clase ${classId}`);
    }

    function formatClanRole(role: ClanMember["role"]) {
        switch (role) {
            case "leader":
                return localizeText("Lider");
            case "co_leader":
                return localizeText("Co-lider");
            default:
                return localizeText("Miembro");
        }
    }

    function validateClanName(rawName: string) {
        const normalizedName = rawName.replace(/\s+/g, " ").trim();

        if (normalizedName.length < 3) {
            return "El nombre del clan debe tener al menos 3 caracteres.";
        }

        if (normalizedName.length > 18) {
            return "El nombre del clan no puede superar 18 caracteres.";
        }

        const spaceCount = (normalizedName.match(/ /g) ?? []).length;

        if (spaceCount > 1) {
            return "El nombre del clan solo puede contener un espacio.";
        }

        if (!clanNamePattern.test(normalizedName)) {
            return "El nombre del clan solo puede contener letras y espacios.";
        }

        return null;
    }

    function sendClanCommand(command: string) {
        onSendCommand?.(command);
        scheduleClanRefresh();
    }

    function handleCreateClan() {
        const name = clanCreateName.replace(/\s+/g, " ").trim();
        const minLevel = Number.parseInt(clanCreateMinLevel, 10);
        const nameError = validateClanName(clanCreateName);
        const currentGold = hud?.gold ?? 0;
        const currentLevel = hud?.level ?? 0;

        if (nameError) {
            setClanError(nameError);
            return;
        }

        if (currentLevel < CLAN_CREATION_LEVEL_REQUIRED) {
            setClanError(
                `Necesitas nivel ${CLAN_CREATION_LEVEL_REQUIRED} para crear un clan.`,
            );
            return;
        }

        if (currentGold < CLAN_CREATION_COST) {
            setClanError("Necesitas 1.500.000 de oro para crear un clan.");
            return;
        }

        if (!name || !Number.isInteger(minLevel) || minLevel < 1) {
            setClanError("Completa nombre y nivel minimo validos.");
            return;
        }

        setClanError(null);
        setClanCreateName(name);
        sendClanCommand(`/clancrear ${name}|${minLevel}`);
    }

    async function handleRequestJoin() {
        if (!detailClan) {
            setClanError("Selecciona un clan primero.");
            return;
        }

        if (
            hasPendingRequestToSelectedClan ||
            clanRequestSubmitting ||
            !canRequestJoinSelectedClan
        ) {
            return;
        }

        setClanRequestSubmitting(true);
        setClanError(null);

        try {
            sendClanCommand(
                `/clanpostular ${detailClan.id}|${clanRequestMessage.trim()}`,
            );
            setClanRequestMessage("");
            setClanOverview((current) =>
                current
                    ? {
                          ...current,
                          pendingRequestClanId: detailClan.id,
                      }
                    : current,
            );
        } finally {
            window.setTimeout(() => setClanRequestSubmitting(false), 700);
        }
    }

    function handleClanReviewAction(
        requestId: string,
        action: "accept" | "reject",
    ) {
        if (clanReviewActionId) {
            return;
        }

        setClanReviewActionId(requestId);
        setClanError(null);
        sendClanCommand(
            action === "accept"
                ? `/clanaceptar ${requestId}`
                : `/clanrechazar ${requestId}`,
        );
        window.setTimeout(() => setClanReviewActionId(null), 700);
    }

    function handleClanKick(characterId: string, memberName?: string) {
        if (clanKickActionId) {
            return;
        }

        const confirmed = window.confirm(localizeText(memberName
                ? `¿Seguro que quieres echar a ${memberName} del clan?`
                : "¿Seguro que quieres echar a este miembro del clan?"),
        );

        if (!confirmed) {
            return;
        }

        setClanKickActionId(characterId);
        setClanMemberActionMenu(null);
        setClanError(null);
        sendClanCommand(`/clanexpulsar ${characterId}`);
        window.setTimeout(() => setClanKickActionId(null), 700);
    }

    function handleLeaveClan() {
        if (clanLeaveSubmitting) {
            return;
        }

        setClanLeaveSubmitting(true);
        setClanError(null);
        sendClanCommand("/clansalir");
        window.setTimeout(() => setClanLeaveSubmitting(false), 700);
    }

    function handleClanRoleChange(
        characterId: string,
        role: "co_leader" | "member",
    ) {
        if (clanRoleActionId) {
            return;
        }

        setClanRoleActionId(characterId);
        setClanMemberActionMenu(null);
        setClanError(null);
        sendClanCommand(`/clancolider ${characterId}|${role}`);
        window.setTimeout(() => setClanRoleActionId(null), 700);
    }

    function handleDeleteClan() {
        if (
            clanDeleteSubmitting ||
            !["BORRAR", "DELETE"].includes(clanDeleteConfirmationText.trim())
        ) {
            return;
        }

        setIsClanDeleteDialogOpen(false);
        setClanDeleteConfirmationText("");
        setClanDeleteSubmitting(true);
        setClanError(null);
        sendClanCommand("/claneliminar confirmar");
        window.setTimeout(() => setClanDeleteSubmitting(false), 700);
    }

    function closeClanDeleteDialog() {
        setIsClanDeleteDialogOpen(false);
        setClanDeleteConfirmationText("");
    }

    function closeClanModal() {
        setIsClanModalOpen(false);
        closeClanDeleteDialog();
    }

    function handleTransferClanLeadership(
        characterId: string,
        memberName?: string,
    ) {
        if (clanLeadershipTransferActionId) {
            return;
        }

        const confirmed = window.confirm(localizeText(memberName
                ? `¿Seguro que quieres transferir el liderazgo del clan a ${memberName}? Dejarás de ser el lider.`
                : "¿Seguro que quieres transferir el liderazgo del clan? Dejarás de ser el lider."),
        );

        if (!confirmed) {
            return;
        }

        setClanLeadershipTransferActionId(characterId);
        setClanMemberActionMenu(null);
        setClanError(null);
        sendClanCommand(`/clanlider ${characterId}`);
        window.setTimeout(() => setClanLeadershipTransferActionId(null), 700);
    }

    async function openClanDetail(clanId: string) {
        setSelectedClanId(clanId);
        setClanLoading(true);
        setClanError(null);

        try {
            if (!selectedCharacterId) {
                throw new Error("No hay personaje seleccionado.");
            }

            const response = await fetch(
                `/api/clans/${encodeURIComponent(clanId)}`,
                { cache: "no-store" },
            );
            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    typeof result?.error === "string"
                        ? result.error
                        : "No se pudo cargar el clan.",
                );
            }

            setSelectedClanDetails(result as ClanDetails);
        } catch (error) {
            setClanError(
                error instanceof Error
                    ? error.message
                    : "No se pudo cargar el clan.",
            );
            return;
        } finally {
            setClanLoading(false);
        }

        setClanView("detail");
    }
    const equippedArmor = React.useMemo(() => {
        if (!objectsDB) {
            return null;
        }

        return items.reduce(
            (total, item) => {
                if (
                    !item.equipped ||
                    (item.objType !== OBJECT_TYPE.armaduras &&
                        item.objType !== OBJECT_TYPE.escudos &&
                        item.objType !== OBJECT_TYPE.cascos)
                ) {
                    return total;
                }

                const objectData = objectsDB[item.idItem.toString()];

                if (!objectData) {
                    return total;
                }

                total.min += objectData.minDef ?? 0;
                total.max += objectData.maxDef ?? 0;
                return total;
            },
            { min: 0, max: 0 },
        );
    }, [items, objectsDB]);
    const equippedArmorLabel = equippedArmor
        ? `${equippedArmor.min}/${equippedArmor.max}`
        : "-";
    const equippedDamage = React.useMemo(() => {
        if (!objectsDB) {
            return null;
        }

        return items.reduce(
            (total, item) => {
                if (!item.equipped || item.objType !== OBJECT_TYPE.armas) {
                    return total;
                }

                const objectData = objectsDB[item.idItem.toString()];

                if (!objectData) {
                    return total;
                }

                total.min += objectData.minHit ?? 0;
                total.max += objectData.maxHit ?? 0;
                return total;
            },
            { min: 0, max: 0 },
        );
    }, [items, objectsDB]);
    const equippedDamageLabel = equippedDamage
        ? `${equippedDamage.min}/${equippedDamage.max}`
        : "-";
    const isChallengeInstanceMap = Boolean(
        hud?.map && hud.map >= 2000 && hud.map < DYNAMIC_INSTANCE_MAP_START,
    );
    const resolvedHudMapId = resolveBaseInstanceMapId(hud?.map);
    const previewMapId = resolvedHudMapId
        ? isChallengeInstanceMap
            ? null
            : resolvedHudMapId >= 1000
              ? 272
              : resolvedHudMapId
        : null;
    const partyMembers = hud?.partyMembers ?? [];
    const partyLeaderId = partyMembers.find((member) => member.isLeader)?.id;
    const normalizedHudId =
        typeof hud?.id === "undefined" || hud.id === null
            ? null
            : String(hud.id);
    const isPartyLeader = Boolean(
        normalizedHudId &&
        partyMembers.some(
            (member) =>
                String(member.id) === normalizedHudId && member.isLeader,
        ),
    );
    const isAdmin = hud?.privileges === 1;
    const worldMapTriggerRef = React.useRef<HTMLButtonElement | null>(null);
    const worldMapGrid = React.useMemo(
        () => (worldMapGridData ? buildWorldMapGrid(worldMapGridData) : null),
        [worldMapGridData],
    );
    const mapPreviewSrc = previewMapId
        ? `/imgs_maps/${previewMapId}.png`
        : null;
    const worldMapAssetSrc = worldMapGridData?.generatedAt
        ? `${isAdmin ? WORLD_MAP_GENERAL_SRC : WORLD_MAP_SRC}?v=${encodeURIComponent(worldMapGridData.generatedAt)}`
        : isAdmin
          ? WORLD_MAP_GENERAL_SRC
          : WORLD_MAP_SRC;
    const adminWorldMapAlt = localizeText("Mapa del mundo completo");
    const minimapMarkerPosition = React.useMemo(() => {
        if (isChallengeInstanceMap) {
            return null;
        }

        return getMinimapMarkerStyle(hud?.pos, mapPreviewAspectRatio);
    }, [hud?.pos, isChallengeInstanceMap, mapPreviewAspectRatio]);
    const worldMapMarkerPosition = React.useMemo(() => {
        return getWorldMapMarkerStyle(worldMapGrid, previewMapId, hud?.pos);
    }, [hud?.pos, previewMapId, worldMapGrid]);
    const worldMapPlayerMarkers = React.useMemo(() => {
        return worldMapPlayers
            .map((player) => {
                const markerStyle = getWorldMapMarkerStyle(
                    worldMapGrid,
                    player.map,
                    player.pos,
                );

                if (!markerStyle) {
                    return null;
                }

                return {
                    id: `${player.name}-${player.map}-${player.pos.x}-${player.pos.y}`,
                    left: markerStyle.left,
                    top: markerStyle.top,
                    title: `${player.name} (Mapa ${player.map} - ${player.pos.x}, ${player.pos.y})`,
                };
            })
            .filter(
                (
                    marker,
                ): marker is {
                    id: string;
                    left: string;
                    top: string;
                    title: string;
                } => marker !== null,
            );
    }, [worldMapGrid, worldMapPlayers]);
    const partyMinimapMarkerPositions = React.useMemo(() => {
        if (isChallengeInstanceMap || !hud?.partyMembers?.length) {
            return [];
        }

        return hud.partyMembers
            .filter(
                (member) =>
                    member.online &&
                    member.map === hud.map &&
                    String(member.id) !== normalizedHudId,
            )
            .map((member) => {
                const markerStyle = getMinimapMarkerStyle(
                    member.pos,
                    mapPreviewAspectRatio,
                );

                return {
                    id: member.id,
                    left: markerStyle?.left ?? "0px",
                    top: markerStyle?.top ?? "0px",
                    title: member.nameCharacter,
                };
            });
    }, [hud, isChallengeInstanceMap, mapPreviewAspectRatio, normalizedHudId]);
    const clanMinimapMarkerPositions = React.useMemo(() => {
        if (isChallengeInstanceMap || !hud?.clanMembers?.length) {
            return [];
        }

        return hud.clanMembers
            .filter(
                (member) =>
                    member.online &&
                    member.map === hud.map &&
                    String(member.id) !== normalizedHudId,
            )
            .map((member) => {
                const markerStyle = getMinimapMarkerStyle(
                    member.pos,
                    mapPreviewAspectRatio,
                );

                return {
                    id: member.id,
                    left: markerStyle?.left ?? "0px",
                    top: markerStyle?.top ?? "0px",
                    title: member.nameCharacter,
                };
            });
    }, [hud, isChallengeInstanceMap, mapPreviewAspectRatio, normalizedHudId]);

    const closeWorldMap = React.useCallback(() => {
        setIsWorldMapOpen(false);
        worldMapTriggerRef.current?.blur();
    }, []);
    const handleLoadWorldMapPlayers = React.useCallback(async () => {
        setWorldMapPlayers([]);
        setWorldMapPlayersSampledAt(null);
        setWorldMapPlayersError(null);
        setWorldMapPlayersLoading(false);
    }, []);
    const handleWorldMapContextMenu = React.useCallback(
        (event: React.MouseEvent<HTMLElement>) => {
            event.preventDefault();
        },
        [],
    );

    React.useEffect(() => {
        let cancelled = false;

        loadWorldMapGrid(
            isAdmin ? WORLD_MAP_GENERAL_GRID_URL : WORLD_MAP_GRID_URL,
        )
            .then((nextWorldMapGridData) => {
                if (!cancelled) {
                    setWorldMapGridData(nextWorldMapGridData);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setWorldMapGridData(null);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [isAdmin]);

    React.useEffect(() => {
        if (!partyMembers.length) {
            setIsPartyModalOpen(false);
        }
    }, [partyMembers.length]);

    React.useEffect(() => {
        setMapPreviewErrored(false);
        setMapPreviewAspectRatio(1);
    }, [hud?.map]);

    React.useEffect(() => {
        if (!isWorldMapOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeWorldMap();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [closeWorldMap, isWorldMapOpen]);

    const closeDropDialog = React.useCallback(() => {
        setDropSlot(null);
        setDropAmount("1");
    }, []);

    const openDropDialog = React.useCallback(() => {
        if (!selectedItem) {
            return;
        }

        setDropSlot(selectedItem.slot);
        setDropAmount("1");
    }, [selectedItem]);

    const submitDropRequest = React.useCallback(() => {
        if (!dropItem) {
            closeDropDialog();
            return;
        }

        const parsedAmount = Number.parseInt(dropAmount, 10);
        const amount = Number.isFinite(parsedAmount)
            ? Math.max(1, Math.min(dropItem.amount, parsedAmount))
            : 1;

        onDropRequest?.(dropItem.slot, amount);
        closeDropDialog();
    }, [closeDropDialog, dropAmount, dropItem, onDropRequest]);

    const submitDropAllRequest = React.useCallback(() => {
        if (!dropItem) {
            closeDropDialog();
            return;
        }

        onDropRequest?.(dropItem.slot, dropItem.amount);
        closeDropDialog();
    }, [closeDropDialog, dropItem, onDropRequest]);

    React.useEffect(() => {
        if (
            selectedSlot !== null &&
            !items.some((item) => item.slot === selectedSlot)
        ) {
            setSelectedSlot(null);
        }
    }, [items, selectedSlot]);

    React.useEffect(() => {
        if (
            selectedSpellSlot !== null &&
            !spells.some((spell) => spell.slot === selectedSpellSlot)
        ) {
            setActiveTab("inventory");
        }
    }, [selectedSpellSlot, spells]);

    React.useEffect(() => {
        if (
            dropSlot !== null &&
            !items.some((item) => item.slot === dropSlot)
        ) {
            closeDropDialog();
        }
    }, [closeDropDialog, dropSlot, items]);

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
        let isActive = true;

        loadSpellsDB()
            .then((data) => {
                if (isActive) {
                    setSpellsDB(data);
                }
            })
            .catch(() => {
                if (isActive) {
                    setSpellsDB({});
                }
            });

        return () => {
            isActive = false;
        };
    }, []);

    React.useEffect(() => {
        if (!selectedSpell) {
            setIsSpellInfoOpen(false);
        }
    }, [selectedSpell]);

    React.useEffect(() => {
        return () => {
            if (hoverTimerRef.current) {
                window.clearTimeout(hoverTimerRef.current);
            }
        };
    }, []);

    React.useEffect(() => {
        setHardwareAccelerationWarning(detectHardwareAccelerationWarning());
    }, []);

    React.useEffect(() => {
        if (!isHotkeySettingsOpen) {
            setListeningBinding(null);
            setHotkeyError(null);
        }
    }, [isHotkeySettingsOpen]);

    React.useEffect(() => {
        if (!isSpellListDragging) {
            return;
        }

        const handleMouseUp = () => {
            setIsSpellListDragging(false);
        };

        window.addEventListener("mouseup", handleMouseUp);
        return () => window.removeEventListener("mouseup", handleMouseUp);
    }, [isSpellListDragging]);

    React.useEffect(() => {
        if (activeTab !== "spells") {
            return;
        }

        const frame = window.requestAnimationFrame(() => {
            if (spellListRef.current) {
                spellListRef.current.scrollTop = spellListScrollTopRef.current;
            }
        });

        return () => window.cancelAnimationFrame(frame);
    }, [activeTab, sortedSpells.length]);

    React.useEffect(() => {
        if (!isHotkeySettingsOpen || !listeningBinding) {
            return;
        }

        const handleCapture = (event: KeyboardEvent) => {
            event.preventDefault();
            event.stopPropagation();

            if (event.code === "Escape") {
                setListeningBinding(null);
                setHotkeyError(null);
                return;
            }

            const shouldClear =
                event.code === "Backspace" || event.code === "Delete";
            const nextSettings = cloneHotkeySettings(hotkeySettings);

            const nextCodes = shouldClear
                ? []
                : sanitizeHotkeyCodes(listeningBinding.action, [event.code]);
            const usedByAction = Object.entries(nextSettings).find(
                ([action, codes]) => {
                    if (action === listeningBinding.action) {
                        return false;
                    }

                    return nextCodes.some((nextCode) =>
                        codes.some((assignedCode) =>
                            expandHotkeyCode(assignedCode).includes(nextCode),
                        ),
                    );
                },
            );

            if (usedByAction) {
                setHotkeyError(
                    `La tecla ${formatHotkeyCode(nextCodes[0] ?? event.code)} ya esta asignada.`,
                );
                return;
            }

            nextSettings[listeningBinding.action] = nextCodes;
            onHotkeySettingsChange(nextSettings);
            setListeningBinding(null);
            setHotkeyError(null);
        };

        window.addEventListener("keydown", handleCapture, true);
        return () => window.removeEventListener("keydown", handleCapture, true);
    }, [
        hotkeySettings,
        isHotkeySettingsOpen,
        listeningBinding,
        onHotkeySettingsChange,
    ]);

    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const activeElement = document.activeElement;
            const isTyping =
                activeElement instanceof HTMLInputElement ||
                activeElement instanceof HTMLTextAreaElement ||
                activeElement instanceof HTMLSelectElement ||
                activeElement?.getAttribute("contenteditable") === "true";
            const key = event.key.toLowerCase();

            if (isHotkeySettingsOpen) {
                return;
            }

            if (key === "escape" && dropSlot !== null) {
                closeDropDialog();
                event.preventDefault();
                return;
            }

            if (key === "enter" && dropSlot !== null) {
                submitDropRequest();
                event.preventDefault();
                return;
            }

            if (isTyping) {
                return;
            }

            if (
                isHotkeyMatch(event, hotkeySettings.toggleWorldMap) &&
                !event.repeat
            ) {
                setIsWorldMapOpen((current) => !current);
                event.preventDefault();
                return;
            }

            if (
                isHotkeyMatch(event, hotkeySettings.equipItem) &&
                selectedSlot !== null
            ) {
                onEquipRequest?.(selectedSlot);
                event.preventDefault();
                return;
            }

            if (
                isHotkeyMatch(event, hotkeySettings.dropItem) &&
                selectedSlot !== null
            ) {
                openDropDialog();
                event.preventDefault();
                return;
            }

            if (key === "h" && selectedSpell) {
                onCastSpell(selectedSpell);
                event.preventDefault();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
        closeDropDialog,
        dropSlot,
        onCastSpell,
        onEquipRequest,
        hotkeySettings.dropItem,
        hotkeySettings.equipItem,
        hotkeySettings.toggleWorldMap,
        isHotkeySettingsOpen,
        openDropDialog,
        selectedSlot,
        selectedSpell,
        submitDropRequest,
    ]);

    const inventoryStartSlot = React.useMemo(() => {
        if (items.length === 0) {
            return 0;
        }

        const lowestSlot = items.reduce(
            (minSlot, item) => Math.min(minSlot, item.slot),
            items[0].slot,
        );

        return lowestSlot === 0 ? 0 : 1;
    }, [items]);

    const handleSpellListMouseMove = React.useCallback(
        (event: React.MouseEvent<HTMLDivElement>) => {
            if (!isSpellListDragging) {
                return;
            }

            const spellListElement = spellListRef.current;

            if (!spellListElement) {
                return;
            }

            const bounds = spellListElement.getBoundingClientRect();
            const pointerOffsetY = event.clientY - bounds.top;

            if (pointerOffsetY < SPELL_LIST_AUTOSCROLL_EDGE_PX) {
                spellListElement.scrollTop -= SPELL_LIST_AUTOSCROLL_STEP;
                return;
            }

            if (
                pointerOffsetY >
                bounds.height - SPELL_LIST_AUTOSCROLL_EDGE_PX
            ) {
                spellListElement.scrollTop += SPELL_LIST_AUTOSCROLL_STEP;
            }
        },
        [isSpellListDragging],
    );

    const totalSlots = React.useMemo(() => {
        if (items.length === 0) {
            return MIN_SLOTS;
        }

        const highestSlot = items.reduce(
            (maxSlot, item) => Math.max(maxSlot, item.slot),
            items[0].slot,
        );

        return Math.max(MIN_SLOTS, highestSlot - inventoryStartSlot + 1);
    }, [inventoryStartSlot, items]);

    const activateItem = React.useCallback(
        (item: InventoryItem) => {
            setSelectedSlot(item.slot);

            if (rangedWeaponIds.has(item.idItem) && item.equipped) {
                onRangeAttackRequest?.();
                return;
            }

            if (
                item.objType === OBJECT_TYPE.armaduras ||
                item.objType === OBJECT_TYPE.armas ||
                item.objType === OBJECT_TYPE.anillos ||
                item.objType === OBJECT_TYPE.escudos ||
                item.objType === OBJECT_TYPE.cascos ||
                item.objType === OBJECT_TYPE.flechas
            ) {
                onEquipRequest?.(item.slot);
                return;
            }

            onUseItemClickRequest?.(item.slot);
        },
        [
            onEquipRequest,
            onRangeAttackRequest,
            onUseItemClickRequest,
            rangedWeaponIds,
        ],
    );

    const handleSlotClick = React.useCallback(
        (item?: InventoryItem) => {
            setSelectedSlot(item?.slot ?? null);

            if (!item) {
                lastClickedSlotRef.current = null;
                return;
            }

            const now = performance.now();
            const lastClickedSlot = lastClickedSlotRef.current;

            if (
                lastClickedSlot?.slot === item.slot &&
                now - lastClickedSlot.timestamp <= DOUBLE_ACTIVATE_WINDOW_MS
            ) {
                lastClickedSlotRef.current = null;
                activateItem(item);
                return;
            }

            lastClickedSlotRef.current = {
                slot: item.slot,
                timestamp: now,
            };
        },
        [activateItem],
    );

    const slotItems = React.useMemo(() => {
        const itemsBySlot = new Map(items.map((item) => [item.slot, item]));

        return Array.from({ length: totalSlots }, (_, index) =>
            itemsBySlot.get(index + inventoryStartSlot),
        );
    }, [inventoryStartSlot, items, totalSlots]);

    const showTooltipWithDelay = (item: InventoryItem) => {
        if (hoverTimerRef.current) {
            window.clearTimeout(hoverTimerRef.current);
        }

        hoverTimerRef.current = window.setTimeout(() => {
            setHoveredItem(item);
        }, HOVER_DELAY_MS);
    };

    const clearTooltip = () => {
        if (hoverTimerRef.current) {
            window.clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
        setHoveredItem(null);
    };

    const finishInventoryDrag = React.useCallback(
        (clientX: number, clientY: number) => {
            if (!draggedInventoryItem) {
                return;
            }

            const dropTarget = document
                .elementFromPoint(clientX, clientY)
                ?.closest("[data-inventory-slot]");
            const slotAttribute = dropTarget?.getAttribute(
                "data-inventory-slot",
            );
            const targetSlot = slotAttribute ? Number(slotAttribute) : NaN;

            if (
                Number.isFinite(targetSlot) &&
                targetSlot !== draggedInventoryItem.slot
            ) {
                onMoveInventoryItem?.(draggedInventoryItem.slot, targetSlot);
                setSelectedSlot(targetSlot);
            }

            setDraggedInventoryItem(null);
        },
        [draggedInventoryItem, onMoveInventoryItem],
    );

    React.useEffect(() => {
        if (!draggedInventoryItem) {
            return;
        }

        const handleMouseMove = (event: MouseEvent) => {
            const panelScale = getPanelScale();

            setDragPointer({
                x: event.clientX / panelScale,
                y: event.clientY / panelScale,
            });
        };

        const handleMouseUp = (event: MouseEvent) => {
            finishInventoryDrag(event.clientX, event.clientY);
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [draggedInventoryItem, finishInventoryDrag, getPanelScale]);

    return (
        <>
            <div
                ref={panelRef}
                className="pointer-events-auto flex w-[min(92vw,320px)] flex-col overflow-hidden rounded-2xl border border-cyan-300/25 bg-slate-950/78 text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.55)] backdrop-blur-xl"
                style={{
                    height: panelHeight,
                    minHeight: panelHeight,
                    maxHeight: panelHeight,
                }}
            >
                <div
                    className="flex min-h-0 flex-1 flex-col p-3"
                    style={{
                        touchAction: "pan-y",
                        scrollbarWidth: "none",
                        msOverflowStyle: "none",
                    }}
                >
                    <div className="flex h-full flex-col gap-2 text-stone-100">
                        <section className="rounded-[22px] border border-[#6f5734] bg-[radial-gradient(circle_at_top,rgba(120,86,44,0.35),rgba(21,14,10,0.96)_60%)] p-3 shadow-[inset_0_1px_0_rgba(255,223,175,0.1)]">
                            <div className="flex items-start gap-2.5">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-200/20 bg-black/25 text-base font-bold text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                                    {hud?.level ?? "-"}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[9px] uppercase tracking-[0.3em] text-amber-200/70">{localizeKey("hud.character")}</p>
                                    <h3 className="truncate text-[24px] font-semibold leading-none text-[#efe2c5]">
                                        {hud?.nameCharacter || "Adventurer"}
                                    </h3>
                                </div>
                                <LocalizedLabel><button
                                    type="button"
                                    onClick={() => setIsSettingsOpen(true)}
                                    className="group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-200/15 bg-black/20 text-amber-100/80 transition hover:border-amber-300/45 hover:bg-black/35 hover:text-amber-50"
                                    aria-label={
                                        hardwareAccelerationWarning
                                            ? "Abrir ajustes. Revisar aceleración gráfica"
                                            : localizeKey("hud.settings")
                                    }
                                    title={
                                        hardwareAccelerationWarning
                                            ? "Revisar aceleración gráfica"
                                            : localizeKey("hud.settings")
                                    }
                                >
                                    <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.16),transparent_62%)] opacity-0 transition group-hover:opacity-100" />
                                    <Settings
                                        aria-hidden="true"
                                        className="relative h-[18px] w-[18px] transition duration-300 group-hover:rotate-90"
                                        strokeWidth={1.8}
                                    />
                                    {hardwareAccelerationWarning ? (
                                        <>
                                            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-rose-500 ring-2 ring-[#1a120d]" />
                                            <span className="sr-only"><LocalizedText source={"Advertencia de aceleración gráfica "} /></span>
                                        </>
                                    ) : null}
                                </button></LocalizedLabel>
                            </div>

                            {!isMaxLevelCharacter ? (
                                <div className="mt-3">
                                    <div className="mb-1 flex flex-nowrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-stone-300/82">
                                        <span className="shrink-0">{localizeKey("hud.experience")}</span>
                                        <span className="shrink-0 whitespace-nowrap text-[10px] tracking-[0.08em] text-right text-amber-100 tabular-nums">
                                            {expLabel}
                                        </span>
                                    </div>
                                    <div className="h-3 overflow-hidden rounded-full border border-[#8b6b3e] bg-black/45 p-[2px]">
                                        <div
                                            className="h-full rounded-full bg-linear-to-r from-[#6a9b2f] via-[#7cb63b] to-[#9fd14d]"
                                            style={{ width: `${expPercent}%` }}
                                        />
                                    </div>
                                </div>
                            ) : null}
                        </section>

                        <section className="flex min-h-0 flex-1 flex-col rounded-[22px] border border-[#5e4529] bg-[#19110d]/95 p-2.5 shadow-[inset_0_1px_0_rgba(255,214,170,0.08)]">
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("inventory")}
                                    className={`rounded-[14px] border px-3 py-2 text-sm font-semibold transition focus:outline-none focus-visible:outline-none ${
                                        activeTab === "inventory"
                                            ? "border-amber-300/70 bg-[linear-gradient(180deg,#7d2e12,#4f1608)] text-amber-50 shadow-[0_0_0_1px_rgba(251,191,36,0.12),inset_0_1px_0_rgba(255,220,180,0.18)]"
                                            : "border-[#4a3424] bg-[#241813] text-stone-300 hover:border-amber-400/40 hover:text-stone-100"
                                    }`}
                                >{localizeKey("hud.inventory")}</button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("spells")}
                                    className={`rounded-[14px] border px-3 py-2 text-sm font-semibold transition focus:outline-none focus-visible:outline-none ${
                                        activeTab === "spells"
                                            ? "border-amber-300/70 bg-[linear-gradient(180deg,#7d2e12,#4f1608)] text-amber-50 shadow-[0_0_0_1px_rgba(251,191,36,0.12),inset_0_1px_0_rgba(255,220,180,0.18)]"
                                            : "border-[#4a3424] bg-[#241813] text-stone-300 hover:border-amber-400/40 hover:text-stone-100"
                                    }`}
                                >{localizeKey("hud.spells")}</button>
                            </div>

                            {activeTab === "inventory" ? (
                                <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2">
                                    <div className="rounded-[18px] border border-amber-300/15 bg-[#120c09] p-2.5 shadow-[inset_0_1px_0_rgba(255,214,170,0.08)]">
                                        <div className="grid grid-cols-7 gap-1">
                                            {slotItems.map((item, index) => {
                                                const slotNumber =
                                                    index + inventoryStartSlot;
                                                const graphicData = item
                                                    ? graphicsDB?.[
                                                          item.grhIndex.toString()
                                                      ]
                                                    : undefined;

                                                return (
                                                    <button
                                                        key={`slot-${index}`}
                                                        type="button"
                                                        data-inventory-slot={
                                                            slotNumber
                                                        }
                                                        className={`relative flex aspect-square items-center justify-center rounded-[6px] border text-left transition focus:outline-none focus-visible:outline-none ${
                                                            item
                                                                ? !item.validForUser
                                                                    ? selectedSlot ===
                                                                      item.slot
                                                                        ? "border-rose-300/85 bg-[#3b2026] shadow-[0_0_0_1px_rgba(253,164,175,0.22),inset_0_1px_0_rgba(255,218,180,0.06)]"
                                                                        : "border-rose-400/25 bg-[#24151a] shadow-[inset_0_1px_0_rgba(255,218,180,0.05)] hover:border-rose-300/60 hover:bg-[#2c181f]"
                                                                    : selectedSlot ===
                                                                        item.slot
                                                                      ? "border-cyan-300/85 bg-[#3a2817] shadow-[0_0_0_1px_rgba(103,232,249,0.25),inset_0_1px_0_rgba(255,218,180,0.08)]"
                                                                      : "border-amber-500/25 bg-[#2b2016] shadow-[inset_0_1px_0_rgba(255,218,180,0.08)] hover:border-amber-300/60 hover:bg-[#35271b]"
                                                                : "border-[#433126] bg-[#140f0a]"
                                                        }`}
                                                        onMouseDown={(
                                                            event,
                                                        ) => {
                                                            if (
                                                                event.button ===
                                                                    2 &&
                                                                item
                                                            ) {
                                                                event.preventDefault();
                                                                clearTooltip();
                                                                setSelectedSlot(
                                                                    item.slot,
                                                                );
                                                                const panelScale =
                                                                    getPanelScale();
                                                                setDraggedInventoryItem(
                                                                    item,
                                                                );
                                                                setDragPointer({
                                                                    x:
                                                                        event.clientX /
                                                                        panelScale,
                                                                    y:
                                                                        event.clientY /
                                                                        panelScale,
                                                                });
                                                                return;
                                                            }

                                                            event.preventDefault();
                                                        }}
                                                        onContextMenu={(
                                                            event,
                                                        ) => {
                                                            event.preventDefault();
                                                        }}
                                                        onClick={() =>
                                                            handleSlotClick(
                                                                item,
                                                            )
                                                        }
                                                        onMouseEnter={() =>
                                                            item &&
                                                            showTooltipWithDelay(
                                                                item,
                                                            )
                                                        }
                                                        onMouseLeave={
                                                            clearTooltip
                                                        }
                                                        onFocus={() =>
                                                            item &&
                                                            showTooltipWithDelay(
                                                                item,
                                                            )
                                                        }
                                                        onBlur={clearTooltip}
                                                    >
                                                        {item ? (
                                                            <>
                                                                <ItemGraphic
                                                                    graphicData={
                                                                        graphicData
                                                                    }
                                                                    name={
                                                                        item.name
                                                                    }
                                                                />
                                                                {item.amount >
                                                                    1 && (
                                                                    <span className="pointer-events-none absolute left-1 top-0.5 text-[10px] font-bold text-stone-100 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                                                                        {
                                                                            item.amount
                                                                        }
                                                                    </span>
                                                                )}
                                                                {item.equipped && (
                                                                    <span className="pointer-events-none absolute bottom-0.5 right-0.5 rounded bg-amber-300 px-1 text-[9px] font-black leading-4 text-stone-950 shadow-sm">
                                                                        E
                                                                    </span>
                                                                )}
                                                                {!item.validForUser && (
                                                                    <span className="pointer-events-none absolute inset-0 rounded-[6px] bg-[linear-gradient(135deg,rgba(244,63,94,0.18),rgba(0,0,0,0))]" />
                                                                )}
                                                            </>
                                                        ) : null}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {hoveredItem ? (
                                        <div className="rounded-2xl border border-amber-200/15 bg-black/45 px-3 py-2 text-[11px] leading-4 text-stone-200">
                                            <p className="font-semibold text-amber-100">
                                                {localizeText(hoveredItem.name)}
                                            </p>
                                            {hoveredItem.details ? (
                                                <p className="mt-1 whitespace-pre-wrap text-stone-300/90">
                                                    {localizeItemDetails(hoveredItem.details, locale)}
                                                </p>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2">
                                    {spells.length ? (
                                        <div className="flex min-h-0 flex-1 flex-col gap-2">
                                            <div className="flex min-h-0 flex-1 items-start gap-1.5">
                                                <LocalizedLabel><div
                                                    ref={spellListRef}
                                                    role="listbox"
                                                    aria-label={localizeText("Lista de hechizos")}
                                                    aria-activedescendant={
                                                        selectedSpell
                                                            ? `spell-option-${selectedSpell.slot}`
                                                            : undefined
                                                    }
                                                    tabIndex={-1}
                                                    onMouseMove={
                                                        handleSpellListMouseMove
                                                    }
                                                    onScroll={(event) => {
                                                        spellListScrollTopRef.current =
                                                            event.currentTarget.scrollTop;
                                                    }}
                                                    onMouseLeave={() => {
                                                        if (
                                                            isSpellListDragging
                                                        ) {
                                                            setIsSpellListDragging(
                                                                false,
                                                            );
                                                        }
                                                    }}
                                                    className="h-full min-h-0 flex-1 overflow-y-auto rounded-[10px] border border-[#7a5a3a] bg-black p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                                                >
                                                    {sortedSpells.map(
                                                        (spell) => (
                                                            <button
                                                                key={`${spell.slot}-${spell.idSpell}`}
                                                                id={`spell-option-${spell.slot}`}
                                                                type="button"
                                                                role="option"
                                                                aria-selected={
                                                                    selectedSpellSlot ===
                                                                    spell.slot
                                                                }
                                                                onMouseDown={(
                                                                    event,
                                                                ) => {
                                                                    if (
                                                                        event.button !==
                                                                        0
                                                                    ) {
                                                                        return;
                                                                    }

                                                                    event.preventDefault();
                                                                    setIsSpellListDragging(
                                                                        true,
                                                                    );
                                                                    onSelectSpell(
                                                                        spell.slot,
                                                                    );
                                                                }}
                                                                onMouseEnter={(
                                                                    event,
                                                                ) => {
                                                                    if (
                                                                        (event.buttons &
                                                                            1) ===
                                                                        0
                                                                    ) {
                                                                        return;
                                                                    }

                                                                    setIsSpellListDragging(
                                                                        true,
                                                                    );
                                                                    onSelectSpell(
                                                                        spell.slot,
                                                                    );
                                                                }}
                                                                onDragStart={(
                                                                    event,
                                                                ) => {
                                                                    event.preventDefault();
                                                                }}
                                                                className={`flex w-full items-center px-2 text-left text-[13px] leading-6 text-stone-100 select-none ${
                                                                    selectedSpellSlot ===
                                                                    spell.slot
                                                                        ? "bg-[#2f86ff] text-white"
                                                                        : "bg-transparent hover:bg-white/8"
                                                                }`}
                                                                style={{
                                                                    minHeight: `${SPELL_LIST_ROW_HEIGHT}px`,
                                                                }}
                                                            >
                                                                <span className="block truncate">
                                                                    {localizeText(spell.name)}
                                                                </span>
                                                            </button>
                                                        ),
                                                    )}
                                                </div></LocalizedLabel>

                                                <div className="flex w-4 shrink-0 flex-col gap-1">
                                                    <LocalizedLabel><button
                                                        type="button"
                                                        aria-label={localizeText("Subir hechizo seleccionado")}
                                                        title={localizeText("Subir hechizo seleccionado")}
                                                        disabled={
                                                            !selectedSpell ||
                                                            !canMoveSelectedSpellUp
                                                        }
                                                        onClick={() => {
                                                            if (selectedSpell) {
                                                                onMoveSpell?.(
                                                                    selectedSpell.slot,
                                                                    "up",
                                                                );
                                                            }
                                                        }}
                                                        className="flex h-7 items-center justify-center rounded-[6px] border border-[#8b6a47] bg-[linear-gradient(180deg,#46331f_0%,#26180e_100%)] text-stone-100 shadow-[inset_0_1px_0_rgba(255,240,210,0.18)] transition hover:border-[#c39a6a] hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-35"
                                                    >
                                                        <ChevronUp className="h-4 w-4" />
                                                    </button></LocalizedLabel>

                                                    <LocalizedLabel><button
                                                        type="button"
                                                        aria-label={localizeText("Bajar hechizo seleccionado")}
                                                        title={localizeText("Bajar hechizo seleccionado")}
                                                        disabled={
                                                            !selectedSpell ||
                                                            !canMoveSelectedSpellDown
                                                        }
                                                        onClick={() => {
                                                            if (selectedSpell) {
                                                                onMoveSpell?.(
                                                                    selectedSpell.slot,
                                                                    "down",
                                                                );
                                                            }
                                                        }}
                                                        className="flex h-7 items-center justify-center rounded-[6px] border border-[#8b6a47] bg-[linear-gradient(180deg,#46331f_0%,#26180e_100%)] text-stone-100 shadow-[inset_0_1px_0_rgba(255,240,210,0.18)] transition hover:border-[#c39a6a] hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-35"
                                                    >
                                                        <ChevronDown className="h-4 w-4" />
                                                    </button></LocalizedLabel>

                                                    <LocalizedLabel><button
                                                        type="button"
                                                        aria-label={localizeText("Informacion del hechizo seleccionado")}
                                                        title={localizeText("Informacion del hechizo")}
                                                        disabled={
                                                            !selectedSpell
                                                        }
                                                        onClick={() => {
                                                            if (selectedSpell) {
                                                                setIsSpellInfoOpen(
                                                                    true,
                                                                );
                                                            }
                                                        }}
                                                        className="mt-3 flex h-7 items-center justify-center rounded-[6px] border border-[#8b6a47] bg-[linear-gradient(180deg,#46331f_0%,#26180e_100%)] text-[12px] font-bold leading-none text-stone-100 shadow-[inset_0_1px_0_rgba(255,240,210,0.18)] transition hover:border-[#c39a6a] hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-35"
                                                    >
                                                        i
                                                    </button></LocalizedLabel>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="rounded-[20px] border border-dashed border-white/10 bg-white/3 px-4 py-6 text-center text-sm text-stone-400">
                                            {localizeText("Este personaje no tiene hechizos disponibles.")}
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (selectedSpell) {
                                                onCastSpell(selectedSpell);
                                            }
                                        }}
                                        disabled={!selectedSpell}
                                        className="shrink-0 w-full rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-stone-950 transition hover:bg-amber-200 focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
                                    >{localizeKey("hud.cast")}</button>
                                </div>
                            )}
                        </section>

                        <section className="relative rounded-[22px] border border-[#5e4529] bg-[#19110d]/95 p-3 shadow-[inset_0_1px_0_rgba(255,214,170,0.08)]">
                            <p className="text-center text-[10px] font-semibold tracking-[0.04em] text-[#cbb18e]">
                                {localizeText(mapName || "Sin mapa cargado")}
                            </p>

                            <div className="mt-2 flex items-start gap-3">
                                <div className="min-w-0 flex-1 space-y-2">
                                    <VitalBarsCanvas
                                        hp={hud?.hp || 0}
                                        maxHp={hud?.maxHp || 0}
                                        mana={hud?.mana || 0}
                                        maxMana={hud?.maxMana || 0}
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setIsPartyModalOpen(true)
                                            }
                                            className="inline-flex min-w-0 items-center justify-center gap-2 rounded-[10px] border border-[#4f3f2b] bg-[linear-gradient(180deg,#2d2218_0%,#17100a_100%)] px-3 py-1.5 text-center text-[11px] font-semibold text-amber-100 transition hover:border-[#8c6a43]"
                                        >
                                            <Users className="h-4 w-4 text-cyan-300" />
                                            Party
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setIsClanModalOpen(true)
                                            }
                                            className="inline-flex min-w-0 items-center justify-center gap-2 rounded-[10px] border border-[#4f3f2b] bg-[linear-gradient(180deg,#2d2218_0%,#17100a_100%)] px-3 py-1.5 text-center text-[11px] font-semibold text-amber-100 transition hover:border-[#8c6a43]"
                                        >
                                            <Shield className="h-4 w-4 text-amber-300" />{localizeKey("hud.clans")}</button>
                                    </div>
                                </div>

                                <div className="w-[92px] shrink-0">
                                    <LocalizedLabel><button
                                        ref={worldMapTriggerRef}
                                        type="button"
                                        onClick={() => setIsWorldMapOpen(true)}
                                        className="relative block h-[92px] w-[92px] overflow-hidden rounded-[10px] border border-[#705134] bg-[#0b0705] text-left shadow-[inset_0_1px_0_rgba(255,220,180,0.1)] transition hover:border-[#9b744f] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
                                        aria-label={localizeKey("hud.worldMap")}
                                    >
                                        {mapPreviewSrc && !mapPreviewErrored ? (
                                            <LocalizedLabel><img
                                                src={mapPreviewSrc}
                                                alt={
                                                    localizeText(mapName || "Mapa")
                                                }
                                                width={MINIMAP_PREVIEW_SIZE}
                                                height={MINIMAP_PREVIEW_SIZE}
                                                className="h-[92px] w-[92px] object-contain"
                                                onLoad={(event) => {
                                                    const target =
                                                        event.currentTarget;
                                                    const naturalWidth =
                                                        target.naturalWidth ||
                                                        MINIMAP_PREVIEW_SIZE;
                                                    const naturalHeight =
                                                        target.naturalHeight ||
                                                        MINIMAP_PREVIEW_SIZE;

                                                    setMapPreviewAspectRatio(
                                                        naturalWidth /
                                                            Math.max(
                                                                1,
                                                                naturalHeight,
                                                            ),
                                                    );
                                                }}
                                                onError={() =>
                                                    setMapPreviewErrored(true)
                                                }
                                            /></LocalizedLabel>
                                        ) : isChallengeInstanceMap ? (
                                            <div className="h-[92px] w-[92px] bg-black" />
                                        ) : (
                                            <div className="flex h-[92px] w-[92px] items-center justify-center bg-[linear-gradient(180deg,#3d2a1d,#1a120d)] text-[10px] font-semibold text-stone-300">{localizeKey("characters.map")}{hud?.map ?? "-"}
                                            </div>
                                        )}
                                        {minimapMarkerPosition ? (
                                            <span
                                                data-testid="minimap-self-marker"
                                                className="pointer-events-none absolute block h-[5px] w-[5px] rounded-full border border-white/90 bg-[#ff3b22] shadow-[0_0_0_1px_rgba(90,14,2,0.9),0_0_5px_rgba(255,88,42,0.9)]"
                                                style={{
                                                    left: minimapMarkerPosition.left,
                                                    top: minimapMarkerPosition.top,
                                                    transform:
                                                        "translate(-50%, -50%)",
                                                }}
                                            />
                                        ) : null}
                                        {clanMinimapMarkerPositions.map(
                                            (marker) => (
                                                <LocalizedLabel><span
                                                    key={`clan-${marker.id}`}
                                                    data-testid={`minimap-clan-marker-${marker.id}`}
                                                    title={marker.title}
                                                    className="pointer-events-none absolute block h-[5px] w-[5px] rounded-full border border-white/90 bg-[#22c55e] shadow-[0_0_0_1px_rgba(20,83,45,0.95),0_0_5px_rgba(34,197,94,0.95)]"
                                                    style={{
                                                        left: marker.left,
                                                        top: marker.top,
                                                        transform:
                                                            "translate(-50%, -50%)",
                                                    }}
                                                /></LocalizedLabel>
                                            ),
                                        )}
                                        {partyMinimapMarkerPositions.map(
                                            (marker) => (
                                                <LocalizedLabel><span
                                                    key={marker.id}
                                                    data-testid={`minimap-party-marker-${marker.id}`}
                                                    title={marker.title}
                                                    className="pointer-events-none absolute block h-[5px] w-[5px] rounded-full border border-white/90 bg-[#38bdf8] shadow-[0_0_0_1px_rgba(8,47,73,0.95),0_0_5px_rgba(56,189,248,0.95)]"
                                                    style={{
                                                        left: marker.left,
                                                        top: marker.top,
                                                        transform:
                                                            "translate(-50%, -50%)",
                                                    }}
                                                /></LocalizedLabel>
                                            ),
                                        )}
                                    </button></LocalizedLabel>
                                    <div className="mt-1 text-center text-[10px] text-amber-100/85">
                                        {hud
                                            ? `${localizeText("Mapa")} ${hud.map} (${hud.pos.x}, ${hud.pos.y})`
                                            : `${localizeText("Mapa")} - (-, -)`}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-stone-100">
                                <StatLine
                                    icon={
                                        <HudGlyph>
                                            <svg
                                                viewBox="0 0 16 16"
                                                className="h-4 w-4 fill-current"
                                            >
                                                <circle cx="8" cy="8" r="5.5" />
                                                <path
                                                    d="M8 3.5 9.2 6H12l-2.3 1.7.9 2.8L8 8.9l-2.6 1.6.9-2.8L4 6h2.8Z"
                                                    className="fill-[#5a3a14]"
                                                />
                                            </svg>
                                        </HudGlyph>
                                    }
                                    value={formatNumber(hud?.gold ?? 0)}
                                    accent="text-amber-200"
                                />
                                <StatLine
                                    icon={
                                        <HudGlyph>
                                            <svg
                                                viewBox="0 0 16 16"
                                                className="h-4 w-4 fill-none stroke-current stroke-[1.4]"
                                            >
                                                <path d="M8 2.2 12.6 4v3.2c0 3-1.9 5.2-4.6 6.6-2.7-1.4-4.6-3.6-4.6-6.6V4Z" />
                                            </svg>
                                        </HudGlyph>
                                    }
                                    value={equippedArmorLabel}
                                />
                                <StatLine
                                    icon={
                                        <HudGlyph>
                                            <svg
                                                viewBox="0 0 16 16"
                                                className="h-4 w-4 fill-none stroke-current stroke-[1.4]"
                                            >
                                                <path d="M4 12 12 4" />
                                                <path d="m9.7 3.7 2.6 2.6" />
                                                <path d="M3.2 12.8 5.3 10.7" />
                                            </svg>
                                        </HudGlyph>
                                    }
                                    value={equippedDamageLabel}
                                />
                                <StatLine
                                    icon={
                                        <span className="inline-flex h-4 w-4 items-center justify-center">
                                            <Image
                                                src="/graphics/23003.png"
                                                alt={localizeKey("hud.strength")}
                                                width={14}
                                                height={14}
                                                className="h-3.5 w-3.5 object-contain opacity-90"
                                                unoptimized
                                            />
                                        </span>
                                    }
                                    value={hud?.attrFuerza ?? "-"}
                                    rightValue={
                                        buffCountdown.fuerza > 0
                                            ? formatBuffSecondsLabel(
                                                  buffCountdown.fuerza,
                                              )
                                            : null
                                    }
                                />
                                <StatLine
                                    icon={
                                        <span className="inline-flex h-4 w-4 items-center justify-center">
                                            <Image
                                                src="/graphics/23000.png"
                                                alt={localizeKey("hud.agility")}
                                                width={14}
                                                height={14}
                                                className="h-3.5 w-3.5 object-contain opacity-90"
                                                unoptimized
                                            />
                                        </span>
                                    }
                                    value={hud?.attrAgilidad ?? "-"}
                                    rightValue={
                                        buffCountdown.agilidad > 0
                                            ? formatBuffSecondsLabel(
                                                  buffCountdown.agilidad,
                                              )
                                            : null
                                    }
                                />
                            </div>

                            <div className="pointer-events-none absolute bottom-3 right-3 text-[10px] uppercase tracking-[0.16em] text-stone-500">
                                v0.0.75
                            </div>
                        </section>
                    </div>
                </div>
            </div>

            {dropItem ? (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]">
                    <div className="w-full max-w-xs rounded-[24px] border border-amber-200/20 bg-[#120c08]/95 p-4 text-stone-100 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                        <p className="text-[11px] uppercase tracking-[0.28em] text-amber-300/75">{localizeKey("controls.drop")}</p>
                        <h3 className="mt-2 text-lg font-semibold text-stone-50">
                            {localizeText(dropItem.name)}
                        </h3>
                        <p className="mt-1 text-sm text-stone-400"><LocalizedText source={"Cantidad disponible: "} />{formatNumber(dropItem.amount)}
                        </p>

                        <label className="mt-4 block text-xs uppercase tracking-[0.22em] text-stone-400">{localizeKey("hud.amount")}</label>
                        <input
                            type="number"
                            min={1}
                            max={dropItem.amount}
                            value={dropAmount}
                            onChange={(event) =>
                                setDropAmount(event.target.value)
                            }
                            className="mt-2 w-full rounded-2xl border border-stone-700 bg-stone-950/90 px-4 py-3 text-base outline-none transition focus:border-amber-400"
                            autoFocus
                        />

                        <div className="mt-4 grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={closeDropDialog}
                                className="flex-1 rounded-2xl border border-stone-700 bg-stone-900/80 px-4 py-3 text-sm font-semibold text-stone-200 transition hover:border-stone-500 hover:bg-stone-800"
                            >{localizeKey("common.cancel")}</button>
                            <button
                                type="button"
                                onClick={submitDropAllRequest}
                                className="flex-1 rounded-2xl border border-rose-400/35 bg-rose-500/12 px-4 py-3 text-sm font-semibold text-rose-100 transition hover:border-rose-300/55 hover:bg-rose-500/18"
                            ><LocalizedText source={"Tirar todo "} /></button>
                            <button
                                type="button"
                                onClick={submitDropRequest}
                                className="col-span-2 rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-200"
                            >{localizeKey("hud.drop")}</button>
                        </div>
                    </div>
                </div>
            ) : null}

            {isWorldMapOpen && typeof document !== "undefined"
                ? createPortal(
                      <div
                          className="fixed inset-0 z-[82] flex items-center justify-center bg-black/70 p-3 backdrop-blur-[3px] sm:p-5"
                          onClick={closeWorldMap}
                      >
                          <div
                              className="relative w-full max-w-6xl overflow-hidden rounded-[24px] border border-amber-200/20 bg-[#120c08]/96 shadow-[0_28px_90px_rgba(0,0,0,0.6)]"
                              onClick={(event) => event.stopPropagation()}
                          >
                              <div className="flex items-center justify-between gap-4 border-b border-amber-200/10 bg-[linear-gradient(180deg,rgba(127,78,35,0.28),rgba(18,12,8,0))] px-4 py-3 sm:px-5">
                                  <div>
                                      <p className="text-[11px] uppercase tracking-[0.28em] text-amber-300/72">{localizeText("Navegacion")}</p>
                                      <h3 className="mt-1 text-lg font-semibold text-[#f2e5ca] sm:text-xl">{localizeKey("hud.mapTitle")}</h3>
                                      {isAdmin ? (
                                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-stone-300">
                                              <button
                                                  type="button"
                                                  onClick={
                                                      handleLoadWorldMapPlayers
                                                  }
                                                  disabled={
                                                      worldMapPlayersLoading
                                                  }
                                                  className="rounded-[10px] border border-sky-700/60 bg-sky-950/60 px-3 py-2 text-left font-semibold text-sky-100 transition hover:border-sky-500 disabled:cursor-not-allowed disabled:border-stone-700 disabled:bg-stone-900 disabled:text-stone-400"
                                              >
                                                  <LocalizedText source={worldMapPlayersLoading
                                                      ? "Cargando jugadores..."
                                                      : "Cargar todos los jugadores en el mapa"} />
                                              </button>
                                              <span className="text-stone-400">
                                                  {worldMapPlayerMarkers.length}{" "}<LocalizedText source={"visibles "} /></span>
                                              {worldMapPlayersSampledAt ? (
                                                  <span className="text-stone-500"><LocalizedText source={"Snapshot listo "} /></span>
                                              ) : null}
                                          </div>
                                      ) : null}
                                      {isAdmin && worldMapPlayersError ? (
                                          <p className="mt-2 text-xs text-rose-300">
                                              <LocalizedText source={worldMapPlayersError} />
                                          </p>
                                      ) : null}
                                  </div>
                                  <LocalizedLabel><button
                                      type="button"
                                      onClick={closeWorldMap}
                                      className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-700 bg-black/20 text-stone-300 transition hover:border-stone-500 hover:text-white"
                                      aria-label={localizeText("Cerrar mapa del mundo")}
                                  >
                                      <X
                                          aria-hidden="true"
                                          className="h-4 w-4"
                                          strokeWidth={1.8}
                                      />
                                  </button></LocalizedLabel>
                              </div>

                              <div className="flex h-[calc(100vh-7rem)] items-center justify-center bg-[#0b0705] p-2 sm:p-3">
                                  <LocalizedLabel><div
                                      className="relative inline-block"
                                      onContextMenu={handleWorldMapContextMenu}
                                      title={
                                          isAdmin
                                              ? "Click derecho para teletransportarte"
                                              : undefined
                                      }
                                  >
                                      <LocalizedLabel><img
                                          src={worldMapAssetSrc}
                                          alt={adminWorldMapAlt}
                                          className="block max-h-[calc(100vh-8.5rem)] max-w-full object-contain"
                                      /></LocalizedLabel>
                                      {worldMapMarkerPosition ? (
                                          <div className="pointer-events-none absolute inset-0">
                                              {worldMapPlayerMarkers.map(
                                                  (marker) => (
                                                      <LocalizedLabel><div
                                                          key={marker.id}
                                                          className="pointer-events-auto absolute h-[8px] w-[8px] rounded-full border border-white/70 bg-sky-400 shadow-[0_0_0_1px_rgba(8,47,73,0.9),0_0_6px_rgba(56,189,248,0.7)]"
                                                          style={{
                                                              left: marker.left,
                                                              top: marker.top,
                                                              transform:
                                                                  "translate(-50%, -50%)",
                                                          }}
                                                          title={marker.title}
                                                          aria-label={
                                                              marker.title
                                                          }
                                                      /></LocalizedLabel>
                                                  ),
                                              )}
                                              <div
                                                  data-testid="world-map-self-marker"
                                                  aria-hidden="true"
                                                  className="absolute rounded-full border border-white/90 bg-[#ff3b22] shadow-[0_0_0_1px_rgba(90,14,2,0.9),0_0_5px_rgba(255,88,42,0.9)] before:absolute before:left-1/2 before:top-1/2 before:h-6 before:w-6 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:border before:border-[#ff6a54]/80 before:bg-[#ff6a54]/10 before:content-['']"
                                                  style={{
                                                      left: worldMapMarkerPosition.left,
                                                      top: worldMapMarkerPosition.top,
                                                      width: `${WORLD_MAP_MARKER_SIZE}px`,
                                                      height: `${WORLD_MAP_MARKER_SIZE}px`,
                                                      transform:
                                                          "translate(-50%, -50%)",
                                                  }}
                                              />
                                          </div>
                                      ) : worldMapPlayerMarkers.length > 0 ? (
                                          <div className="pointer-events-none absolute inset-0">
                                              {worldMapPlayerMarkers.map(
                                                  (marker) => (
                                                      <LocalizedLabel><div
                                                          key={marker.id}
                                                          className="pointer-events-auto absolute h-[8px] w-[8px] rounded-full border border-white/70 bg-sky-400 shadow-[0_0_0_1px_rgba(8,47,73,0.9),0_0_6px_rgba(56,189,248,0.7)]"
                                                          style={{
                                                              left: marker.left,
                                                              top: marker.top,
                                                              transform:
                                                                  "translate(-50%, -50%)",
                                                          }}
                                                          title={marker.title}
                                                          aria-label={
                                                              marker.title
                                                          }
                                                      /></LocalizedLabel>
                                                  ),
                                              )}
                                          </div>
                                      ) : null}
                                  </div></LocalizedLabel>
                              </div>
                          </div>
                      </div>,
                      portalTarget ?? document.body,
                  )
                : null}

            {isSettingsOpen ? (
                <div className="fixed inset-0 z-[84] flex items-center justify-center bg-black/45 px-4 backdrop-blur-[3px]">
                    <div className="w-full max-w-md overflow-hidden rounded-[28px] border border-amber-200/20 bg-[#120c08]/95 text-stone-100 shadow-[0_28px_90px_rgba(0,0,0,0.55)]">
                        <div className="flex items-start justify-between gap-4 border-b border-amber-200/10 bg-[linear-gradient(180deg,rgba(127,78,35,0.28),rgba(18,12,8,0))] px-5 py-4">
                            <div>
                                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-amber-300/72">
                                    <Settings
                                        aria-hidden="true"
                                        className="h-3.5 w-3.5"
                                        strokeWidth={1.9}
                                    />
                                    <p><LocalizedText source={"Ajustes"} /></p>
                                </div>
                                <h3 className="mt-1 text-xl font-semibold text-[#f2e5ca]"><LocalizedText source={"Configuración "} /></h3>
                            </div>
                            <LocalizedLabel><button
                                type="button"
                                onClick={() => setIsSettingsOpen(false)}
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-700 bg-black/20 text-stone-300 transition hover:border-stone-500 hover:text-white"
                                aria-label="Cerrar ajustes"
                            >
                                <X
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                    strokeWidth={1.8}
                                />
                            </button></LocalizedLabel>
                        </div>

                        <div className="space-y-4 px-5 py-5">
                            {hardwareAccelerationWarning ? (
                                <section className="rounded-[22px] border border-rose-400/28 bg-[linear-gradient(180deg,rgba(127,29,29,0.28),rgba(40,10,10,0.96))] p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rose-200/20 bg-rose-500/16 text-lg font-bold text-rose-50">
                                            !
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[11px] uppercase tracking-[0.26em] text-rose-200/85"><LocalizedText source={"Rendimiento del navegador "} /></p>
                                            <p className="mt-1 text-sm font-semibold text-rose-50"><LocalizedText source={"Parece que la aceleración por hardware no está activa. "} /></p>
                                            <p className="mt-3 text-sm leading-6 text-rose-100/85"><LocalizedText source={"Esto suele causar tirones, menos FPS o una experiencia más pesada. Para activarla en"} />{" "}
                                                {
                                                    localizeText(hardwareAccelerationWarning
                                                        .help.browserLabel)
                                                }
                                                :
                                            </p>
                                            <ol className="mt-3 space-y-2 text-sm leading-6 text-rose-50/92">
                                                {hardwareAccelerationWarning.help.steps.map(
                                                    (step, index) => (
                                                        <li
                                                            key={step}
                                                            className="flex gap-2"
                                                        >
                                                            <span className="font-semibold text-rose-200">
                                                                {index + 1}.
                                                            </span>
                                                            <span><LocalizedText source={step} /></span>
                                                        </li>
                                                    ),
                                                )}
                                            </ol>
                                        </div>
                                    </div>
                                </section>
                            ) : null}

                            <section className="rounded-[22px] border border-[#4f3926] bg-[#19110d]/92 p-4">
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-300/15 bg-black/25 text-amber-100">
                                        <Volume2
                                            className="h-4.5 w-4.5"
                                            strokeWidth={1.8}
                                        />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[11px] uppercase tracking-[0.26em] text-amber-200/78"><LocalizedText source={"Sonido "} /></p>
                                        <p className="mt-1 text-sm text-stone-300"><LocalizedText source={"Ajusta el volumen general de efectos del juego. "} /></p>
                                    </div>
                                    <div className="rounded-full border border-amber-300/20 bg-black/30 px-3 py-1 text-sm font-semibold text-amber-100">
                                        {Math.round(soundVolume * 100)}%
                                    </div>
                                </div>

                                <div className="mt-4">
                                    <LocalizedLabel><input
                                        type="range"
                                        min="0"
                                        max="100"
                                        step="1"
                                        value={Math.round(soundVolume * 100)}
                                        onChange={(event) =>
                                            onSoundVolumeChange(
                                                Number(event.target.value) /
                                                    100,
                                            )
                                        }
                                        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-amber-200/15 accent-amber-400"
                                        aria-label="Volumen general"
                                    /></LocalizedLabel>
                                    <div className="mt-2 flex justify-between text-[10px] uppercase tracking-[0.2em] text-stone-500">
                                        <span><LocalizedText source={"Silencio"} /></span>
                                        <span><LocalizedText source={"Máximo"} /></span>
                                    </div>
                                </div>
                            </section>

                            <button
                                type="button"
                                onClick={() => {
                                    setIsSettingsOpen(false);
                                    setIsHotkeySettingsOpen(true);
                                }}
                                className="flex w-full items-center justify-between rounded-[20px] border border-amber-300/25 bg-[linear-gradient(180deg,rgba(109,44,19,0.9),rgba(60,19,8,0.98))] px-4 py-3 text-left text-amber-50 transition hover:border-amber-200/45 hover:brightness-110"
                            >
                                <span className="flex items-center gap-3">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-200/20 bg-black/20 text-amber-100">
                                        <Keyboard
                                            className="h-4.5 w-4.5"
                                            strokeWidth={1.8}
                                        />
                                    </span>
                                    <span>
                                        <span className="block text-[11px] uppercase tracking-[0.24em] text-amber-200/78"><LocalizedText source={"Teclas "} /></span>
                                        <span className="mt-1 block text-sm font-semibold"><LocalizedText source={"Ir a configuración de teclas "} /></span>
                                    </span>
                                </span>
                                <Settings2
                                    className="h-4.5 w-4.5"
                                    strokeWidth={1.8}
                                />
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {isPartyModalOpen ? (
                <div
                    className="fixed inset-0 z-[83] flex items-center justify-center bg-black/45 px-4 backdrop-blur-[3px]"
                    onClick={() => setIsPartyModalOpen(false)}
                >
                    <div
                        className="w-full max-w-sm overflow-hidden rounded-[24px] border border-amber-200/20 bg-[#120c08]/96 text-stone-100 shadow-[0_28px_90px_rgba(0,0,0,0.6)]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-4 border-b border-amber-200/10 bg-[linear-gradient(180deg,rgba(127,78,35,0.28),rgba(18,12,8,0))] px-4 py-3">
                            <div>
                                <p className="text-[11px] uppercase tracking-[0.28em] text-amber-300/72"><LocalizedText source={"Party (15% mas experiencia) "} /></p>
                                <h3 className="mt-1 text-lg font-semibold text-[#f2e5ca]">
                                    <LocalizedText source={partyMembers.length
                                        ? `Miembros ${partyMembers.length}/4`
                                        : "Crear o unirte a una party"} />
                                </h3>
                            </div>
                            <LocalizedLabel><button
                                type="button"
                                onClick={() => setIsPartyModalOpen(false)}
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-700 bg-black/20 text-stone-300 transition hover:border-stone-500 hover:text-white"
                                aria-label="Cerrar party"
                            >
                                <X
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                    strokeWidth={1.8}
                                />
                            </button></LocalizedLabel>
                        </div>

                        <div className="space-y-3 px-4 py-4">
                            {partyMembers.length ? (
                                <>
                                    <div className="space-y-2">
                                        {partyMembers.map((member) => {
                                            const isLeader =
                                                typeof partyLeaderId !==
                                                    "undefined" &&
                                                String(member.id) ===
                                                    String(partyLeaderId);
                                            const canKick =
                                                isPartyLeader &&
                                                !isLeader &&
                                                normalizedHudId !== null &&
                                                String(member.id) !==
                                                    normalizedHudId;

                                            return (
                                                <div
                                                    key={member.id}
                                                    className="flex items-center gap-2 rounded-[14px] border border-white/8 bg-white/4 px-3 py-3"
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-stone-100">
                                                            <span className="truncate">
                                                                {
                                                                    member.nameCharacter
                                                                }
                                                            </span>
                                                            {isLeader ? (
                                                                <Crown className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                                                            ) : null}
                                                        </div>
                                                        <div className="mt-1 text-[11px] text-stone-400">
                                                            {member.online
                                                                ? localizeText(`Mapa ${member.map} (${member.pos.x}, ${member.pos.y})`)
                                                                : "Offline"}
                                                        </div>
                                                    </div>

                                                    {canKick ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                onSendCommand?.(
                                                                    `/expulsarparty ${member.nameCharacter}`,
                                                                );
                                                                setIsPartyModalOpen(
                                                                    false,
                                                                );
                                                            }}
                                                            className="inline-flex h-9 items-center justify-center rounded-[10px] border border-rose-700/60 bg-rose-950/70 px-3 text-[11px] font-semibold text-rose-100 transition hover:border-rose-500 hover:bg-rose-900/80"
                                                        >
                                                            <UserRoundX className="mr-1.5 h-3.5 w-3.5" /><LocalizedText source={"Echar "} /></button>
                                                    ) : null}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            onSendCommand?.("/salirparty");
                                            setIsPartyModalOpen(false);
                                        }}
                                        className="flex w-full items-center justify-center rounded-[14px] border border-[#8b6a47] bg-[linear-gradient(180deg,#46331f_0%,#26180e_100%)] px-4 py-3 text-[12px] font-bold text-amber-100 transition hover:border-[#c39a6a] hover:text-amber-50"
                                    >
                                        <DoorOpen className="mr-2 h-4 w-4" />
                                        <LocalizedText source={isPartyLeader
                                            ? "Cerrar party"
                                            : "Salir de la party"} />
                                    </button>
                                </>
                            ) : (
                                <div className="rounded-[16px] border border-white/8 bg-white/4 px-4 py-4 text-sm text-stone-300">
                                    <p className="font-semibold text-stone-100"><LocalizedText source={"Aun no estás en una party. "} /></p>
                                    <p className="mt-2 leading-6 text-stone-400"><LocalizedText source={"Escribe"} />{" "}
                                        <code>{localizeText('/party nombredeusuario')}</code><LocalizedText source={" para invitar a otro jugador. El usuario invitado tiene que escribir"} />{" "}
                                        <code>{localizeText('/aceptar')}</code><LocalizedText source={" para unirse. "} /></p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}

            {isClanModalOpen ? (
                <div
                    className="fixed inset-0 z-[84] flex items-center justify-center bg-black/45 px-4 backdrop-blur-[3px]"
                    onClick={closeClanModal}
                >
                    <div
                        className="w-full max-w-3xl overflow-hidden rounded-[24px] border border-amber-200/20 bg-[#120c08]/96 text-stone-100 shadow-[0_28px_90px_rgba(0,0,0,0.6)]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-4 border-b border-amber-200/10 bg-[linear-gradient(180deg,rgba(127,78,35,0.28),rgba(18,12,8,0))] px-4 py-3">
                            <div>
                                <p className="text-[11px] uppercase tracking-[0.28em] text-amber-300/72">{localizeKey("hud.clans")}</p>
                                <h3 className="mt-1 text-lg font-semibold text-[#f2e5ca]">
                                    {clanView === "detail" && detailClan
                                        ? `<${detailClan.name}>`
                                        : clanView === "create"
                                          ? <LocalizedText source={"Crear clan"} />
                                          : currentClan
                                            ? `<${currentClan.name}>`
                                            : <LocalizedText source={"Clanes disponibles"} />}
                                </h3>
                            </div>
                            <div className="flex items-center gap-2">
                                {!currentClan && clanView !== "create" ? (
                                    <button
                                        type="button"
                                        onClick={() => setClanView("create")}
                                        className="rounded-[10px] border border-[#8b6a47] bg-[linear-gradient(180deg,#46331f_0%,#26180e_100%)] px-3 py-2 text-[11px] font-bold text-amber-100 transition hover:border-[#c39a6a]"
                                    ><LocalizedText source={"Crear clan "} /></button>
                                ) : null}
                                {currentClan ? (
                                    <button
                                        type="button"
                                        onClick={() => setClanView("list")}
                                        className="rounded-[10px] border border-[#8b6a47] bg-[linear-gradient(180deg,#46331f_0%,#26180e_100%)] px-3 py-2 text-[11px] font-bold text-amber-100 transition hover:border-[#c39a6a]"
                                    ><LocalizedText source={"Ver clanes "} /></button>
                                ) : null}
                                {clanView === "detail" ? (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setClanView(
                                                currentClan ? "manage" : "list",
                                            )
                                        }
                                        className="rounded-[10px] border border-[#8b6a47] bg-[linear-gradient(180deg,#46331f_0%,#26180e_100%)] px-3 py-2 text-[11px] font-bold text-amber-100 transition hover:border-[#c39a6a]"
                                    >{localizeKey("common.back")}</button>
                                ) : null}
                                {clanView === "create" ? (
                                    <button
                                        type="button"
                                        onClick={() => setClanView("list")}
                                        className="rounded-[10px] border border-[#8b6a47] bg-[linear-gradient(180deg,#46331f_0%,#26180e_100%)] px-3 py-2 text-[11px] font-bold text-amber-100 transition hover:border-[#c39a6a]"
                                    >{localizeKey("common.back")}</button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => void refreshClanOverview()}
                                    className="rounded-[10px] border border-[#8b6a47] bg-[linear-gradient(180deg,#46331f_0%,#26180e_100%)] px-3 py-2 text-[11px] font-bold text-amber-100 transition hover:border-[#c39a6a]"
                                ><LocalizedText source={"Refrescar "} /></button>
                                <LocalizedLabel><button
                                    type="button"
                                    onClick={closeClanModal}
                                    className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-700 bg-black/20 text-stone-300 transition hover:border-stone-500 hover:text-white"
                                    aria-label="Cerrar clanes"
                                >
                                    <X
                                        aria-hidden="true"
                                        className="h-4 w-4"
                                        strokeWidth={1.8}
                                    />
                                </button></LocalizedLabel>
                            </div>
                        </div>

                        <div className="px-4 py-4">
                            {clanView === "list" ? (
                                <div>
                                    <section className="rounded-[18px] border border-white/8 bg-white/4 p-4">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300/78"><LocalizedText source={"Clanes disponibles "} /></p>
                                            <span className="text-[11px] text-stone-400">
                                                {clanOverview?.clans.length ??
                                                    0}
                                            </span>
                                        </div>
                                        <div className="mt-3 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                                            {(clanOverview?.clans ?? []).map(
                                                (clan) => (
                                                    <div
                                                        key={clan.id}
                                                        className="rounded-[14px] border border-white/8 bg-white/3 px-3 py-3"
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <div className="text-sm font-semibold text-stone-100">
                                                                    {`<${clan.name}>`}
                                                                </div>
                                                                <div className="mt-1 text-xs text-stone-400">
                                                                    {formatClanAlignment(
                                                                        clan.alignment,
                                                                    )}{" "}<LocalizedText source={"• Lider"} />{" "}
                                                                    {
                                                                        clan.leaderName
                                                                    }
                                                                </div>
                                                                <div className="mt-1 text-xs text-stone-500"><LocalizedText source={"Miembros"} />{" "}
                                                                    {
                                                                        clan.memberCount
                                                                    }{" "}<LocalizedText source={"• Minimo"} />{" "}
                                                                    {
                                                                        clan.minJoinLevel
                                                                    }
                                                                </div>
                                                            </div>
                                                            <LocalizedLabel><button
                                                                type="button"
                                                                onClick={() =>
                                                                    openClanDetail(
                                                                        clan.id,
                                                                    )
                                                                }
                                                                aria-label={`Ver clan ${clan.name}`}
                                                                className="shrink-0 rounded-[10px] border border-[#8b6a47] bg-[linear-gradient(180deg,#46331f_0%,#26180e_100%)] px-3 py-2 text-[11px] font-bold text-amber-100 transition hover:border-[#c39a6a]"
                                                            ><LocalizedText source={"Ver clan "} /></button></LocalizedLabel>
                                                        </div>
                                                    </div>
                                                ),
                                            )}
                                            {!clanLoading &&
                                            !clanError &&
                                            !(
                                                clanOverview?.clans.length ?? 0
                                            ) ? (
                                                <div className="rounded-[14px] border border-white/8 bg-white/3 px-3 py-4 text-sm text-stone-400"><LocalizedText source={"No hay clanes creados todavía. "} /></div>
                                            ) : null}
                                        </div>
                                    </section>
                                </div>
                            ) : null}

                            {clanView === "create" && !currentClan ? (
                                <section className="rounded-[18px] border border-white/8 bg-white/4 p-4">
                                    <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300/78"><LocalizedText source={"Crear clan "} /></p>
                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        <label className="sm:col-span-2">
                                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-400"><LocalizedText source={"Nombre del clan "} /></span>
                                            <LocalizedLabel><input
                                                type="text"
                                                value={clanCreateName}
                                                onChange={(event) =>
                                                    setClanCreateName(
                                                        event.target.value,
                                                    )
                                                }
                                                maxLength={18}
                                                placeholder="Nombre del clan"
                                                className="w-full rounded-2xl border border-stone-700 bg-stone-950/90 px-4 py-3 text-sm outline-none transition focus:border-amber-400"
                                            /></LocalizedLabel>
                                        </label>
                                        <label>
                                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-400"><LocalizedText source={"Nivel minimo "} /></span>
                                            <LocalizedLabel><input
                                                type="number"
                                                min={1}
                                                value={clanCreateMinLevel}
                                                onChange={(event) =>
                                                    setClanCreateMinLevel(
                                                        event.target.value,
                                                    )
                                                }
                                                placeholder="Nivel minimo"
                                                className="w-full rounded-2xl border border-stone-700 bg-stone-950/90 px-4 py-3 text-sm outline-none transition focus:border-amber-400"
                                            /></LocalizedLabel>
                                        </label>
                                    </div>
                                    <p className="mt-3 text-xs text-stone-400"><LocalizedText source={"Para crear un clan debes ser nivel 30 y pagar 1.500.000 de oro. "} /></p>
                                    <button
                                        type="button"
                                        onClick={handleCreateClan}
                                        className="mt-4 w-full rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-200"
                                    ><LocalizedText source={"Crear clan "} /></button>
                                </section>
                            ) : null}

                            {clanView === "detail" && detailClan ? (
                                <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
                                    <section className="rounded-[18px] border border-white/8 bg-white/4 p-4">
                                        <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300/78"><LocalizedText source={"Información del clan "} /></p>
                                        <h4 className="mt-2 text-xl font-semibold text-stone-100">
                                            {`<${detailClan.name}>`}
                                        </h4>
                                        <p className="mt-1 text-sm text-stone-400">
                                            {formatClanAlignment(
                                                detailClan.alignment,
                                            )}{" "}<LocalizedText source={"• Lider "} />{detailClan.leaderName}
                                        </p>
                                        <p className="mt-1 text-sm text-stone-400"><LocalizedText source={"Miembros "} />{detailClan.memberCount}<LocalizedText source={" • Nivel minimo"} />{" "}
                                            {detailClan.minJoinLevel}
                                        </p>
                                        {!currentClan ? (
                                            <>
                                                {hasPendingRequestToSelectedClan ? (
                                                    <div className="mt-3 rounded-[14px] border border-amber-300/20 bg-amber-400/10 px-3 py-3 text-sm text-amber-100"><LocalizedText source={"Ya enviaste una solicitud a este clan. "} /></div>
                                                ) : !canRequestJoinSelectedClan ? (
                                                    <div className="mt-3 rounded-[14px] border border-rose-400/25 bg-rose-500/10 px-3 py-3 text-sm text-rose-100">
                                                        {missingClanJoinRequirements.map(
                                                            (issue) => (
                                                                <p key={issue}>
                                                                    <LocalizedText source={issue} />
                                                                </p>
                                                            ),
                                                        )}
                                                    </div>
                                                ) : (
                                                    <>
                                                        <LocalizedLabel><textarea
                                                            value={
                                                                clanRequestMessage
                                                            }
                                                            onChange={(event) =>
                                                                setClanRequestMessage(
                                                                    event.target
                                                                        .value,
                                                                )
                                                            }
                                                            placeholder="Mensaje opcional para el lider"
                                                            rows={6}
                                                            className="mt-4 w-full rounded-2xl border border-stone-700 bg-stone-950/90 px-4 py-3 text-sm outline-none transition focus:border-amber-400"
                                                        /></LocalizedLabel>
                                                        <button
                                                            type="button"
                                                            onClick={
                                                                handleRequestJoin
                                                            }
                                                            disabled={
                                                                clanRequestSubmitting
                                                            }
                                                            className="mt-4 w-full rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-stone-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
                                                        >
                                                            <LocalizedText source={clanRequestSubmitting
                                                                ? "Enviando solicitud..."
                                                                : "Enviar solicitud"} />
                                                        </button>
                                                    </>
                                                )}
                                            </>
                                        ) : null}
                                    </section>

                                    <section className="rounded-[18px] border border-white/8 bg-white/4 p-4">
                                        <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300/78"><LocalizedText source={"Miembros "} /></p>
                                        <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                                            {detailClan.members.map(
                                                (member) => (
                                                    <div
                                                        key={member.characterId}
                                                        className="rounded-[14px] border border-white/8 bg-white/3 px-3 py-3"
                                                    >
                                                        <div className="text-sm font-semibold text-stone-100">
                                                            {member.name}
                                                        </div>
                                                        <div className="mt-1 text-xs text-stone-400">
                                                            {formatClassName(
                                                                member.classId,
                                                            )}{" "}<LocalizedText source={"• Nivel"} />{" "}
                                                            {member.level} •{" "}
                                                            <LocalizedText source={member.criminal
                                                                ? "Criminal"
                                                                : "Ciudadano"} />
                                                            {member.online ===
                                                            null ? null : (
                                                                <>
                                                                    {" "}
                                                                    •{" "}
                                                                    <span
                                                                        className={
                                                                            member.online
                                                                                ? "text-emerald-400"
                                                                                : "text-rose-400"
                                                                        }
                                                                    >
                                                                        {member.online
                                                                            ? "Online"
                                                                            : "Offline"}
                                                                    </span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    </section>
                                </div>
                            ) : null}

                            {clanView === "manage" && currentClan ? (
                                <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
                                    <div className="space-y-4">
                                        <section className="relative rounded-[18px] border border-white/8 bg-white/4 p-4">
                                            <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300/78"><LocalizedText source={"Tu clan "} /></p>
                                            {isClanLeader ? (
                                                <LocalizedLabel><button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsClanDeleteDialogOpen(
                                                            true,
                                                        );
                                                        setClanDeleteConfirmationText(
                                                            "",
                                                        );
                                                    }}
                                                    disabled={
                                                        clanDeleteSubmitting
                                                    }
                                                    aria-label="Borrar clan"
                                                    title="Borrar clan"
                                                    className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/8 bg-black/20 text-stone-400 opacity-70 transition hover:border-rose-500/50 hover:bg-rose-950/40 hover:text-rose-200 hover:opacity-100 disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-black/10 disabled:text-stone-600"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button></LocalizedLabel>
                                            ) : null}
                                            <h4 className="mt-2 text-xl font-semibold text-stone-100">
                                                {`<${currentClan.name}>`}
                                            </h4>
                                            <p className="mt-1 text-sm text-stone-400">
                                                {formatClanAlignment(
                                                    currentClan.alignment,
                                                )}{" "}<LocalizedText source={"• Lider "} />{currentClan.leaderName}
                                            </p>
                                            <p className="mt-1 text-sm text-stone-400"><LocalizedText source={"Miembros"} />{" "}
                                                {currentClan.memberCount}<LocalizedText source={" • Nivel minimo"} />{" "}
                                                {currentClan.minJoinLevel}
                                            </p>
                                            {!isClanLeader && (
                                                <button
                                                    type="button"
                                                    onClick={handleLeaveClan}
                                                    disabled={
                                                        clanLeaveSubmitting
                                                    }
                                                    className="mt-4 w-full rounded-2xl border border-[#8b6a47] bg-[linear-gradient(180deg,#46331f_0%,#26180e_100%)] px-4 py-3 text-sm font-semibold text-amber-100 transition hover:border-[#c39a6a] disabled:cursor-not-allowed disabled:border-stone-700 disabled:bg-stone-900 disabled:text-stone-400"
                                                >
                                                    <LocalizedText source={clanLeaveSubmitting
                                                        ? "Saliendo del clan..."
                                                        : "Salir del clan"} />
                                                </button>
                                            )}
                                        </section>

                                        <section className="rounded-[18px] border border-white/8 bg-white/4 p-4">
                                            <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300/78"><LocalizedText source={"Miembros "} /></p>
                                            <div className="mt-3 max-h-[300px] space-y-2 overflow-y-auto pr-1">
                                                {currentClan.members.map(
                                                    (member) => {
                                                        const canKick =
                                                            isClanLeader &&
                                                            member.role !==
                                                                "leader";
                                                        const canManageRole =
                                                            isClanLeader &&
                                                            member.role !==
                                                                "leader";
                                                        const canTransferLeadership =
                                                            isClanLeader &&
                                                            member.role !==
                                                                "leader";
                                                        return (
                                                            <div
                                                                key={
                                                                    member.characterId
                                                                }
                                                                className="rounded-[14px] border border-white/8 bg-white/3 px-3 py-3"
                                                            >
                                                                <div className="flex items-center justify-between gap-3">
                                                                    <div className="min-w-0">
                                                                        <div className="truncate text-sm font-semibold text-stone-100">
                                                                            {
                                                                                member.name
                                                                            }
                                                                        </div>
                                                                        <div className="mt-1 text-xs text-stone-400">
                                                                            {formatClanRole(
                                                                                member.role,
                                                                            )}{" "}
                                                                            •{" "}
                                                                            {formatClassName(
                                                                                member.classId,
                                                                            )}{" "}<LocalizedText source={"• Nivel"} />{" "}
                                                                            {
                                                                                member.level
                                                                            }{" "}
                                                                            •{" "}
                                                                            <LocalizedText source={member.criminal
                                                                                ? "Criminal"
                                                                                : "Ciudadano"} />
                                                                            {member.online ===
                                                                            null ? null : (
                                                                                <>
                                                                                    {" "}
                                                                                    •{" "}
                                                                                    <span
                                                                                        className={
                                                                                            member.online
                                                                                                ? "text-emerald-400"
                                                                                                : "text-rose-400"
                                                                                        }
                                                                                    >
                                                                                        {member.online
                                                                                            ? "Online"
                                                                                            : "Offline"}
                                                                                    </span>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {canTransferLeadership ||
                                                                    canManageRole ||
                                                                    canKick ? (
                                                                        <div>
                                                                            <LocalizedLabel><button
                                                                                type="button"
                                                                                onClick={(
                                                                                    event,
                                                                                ) => {
                                                                                    const bounds =
                                                                                        event.currentTarget.getBoundingClientRect();
                                                                                    setClanMemberActionMenu(
                                                                                        clanMemberActionMenu?.characterId ===
                                                                                            member.characterId
                                                                                            ? null
                                                                                            : {
                                                                                                  characterId:
                                                                                                      member.characterId,
                                                                                                  memberName:
                                                                                                      member.name,
                                                                                                  left: bounds.right,
                                                                                                  top: bounds.bottom,
                                                                                              },
                                                                                    );
                                                                                }}
                                                                                aria-label={`Acciones para ${member.name}`}
                                                                                className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/10 bg-black/20 text-stone-300 transition hover:border-white/20 hover:text-stone-100"
                                                                            >
                                                                                <MoreHorizontal className="h-4 w-4" />
                                                                            </button></LocalizedLabel>
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                        );
                                                    },
                                                )}
                                            </div>
                                        </section>
                                    </div>

                                    <div className="space-y-4">
                                        {canReviewClanRequests ? (
                                            <section className="rounded-[18px] border border-white/8 bg-white/4 p-4">
                                                <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300/78"><LocalizedText source={"Solicitudes "} /></p>
                                                <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                                                    {currentClan.requests
                                                        .length ? (
                                                        currentClan.requests.map(
                                                            (request) => (
                                                                <div
                                                                    key={
                                                                        request.id
                                                                    }
                                                                    className="rounded-[14px] border border-white/8 bg-white/3 px-3 py-3"
                                                                >
                                                                    <div className="text-sm font-semibold text-stone-100">
                                                                        {
                                                                            request.name
                                                                        }
                                                                    </div>
                                                                    <div className="mt-1 text-xs text-stone-400">
                                                                        {formatClassName(
                                                                            request.classId,
                                                                        )}{" "}<LocalizedText source={"• Nivel"} />{" "}
                                                                        {
                                                                            request.level
                                                                        }{" "}
                                                                        •{" "}
                                                                        <LocalizedText source={request.criminal
                                                                            ? "Criminal"
                                                                            : "Ciudadano"} />{" "}
                                                                        •{" "}
                                                                        <span
                                                                            className={
                                                                                request.online
                                                                                    ? "text-emerald-400"
                                                                                    : "text-rose-400"
                                                                            }
                                                                        >
                                                                            {request.online
                                                                                ? "Online"
                                                                                : "Offline"}
                                                                        </span>
                                                                    </div>
                                                                    <p className="mt-2 text-sm text-stone-300">
                                                                        {request.message || <LocalizedText source="Sin mensaje" />}
                                                                    </p>
                                                                    <div className="mt-3 flex gap-2">
                                                                        <LocalizedLabel><button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                handleClanReviewAction(
                                                                                    request.id,
                                                                                    "accept",
                                                                                )
                                                                            }
                                                                            aria-label={`Aceptar solicitud de ${request.name}`}
                                                                            disabled={Boolean(
                                                                                clanReviewActionId,
                                                                            )}
                                                                            className="flex-1 rounded-2xl bg-emerald-300 px-3 py-2 text-sm font-semibold text-stone-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
                                                                        >
                                                                            <LocalizedText source={clanReviewActionId ===
                                                                            request.id
                                                                                ? localizeKey("auth.pending")
                                                                                : "Aceptar"} />
                                                                        </button></LocalizedLabel>
                                                                        {isClanLeader ? (
                                                                            <LocalizedLabel><button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    handleClanReviewAction(
                                                                                        request.id,
                                                                                        "reject",
                                                                                    )
                                                                                }
                                                                                aria-label={`Rechazar solicitud de ${request.name}`}
                                                                                disabled={Boolean(
                                                                                    clanReviewActionId,
                                                                                )}
                                                                                className="flex-1 rounded-2xl border border-rose-700/60 bg-rose-950/70 px-3 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-500 disabled:cursor-not-allowed disabled:border-stone-700 disabled:bg-stone-900 disabled:text-stone-400"
                                                                            >
                                                                                <LocalizedText source={clanReviewActionId ===
                                                                                request.id
                                                                                    ? localizeKey("auth.pending")
                                                                                    : "Rechazar"} />
                                                                            </button></LocalizedLabel>
                                                                        ) : null}
                                                                    </div>
                                                                </div>
                                                            ),
                                                        )
                                                    ) : (
                                                        <div className="rounded-[14px] border border-white/8 bg-white/3 px-3 py-4 text-sm text-stone-400"><LocalizedText source={"No hay solicitudes pendientes. "} /></div>
                                                    )}
                                                </div>
                                            </section>
                                        ) : (
                                            <section className="rounded-[18px] border border-white/8 bg-white/4 p-4">
                                                <p className="text-[11px] uppercase tracking-[0.22em] text-amber-300/78"><LocalizedText source={"Estado del clan "} /></p>
                                                <p className="mt-3 text-sm text-stone-300"><LocalizedText source={"Aquí puedes ver la información general del clan y sus miembros. "} /></p>
                                            </section>
                                        )}
                                    </div>
                                </div>
                            ) : null}

                            {clanLoading ? (
                                <div className="mt-4 rounded-[14px] border border-white/8 bg-white/3 px-3 py-4 text-sm text-stone-400"><LocalizedText source={"Cargando clanes... "} /></div>
                            ) : null}

                            {clanError ? (
                                <div className="mt-4 rounded-[14px] border border-rose-400/25 bg-rose-500/10 px-3 py-4 text-sm text-rose-100">
                                    <LocalizedText source={clanError} />
                                </div>
                            ) : null}
                        </div>

                        {isClanDeleteDialogOpen ? (
                            <div
                                className="fixed inset-0 z-[85] flex items-center justify-center bg-black/55 px-4 backdrop-blur-[3px]"
                                onClick={closeClanDeleteDialog}
                            >
                                <div
                                    className="w-full max-w-md rounded-[28px] border border-rose-400/20 bg-[linear-gradient(180deg,rgba(32,12,12,0.97),rgba(18,12,8,0.98))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.6)]"
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="rounded-2xl border border-rose-400/25 bg-rose-400/10 p-3 text-rose-100">
                                            <Trash2 className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-lg font-semibold text-white"><LocalizedText source={"Borrar clan "} /></p>
                                            <p className="mt-2 text-sm leading-6 text-stone-300"><LocalizedText source={"Se eliminara el clan para todos los miembros, online y offline. "} /></p>
                                            <p className="mt-3 text-sm leading-6 text-stone-400"><LocalizedText source={"Escribe"} />{" "}
                                                <span className="font-semibold text-white"><LocalizedText source={"BORRAR "} /></span>{" "}<LocalizedText source={"para confirmar. "} /></p>
                                        </div>
                                    </div>

                                    <label className="mt-6 block">
                                        <span className="text-xs font-medium uppercase tracking-[0.22em] text-stone-400"><LocalizedText source={"Confirmacion "} /></span>
                                        <LocalizedLabel><input
                                            type="text"
                                            value={clanDeleteConfirmationText}
                                            onChange={(event) =>
                                                setClanDeleteConfirmationText(
                                                    event.target.value,
                                                )
                                            }
                                            autoComplete="off"
                                            spellCheck={false}
                                            disabled={clanDeleteSubmitting}
                                            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-stone-500 focus:border-rose-400/50 focus:bg-white/7 disabled:cursor-not-allowed disabled:opacity-60"
                                            placeholder="BORRAR"
                                        /></LocalizedLabel>
                                    </label>

                                    <div className="mt-6 flex justify-end gap-3">
                                        <button
                                            type="button"
                                            onClick={closeClanDeleteDialog}
                                            disabled={clanDeleteSubmitting}
                                            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-stone-200 transition hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                                        >{localizeKey("common.cancel")}</button>
                                        <button
                                            type="button"
                                            onClick={handleDeleteClan}
                                            disabled={
                                                clanDeleteSubmitting ||
                                                !["BORRAR", "DELETE"].includes(clanDeleteConfirmationText.trim())
                                            }
                                            className="rounded-full border border-rose-400/35 bg-rose-500/15 px-4 py-2 text-sm font-medium text-rose-100 transition hover:border-rose-400/55 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {clanDeleteSubmitting
                                                ? localizeKey("characters.deleting")
                                                : localizeKey("characters.deleteConfirm")}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {isHotkeySettingsOpen ? (
                <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/45 px-4 backdrop-blur-[3px]">
                    <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-amber-200/20 bg-[#120c08]/95 text-stone-100 shadow-[0_28px_90px_rgba(0,0,0,0.55)]">
                        <div className="flex items-start justify-between gap-4 border-b border-amber-200/10 bg-[linear-gradient(180deg,rgba(127,78,35,0.28),rgba(18,12,8,0))] px-5 py-4">
                            <div>
                                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-amber-300/72">
                                    <Settings2
                                        aria-hidden="true"
                                        className="h-3.5 w-3.5"
                                        strokeWidth={1.9}
                                    />
                                    <p>Hotkeys</p>
                                </div>
                                <h3 className="mt-1 text-xl font-semibold text-[#f2e5ca]"><LocalizedText source={"Configuración de teclas "} /></h3>
                            </div>
                            <LocalizedLabel><button
                                type="button"
                                onClick={() => setIsHotkeySettingsOpen(false)}
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-700 bg-black/20 text-stone-300 transition hover:border-stone-500 hover:text-white"
                                aria-label="Cerrar configuracion"
                            >
                                <X
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                    strokeWidth={1.8}
                                />
                            </button></LocalizedLabel>
                        </div>

                        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
                            <div className="space-y-4">
                                {HOTKEY_SECTIONS.map((section) => (
                                    <section
                                        key={section.title}
                                        className="rounded-[22px] border border-[#4f3926] bg-[#19110d]/92 p-4"
                                    >
                                        <h4 className="text-[11px] uppercase tracking-[0.26em] text-amber-200/78">
                                            <LocalizedText source={section.title} />
                                        </h4>
                                        <div className="mt-3 space-y-3">
                                            {section.items.map((item) => (
                                                <div
                                                    key={item.action}
                                                    className="rounded-[18px] border border-white/6 bg-black/20 px-3 py-3"
                                                >
                                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                                        <div className="min-w-0 md:max-w-[52%]">
                                                            <p className="text-sm font-semibold text-stone-100">
                                                                {localizeText(item.label)}
                                                            </p>
                                                            <p className="mt-1 text-xs leading-5 text-stone-400">
                                                                <LocalizedText source={item.description} />
                                                            </p>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2 md:justify-end">
                                                            {Array.from(
                                                                {
                                                                    length: item.slots,
                                                                },
                                                                (
                                                                    _,
                                                                    slotIndex,
                                                                ) => {
                                                                    const code =
                                                                        hotkeySettings[
                                                                            item
                                                                                .action
                                                                        ];
                                                                    const isListening =
                                                                        listeningBinding?.action ===
                                                                            item.action &&
                                                                        listeningBinding.slotIndex ===
                                                                            slotIndex;

                                                                    return (
                                                                        <button
                                                                            key={`${item.action}-${slotIndex}`}
                                                                            type="button"
                                                                            onClick={() =>
                                                                                setListeningBinding(
                                                                                    {
                                                                                        action: item.action,
                                                                                        slotIndex,
                                                                                    },
                                                                                )
                                                                            }
                                                                            className={`min-w-[132px] rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                                                                                isListening
                                                                                    ? "border-cyan-300/60 bg-cyan-300/10 text-cyan-100"
                                                                                    : "border-amber-200/15 bg-[#241813] text-stone-100 hover:border-amber-300/45 hover:bg-[#2f1d14]"
                                                                            }`}
                                                                        >
                                                                            <LocalizedText source={isListening
                                                                                ? "Presiona una tecla"
                                                                                : code.length
                                                                                  ? formatHotkeyBinding(
                                                                                        code,
                                                                                    )
                                                                                  : "Sin asignar"} />
                                                                        </button>
                                                                    );
                                                                },
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 border-t border-amber-200/10 px-5 py-4 text-xs text-stone-400 md:flex-row md:items-center md:justify-between">
                            <p><LocalizedText source={"Click en una tecla para reasignarla. `Esc` cancela la captura y `Backspace` o `Delete` limpian el atajo. "} /></p>
                            {hotkeyError ? (
                                <p className="text-rose-300"><LocalizedText source={hotkeyError} /></p>
                            ) : null}
                            <button
                                type="button"
                                onClick={() =>
                                    onHotkeySettingsChange(
                                        cloneHotkeySettings(),
                                    )
                                }
                                className="rounded-2xl border border-amber-300/30 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-300/55 hover:bg-amber-200/10"
                            ><LocalizedText source={"Restaurar defaults "} /></button>
                        </div>
                    </div>
                </div>
            ) : null}

            {draggedInventoryItem ? (
                <div
                    className="pointer-events-none fixed z-[83]"
                    style={{
                        left: dragPointer.x,
                        top: dragPointer.y,
                        transform: "translate(-50%, -50%)",
                    }}
                >
                    <div className="relative flex h-11 w-11 items-center justify-center rounded-[8px] border border-amber-300/55 bg-[#2b2016]/90 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
                        <ItemGraphic
                            graphicData={
                                graphicsDB?.[
                                    draggedInventoryItem.grhIndex.toString()
                                ]
                            }
                            name={draggedInventoryItem.name}
                        />
                        {draggedInventoryItem.amount > 1 ? (
                            <span className="pointer-events-none absolute left-1 top-0.5 text-[10px] font-bold text-stone-100 drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">
                                {formatNumber(draggedInventoryItem.amount)}
                            </span>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {clanMemberActionMenu && clanMemberActionTarget
                ? createPortal(
                      <div
                          className="fixed inset-0 z-[86]"
                          onClick={() => setClanMemberActionMenu(null)}
                      >
                          <div
                              className="absolute flex min-w-[190px] flex-col gap-2 rounded-[14px] border border-white/10 bg-[#1b140f]/95 p-2 shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur-sm"
                              style={{
                                  left: clanMemberActionMenu.left,
                                  top: clanMemberActionMenu.top,
                                  transform: "translate(-100%, 8px)",
                              }}
                              onClick={(event) => event.stopPropagation()}
                          >
                              <button
                                  type="button"
                                  onClick={() =>
                                      handleTransferClanLeadership(
                                          clanMemberActionTarget.characterId,
                                          clanMemberActionTarget.name,
                                      )
                                  }
                                  disabled={Boolean(
                                      clanLeadershipTransferActionId,
                                  )}
                                  className="rounded-[10px] border border-amber-700/60 bg-amber-950/55 px-3 py-2 text-left text-[11px] font-semibold text-amber-100 transition hover:border-amber-500 disabled:cursor-not-allowed disabled:border-stone-700 disabled:bg-stone-900 disabled:text-stone-400"
                              >
                                  <LocalizedText source={clanLeadershipTransferActionId ===
                                  clanMemberActionTarget.characterId
                                      ? localizeKey("auth.pending")
                                      : "Transferir liderazgo"} />
                              </button>
                              <button
                                  type="button"
                                  onClick={() =>
                                      handleClanRoleChange(
                                          clanMemberActionTarget.characterId,
                                          clanMemberActionTarget.role ===
                                              "co_leader"
                                              ? "member"
                                              : "co_leader",
                                      )
                                  }
                                  disabled={Boolean(clanRoleActionId)}
                                  className="rounded-[10px] border border-sky-700/60 bg-sky-950/60 px-3 py-2 text-left text-[11px] font-semibold text-sky-100 transition hover:border-sky-500 disabled:cursor-not-allowed disabled:border-stone-700 disabled:bg-stone-900 disabled:text-stone-400"
                              >
                                  {clanRoleActionId ===
                                  clanMemberActionTarget.characterId
                                      ? localizeKey("auth.pending")
                                      : clanMemberActionTarget.role ===
                                          "co_leader"
                                        ? <LocalizedText source={"Quitar co-lider"} />
                                        : <LocalizedText source={"Hacer co-lider"} />}
                              </button>
                              <LocalizedLabel><button
                                  type="button"
                                  onClick={() =>
                                      handleClanKick(
                                          clanMemberActionTarget.characterId,
                                          clanMemberActionTarget.name,
                                      )
                                  }
                                  aria-label={`Echar a ${clanMemberActionTarget.name}`}
                                  disabled={Boolean(clanKickActionId)}
                                  className="rounded-[10px] border border-rose-700/60 bg-rose-950/70 px-3 py-2 text-left text-[11px] font-semibold text-rose-100 transition hover:border-rose-500 disabled:cursor-not-allowed disabled:border-stone-700 disabled:bg-stone-900 disabled:text-stone-400"
                              >
                                  <LocalizedText source={clanKickActionId ===
                                  clanMemberActionTarget.characterId
                                      ? localizeKey("auth.pending")
                                      : "Echar"} />
                              </button></LocalizedLabel>
                          </div>
                      </div>,
                      portalTarget ?? document.body,
                  )
                : null}

            {isSpellInfoOpen && selectedSpell ? (
                <div
                    className="fixed inset-0 z-[84] flex items-center justify-center bg-black/50 px-4 backdrop-blur-[3px]"
                    onClick={() => setIsSpellInfoOpen(false)}
                >
                    <div
                        className="w-full max-w-md overflow-hidden rounded-[26px] border border-amber-200/20 bg-[#120c08]/95 text-stone-100 shadow-[0_28px_90px_rgba(0,0,0,0.55)]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-amber-200/10 bg-[linear-gradient(180deg,rgba(127,78,35,0.28),rgba(18,12,8,0))] px-5 py-4">
                            <div>
                                <p className="text-[11px] uppercase tracking-[0.28em] text-amber-300/72">{localizeText("Hechizo")}</p>
                                <h3 className="mt-1 text-xl font-semibold text-[#f2e5ca]">
                                    {localizeText(selectedSpell.name)}
                                </h3>
                            </div>
                            <LocalizedLabel><button
                                type="button"
                                onClick={() => setIsSpellInfoOpen(false)}
                                className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-700 bg-black/20 text-stone-300 transition hover:border-stone-500 hover:text-white"
                                aria-label={localizeText("Cerrar informacion del hechizo")}
                            >
                                <X
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                    strokeWidth={1.8}
                                />
                            </button></LocalizedLabel>
                        </div>

                        <div className="space-y-4 px-5 py-4">
                            <div className="rounded-[18px] border border-[#4f3926] bg-[#19110d]/92 p-4">
                                <div className="flex items-center justify-between gap-4 text-sm">
                                    <span className="text-stone-300">{localizeKey("hud.manaCost")}</span>
                                    <span className="font-semibold text-amber-100">
                                        {selectedSpell.manaRequired}
                                    </span>
                                </div>

                                {selectedSpellRequiredLevel ? (
                                    <div className="mt-3 flex items-center justify-between gap-4 text-sm">
                                        <span className="text-stone-300"><LocalizedText source={"Nivel requerido "} /></span>
                                        <span className="font-semibold text-amber-100">
                                            {selectedSpellRequiredLevel}
                                        </span>
                                    </div>
                                ) : null}

                                {selectedSpellDamageLabel ? (
                                    <div className="mt-3 flex items-center justify-between gap-4 text-sm">
                                        <span className="text-stone-300">{localizeKey("hud.damage")}</span>
                                        <span className="font-semibold text-amber-100">
                                            {selectedSpellDamageLabel}
                                        </span>
                                    </div>
                                ) : null}

                                {selectedSpellData?.desc ? (
                                    <p className="mt-4 text-sm leading-6 text-stone-300/92">
                                        {localizeText(selectedSpellData.desc)}
                                    </p>
                                ) : null}
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsSpellInfoOpen(false)}
                                className="w-full rounded-2xl bg-amber-300 px-4 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-200"
                            >{localizeKey("common.close")}</button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
