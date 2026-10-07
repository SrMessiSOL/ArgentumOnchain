"use client";
import { LocalizedText, LocalizedLabel } from '@/components/LocalizedText';
import { translateSource, type Locale } from "@/lib/i18n";
import { localizeConsoleEntry } from "@/lib/game-i18n";
import { useI18n } from "@/components/I18nProvider";

import Link from "next/link";
import {logoutFeedback} from "@/lib/logout-state";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Maximize2, Minimize2 } from "lucide-react";
import React, {
    Suspense,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { MapRenderer } from "../../components/game";
import AdminIntervalsModal from "../../components/AdminIntervalsModal";
import BuffStatusSidebar from "../../components/BuffStatusSidebar";
import InventoryFloatingPanel from "../../components/InventoryFloatingPanel";
import MacroBar from "../../components/MacroBar";
import BailModal from "../../components/BailModal";
import CharacterStatsModal from "../../components/CharacterStatsModal";
import CraftingModal from "../../components/CraftingModal";
import MarketModal from "../../components/MarketModal";
import RetosModal from "../../components/RetosModal";
import TradeModal from "../../components/TradeModal";
import {
    createEmptyMacros,
    normalizeCharacterSettings,
    type CharacterSettingsResponse,
    type StoredMacro,
} from "../../lib/character-settings";
import {
    DEFAULT_HOTKEY_SETTINGS,
    formatHotkeyBinding,
    type HotkeySettings,
} from "../../lib/hotkeys";
import type {
    BailOffer,
    CraftingState,
    CharacterStatsSnapshot,
    ChatChannel,
    MarketPriceSort,
    PanelSnapshot,
    MarketState,
    PlayerHudState,
    RetosState,
    TradeItem,
    TradeState,
} from "../../lib/aowProtocol";
import type { AuthErrorResponse } from "../../lib/auth";
import type {
    ArenaGameTicketResponse,
    ArenaRoomDetails,
} from "../../lib/arenas";
import {
    applyRuntimeTimingEnvironmentOverrides,
    mergeClientRuntimeTiming,
    type ClientRuntimeConfigResponse,
    DEFAULT_RUNTIME_TIMING,
    type RuntimeConfigResponse,
    type RuntimeTimingConfig,
} from "../../lib/runtime-config";
import { useAuthRedirect } from "../../hooks/useAuthRedirect";
import {
    VIEWPORT_PIXEL_HEIGHT,
    VIEWPORT_PIXEL_WIDTH,
} from "../../lib/viewport";

const DEFAULT_WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:7666";
const OverviewModal = dynamic(() => import("../../components/OverviewModal"), {
    ssr: false,
});
const CANVAS_BASE_WIDTH = VIEWPORT_PIXEL_WIDTH;
const CANVAS_BASE_HEIGHT = VIEWPORT_PIXEL_HEIGHT;
const HUD_GAP = 10;
const RIGHT_PANEL_WIDTH = 320;
const DESKTOP_CONSOLE_HEIGHT = 126;
const MACRO_BAR_ESTIMATED_HEIGHT = 80;
const RIGHT_COLUMN_ACTIONS_ESTIMATED_HEIGHT = 112;
const SHELL_VERTICAL_PADDING = 48;
const SHELL_TOP_PADDING_FULLSCREEN = 0;
const SHELL_BOTTOM_PADDING_FULLSCREEN = 0;
const SHELL_HORIZONTAL_PADDING = 24;
const SHELL_HORIZONTAL_PADDING_FULLSCREEN = 16;
const COLUMN_SECTION_GAP = 12;
const MAX_FULLSCREEN_HUD_SCALE = 1.5;
const FULLSCREEN_HINT_DURATION_MS = 2600;
const FULLSCREEN_PROMPT_MAX_WIDTH = 1200;
const FULLSCREEN_PROMPT_MAX_HEIGHT = 900;
const PLAY_HOTKEYS_HINT_STORAGE_KEY = "ao-play-hotkeys-hint-dismissed";
const PLAY_SOUND_VOLUME_STORAGE_KEY = "ao-play-sound-volume";
const LOGOUT_STARTED_MESSAGE =
    "[Servidor] Debes permanecer quieto durante 10 segundos para salir. Si te mueves, la salida se cancelarÃƒÂ¡.";
const LOGOUT_CANCELLED_PATTERN = /^\[Servidor\] La salida se cancelÃƒÂ³ porque /;
const LOGOUT_DENIED_PATTERN = /^\[Servidor\] No puedes salir /;
const LOGOUT_CLOSING_MESSAGE = "[Servidor] Cerrando sesiÃƒÂ³n...";
const LOGOUT_DELAY_MS = 10000;
const CHALLENGE_INSTANCE_MAP_START = 2000;
const RETOS_INFO_MESSAGES = new Set([
    "[Retos] Reto publicado.",
    "[Retos] Reto cancelado.",
    "[Retos] Reto aceptado.",
]);
const RETOS_ERROR_MESSAGES = new Set([
    "Solo puedes usar retos en Mundo Abierto.",
    "No puedes usar retos mientras estÃƒÂ¡s muerto.",
    "Solo puedes usar retos estando en zona segura.",
    "Ese personaje ya estÃƒÂ¡ participando en otro reto.",
    "Para crear o unirte a un reto 2vs2 debes estar en una party de 2.",
    "Solo el lÃƒÂ­der de la party puede crear o aceptar retos 2vs2.",
    "El reto 2vs2 requiere una party exacta de 2 personajes.",
    "Todos los miembros de la party deben estar conectados para el reto 2vs2.",
    "Debes estar conectado para usar retos.",
    "El modo de reto es invÃƒÂ¡lido.",
    "El reto ya no estÃƒÂ¡ disponible.",
    "Solo puedes cancelar tu propio reto.",
    "El retador ya no estÃƒÂ¡ disponible.",
    "No puedes aceptar tu propio reto.",
]);
const CONSOLE_DISCORD_URL = "https://discord.gg/sf8rWAvgxs";
const CONSOLE_FEEDBACK_FORM_URL = "https://forms.gle/Df2cmGExTBjjJhAR8";
const WELCOME_CONSOLE_MESSAGES = {
    discord:
        "Bienvenido a AOCHAIN. Si quieres enterarte de las ÃƒÂºltimas actualizaciones del juego, puedes ingresar a nuestro Discord.",
    feedback:
        "- Si quieres reportar erorres o sugerir cambios, puedes hacerlo en: https://forms.gle/Df2cmGExTBjjJhAR8",
    rules: "- EstÃƒÂ¡ completamente prohibido el uso de personajes cÃƒÂ¡mara, cheats o cualquier programa externo que modifique el juego, como auto tomar pociones o auto removerse. El uso de los mismos terminarÃƒÂ¡ en un ban permanente, sin previo aviso.",
} as const;
const CHALLENGE_OVERLAY_PATTERN = /^\[Reto\]\s+(10|[0-9]|YA)$/;

function isPrivateHostname(hostname: string): boolean {
    return (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "0.0.0.0" ||
        hostname.startsWith("10.") ||
        hostname.startsWith("192.168.") ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    );
}

function resolveWebSocketUrl(configuredUrl: string): string {
    if (typeof window === "undefined") {
        return configuredUrl;
    }

    const pageProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    if (configuredUrl.startsWith("/") && !configuredUrl.startsWith("//")) {
        return `${pageProtocol}//${window.location.host}${configuredUrl}`;
    }

    try {
        const configured = new URL(configuredUrl);
        const currentHost = window.location.hostname;

        if (configured.hostname === currentHost) {
            configured.protocol = pageProtocol;
            return configured.toString();
        }

        if (
            isPrivateHostname(configured.hostname) &&
            !isPrivateHostname(currentHost)
        ) {
            return `${pageProtocol}//${window.location.host}/game-socket`;
        }

        return configuredUrl;
    } catch {
        return `${pageProtocol}//${window.location.host}/game-socket`;
    }
}

type HudLayout = {
    canvasWidth?: number;
    canvasHeight?: number;
};

type RendererStatus = {
    connected: boolean;
    connecting: boolean;
    worldName?: string;
    error?: string;
    consoleLine?: string;
};

type ConnectionForm = {
    wsUrl: string;
    ticket: string;
    typeGame?: number;
    idChar?: number;
};

type GameTicketResponse = {
    ticket: string;
    expiresAt: string;
};

type MeasuredHudSize = {
    width: number;
    height: number;
};

type ScaledHudFrameProps = {
    scale: number;
    baseWidth?: number;
    onMeasure?: (size: MeasuredHudSize) => void;
    children: React.ReactNode;
};

type EquipRequest = {
    slot: number;
    token: number;
};

type UseRequest = {
    slot: number;
    token: number;
};

type DropRequest = {
    slot: number;
    amount: number;
    token: number;
};

type BuyRequest = {
    slot: number;
    amount: number;
    token: number;
};

type SellRequest = {
    slot: number;
    amount: number;
    token: number;
};

type ChangeBankTabRequest = {
    tab: "character" | "account" | "clan";
    token: number;
};

type BankGoldRequest = {
    amount: number;
    token: number;
};

type CloseTradeRequest = {
    token: number;
};

type MarketActionRequest = {
    action: "refresh" | "create" | "buy" | "cancel" | "claim";
    payload?: Record<string, unknown>;
    token: number;
};

type MarketBrowseRequest = {
    listingLimit: number;
    search?: string;
    objType?: number | null;
    sortPrice?: MarketPriceSort;
};

type CraftRequest = {
    profession: "carpentry" | "blacksmith" | "tailoring";
    itemId: number;
    amount: number;
    token: number;
};

type ReorderInventoryRequest = {
    sourceSlot: number;
    targetSlot: number;
    token: number;
};

type ReorderSpellRequest = {
    sourceSlot: number;
    targetSlot: number;
    token: number;
};

type ReorderBankRequest = {
    sourceSlot: number;
    targetSlot: number;
    token: number;
};

type RangeAttackRequest = {
    token: number;
};

type SpellTargetRequest = {
    slot: number;
    manaRequired: number;
    name: string;
    token: number;
};

type ChatRequest = {
    message: string;
    token: number;
};

type ConsoleEntry = {
    id: number;
    text: string;
    color?: string;
    source: "console" | "dialog" | "system";
    speakerType?: "npc" | "user";
    channel?: ChatChannel;
    senderName?: string;
    npcName?: string;
};

type GlobalCanvasNotice = {
    id: number;
    text: string;
    durationMs: number;
};

type ChatTab = ChatChannel;
type NotifiableChatTab = Extract<ChatTab, "party" | "clan" | "whisper">;
type ChatEntriesByTab = Record<ChatTab, ConsoleEntry[]>;

const CHAT_TABS: Array<{ id: ChatTab; label: string }> = [
    { id: "console", label: "Consola" },
    { id: "global", label: "Global" },
    { id: "party", label: "Party" },
    { id: "clan", label: "Clan" },
    { id: "whisper", label: "Privados" },
];

function parseWhisperPartnerFromEntry(
    text: string,
    currentUserName?: string | null,
): string | null {
    const sentMatch = text.match(/^\[Privado\]\s+(.+?)\s+->\s+(.+?):\s+/i);

    if (sentMatch) {
        const from = sentMatch[1]?.trim();
        const to = sentMatch[2]?.trim();

        if (currentUserName && from === currentUserName) {
            return to || null;
        }

        if (currentUserName && to === currentUserName) {
            return from || null;
        }
    }

    const compactMatch = text.match(/^\[Privado\]\s+(.+?):\s+/i);

    if (compactMatch) {
        const visibleName = compactMatch[1]?.trim();

        if (!visibleName) {
            return null;
        }

        if (
            currentUserName &&
            visibleName.toLocaleLowerCase() ===
                currentUserName.trim().toLocaleLowerCase()
        ) {
            return null;
        }

        return visibleName;
    }

    return null;
}

function parseWhisperTargetFromCommand(message: string): string | null {
    const match = message.match(/^\/w\s+"(.+?)"\s+.+$/i);
    return match?.[1]?.trim() || null;
}

function isOwnChatEntry(
    entryText: string,
    channel: ChatTab,
    currentUserName?: string | null,
    senderName?: string,
): boolean {
    if (!currentUserName) {
        return false;
    }

    const normalizedUserName = currentUserName.trim().toLocaleLowerCase();

    if (channel === "whisper" && senderName) {
        return senderName.trim().toLocaleLowerCase() === normalizedUserName;
    }

    const matchesSender = (sender: string | null) =>
        Boolean(
            sender && sender.trim().toLocaleLowerCase() === normalizedUserName,
        );

    if (channel === "party") {
        const match = entryText.match(/^\[Party\]\s+(.+?):\s+/i);
        return matchesSender(match?.[1] ?? null);
    }

    if (channel === "clan") {
        const match = entryText.match(/^\[Clan\]\s+(.+?):\s+/i);
        return matchesSender(match?.[1] ?? null);
    }

    if (channel === "whisper") {
        const legacyMatch = entryText.match(/^\[Privado\]\s+(.+?)\s+->\s+/i);

        if (legacyMatch) {
            return matchesSender(legacyMatch?.[1] ?? null);
        }

        const compactMatch = entryText.match(/^\[Privado\]\s+(.+?):\s+/i);
        return matchesSender(compactMatch?.[1] ?? null);
    }

    return false;
}

function buildChatMessageForTab(
    tab: ChatTab,
    rawMessage: string,
    lastWhisperTarget: string | null,
): {
    message: string | null;
    nextWhisperTarget: string | null;
    error: string | null;
} {
    const trimmedMessage = rawMessage.trim();

    if (trimmedMessage.startsWith("/")) {
        const whisperTarget = parseWhisperTargetFromCommand(trimmedMessage);

        return {
            message: trimmedMessage.length === 0 ? " " : trimmedMessage,
            nextWhisperTarget: whisperTarget,
            error: null,
        };
    }

    if (trimmedMessage.length === 0) {
        return { message: " ", nextWhisperTarget: null, error: null };
    }

    switch (tab) {
        case "global":
            return {
                message: trimmedMessage,
                nextWhisperTarget: null,
                error: null,
            };
        case "party":
            return {
                message: `/p ${trimmedMessage}`,
                nextWhisperTarget: null,
                error: null,
            };
        case "clan":
            return {
                message: `/c ${trimmedMessage}`,
                nextWhisperTarget: null,
                error: null,
            };
        case "whisper":
            if (!lastWhisperTarget) {
                return {
                    message: null,
                    nextWhisperTarget: null,
                    error: 'Usa /w "usuario" mensaje una vez para elegir destinatario.',
                };
            }

            return {
                message: `/w "${lastWhisperTarget}" ${trimmedMessage}`,
                nextWhisperTarget: lastWhisperTarget,
                error: null,
            };
        default:
            return {
                message: trimmedMessage,
                nextWhisperTarget: null,
                error: null,
            };
    }
}

function renderConsoleEntryText(text: string, locale: Locale) {
    if (text === WELCOME_CONSOLE_MESSAGES.discord || text === translateSource(WELCOME_CONSOLE_MESSAGES.discord,'en')) {
        const suffix = "Discord";
        const linkStart = text.indexOf(suffix);
        const prefix = text.slice(0, linkStart);
        const ending = text.slice(linkStart + suffix.length);

        return (
            <>
                {translateSource(prefix, locale)}
                <a
                    href={CONSOLE_DISCORD_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-sky-300 underline underline-offset-2 hover:text-sky-200"
                >
                    {suffix}
                </a>
                {ending}
            </>
        );
    }

    if (text === WELCOME_CONSOLE_MESSAGES.feedback || text === translateSource(WELCOME_CONSOLE_MESSAGES.feedback,'en')) {
        const url = CONSOLE_FEEDBACK_FORM_URL;
        const prefix = text.slice(0, -url.length);

        return (
            <>
                {translateSource(prefix, locale)}
                <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-sky-300 underline underline-offset-2 hover:text-sky-200"
                >
                    {url}
                </a>
            </>
        );
    }

    return text;
}

function createEmptyUnreadChatCounts(): Record<NotifiableChatTab, number> {
    return {
        party: 0,
        clan: 0,
        whisper: 0,
    };
}

function createEmptyChatEntriesByTab(): ChatEntriesByTab {
    return {
        console: [],
        local: [],
        global: [],
        party: [],
        clan: [],
        whisper: [],
    };
}

const MAX_CONSOLE_ENTRIES = 75;

function setTimingValueByPath(
    timing: RuntimeTimingConfig,
    path: string,
    value: number,
): RuntimeTimingConfig {
    const clone = JSON.parse(JSON.stringify(timing)) as RuntimeTimingConfig;
    const segments = path.split(".");
    let current: Record<string, unknown> = clone as Record<string, unknown>;

    for (let index = 0; index < segments.length - 1; index += 1) {
        current = current[segments[index]] as Record<string, unknown>;
    }

    current[segments[segments.length - 1]] = value;
    return clone;
}

function ScaledHudFrame({
    scale,
    baseWidth,
    onMeasure,
    children,
}: ScaledHudFrameProps) {
    const innerRef = useRef<HTMLDivElement | null>(null);
    const lastReportedSizeRef = useRef<MeasuredHudSize | null>(null);
    const [measuredSize, setMeasuredSize] = useState({
        width: baseWidth ?? 0,
        height: 0,
    });

    useEffect(() => {
        const element = innerRef.current;
        if (!element) {
            return;
        }

        const normalizedScale = scale || 1;

        const updateSize = () => {
            const rect = element.getBoundingClientRect();
            const nextWidth =
                baseWidth ?? Math.round(rect.width / normalizedScale);
            const nextHeight = Math.round(rect.height / normalizedScale);
            const nextSize = {
                width: nextWidth,
                height: nextHeight,
            };

            const lastReportedSize = lastReportedSizeRef.current;
            const didSizeChange =
                !lastReportedSize ||
                lastReportedSize.width !== nextSize.width ||
                lastReportedSize.height !== nextSize.height;

            if (didSizeChange) {
                lastReportedSizeRef.current = nextSize;
                onMeasure?.(nextSize);
            }

            setMeasuredSize((current) => {
                if (
                    current.width === nextWidth &&
                    current.height === nextHeight
                ) {
                    return current;
                }

                return nextSize;
            });
        };

        updateSize();

        const observer = new ResizeObserver(() => {
            updateSize();
        });

        observer.observe(element);
        return () => observer.disconnect();
    }, [baseWidth, onMeasure, scale]);

    const frameWidth = (measuredSize.width || baseWidth || 0) * scale;
    const frameHeight = measuredSize.height * scale;

    return (
        <div
            className="relative"
            style={{
                width: frameWidth || undefined,
                height: frameHeight || undefined,
                flexShrink: 0,
            }}
        >
            <div
                ref={innerRef}
                style={{
                    width: baseWidth ? `${baseWidth}px` : undefined,
                    zoom: scale,
                }}
            >
                {children}
            </div>
        </div>
    );
}

function HomeContent() {
    const { locale, t: localizeKey, text: localizeText } = useI18n();

    const router = useRouter();
    const searchParams = useSearchParams();
    const arenaRoomId = searchParams.get("room")?.trim() || "";
    const arenaTicket = searchParams.get("ticket")?.trim() || "";
    const arenaMode = searchParams.get("mode") === "arena";
    const arenaTemplateId = Number(searchParams.get("idChar") || "0");
    const [status, setStatus] = useState<RendererStatus>({
        connected: false,
        connecting: false,
    });
    const { session: authSession } = useAuthRedirect({
        redirectTo: "/login",
        when: "unauthenticated",
        preserveRedirect: true,
    });
    const selectedCharacter = useMemo(
        () =>
            authSession?.characters.find(
                (character) =>
                    character._id === authSession.selectedCharacterId,
            ) ?? null,
        [authSession],
    );
    const [selectedMap, setSelectedMap] = useState(
        () => selectedCharacter?.map ?? 1,
    );
    const [form, setForm] = useState<ConnectionForm>({
        wsUrl: DEFAULT_WS_URL,
        ticket: "",
    });
    const [connectionSeed, setConnectionSeed] = useState(0);
    const [activeConnection, setActiveConnection] =
        useState<ConnectionForm | null>(null);
    const [hud, setHud] = useState<PlayerHudState | null>(null);
    const [equipRequest, setEquipRequest] = useState<EquipRequest | null>(null);
    const [useItemClickRequest, setUseItemClickRequest] =
        useState<UseRequest | null>(null);
    const [useItemURequest, setUseItemURequest] = useState<UseRequest | null>(
        null,
    );
    const [dropRequest, setDropRequest] = useState<DropRequest | null>(null);
    const [buyRequest, setBuyRequest] = useState<BuyRequest | null>(null);
    const [sellRequest, setSellRequest] = useState<SellRequest | null>(null);
    const [changeBankTabRequest, setChangeBankTabRequest] =
        useState<ChangeBankTabRequest | null>(null);
    const [depositBankGoldRequest, setDepositBankGoldRequest] =
        useState<BankGoldRequest | null>(null);
    const [withdrawBankGoldRequest, setWithdrawBankGoldRequest] =
        useState<BankGoldRequest | null>(null);
    const [closeTradeRequest, setCloseTradeRequest] =
        useState<CloseTradeRequest | null>(null);
    const [marketActionRequest, setMarketActionRequest] =
        useState<MarketActionRequest | null>(null);
    const [craftRequest, setCraftRequest] = useState<CraftRequest | null>(null);
    const [reorderInventoryRequest, setReorderInventoryRequest] =
        useState<ReorderInventoryRequest | null>(null);
    const [reorderSpellRequest, setReorderSpellRequest] =
        useState<ReorderSpellRequest | null>(null);
    const [reorderBankRequest, setReorderBankRequest] =
        useState<ReorderBankRequest | null>(null);
    const [rangeAttackRequest, setRangeAttackRequest] =
        useState<RangeAttackRequest | null>(null);
    const [selectedSpellSlot, setSelectedSpellSlot] = useState<number | null>(
        null,
    );
    const [spellTargetRequest, setSpellTargetRequest] =
        useState<SpellTargetRequest | null>(null);
    const [chatRequest, setChatRequest] = useState<ChatRequest | null>(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatMessage, setChatMessage] = useState("");
    const [isChatMenuOpen, setIsChatMenuOpen] = useState(false);
    const isConsoleOpen = true;
    const [lastWhisperTarget, setLastWhisperTarget] = useState<string | null>(
        null,
    );
    const [unreadChatCounts, setUnreadChatCounts] = useState<
        Record<NotifiableChatTab, number>
    >(createEmptyUnreadChatCounts);
    const [tradeState, setTradeState] = useState<TradeState | null>(null);
    const [marketState, setMarketState] = useState<MarketState | null>(null);
    const [retosState, setRetosState] = useState<RetosState | null>(null);
    const [tradeStatusMessage, setTradeStatusMessage] = useState<string | null>(
        null,
    );
    const [retosOpen, setRetosOpen] = useState(false);
    const [retosLoading, setRetosLoading] = useState(false);
    const [retosActionKey, setRetosActionKey] = useState<string | null>(null);
    const [retosError, setRetosError] = useState<string | null>(null);
    const [retosInfo, setRetosInfo] = useState<string | null>(null);
    const [retosActionRequest, setRetosActionRequest] = useState<{
        action: "refresh" | "create" | "join" | "cancel";
        payload?: Record<string, unknown>;
        token: number;
    } | null>(null);
    const [challengeOverlayText, setChallengeOverlayText] = useState<
        string | null
    >(null);
    const [globalCanvasNotice, setGlobalCanvasNotice] =
        useState<GlobalCanvasNotice | null>(null);
    const [bailState, setBailState] = useState<BailOffer | null>(null);
    const [craftingState, setCraftingState] = useState<CraftingState | null>(
        null,
    );
    const [chatEntriesByTab, setChatEntriesByTab] = useState<ChatEntriesByTab>(
        createEmptyChatEntriesByTab,
    );
    const [activeChatTab, setActiveChatTab] = useState<ChatTab>("console");
    const [logoutPending, setLogoutPending] = useState(false);
    const [logoutDeadline, setLogoutDeadline] = useState<number | null>(null);
    const [logoutSecondsRemaining, setLogoutSecondsRemaining] = useState(0);
    const [pendingExitHref, setPendingExitHref] = useState<string | null>(null);
    const [hotkeySettings, setHotkeySettings] = useState<HotkeySettings>(
        DEFAULT_HOTKEY_SETTINGS,
    );
    const [macros, setMacros] =
        useState<Array<StoredMacro | null>>(createEmptyMacros());
    const [isCharacterSettingsLoading, setIsCharacterSettingsLoading] =
        useState(true);
    const tradeStateRef = useRef<TradeState | null>(null);
    const globalCanvasNoticeTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        tradeStateRef.current = tradeState;
    }, [tradeState]);

    useEffect(() => {
        return () => {
            if (globalCanvasNoticeTimeoutRef.current !== null) {
                window.clearTimeout(globalCanvasNoticeTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (globalCanvasNoticeTimeoutRef.current !== null) {
            window.clearTimeout(globalCanvasNoticeTimeoutRef.current);
            globalCanvasNoticeTimeoutRef.current = null;
        }

        if (!globalCanvasNotice) {
            return;
        }

        globalCanvasNoticeTimeoutRef.current = window.setTimeout(() => {
            setGlobalCanvasNotice((current) =>
                current?.id === globalCanvasNotice.id ? null : current,
            );
            globalCanvasNoticeTimeoutRef.current = null;
        }, globalCanvasNotice.durationMs);
    }, [globalCanvasNotice]);

    useEffect(() => {
        if (!tradeState) {
            setTradeStatusMessage(null);
            return;
        }

        setMarketState(null);
    }, [tradeState]);
    useEffect(() => {
        if (!marketState) {
            return;
        }

        setTradeState(null);
        setTradeStatusMessage(null);
    }, [marketState]);
    useEffect(() => {
        if (!retosState) {
            return;
        }

        setRetosLoading(false);
        setRetosActionKey(null);
    }, [retosState]);
    const [soundVolume, setSoundVolume] = useState(1);
    const hasInitializedSoundVolumeRef = useRef(false);
    const hasSkippedInitialSoundVolumePersistRef = useRef(false);
    const [runtimeTiming, setRuntimeTiming] = useState<RuntimeTimingConfig>(
        DEFAULT_RUNTIME_TIMING,
    );
    const useItemRepeatMs = Math.max(
        1,
        Math.round(runtimeTiming.actionCooldowns.useItemMs / 5),
    );
    const [adminIntervalsOpen, setAdminIntervalsOpen] = useState(false);
    const [adminIntervalsSavingPath, setAdminIntervalsSavingPath] = useState<
        string | null
    >(null);
    const [overviewOpen, setOverviewOpen] = useState(false);
    const [overviewRefreshing, setOverviewRefreshing] = useState(false);
    const [overviewSnapshot, setOverviewSnapshot] =
        useState<PanelSnapshot | null>(null);
    const [characterStatsOpen, setCharacterStatsOpen] = useState(false);
    const [characterStatsSnapshot, setCharacterStatsSnapshot] =
        useState<CharacterStatsSnapshot | null>(null);
    const [characterStatsLoading, setCharacterStatsLoading] = useState(false);
    const [isHotkeyIntroOpen, setIsHotkeyIntroOpen] = useState(false);
    const [deathHomePromptOpen, setDeathHomePromptOpen] = useState(false);
    const [arenaLeavePending, setArenaLeavePending] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [fullscreenError, setFullscreenError] = useState<string | null>(null);
    const [showFullscreenHint, setShowFullscreenHint] = useState(false);
    const [showFullscreenPrompt, setShowFullscreenPrompt] = useState(false);
    const [topHudSectionSize, setTopHudSectionSize] = useState<MeasuredHudSize>(
        {
            width: CANVAS_BASE_WIDTH + 156 + HUD_GAP,
            height: DESKTOP_CONSOLE_HEIGHT,
        },
    );
    const [macroBarSize, setMacroBarSize] = useState<MeasuredHudSize>({
        width: CANVAS_BASE_WIDTH,
        height: MACRO_BAR_ESTIMATED_HEIGHT,
    });
    const [rightColumnSize, setRightColumnSize] = useState<MeasuredHudSize>({
        width: RIGHT_PANEL_WIDTH,
        height: CANVAS_BASE_HEIGHT + RIGHT_COLUMN_ACTIONS_ESTIMATED_HEIGHT,
    });
    const [viewport, setViewport] = useState({
        width: 0,
        height: 0,
    });
    const lastConsoleEntryIdRef = useRef(0);
    const autoConnectKeyRef = useRef<string | null>(null);
    const activeChatTabRef = useRef<ChatTab>("console");
    const playerNameRef = useRef<string | null>(null);
    const chatInputRef = useRef<HTMLInputElement | null>(null);
    const chatFormRef = useRef<HTMLFormElement | null>(null);
    const consoleScrollRef = useRef<HTMLDivElement | null>(null);
    const loadedCharacterSettingsIdRef = useRef<string | null>(null);
    const lastSavedCharacterSettingsRef = useRef<string | null>(null);
    const previousDeadRef = useRef<boolean | null>(null);
    const gameShellRef = useRef<HTMLDivElement | null>(null);
    const [gameShellElement, setGameShellElement] =
        useState<HTMLDivElement | null>(null);
    const fullscreenPromptWasEvaluatedRef = useRef(false);
    const statusRef = useRef(status);
    const hudRef = useRef(hud);
    const selectedMapRef = useRef(selectedMap);
    const selectedCharacterRef = useRef(selectedCharacter ?? null);
    const setGameShellNode = useCallback((node: HTMLDivElement | null) => {
        gameShellRef.current = node;
        setGameShellElement(node);
    }, []);

    const switchCharacterHref = arenaMode
        ? arenaRoomId
            ? `/arenas?room=${encodeURIComponent(arenaRoomId)}`
            : "/arenas"
        : "/characters";
    const switchCharacterLabel = arenaMode
        ? "Cambiar clase"
        : localizeKey("hud.changeCharacter");
    const deathHomeTitle = arenaMode
        ? "Volver al sacerdote"
        : "Volver a la ciudad";
    const deathHomeDescription = arenaMode
        ? "TambiÃƒÂ©n puedes volver al sacerdote con el comando /hogar"
        : "TambiÃƒÂ©n puedes volver con el comando /hogar";

    useEffect(() => {
        activeChatTabRef.current = activeChatTab;
    }, [activeChatTab]);

    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    useEffect(() => {
        hudRef.current = hud;
    }, [hud]);

    useEffect(() => {
        selectedMapRef.current = selectedMap;
    }, [selectedMap]);

    useEffect(() => {
        selectedCharacterRef.current = selectedCharacter ?? null;
    }, [selectedCharacter]);

    useEffect(() => {
        playerNameRef.current = hud?.nameCharacter ?? null;
    }, [hud?.nameCharacter]);

    useEffect(() => {
        if (status.connected || status.connecting) {
            return;
        }

        if (
            selectedCharacter?.map != null &&
            selectedCharacter.map !== selectedMap
        ) {
            setSelectedMap(selectedCharacter.map);
        }
    }, [
        selectedCharacter?.map,
        selectedMap,
        status.connected,
        status.connecting,
    ]);

    const connection = useMemo(() => {
        if (!activeConnection) {
            return null;
        }

        return {
            ...activeConnection,
            sessionKey: `${connectionSeed}`,
            typeGame: activeConnection.typeGame ?? 1,
            idChar: activeConnection.idChar ?? 0,
        };
    }, [activeConnection, connectionSeed]);

    const sendChatMessage = useCallback(
        (message: string) => {
            const trimmedMessage = message.trim();
            const normalizedMessage =
                trimmedMessage.length === 0 ? message : trimmedMessage;

            if (normalizedMessage.length === 0) {
                return false;
            }

            const commandText = trimmedMessage
                .split(/\s+/, 1)[0]
                ?.toLowerCase();

            if (commandText === "/estadisticas" || commandText === "/stats") {
                setCharacterStatsOpen(true);
                setCharacterStatsLoading(true);
                setCharacterStatsSnapshot(null);
            }

            if (
                ["/retos", "/challenges"].includes(commandText) &&
                ["/retos", "/challenges"].includes(trimmedMessage.toLowerCase())
            ) {
                setRetosOpen(true);
                return true;
            }

            setChatRequest((current) => ({
                message: normalizedMessage,
                token: (current?.token ?? 0) + 1,
            }));
            return true;
        },
        [],
    );

    const requestRetosState = useCallback(
        (
            action: "refresh" | "create" | "join" | "cancel",
            payload?: Record<string, unknown>,
        ) => {
            setRetosError(null);
            setRetosInfo(null);
            setRetosLoading(true);
            setRetosActionRequest((current) => ({
                action,
                payload,
                token: (current?.token ?? 0) + 1,
            }));
        },
        [],
    );

    useEffect(() => {
        if (!retosOpen) {
            return;
        }

        requestRetosState("refresh");
    }, [requestRetosState, retosOpen]);

    useEffect(() => {
        let cancelled = false;

        const loadRuntimeTiming = async () => {
            try {
                const response = await fetch("/api/runtime-config", {
                    cache: "no-store",
                });
                const result = (await response.json()) as
                    | ClientRuntimeConfigResponse
                    | AuthErrorResponse;

                if (!response.ok || cancelled || "error" in result) {
                    return;
                }

                setRuntimeTiming(mergeClientRuntimeTiming(result.timing));
            } catch {
                return;
            }
        };

        void loadRuntimeTiming();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const updateViewport = () => {
            setViewport({
                width: window.innerWidth,
                height: window.innerHeight,
            });
        };

        updateViewport();
        window.addEventListener("resize", updateViewport);
        return () => window.removeEventListener("resize", updateViewport);
    }, []);

    useEffect(() => {
        const handleFullscreenChange = () => {
            const shellElement = gameShellRef.current;
            const nextIsFullscreen =
                !!shellElement && document.fullscreenElement === shellElement;

            setIsFullscreen(nextIsFullscreen);
            if (nextIsFullscreen) {
                setFullscreenError(null);
            }
        };

        const handleFullscreenError = () => {
            setFullscreenError(
                "No se pudo activar pantalla completa en este navegador.",
            );
        };

        handleFullscreenChange();
        document.addEventListener("fullscreenchange", handleFullscreenChange);
        document.addEventListener("fullscreenerror", handleFullscreenError);

        return () => {
            document.removeEventListener(
                "fullscreenchange",
                handleFullscreenChange,
            );
            document.removeEventListener(
                "fullscreenerror",
                handleFullscreenError,
            );
        };
    }, []);

    useEffect(() => {
        if (!isFullscreen) {
            setShowFullscreenHint(false);
            return;
        }

        setShowFullscreenHint(true);
        const timeoutId = window.setTimeout(() => {
            setShowFullscreenHint(false);
        }, FULLSCREEN_HINT_DURATION_MS);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [isFullscreen]);

    useEffect(() => {
        if (!status.connected) {
            fullscreenPromptWasEvaluatedRef.current = false;
            setShowFullscreenPrompt(false);
            return;
        }

        if (isFullscreen) {
            fullscreenPromptWasEvaluatedRef.current = true;
            setShowFullscreenPrompt(false);
            return;
        }

        if (fullscreenPromptWasEvaluatedRef.current) {
            return;
        }

        if (!viewport.width || !viewport.height) {
            return;
        }

        fullscreenPromptWasEvaluatedRef.current = true;

        const shouldSuggestFullscreen =
            viewport.width <= FULLSCREEN_PROMPT_MAX_WIDTH ||
            viewport.height <= FULLSCREEN_PROMPT_MAX_HEIGHT;

        if (shouldSuggestFullscreen) {
            setShowFullscreenPrompt(true);
        }
    }, [isFullscreen, status.connected, viewport.height, viewport.width]);

    useEffect(() => {
        setForm((current) => {
            const nextWsUrl = resolveWebSocketUrl(current.wsUrl);

            if (nextWsUrl === current.wsUrl) {
                return current;
            }

            return {
                ...current,
                wsUrl: nextWsUrl,
            };
        });
    }, []);

    useEffect(() => {
        if (!authSession) {
            setForm((current) => ({
                ...current,
                ticket: "",
            }));
            return;
        }

        const selectedCharacterId = authSession.selectedCharacterId || "";

        if (!arenaMode && !selectedCharacterId) {
            autoConnectKeyRef.current = null;
            setActiveConnection(null);
            setHud(null);
            setChatEntriesByTab(createEmptyChatEntriesByTab());
            setStatus({
                connected: false,
                connecting: false,
                worldName: undefined,
                error: undefined,
                consoleLine: undefined,
            });
            router.replace("/characters");
            return;
        }

        setForm((current) => ({
            ...current,
            ticket: "",
        }));
    }, [arenaMode, authSession, router]);

    useEffect(() => {
        if (!authSession) {
            return;
        }

        void fetch("/api/auth/session", { cache: "no-store" }).catch(
            () => null,
        );
    }, [authSession]);

    useEffect(() => {
        if (
            !arenaMode ||
            !!arenaRoomId ||
            !arenaTicket ||
            status.connecting ||
            status.connected
        ) {
            return;
        }

        const nextKey = `arena:${arenaTicket}:${arenaTemplateId}`;

        if (autoConnectKeyRef.current === nextKey) {
            return;
        }

        autoConnectKeyRef.current = nextKey;
        setHud(null);
        setChatEntriesByTab(createEmptyChatEntriesByTab());
        setStatus({
            connected: false,
            connecting: true,
            worldName: undefined,
            error: undefined,
            consoleLine: undefined,
        });
        setForm((current) => ({
            ...current,
            ticket: arenaTicket,
        }));
        setConnectionSeed((current) => current + 1);
        setActiveConnection({
            wsUrl: form.wsUrl,
            ticket: arenaTicket,
            typeGame: 2,
            idChar: Number.isFinite(arenaTemplateId) ? arenaTemplateId : 0,
        });
    }, [
        arenaMode,
        arenaRoomId,
        arenaTemplateId,
        arenaTicket,
        form.wsUrl,
        status.connected,
        status.connecting,
    ]);

    useEffect(() => {
        if (
            !arenaMode ||
            !arenaRoomId ||
            status.connecting ||
            status.connected
        ) {
            return;
        }

        const nextKey = `arena-room:${arenaRoomId}`;

        if (autoConnectKeyRef.current === nextKey) {
            return;
        }

        autoConnectKeyRef.current = nextKey;

        const startArenaConnection = async () => {
            setHud(null);
            setChatEntriesByTab(createEmptyChatEntriesByTab());
            setStatus({
                connected: false,
                connecting: true,
                worldName: undefined,
                error: undefined,
                consoleLine: undefined,
            });

            try {
                const roomResponse = await fetch(
                    `/api/arenas/rooms/${arenaRoomId}`,
                    {
                        cache: "no-store",
                    },
                );
                const roomResult = (await roomResponse.json()) as
                    | ArenaRoomDetails
                    | AuthErrorResponse;

                if (!roomResponse.ok || "error" in roomResult) {
                    throw new Error(
                        "error" in roomResult
                            ? roomResult.error
                            : "No se pudo recuperar la sala",
                    );
                }

                const templateId = roomResult.member?.selectedPvpTemplateId;

                if (templateId === null || templateId === undefined) {
                    router.replace(
                        `/arenas?room=${encodeURIComponent(arenaRoomId)}`,
                    );
                    return;
                }

                const ticketResponse = await fetch(
                    `/api/arenas/rooms/${arenaRoomId}/select-template`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ templateId }),
                    },
                );
                const ticketResult = (await ticketResponse.json()) as
                    | ArenaGameTicketResponse
                    | AuthErrorResponse;

                if (!ticketResponse.ok || "error" in ticketResult) {
                    throw new Error(
                        "error" in ticketResult
                            ? ticketResult.error
                            : "No se pudo regenerar el ticket de arena",
                    );
                }

                setForm((current) => ({
                    ...current,
                    ticket: ticketResult.ticket,
                }));
                setConnectionSeed((current) => current + 1);
                setActiveConnection({
                    wsUrl: form.wsUrl,
                    ticket: ticketResult.ticket,
                    typeGame: 2,
                    idChar: templateId,
                });
            } catch (error) {
                autoConnectKeyRef.current = null;
                setStatus({
                    connected: false,
                    connecting: false,
                    worldName: undefined,
                    error:
                        error instanceof Error
                            ? error.message
                            : "No se pudo reingresar a la arena",
                });
                router.replace(
                    `/arenas?room=${encodeURIComponent(arenaRoomId)}`,
                );
            }
        };

        void startArenaConnection();
    }, [
        arenaMode,
        arenaRoomId,
        form.wsUrl,
        router,
        status.connected,
        status.connecting,
    ]);

    useEffect(() => {
        if (
            arenaMode ||
            !authSession?.selectedCharacterId ||
            !authSession ||
            status.connecting ||
            status.connected
        ) {
            return;
        }

        const nextKey = `${authSession.account._id}:${authSession.selectedCharacterId}`;

        if (autoConnectKeyRef.current === nextKey) {
            return;
        }

        autoConnectKeyRef.current = nextKey;

        const startConnection = async () => {
            setHud(null);
            setChatEntriesByTab(createEmptyChatEntriesByTab());
            setStatus({
                connected: false,
                connecting: true,
                worldName: undefined,
                error: undefined,
                consoleLine: undefined,
            });

            try {
                const response = await fetch("/api/auth/game-ticket", {
                    method: "POST",
                });

                const result = (await response.json()) as
                    | GameTicketResponse
                    | AuthErrorResponse;

                if (!response.ok || "error" in result) {
                    throw new Error(
                        "error" in result
                            ? result.error
                            : "No se pudo crear el ticket de juego",
                    );
                }

                setForm((current) => ({
                    ...current,
                    ticket: result.ticket,
                }));
                setConnectionSeed((current) => current + 1);
                setActiveConnection({
                    wsUrl: form.wsUrl,
                    ticket: result.ticket,
                });
            } catch (error) {
                autoConnectKeyRef.current = null;
                setStatus({
                    connected: false,
                    connecting: false,
                    worldName: undefined,
                    error:
                        error instanceof Error
                            ? error.message
                            : "No se pudo iniciar la conexion",
                });
            }
        };

        void startConnection();
    }, [
        arenaMode,
        authSession,
        form.wsUrl,
        status.connected,
        status.connecting,
    ]);

    const minimumPinnedConsoleHeight =
        CANVAS_BASE_HEIGHT +
        DESKTOP_CONSOLE_HEIGHT +
        MACRO_BAR_ESTIMATED_HEIGHT +
        HUD_GAP +
        COLUMN_SECTION_GAP;

    const leftConsoleWidth = Math.min(320, viewport.width - CANVAS_BASE_WIDTH - RIGHT_PANEL_WIDTH - HUD_GAP * 2 - (isFullscreen ? SHELL_HORIZONTAL_PADDING_FULLSCREEN : SHELL_HORIZONTAL_PADDING) * 2);
    const isLeftConsoleLayout = leftConsoleWidth >= 200;
    const isDesktopConsoleLayout = isLeftConsoleLayout || (isFullscreen
        ? viewport.width > 768
        : viewport.width > 768 && viewport.height >= minimumPinnedConsoleHeight);

    const shellTopPadding = isFullscreen
        ? SHELL_TOP_PADDING_FULLSCREEN
        : SHELL_VERTICAL_PADDING;
    const shellBottomPadding = isFullscreen
        ? SHELL_BOTTOM_PADDING_FULLSCREEN
        : SHELL_VERTICAL_PADDING;
    const shellHorizontalPadding = isFullscreen
        ? SHELL_HORIZONTAL_PADDING_FULLSCREEN
        : SHELL_HORIZONTAL_PADDING;

    const handleTopHudSectionMeasure = useCallback((size: MeasuredHudSize) => {
        setTopHudSectionSize((current) => {
            if (
                current.width === size.width &&
                current.height === size.height
            ) {
                return current;
            }

            return size;
        });
    }, []);

    const handleMacroBarMeasure = useCallback((size: MeasuredHudSize) => {
        setMacroBarSize((current) => {
            if (
                current.width === size.width &&
                current.height === size.height
            ) {
                return current;
            }

            return size;
        });
    }, []);

    const handleRightColumnMeasure = useCallback((size: MeasuredHudSize) => {
        setRightColumnSize((current) => {
            if (
                current.width === size.width &&
                current.height === size.height
            ) {
                return current;
            }

            return size;
        });
    }, []);

    const hudScale = useMemo(() => {
        if ((!isFullscreen && !isLeftConsoleLayout) || !viewport.width || !viewport.height) {
            return 1;
        }

        const leftColumnBaseHeight =
            CANVAS_BASE_HEIGHT + COLUMN_SECTION_GAP + macroBarSize.height;
        const mainRowBaseHeight = Math.max(
            leftColumnBaseHeight,
            rightColumnSize.height,
        );
        const totalBaseHeight =
            (isDesktopConsoleLayout && !isLeftConsoleLayout ? topHudSectionSize.height + HUD_GAP : 0) +
            mainRowBaseHeight;
        const mainRowBaseWidth =
            CANVAS_BASE_WIDTH + HUD_GAP + rightColumnSize.width + (isLeftConsoleLayout ? leftConsoleWidth + HUD_GAP : 0);
        const totalBaseWidth = isDesktopConsoleLayout && !isLeftConsoleLayout
            ? Math.max(mainRowBaseWidth, topHudSectionSize.width)
            : mainRowBaseWidth;
        const availableWidth = viewport.width - shellHorizontalPadding * 2;
        const availableHeight =
            viewport.height - shellTopPadding - shellBottomPadding;
        const widthScale = availableWidth / totalBaseWidth;
        const heightScale = availableHeight / totalBaseHeight;
        const nextScale = Math.min(widthScale, heightScale);

        if (!Number.isFinite(nextScale) || nextScale <= 0) {
            return 1;
        }

        return Math.min(isFullscreen ? MAX_FULLSCREEN_HUD_SCALE : 1, nextScale);
    }, [
        isDesktopConsoleLayout,
        isLeftConsoleLayout,
        leftConsoleWidth,
        isFullscreen,
        macroBarSize.height,
        rightColumnSize.height,
        rightColumnSize.width,
        shellHorizontalPadding,
        shellBottomPadding,
        shellTopPadding,
        topHudSectionSize.height,
        topHudSectionSize.width,
        viewport.height,
        viewport.width,
    ]);

    const hudLayout = useMemo<HudLayout>(() => {
        if (!viewport.width || !viewport.height) {
            return {
                canvasWidth: CANVAS_BASE_WIDTH,
                canvasHeight: CANVAS_BASE_HEIGHT,
            };
        }

        if (!isFullscreen && !isLeftConsoleLayout) {
            return {
                canvasWidth: CANVAS_BASE_WIDTH,
                canvasHeight: CANVAS_BASE_HEIGHT,
            };
        }

        const scaledCanvasSize = Math.max(
            1,
            Math.floor(CANVAS_BASE_WIDTH * hudScale),
        );

        return {
            canvasWidth: scaledCanvasSize,
            canvasHeight: scaledCanvasSize,
        };
    }, [hudScale, isFullscreen, isLeftConsoleLayout, viewport.height, viewport.width]);

    const toggleFullscreen = useCallback(async () => {
        const shellElement = gameShellRef.current;
        if (!shellElement) {
            return;
        }

        try {
            if (document.fullscreenElement === shellElement) {
                await document.exitFullscreen();
                return;
            }

            setFullscreenError(null);
            await shellElement.requestFullscreen({ navigationUI: "hide" });
        } catch {
            setFullscreenError(
                "No se pudo activar pantalla completa en este navegador.",
            );
        }
    }, []);

    const dismissFullscreenPrompt = useCallback(() => {
        setShowFullscreenPrompt(false);
    }, []);

    const resetConnectionState = useCallback(() => {
        autoConnectKeyRef.current = null;
        setLogoutPending(false);
        setLogoutDeadline(null);
        setLogoutSecondsRemaining(0);
        setPendingExitHref(null);
        setActiveConnection(null);
        setHud(null);
        setEquipRequest(null);
        setChatRequest(null);
        setIsChatOpen(false);
        setChatMessage("");
        setIsChatMenuOpen(false);
        setLastWhisperTarget(null);
        setUnreadChatCounts(createEmptyUnreadChatCounts());
        setDeathHomePromptOpen(false);
        setTradeState(null);
        setTradeStatusMessage(null);
        setRetosState(null);
        setRetosOpen(false);
        setRetosLoading(false);
        setRetosActionKey(null);
        setRetosActionRequest(null);
        setChallengeOverlayText(null);
        setBailState(null);
        setAdminIntervalsOpen(false);
        setAdminIntervalsSavingPath(null);
        setOverviewOpen(false);
        setOverviewRefreshing(false);
        setOverviewSnapshot(null);
        setChatEntriesByTab(createEmptyChatEntriesByTab());
        setActiveChatTab("console");
        activeChatTabRef.current = "console";
        playerNameRef.current = null;
        setStatus({
            connected: false,
            connecting: false,
            worldName: undefined,
            error: undefined,
            consoleLine: undefined,
        });
    }, []);

    const disconnect = useCallback(
        (nextHref?: string) => {
            resetConnectionState();

            if (arenaMode) {
                router.replace(
                    nextHref ??
                        (arenaRoomId
                            ? `/arenas?room=${encodeURIComponent(arenaRoomId)}`
                            : "/arenas"),
                );
            }
        },
        [arenaMode, arenaRoomId, resetConnectionState, router],
    );

    const leaveArenaRoom = useCallback(async () => {
        if (arenaLeavePending) {
            return;
        }

        resetConnectionState();

        if (!arenaRoomId) {
            router.replace("/arenas");
            return;
        }

        setArenaLeavePending(true);

        try {
            await fetch(`/api/arenas/rooms/${arenaRoomId}/leave`, {
                method: "POST",
            });
        } finally {
            setArenaLeavePending(false);
            router.replace("/arenas");
        }
    }, [arenaLeavePending, arenaRoomId, resetConnectionState, router]);

    const appendConsoleEntry = useCallback(
        (entry: Omit<ConsoleEntry, "id">) => {
            if (entry.source === "console") {
                const challengeOverlayMatch = entry.text.match(
                    CHALLENGE_OVERLAY_PATTERN,
                );

                if (challengeOverlayMatch) {
                    const overlayText = challengeOverlayMatch[1] ?? null;

                    setChallengeOverlayText(overlayText);
                    window.setTimeout(
                        () => {
                            setChallengeOverlayText((current) =>
                                current === overlayText ? null : current,
                            );
                        },
                        overlayText === "YA" ? 1300 : 900,
                    );

                    return;
                }

                if (logoutFeedback(entry.text) === 'started') {
                    setLogoutPending(true);
                    setLogoutDeadline(Date.now() + LOGOUT_DELAY_MS);
                } else if (logoutFeedback(entry.text) === 'cancelled') {
                    setLogoutPending(false);
                    setLogoutDeadline(null);
                    setLogoutSecondsRemaining(0);
                    setPendingExitHref(null);
                } else if (logoutFeedback(entry.text) === 'denied') {
                    setLogoutPending(false);
                    setLogoutDeadline(null);
                    setLogoutSecondsRemaining(0);
                    setPendingExitHref(null);
                } else if (logoutFeedback(entry.text) === 'closing') {
                    setLogoutPending(true);
                    setLogoutDeadline(null);
                    setLogoutSecondsRemaining(0);
                }

                if (RETOS_INFO_MESSAGES.has(entry.text)) {
                    setRetosLoading(false);
                    setRetosActionKey(null);
                    setRetosError(null);
                    setRetosInfo(entry.text);
                } else if (RETOS_ERROR_MESSAGES.has(entry.text)) {
                    setRetosLoading(false);
                    setRetosActionKey(null);
                    setRetosInfo(null);
                    setRetosError(entry.text);
                }
            }

            if (entry.source !== "console" && entry.source !== "system") {
                if (entry.source !== "dialog" || entry.speakerType === "npc") {
                    return;
                }
            }

            if (
                entry.source !== "console" &&
                entry.source !== "dialog" &&
                entry.source !== "system"
            ) {
                return;
            }

            if (
                tradeStateRef.current?.mode === "bank" &&
                entry.source === "console" &&
                /boveda/i.test(entry.text)
            ) {
                setTradeStatusMessage(entry.text);
            }

            if (entry.channel === "whisper") {
                const whisperPartner =
                    entry.senderName &&
                    playerNameRef.current &&
                    entry.senderName.trim().toLocaleLowerCase() !==
                        playerNameRef.current.trim().toLocaleLowerCase()
                        ? entry.senderName
                        : parseWhisperPartnerFromEntry(
                              entry.text,
                              playerNameRef.current,
                          );

                if (whisperPartner) {
                    setLastWhisperTarget(whisperPartner);
                }
            }

            const nextChannel = entry.channel ?? "console";

            setChatEntriesByTab((current) => {
                const nextId = Math.max(
                    Date.now(),
                    lastConsoleEntryIdRef.current + 1,
                );
                lastConsoleEntryIdRef.current = nextId;
                const nextEntry = {
                    id: nextId,
                    channel: nextChannel,
                    ...entry,
                };

                return {
                    ...current,
                    [nextChannel]: [
                        ...current[nextChannel].slice(
                            -(MAX_CONSOLE_ENTRIES - 1),
                        ),
                        nextEntry,
                    ],
                };
            });
        },
        [],
    );

    const refreshRuntimeTiming = useCallback(async () => {
        try {
            const response = await fetch("/api/runtime-config", {
                cache: "no-store",
            });
            const result = (await response.json()) as
                | RuntimeConfigResponse
                | AuthErrorResponse;

            if (!response.ok || "error" in result) {
                throw new Error(
                    "error" in result
                        ? result.error
                        : "No se pudo cargar la configuracion de intervalos",
                );
            }

            setRuntimeTiming(
                applyRuntimeTimingEnvironmentOverrides(result.timing),
            );
        } catch (error) {
            appendConsoleEntry({
                text:
                    error instanceof Error
                        ? error.message
                        : "No se pudo cargar la configuracion de intervalos",
                color: "#fca5a5",
                source: "system",
            });
        }
    }, [appendConsoleEntry]);

    useEffect(() => {
        if (!logoutPending || !logoutDeadline) {
            setLogoutSecondsRemaining(0);
            return;
        }

        const updateRemaining = () => {
            const remainingMs = Math.max(0, logoutDeadline - Date.now());
            setLogoutSecondsRemaining(Math.ceil(remainingMs / 1000));
        };

        updateRemaining();
        const intervalId = window.setInterval(updateRemaining, 200);
        return () => window.clearInterval(intervalId);
    }, [logoutDeadline, logoutPending]);

    useEffect(() => {
        if (
            arenaMode ||
            !status.connected ||
            logoutPending ||
            hud?.zonaSegura !== 0 ||
            hud?.dead
        ) {
            return;
        }

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue =
                "Para salir en zona insegura usa /salir y espera 10 segundos sin moverte.";
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () =>
            window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [
        arenaMode,
        hud?.dead,
        hud?.zonaSegura,
        logoutPending,
        status.connected,
    ]);

    useEffect(() => {
        if (!logoutPending || status.connected || status.connecting) {
            return;
        }

        disconnect();
        router.replace(
            pendingExitHref ??
                (arenaMode ? switchCharacterHref : "/characters"),
        );
    }, [
        arenaMode,
        disconnect,
        logoutPending,
        pendingExitHref,
        router,
        status.connected,
        status.connecting,
        switchCharacterHref,
    ]);

    const handleSwitchCharacterClick = useCallback(
        (event: React.MouseEvent<HTMLAnchorElement>) => {
            if (
                arenaMode ||
                !status.connected ||
                hud?.dead ||
                hud?.zonaSegura !== 0
            ) {
                return;
            }

            event.preventDefault();
            setPendingExitHref(switchCharacterHref);
            sendChatMessage("/salir");
        },
        [
            arenaMode,
            hud?.dead,
            hud?.zonaSegura,
            sendChatMessage,
            status.connected,
            switchCharacterHref,
        ],
    );

    const handleStatusChange = useCallback((nextStatus: RendererStatus) => {
        const nextWorldName =
            typeof nextStatus.worldName === "string" &&
            nextStatus.worldName.trim().length > 0
                ? nextStatus.worldName
                : undefined;

        setStatus((current) => ({
            ...current,
            ...nextStatus,
            worldName: nextWorldName ?? current.worldName,
        }));
    }, []);

    const handleGlobalNotice = useCallback(
        (notice: { text: string; durationMs: number }) => {
            setGlobalCanvasNotice({
                id: Date.now(),
                text: notice.text,
                durationMs: Math.max(1000, notice.durationMs),
            });
        },
        [],
    );

    useEffect(() => {
        if (!marketState) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            setMarketState(null);
            setCloseTradeRequest((current) => ({
                token: (current?.token ?? 0) + 1,
            }));
        };

        document.addEventListener("keydown", handleKeyDown, true);
        return () =>
            document.removeEventListener("keydown", handleKeyDown, true);
    }, [marketState]);

    useLayoutEffect(() => {
        let nextVolume = 1;

        try {
            const storedVolume = window.localStorage.getItem(
                PLAY_SOUND_VOLUME_STORAGE_KEY,
            );

            if (storedVolume != null) {
                const parsedVolume = Number.parseFloat(storedVolume);

                if (Number.isFinite(parsedVolume)) {
                    nextVolume = Math.min(1, Math.max(0, parsedVolume));
                }
            }
        } catch {
            nextVolume = 1;
        }

        hasInitializedSoundVolumeRef.current = true;
        setSoundVolume(nextVolume);
    }, []);

    useEffect(() => {
        try {
            const hasSeenIntro = window.localStorage.getItem(
                PLAY_HOTKEYS_HINT_STORAGE_KEY,
            );

            if (!hasSeenIntro) {
                setIsHotkeyIntroOpen(true);
            }
        } catch {
            setIsHotkeyIntroOpen(true);
        }
    }, []);

    useEffect(() => {
        if (!hasInitializedSoundVolumeRef.current) {
            return;
        }

        if (!hasSkippedInitialSoundVolumePersistRef.current) {
            hasSkippedInitialSoundVolumePersistRef.current = true;
            return;
        }

        try {
            window.localStorage.setItem(
                PLAY_SOUND_VOLUME_STORAGE_KEY,
                soundVolume.toString(),
            );
        } catch {
            // Ignore storage failures in restricted/browser test contexts.
        }
    }, [soundVolume]);

    useEffect(() => {
        if (!isChatOpen) {
            return;
        }

        chatInputRef.current?.focus();
        chatInputRef.current?.select();
    }, [isChatOpen]);

    useEffect(() => {
        if (!isChatOpen) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) {
                return;
            }

            if (chatFormRef.current?.contains(target)) {
                return;
            }

            const activeElement = document.activeElement;
            if (activeElement === chatInputRef.current) {
                event.preventDefault();
            }

            window.requestAnimationFrame(() => {
                const input = chatInputRef.current;
                if (!input || !isChatOpen) {
                    return;
                }

                input.focus();
                const cursorPosition = input.value.length;
                input.setSelectionRange(cursorPosition, cursorPosition);
            });
        };

        document.addEventListener("pointerdown", handlePointerDown, true);

        return () => {
            document.removeEventListener(
                "pointerdown",
                handlePointerDown,
                true,
            );
        };
    }, [isChatOpen]);

    useEffect(() => {
        if (!status.connected && isChatOpen) {
            setIsChatOpen(false);
            setChatMessage("");
        }
    }, [isChatOpen, status.connected]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!status.connected) {
                return;
            }

            const target = event.target;
            const isTypingTarget =
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target instanceof HTMLSelectElement ||
                (target instanceof HTMLElement && target.isContentEditable);

            if (event.key === "Enter" && !isTypingTarget && !isChatOpen) {
                event.preventDefault();
                setIsChatOpen(true);
                return;
            }

            if (event.key === "Escape" && isChatOpen) {
                setIsChatOpen(false);
                setChatMessage("");
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isChatOpen, status.connected]);

    const submitChatMessage = useCallback(() => {
        const result = buildChatMessageForTab(
            activeChatTab,
            chatMessage,
            lastWhisperTarget,
        );

        if (result.error) {
            appendConsoleEntry({
                text: result.error,
                color: "#fca5a5",
                source: "system",
                channel: activeChatTab === "whisper" ? "whisper" : "console",
            });
            return;
        }

        if (result.nextWhisperTarget) {
            setLastWhisperTarget(result.nextWhisperTarget);
        }

        sendChatMessage(result.message ?? " ");
        setIsChatOpen(false);
        setChatMessage("");
    }, [
        activeChatTab,
        appendConsoleEntry,
        chatMessage,
        lastWhisperTarget,
        sendChatMessage,
    ]);

    const handlePayBail = useCallback(() => {
        sendChatMessage("/fianza pagar");
    }, [sendChatMessage]);

    const handleDeathHomeConfirm = useCallback(() => {
        setDeathHomePromptOpen(false);
        sendChatMessage("/hogar");
    }, [sendChatMessage]);

    const handleAdminIntervalSave = useCallback(
        (path: string, value: number) => {
            setRuntimeTiming((current) =>
                setTimingValueByPath(current, path, value),
            );
            setAdminIntervalsSavingPath(path);
            setChatRequest((current) => ({
                message: `/intervalo ${path} ${value}`,
                token: (current?.token ?? 0) + 1,
            }));

            window.setTimeout(() => {
                setAdminIntervalsSavingPath((current) =>
                    current === path ? null : current,
                );
                void refreshRuntimeTiming();
            }, 500);
        },
        [refreshRuntimeTiming],
    );

    const refreshOverview = useCallback(() => {
        setOverviewRefreshing(true);
        setChatRequest((current) => ({
            message: "/paquetes",
            token: (current?.token ?? 0) + 1,
        }));
    }, []);

    useEffect(() => {
        if (
            selectedSpellSlot !== null &&
            !hud?.spells.some((spell) => spell.slot === selectedSpellSlot)
        ) {
            setSelectedSpellSlot(null);
        }
    }, [hud?.spells, selectedSpellSlot]);

    useEffect(() => {
        if (!hud) {
            previousDeadRef.current = null;
            setDeathHomePromptOpen(false);
            return;
        }

        const isDead = Boolean(hud.dead);
        const isInChallengeInstance = hud.map >= CHALLENGE_INSTANCE_MAP_START;

        if (
            previousDeadRef.current !== true &&
            isDead &&
            !isInChallengeInstance
        ) {
            setDeathHomePromptOpen(true);
        }

        if (!isDead || isInChallengeInstance) {
            setDeathHomePromptOpen(false);
        }

        previousDeadRef.current = isDead;
    }, [hud]);

    const tradePlayerItems = useMemo<TradeItem[]>(() => {
        if (!tradeState) {
            return [];
        }

        const tradeItemsBySlot = new Map(
            tradeState.playerItems.map((item) => [item.slot, item]),
        );

        return (hud?.inventory ?? []).map((item) => {
            const tradeItem = tradeItemsBySlot.get(item.slot);

            return {
                slot: item.slot,
                name: item.name,
                grhIndex: item.grhIndex,
                amount: item.amount,
                value: tradeItem?.value ?? item.value,
                validForUser: tradeItem?.validForUser ?? item.validForUser,
                details: tradeItem?.details ?? item.details,
                equipped: item.equipped,
            };
        });
    }, [hud?.inventory, tradeState]);

    const visibleConsoleEntries = useMemo(
        () => Object.values(chatEntriesByTab).flat().sort((a, b) => a.id - b.id),
        [chatEntriesByTab],
    );
    const activeChatTabLabel = "Consola";
    const totalUnreadChatCount =
        unreadChatCounts.party +
        unreadChatCounts.clan +
        unreadChatCounts.whisper;
    const whisperPlaceholder = lastWhisperTarget
        ? `Mensaje privado para ${lastWhisperTarget}`
        : 'Usa /w "usuario" mensaje';

    useEffect(() => {
        if (
            activeChatTab === "party" ||
            activeChatTab === "clan" ||
            activeChatTab === "whisper"
        ) {
            setUnreadChatCounts((current) => ({
                ...current,
                [activeChatTab]: 0,
            }));
        }
    }, [activeChatTab]);

    useEffect(() => {
        if (!isDesktopConsoleLayout && !isConsoleOpen) {
            return;
        }

        const container = consoleScrollRef.current;

        if (!container) {
            return;
        }

        container.scrollTop = container.scrollHeight;
    }, [isDesktopConsoleLayout, isLeftConsoleLayout, isConsoleOpen, visibleConsoleEntries]);

    useEffect(() => {
        if (arenaMode || !authSession?.selectedCharacterId) {
            loadedCharacterSettingsIdRef.current = null;
            lastSavedCharacterSettingsRef.current = null;
            setIsCharacterSettingsLoading(false);
            setHotkeySettings(DEFAULT_HOTKEY_SETTINGS);
            setMacros(createEmptyMacros());
            return;
        }

        const characterId = authSession.selectedCharacterId;
        let cancelled = false;

        loadedCharacterSettingsIdRef.current = null;
        lastSavedCharacterSettingsRef.current = null;
        setIsCharacterSettingsLoading(true);

        const loadCharacterSettings = async () => {
            for (let attempt = 0; attempt < 2; attempt += 1) {
                try {
                    const response = await fetch(
                        "/api/auth/character-settings",
                        {
                            cache: "no-store",
                        },
                    );
                    const result = (await response.json()) as
                        | CharacterSettingsResponse
                        | AuthErrorResponse;

                    if (cancelled) {
                        return;
                    }

                    if (!response.ok || "error" in result) {
                        continue;
                    }

                    const normalized = normalizeCharacterSettings(result);

                    if (!normalized || normalized.characterId !== characterId) {
                        continue;
                    }

                    setHotkeySettings(normalized.hotkeys);
                    setMacros(normalized.macros);
                    loadedCharacterSettingsIdRef.current = characterId;
                    lastSavedCharacterSettingsRef.current = JSON.stringify({
                        hotkeys: normalized.hotkeys,
                        macros: normalized.macros,
                    });
                    setIsCharacterSettingsLoading(false);
                    return;
                } catch {
                    continue;
                }
            }

            if (!cancelled) {
                setHotkeySettings(DEFAULT_HOTKEY_SETTINGS);
                setMacros(createEmptyMacros());
                setIsCharacterSettingsLoading(false);
            }
        };

        void loadCharacterSettings();

        return () => {
            cancelled = true;
        };
    }, [arenaMode, authSession?.selectedCharacterId]);

    useEffect(() => {
        if (arenaMode || !authSession?.selectedCharacterId) {
            return;
        }

        if (
            loadedCharacterSettingsIdRef.current !==
            authSession.selectedCharacterId
        ) {
            return;
        }

        const payload = {
            hotkeys: hotkeySettings,
            macros,
        };
        const serializedPayload = JSON.stringify(payload);

        if (lastSavedCharacterSettingsRef.current === serializedPayload) {
            return;
        }

        const selectedCharacterId = authSession.selectedCharacterId;
        const timeoutId = window.setTimeout(() => {
            void fetch("/api/auth/character-settings", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: serializedPayload,
            })
                .then(async (response) => {
                    if (!response.ok) {
                        return;
                    }

                    const result = (await response.json()) as
                        | CharacterSettingsResponse
                        | AuthErrorResponse;

                    if ("error" in result) {
                        return;
                    }

                    const normalized = normalizeCharacterSettings(result);

                    if (
                        !normalized ||
                        loadedCharacterSettingsIdRef.current !==
                            selectedCharacterId ||
                        normalized.characterId !== selectedCharacterId
                    ) {
                        return;
                    }

                    lastSavedCharacterSettingsRef.current = JSON.stringify({
                        hotkeys: normalized.hotkeys,
                        macros: normalized.macros,
                    });
                })
                .catch(() => undefined);
        }, 400);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [arenaMode, authSession?.selectedCharacterId, hotkeySettings, macros]);

    const dismissHotkeyIntro = useCallback(() => {
        setIsHotkeyIntroOpen(false);

        try {
            window.localStorage.setItem(PLAY_HOTKEYS_HINT_STORAGE_KEY, "1");
        } catch {
            return;
        }
    }, []);

    const defaultHotkeyIntroItems = useMemo(
        () => [
            {
                label: "Mover arriba",
                value: formatHotkeyBinding(DEFAULT_HOTKEY_SETTINGS.moveUp),
            },
            {
                label: "Mover izquierda",
                value: formatHotkeyBinding(DEFAULT_HOTKEY_SETTINGS.moveLeft),
            },
            {
                label: "Mover abajo",
                value: formatHotkeyBinding(DEFAULT_HOTKEY_SETTINGS.moveDown),
            },
            {
                label: "Mover derecha",
                value: formatHotkeyBinding(DEFAULT_HOTKEY_SETTINGS.moveRight),
            },
            {
                label: "Abrir / cerrar mapa",
                value: formatHotkeyBinding(
                    DEFAULT_HOTKEY_SETTINGS.toggleWorldMap,
                ),
            },
            {
                label: "Activar / desactivar seguro",
                value: formatHotkeyBinding(
                    DEFAULT_HOTKEY_SETTINGS.toggleSeguro,
                ),
            },
            {
                label: "Activar / desactivar seguro de clan",
                value: formatHotkeyBinding(
                    DEFAULT_HOTKEY_SETTINGS.toggleClanSeguro,
                ),
            },
            {
                label: "Agarrar item",
                value: formatHotkeyBinding(DEFAULT_HOTKEY_SETTINGS.pickupItem),
            },
            {
                label: "Atacar / apuntar",
                value: formatHotkeyBinding(
                    DEFAULT_HOTKEY_SETTINGS.attackOrTarget,
                ),
            },
            {
                label: "Meditar",
                value: formatHotkeyBinding(DEFAULT_HOTKEY_SETTINGS.meditate),
            },
            {
                label: "Equipar item",
                value: formatHotkeyBinding(DEFAULT_HOTKEY_SETTINGS.equipItem),
            },
            {
                label: "Usar item",
                value: formatHotkeyBinding(DEFAULT_HOTKEY_SETTINGS.useItem),
            },
            {
                label: "Tirar item",
                value: formatHotkeyBinding(DEFAULT_HOTKEY_SETTINGS.dropItem),
            },
            { label: "Chat", value: "Enter" },
            { label: "Cancelar / cerrar", value: "Esc" },
        ],
        [],
    );

    const chatInputForm = (
                                        <form
                                            ref={chatFormRef}
                                            className="pointer-events-auto flex w-full items-center gap-3 rounded-2xl border border-amber-300/35 bg-stone-950/88 px-4 py-3 shadow-2xl backdrop-blur-md"
                                            onSubmit={(event) => {
                                                event.preventDefault();
                                                submitChatMessage();
                                            }}
                                        >
                                            <LocalizedLabel><input
                                                ref={chatInputRef}
                                                type="text"
                                                autoComplete="off"
                                                value={chatMessage}
                                                maxLength={120}
                                                onChange={(event) =>
                                                    setChatMessage(
                                                        event.target.value,
                                                    )
                                                }
                                                onKeyDown={(event) => {
                                                    if (
                                                        event.key === "Escape"
                                                    ) {
                                                        event.preventDefault();
                                                        setIsChatOpen(false);
                                                        setChatMessage("");
                                                    }
                                                }}
                                                placeholder={
                                                    activeChatTab === "global"
                                                        ? "/global para mandar un mensaje global"
                                                        : activeChatTab ===
                                                            "party"
                                                          ? "Mensaje para la party"
                                                          : activeChatTab ===
                                                              "clan"
                                                            ? "Mensaje para el clan"
                                                            : activeChatTab ===
                                                                "whisper"
                                                              ? whisperPlaceholder
                                                              : "Escribi tu mensaje y presiona Enter"
                                                }
                                                className="min-w-0 flex-1 bg-transparent text-sm text-stone-100 outline-none placeholder:text-stone-500"
                                            /></LocalizedLabel>
                                        </form>
    );

    const chatTabsMenu = (
        <div className={`${isLeftConsoleLayout ? "grid grid-cols-2" : "flex h-full flex-col"} gap-1 rounded-2xl border border-cyan-200/20 bg-stone-950/72 p-2 shadow-2xl backdrop-blur-[2px]`}>
            {CHAT_TABS.map((tab) => {
                const isActive = tab.id === activeChatTab;
                const unreadCount =
                    tab.id === "party" ||
                    tab.id === "clan" ||
                    tab.id === "whisper"
                        ? unreadChatCounts[tab.id]
                        : 0;

                return (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={(event) => {
                            setActiveChatTab(tab.id);
                            setIsChatOpen(true);
                            setIsChatMenuOpen(false);
                            event.currentTarget.blur();
                        }}
                        className={`relative flex ${isLeftConsoleLayout ? "min-h-8" : "min-h-0 flex-1"} items-center justify-center rounded-full px-3 py-1 text-center text-[10px] font-medium uppercase tracking-[0.2em] transition focus:outline-none focus-visible:outline-none ${
                            isActive
                                ? "bg-cyan-300/18 text-cyan-100"
                                : "bg-stone-900/70 text-stone-400 hover:text-stone-200"
                        }`}
                    >
                        {localizeText(tab.label)}
                        {unreadCount > 0 ? (
                            <span className="absolute right-1.5 top-1/2 flex min-w-3.5 -translate-y-1/2 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-semibold leading-3 text-white">
                                {unreadCount > 9 ? "9+" : unreadCount}
                            </span>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );

    const fullscreenToggleButton = (
        <LocalizedLabel><button
            type="button"
            onClick={(event) => {
                void toggleFullscreen();
                event.currentTarget.blur();
            }}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-cyan-200/25 bg-stone-950/78 text-cyan-100/85 shadow-xl backdrop-blur-md transition hover:border-cyan-200/45 hover:bg-stone-900/85 hover:text-white focus:outline-none focus-visible:outline-none"
            aria-label={
                isFullscreen
                    ? localizeKey("fullscreen.exit")
                    : localizeKey("fullscreen.enter")
            }
            title={
                isFullscreen
                    ? localizeKey("fullscreen.exit")
                    : localizeKey("fullscreen.enter")
            }
        >
            {isFullscreen ? (
                <Minimize2 className="h-5 w-5" />
            ) : (
                <Maximize2 className="h-5 w-5" />
            )}
        </button></LocalizedLabel>
    );

    const fullscreenToggleControl = (
        <div className="pointer-events-none flex flex-col items-end gap-2">
            {showFullscreenHint ? (
                <div className="rounded-full border border-white/10 bg-stone-950/70 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-stone-300/85 shadow-xl backdrop-blur-md"><LocalizedText source={"Esc para salir "} /></div>
            ) : null}
            {fullscreenToggleButton}
        </div>
    );

    return (
        <div
            ref={setGameShellNode}
            className="game-shell"
            onContextMenu={(event) => {
                event.preventDefault();
            }}
            onDragStart={(event) => {
                event.preventDefault();
            }}
        >
            <div
                className={`pointer-events-none fixed inset-0 z-20 flex justify-center overflow-hidden ${
                    isFullscreen ? "items-start" : "items-center"
                }`}
                style={{
                    padding: `${shellTopPadding}px ${shellHorizontalPadding}px ${shellBottomPadding}px`,
                }}
            >
                <div
                    className="pointer-events-auto flex flex-col"
                    style={{ gap: `${HUD_GAP}px` }}
                >
                    {isDesktopConsoleLayout && !isLeftConsoleLayout ? (
                        <ScaledHudFrame
                            scale={hudScale}
                            baseWidth={CANVAS_BASE_WIDTH + 156 + HUD_GAP}
                            onMeasure={handleTopHudSectionMeasure}
                        >
                            <div
                                className="pointer-events-auto flex items-start"
                                style={{ gap: `${HUD_GAP}px` }}
                            >
                                <div
                                    className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-cyan-200/20 bg-stone-950/72 shadow-2xl backdrop-blur-[2px]"
                                    style={{
                                        width: `${CANVAS_BASE_WIDTH}px`,
                                    }}
                                >
                                    <div
                                        ref={consoleScrollRef}
                                        className="h-[126px] overflow-y-auto px-4 py-3 text-xs leading-5 text-stone-200/90"
                                    >
                                        {visibleConsoleEntries.length ? (
                                            visibleConsoleEntries.map(
                                                (entry) => (
                                                    <div
                                                        key={entry.id}
                                                        className="break-words"
                                                        style={{
                                                            color:
                                                                entry.color ||
                                                                "rgba(231, 229, 228, 0.92)",
                                                        }}
                                                    >
                                                        {renderConsoleEntryText(
                                                            localizeConsoleEntry(entry, locale), locale,
                                                        )}
                                                    </div>
                                                ),
                                            )
                                        ) : (
                                            <div className="text-stone-300/55"><LocalizedText source={"No hay mensajes en"} />{" "}
                                                {localizeText(activeChatTabLabel).toLowerCase()}{" "}<LocalizedText source={"todavÃƒÂ­a. "} /></div>
                                        )}
                                    </div>
                                </div>

                                <div className="pointer-events-auto h-[126px] w-[156px] shrink-0">
                                    {chatTabsMenu}
                                </div>
                            </div>
                        </ScaledHudFrame>
                    ) : null}

                    <div
                        className="flex items-start"
                        style={{ gap: `${HUD_GAP}px` }}
                    >
                        {isLeftConsoleLayout ? (
                            <ScaledHudFrame scale={hudScale} baseWidth={leftConsoleWidth}>
                                <aside aria-label={localizeText('Consola')} className="flex flex-col overflow-hidden rounded-2xl border border-cyan-200/20 bg-stone-950/90 shadow-2xl" style={{width:leftConsoleWidth,height:CANVAS_BASE_HEIGHT}}>
                                    <div className="border-b border-white/10 px-3 py-3 text-xs font-semibold uppercase tracking-widest text-cyan-100">{localizeText(activeChatTabLabel)}</div>
                                    <div className="p-2">{chatTabsMenu}</div>
                                    <div ref={consoleScrollRef} role="log" aria-label={localizeText(activeChatTabLabel)} aria-live="polite" className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-xs leading-5 text-stone-200/90">
                                        {visibleConsoleEntries.length ? visibleConsoleEntries.map(entry => (
                                            <div key={entry.id} className="break-words" style={{color:entry.color || 'rgba(231, 229, 228, 0.92)'}}>{renderConsoleEntryText(localizeConsoleEntry(entry,locale),locale)}</div>
                                        )) : <p className="text-stone-400"><LocalizedText source="No hay mensajes en" />{' '}{localizeText(activeChatTabLabel).toLowerCase()}{' '}<LocalizedText source="todavÃƒÂ­a. " /></p>}
                                    </div>
                                    <div className="shrink-0 border-t border-white/10 p-2">
                                        {isChatOpen ? chatInputForm : <button type="button" onClick={event=>{setIsChatOpen(true);event.currentTarget.blur();}} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-stone-300"><span>{localizeText('Chat')}</span><kbd className="rounded border border-white/20 px-1.5 text-xs">Enter</kbd></button>}
                                    </div>
                                </aside>
                            </ScaledHudFrame>
                        ) : null}
                        <div
                            className="flex flex-col"
                            style={{
                                width: `${hudLayout.canvasWidth ?? CANVAS_BASE_WIDTH}px`,
                                gap: "12px",
                            }}
                        >
                            <div
                                className="relative"
                                style={{
                                    width: `${hudLayout.canvasWidth ?? CANVAS_BASE_WIDTH}px`,
                                    height: `${hudLayout.canvasHeight ?? CANVAS_BASE_HEIGHT}px`,
                                }}
                            >
                                <BuffStatusSidebar
                                    hud={hud}
                                    runtimeTiming={runtimeTiming}
                                />
                                <MapRenderer
                                    embedded
                                    mapNumber={selectedMap}
                                    width={hudLayout.canvasWidth}
                                    height={hudLayout.canvasHeight}
                                    connection={connection}
                                    equipRequest={equipRequest}
                                    useItemClickRequest={useItemClickRequest}
                                    useItemURequest={useItemURequest}
                                    dropRequest={dropRequest}
                                    buyRequest={buyRequest}
                                    sellRequest={sellRequest}
                                    changeBankTabRequest={changeBankTabRequest}
                                    depositBankGoldRequest={
                                        depositBankGoldRequest
                                    }
                                    withdrawBankGoldRequest={
                                        withdrawBankGoldRequest
                                    }
                                    closeTradeRequest={closeTradeRequest}
                                    marketActionRequest={marketActionRequest}
                                    retosActionRequest={retosActionRequest}
                                    craftRequest={craftRequest}
                                    reorderInventoryRequest={
                                        reorderInventoryRequest
                                    }
                                    reorderSpellRequest={reorderSpellRequest}
                                    reorderBankRequest={reorderBankRequest}
                                    rangeAttackRequest={rangeAttackRequest}
                                    spellTargetRequest={spellTargetRequest}
                                    chatRequest={chatRequest}
                                    runtimeTiming={runtimeTiming}
                                    hotkeySettings={hotkeySettings}
                                    macros={macros}
                                    soundVolume={soundVolume}
                                    onMapChange={setSelectedMap}
                                    onStatusChange={handleStatusChange}
                                    onHudChange={setHud}
                                    onConsoleMessage={appendConsoleEntry}
                                    onGlobalNotice={handleGlobalNotice}
                                    onTradeStateChange={setTradeState}
                                    onMarketStateChange={setMarketState}
                                    onRetosStateChange={setRetosState}
                                    onBailStateChange={setBailState}
                                    onCraftingStateChange={setCraftingState}
                                    onAdminIntervalsOpen={() =>
                                        setAdminIntervalsOpen(true)
                                    }
                                    onAdminOverviewSnapshot={(snapshot) => {
                                        setOverviewSnapshot(snapshot);
                                        setOverviewRefreshing(false);
                                        setOverviewOpen(true);
                                    }}
                                    onCharacterStatsSnapshot={(snapshot) => {
                                        setCharacterStatsSnapshot(snapshot);
                                        setCharacterStatsLoading(false);
                                        setCharacterStatsOpen(true);
                                    }}
                                />

                                {!arenaMode &&
                                logoutPending &&
                                logoutSecondsRemaining > 0 &&
                                !hud?.dead ? (
                                    <div className="pointer-events-none absolute left-4 top-4 z-30 rounded-2xl border border-amber-300/45 bg-stone-950/88 px-4 py-3 text-stone-100 shadow-2xl backdrop-blur-md">
                                        <div className="text-[11px] uppercase tracking-[0.28em] text-amber-300/85"><LocalizedText source={"Salida en progreso "} /></div>
                                        <div className="mt-1 text-2xl font-semibold text-amber-100">
                                            {logoutSecondsRemaining}s
                                        </div>
                                        <div className="mt-1 text-xs text-stone-300/85"><LocalizedText source={"No te muevas, no ataques y no castees. "} /></div>
                                    </div>
                                ) : null}

                                {challengeOverlayText ? (
                                    <div className="pointer-events-none absolute right-3 top-3 z-30">
                                        <div className="rounded-2xl border border-cyan-200/30 bg-stone-950/84 px-4 py-2 text-center shadow-xl backdrop-blur-md">
                                            <div className="text-[10px] uppercase tracking-[0.24em] text-cyan-200/70"><LocalizedText source={"Reto "} /></div>
                                            <div className="mt-0.5 text-2xl font-semibold leading-none text-cyan-100">
                                                {localizeText(challengeOverlayText)}
                                            </div>
                                        </div>
                                    </div>
                                ) : null}

                                {globalCanvasNotice ? (
                                    <div
                                        className="absolute right-4 z-30 max-w-[min(360px,calc(100%-2rem))]"
                                        style={{
                                            top: challengeOverlayText
                                                ? "88px"
                                                : "16px",
                                        }}
                                    >
                                        <LocalizedLabel><div
                                            role="button"
                                            tabIndex={0}
                                            onClick={() =>
                                                setGlobalCanvasNotice(null)
                                            }
                                            onKeyDown={(event) => {
                                                if (
                                                    event.key === "Enter" ||
                                                    event.key === " "
                                                ) {
                                                    event.preventDefault();
                                                    setGlobalCanvasNotice(null);
                                                }
                                            }}
                                            className="pointer-events-auto block w-full rounded-2xl border border-stone-200/15 bg-stone-950/72 px-4 py-3 text-left text-stone-100 shadow-xl backdrop-blur-md"
                                            aria-label="Cerrar aviso global"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-[10px] uppercase tracking-[0.24em] text-stone-300/65"><LocalizedText source={"Servidor "} /></div>
                                                    <div className="mt-1 break-words text-sm leading-5 text-stone-100/90">
                                                        {
                                                            globalCanvasNotice.text
                                                        }
                                                    </div>
                                                </div>
                                                <LocalizedLabel><button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setGlobalCanvasNotice(
                                                            null,
                                                        );
                                                    }}
                                                    className="rounded-full px-2 py-1 text-xs text-stone-400 transition hover:bg-white/5 hover:text-stone-200"
                                                    aria-label="Cerrar aviso global"
                                                >
                                                    x
                                                </button></LocalizedLabel>
                                            </div>
                                        </div></LocalizedLabel>
                                    </div>
                                ) : null}

                                <div
                                    className="pointer-events-none absolute right-4 z-30"
                                    style={{
                                        top: globalCanvasNotice
                                            ? challengeOverlayText
                                                ? "172px"
                                                : "112px"
                                            : challengeOverlayText
                                              ? "88px"
                                              : "16px",
                                    }}
                                >
                                    {!isDesktopConsoleLayout || isLeftConsoleLayout
                                        ? fullscreenToggleControl
                                        : null}
                                </div>

                                <div className="pointer-events-none absolute bottom-3 right-16 z-30 flex w-[594px] max-w-[calc(100vw-9rem)] flex-col items-center gap-3">
                                    {isChatOpen && !isLeftConsoleLayout ? (
                                        chatInputForm
                                    ) : null}

                                    {!isDesktopConsoleLayout &&
                                    isConsoleOpen ? (
                                        <div className="pointer-events-auto flex w-full flex-col overflow-hidden rounded-2xl border border-cyan-200/20 bg-stone-950/45 shadow-2xl backdrop-blur-[2px]">
                                            <div
                                                ref={consoleScrollRef}
                                                className="h-[126px] overflow-y-auto px-4 py-3 text-xs leading-5 text-stone-200/90"
                                            >
                                                {visibleConsoleEntries.length ? (
                                                    visibleConsoleEntries.map(
                                                        (entry) => (
                                                            <div
                                                                key={entry.id}
                                                                className="break-words"
                                                                style={{
                                                                    color:
                                                                        entry.color ||
                                                                        "rgba(231, 229, 228, 0.92)",
                                                                }}
                                                            >
                                                                {renderConsoleEntryText(
                                                            localizeConsoleEntry(entry, locale), locale,
                                                                )}
                                                            </div>
                                                        ),
                                                    )
                                                ) : (
                                                    <div className="text-stone-300/55"><LocalizedText source={"No hay mensajes en"} />{" "}
                                                        {localizeText(activeChatTabLabel).toLowerCase()}{" "}<LocalizedText source={"todavÃƒÂ­a. "} /></div>
                                                )}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>

                                {!isDesktopConsoleLayout ? (
                                    <div className="pointer-events-none absolute bottom-3 right-3 z-40">
                                        {isChatMenuOpen ? (
                                            <div className="pointer-events-auto absolute bottom-28 right-0 w-[156px]">
                                                {chatTabsMenu}
                                            </div>
                                        ) : null}

                                        <div className="flex flex-col items-end gap-3">
                                            <LocalizedLabel><button
                                                type="button"
                                                onClick={(event) => {
                                                    setIsChatMenuOpen(
                                                        (current) => !current,
                                                    );
                                                    event.currentTarget.blur();
                                                }}
                                                className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-cyan-200/25 bg-stone-950/38 text-cyan-100/82 shadow-xl backdrop-blur-[2px] transition hover:border-cyan-200/45 hover:bg-stone-900/50 hover:text-white focus:outline-none focus-visible:outline-none"
                                                aria-label={
                                                    isChatMenuOpen
                                                        ? localizeText("Ocultar canales")
                                                        : localizeText("Mostrar canales")
                                                }
                                                title={
                                                    isChatMenuOpen
                                                        ? localizeText("Ocultar canales")
                                                        : localizeText("Mostrar canales")
                                                }
                                                style={{
                                                    WebkitTapHighlightColor:
                                                        "transparent",
                                                }}
                                            >
                                                {!isChatMenuOpen &&
                                                totalUnreadChatCount > 0 ? (
                                                    <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-semibold leading-4 text-white">
                                                        {totalUnreadChatCount >
                                                        9
                                                            ? "9+"
                                                            : totalUnreadChatCount}
                                                    </span>
                                                ) : null}

                                                <svg
                                                    aria-hidden="true"
                                                    viewBox="0 0 24 24"
                                                    className="h-5 w-5"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="1.8"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                >
                                                    <path d="M8 6h12" />
                                                    <path d="M8 12h12" />
                                                    <path d="M8 18h12" />
                                                    <circle
                                                        cx="4"
                                                        cy="6"
                                                        r="1"
                                                    />
                                                    <circle
                                                        cx="4"
                                                        cy="12"
                                                        r="1"
                                                    />
                                                    <circle
                                                        cx="4"
                                                        cy="18"
                                                        r="1"
                                                    />
                                                </svg>
                                            </button></LocalizedLabel>


                                        </div>
                                    </div>
                                ) : null}
                            </div>

                            {isCharacterSettingsLoading ? (
                                <ScaledHudFrame
                                    scale={hudScale}
                                    baseWidth={CANVAS_BASE_WIDTH}
                                    onMeasure={handleMacroBarMeasure}
                                >
                                    <div className="flex min-h-20 items-center justify-center rounded-[24px] border border-white/8 bg-stone-950/55 px-4 py-5 text-sm text-stone-400 shadow-xl backdrop-blur-md"><LocalizedText source={"Cargando macros... "} /></div>
                                </ScaledHudFrame>
                            ) : (
                                <ScaledHudFrame
                                    scale={hudScale}
                                    baseWidth={CANVAS_BASE_WIDTH}
                                    onMeasure={handleMacroBarMeasure}
                                >
                                    <MacroBar
                                        hud={hud}
                                        connected={status.connected}
                                        hotkeySettings={hotkeySettings}
                                        macros={macros}
                                        useItemRepeatMs={useItemRepeatMs}
                                        onMacrosChange={setMacros}
                                        onUseItem={(slot) =>
                                            setUseItemURequest((current) => ({
                                                slot,
                                                token:
                                                    (current?.token ?? 0) + 1,
                                            }))
                                        }
                                        onRangeAttackRequest={() =>
                                            setRangeAttackRequest(
                                                (current) => ({
                                                    token:
                                                        (current?.token ?? 0) +
                                                        1,
                                                }),
                                            )
                                        }
                                        onCastSpell={(spell) =>
                                            setSpellTargetRequest(
                                                (current) => ({
                                                    slot: spell.slot,
                                                    manaRequired:
                                                        spell.manaRequired,
                                                    name: spell.name,
                                                    token:
                                                        (current?.token ?? 0) +
                                                        1,
                                                }),
                                            )
                                        }
                                        onSendCommand={sendChatMessage}
                                    />
                                </ScaledHudFrame>
                            )}
                        </div>

                        <ScaledHudFrame
                            scale={hudScale}
                            baseWidth={RIGHT_PANEL_WIDTH}
                            onMeasure={handleRightColumnMeasure}
                        >
                            <div
                                className="flex w-[320px] flex-col"
                                style={{ gap: "12px" }}
                            >
                                {isDesktopConsoleLayout && !isLeftConsoleLayout ? (
                                    <div className="pointer-events-none absolute right-0 top-0 z-30 -translate-y-[calc(100%+12px)]">
                                        {fullscreenToggleControl}
                                    </div>
                                ) : null}
                                <InventoryFloatingPanel
                                    hud={hud}
                                    mapName={status.worldName}
                                    connected={status.connected}
                                    characterStatsSnapshot={
                                        characterStatsSnapshot
                                    }
                                    panelHeight={`${CANVAS_BASE_HEIGHT}px`}
                                    portalTarget={gameShellElement}
                                    selectedSpellSlot={selectedSpellSlot}
                                    hotkeySettings={hotkeySettings}
                                    useItemRepeatMs={useItemRepeatMs}
                                    soundVolume={soundVolume}
                                    onHotkeySettingsChange={setHotkeySettings}
                                    onSoundVolumeChange={setSoundVolume}
                                    onSelectSpell={setSelectedSpellSlot}
                                    onCastSpell={(spell) =>
                                        setSpellTargetRequest((current) => ({
                                            slot: spell.slot,
                                            manaRequired: spell.manaRequired,
                                            name: spell.name,
                                            token: (current?.token ?? 0) + 1,
                                        }))
                                    }
                                    onEquipRequest={(slot) =>
                                        setEquipRequest((current) => ({
                                            slot,
                                            token: (current?.token ?? 0) + 1,
                                        }))
                                    }
                                    onUseItemClickRequest={(slot) =>
                                        setUseItemClickRequest((current) => ({
                                            slot,
                                            token: (current?.token ?? 0) + 1,
                                        }))
                                    }
                                    onUseItemURequest={(slot) =>
                                        setUseItemURequest((current) => ({
                                            slot,
                                            token: (current?.token ?? 0) + 1,
                                        }))
                                    }
                                    onMoveInventoryItem={(
                                        sourceSlot,
                                        targetSlot,
                                    ) => {
                                        setHud((currentHud) => {
                                            if (!currentHud) {
                                                return currentHud;
                                            }

                                            const sourceItem =
                                                currentHud.inventory.find(
                                                    (item) =>
                                                        item.slot ===
                                                        sourceSlot,
                                                ) ?? null;

                                            if (!sourceItem) {
                                                return currentHud;
                                            }

                                            const nextInventory =
                                                currentHud.inventory.flatMap(
                                                    (item) => {
                                                        if (
                                                            item.slot ===
                                                            sourceSlot
                                                        ) {
                                                            return [
                                                                {
                                                                    ...item,
                                                                    slot: targetSlot,
                                                                },
                                                            ];
                                                        }

                                                        if (
                                                            item.slot ===
                                                            targetSlot
                                                        ) {
                                                            return [
                                                                {
                                                                    ...item,
                                                                    slot: sourceSlot,
                                                                },
                                                            ];
                                                        }

                                                        return [item];
                                                    },
                                                );

                                            setReorderInventoryRequest(
                                                (current) => ({
                                                    sourceSlot,
                                                    targetSlot,
                                                    token:
                                                        (current?.token ?? 0) +
                                                        1,
                                                }),
                                            );

                                            return {
                                                ...currentHud,
                                                inventory: nextInventory,
                                            };
                                        });
                                    }}
                                    onRangeAttackRequest={() =>
                                        setRangeAttackRequest((current) => ({
                                            token: (current?.token ?? 0) + 1,
                                        }))
                                    }
                                    onMoveSpell={(slot, direction) => {
                                        setHud((currentHud) => {
                                            if (!currentHud) {
                                                return currentHud;
                                            }

                                            const sortedSpells =
                                                currentHud.spells
                                                    .slice()
                                                    .sort(
                                                        (left, right) =>
                                                            left.slot -
                                                            right.slot,
                                                    );
                                            const spellIndex =
                                                sortedSpells.findIndex(
                                                    (spell) =>
                                                        spell.slot === slot,
                                                );

                                            if (spellIndex === -1) {
                                                return currentHud;
                                            }

                                            const targetIndex =
                                                direction === "up"
                                                    ? spellIndex - 1
                                                    : spellIndex + 1;
                                            const targetSpell =
                                                sortedSpells[targetIndex] ??
                                                null;

                                            if (!targetSpell) {
                                                return currentHud;
                                            }

                                            const movingSpell =
                                                currentHud.spells.find(
                                                    (spell) =>
                                                        spell.slot === slot,
                                                ) ?? null;

                                            if (!movingSpell) {
                                                return currentHud;
                                            }

                                            const nextSpells =
                                                currentHud.spells.map(
                                                    (spell) => {
                                                        if (
                                                            spell.slot === slot
                                                        ) {
                                                            return {
                                                                ...spell,
                                                                slot: targetSpell.slot,
                                                            };
                                                        }

                                                        if (
                                                            spell.slot ===
                                                            targetSpell.slot
                                                        ) {
                                                            return {
                                                                ...spell,
                                                                slot,
                                                            };
                                                        }

                                                        return spell;
                                                    },
                                                );

                                            const movedSpell =
                                                nextSpells.find(
                                                    (spell) =>
                                                        spell.idSpell ===
                                                        movingSpell.idSpell,
                                                ) ?? null;

                                            setSelectedSpellSlot(
                                                movedSpell?.slot ??
                                                    targetSpell.slot,
                                            );
                                            setReorderSpellRequest(
                                                (current) => ({
                                                    sourceSlot: slot,
                                                    targetSlot:
                                                        targetSpell.slot,
                                                    token:
                                                        (current?.token ?? 0) +
                                                        1,
                                                }),
                                            );

                                            return {
                                                ...currentHud,
                                                spells: nextSpells,
                                            };
                                        });
                                    }}
                                    onDropRequest={(slot, amount) =>
                                        setDropRequest((current) => ({
                                            slot,
                                            amount,
                                            token: (current?.token ?? 0) + 1,
                                        }))
                                    }
                                    onSendCommand={sendChatMessage}
                                    selectedCharacterId={
                                        authSession?.selectedCharacterId ?? null
                                    }
                                />

                                <div className="pointer-events-auto flex w-full flex-col gap-2 rounded-2xl border border-stone-700/80 bg-stone-950/84 px-4 py-3 text-xs text-stone-100 shadow-2xl backdrop-blur-md">
                                    <div className="flex items-center justify-center gap-3 uppercase tracking-[0.22em]">
                                        {authSession ? (
                                            <>
                                                <Link
                                                    href={switchCharacterHref}
                                                    prefetch={false}
                                                    onClick={
                                                        handleSwitchCharacterClick
                                                    }
                                                    className="text-cyan-300 transition hover:text-cyan-200"
                                                >
                                                    {localizeText(switchCharacterLabel)}
                                                </Link>
                                            </>
                                        ) : (
                                            <>
                                                <Link
                                                    href="/login"
                                                    prefetch={false}
                                                    className="text-cyan-300 transition hover:text-cyan-200"
                                                >
                                                    Login
                                                </Link>
                                                <Link
                                                    href="/register"
                                                    prefetch={false}
                                                    className="text-stone-400 transition hover:text-stone-200"
                                                >{localizeKey("auth.registration")}</Link>
                                            </>
                                        )}
                                    </div>

                                    {authSession && !arenaMode ? (
                                        <div className="text-center text-[11px] leading-5 tracking-[0.04em] text-stone-300/85">
                                            {localizeText("En zona insegura cerrÃƒÂ¡ el personaje con /salir o quedarÃƒÂ¡ conectado por 10 segundos.")}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </ScaledHudFrame>
                    </div>
                </div>
            </div>

            {marketState ? (
                <MarketModal
                    marketState={marketState}
                    inventory={hud?.inventory ?? []}
                    gold={hud?.gold ?? 0}
                    currentCharacterName={hud?.nameCharacter ?? null}
                    onClose={() => {
                        setMarketState(null);
                        setCloseTradeRequest((current) => ({
                            token: (current?.token ?? 0) + 1,
                        }));
                    }}
                    onRefresh={(browse: MarketBrowseRequest) =>
                        setMarketActionRequest((current) => ({
                            action: "refresh",
                            payload: browse,
                            token: (current?.token ?? 0) + 1,
                        }))
                    }
                    onCreateListing={(
                        slot,
                        quantity,
                        price,
                        durationHours,
                        browse: MarketBrowseRequest,
                    ) =>
                        setMarketActionRequest((current) => ({
                            action: "create",
                            payload: {
                                slot,
                                quantity,
                                price,
                                durationHours,
                                ...browse,
                            },
                            token: (current?.token ?? 0) + 1,
                        }))
                    }
                    onBuyListing={(
                        listingId,
                        expected,
                        browse: MarketBrowseRequest,
                    ) =>
                        setMarketActionRequest((current) => ({
                            action: "buy",
                            payload: {
                                listingId,
                                expectedItemId: expected.itemId,
                                expectedQuantity: expected.quantity,
                                expectedPrice: expected.price,
                                ...browse,
                            },
                            token: (current?.token ?? 0) + 1,
                        }))
                    }
                    onCancelListing={(listingId, browse: MarketBrowseRequest) =>
                        setMarketActionRequest((current) => ({
                            action: "cancel",
                            payload: { listingId, ...browse },
                            token: (current?.token ?? 0) + 1,
                        }))
                    }
                    onClaim={(browse: MarketBrowseRequest) =>
                        setMarketActionRequest((current) => ({
                            action: "claim",
                            payload: browse,
                            token: (current?.token ?? 0) + 1,
                        }))
                    }
                />
            ) : null}

            {tradeState ? (
                <TradeModal
                    mode={tradeState.mode}
                    merchantItems={tradeState.merchantItems}
                    playerItems={tradePlayerItems}
                    gold={hud?.gold ?? 0}
                    bankTab={tradeState.bankTab}
                    vaultGold={tradeState.vaultGold}
                    hasClanVault={tradeState.hasClanVault}
                    clanName={tradeState.clanName}
                    bankStatusMessage={tradeStatusMessage}
                    onClose={() => {
                        setTradeState(null);
                        setTradeStatusMessage(null);
                        setCloseTradeRequest((current) => ({
                            token: (current?.token ?? 0) + 1,
                        }));
                    }}
                    onBankTabChange={(tab) => {
                        setTradeStatusMessage(null);
                        setChangeBankTabRequest((current) => ({
                            tab,
                            token: (current?.token ?? 0) + 1,
                        }));
                    }}
                    onBuyRequest={(slot, amount) =>
                        setBuyRequest((current) => ({
                            slot,
                            amount,
                            token: (current?.token ?? 0) + 1,
                        }))
                    }
                    onSellRequest={(slot, amount) =>
                        setSellRequest((current) => ({
                            slot,
                            amount,
                            token: (current?.token ?? 0) + 1,
                        }))
                    }
                    onDepositGoldRequest={(amount) =>
                        setDepositBankGoldRequest((current) => ({
                            amount,
                            token: (current?.token ?? 0) + 1,
                        }))
                    }
                    onWithdrawGoldRequest={(amount) =>
                        setWithdrawBankGoldRequest((current) => ({
                            amount,
                            token: (current?.token ?? 0) + 1,
                        }))
                    }
                    onEquipRequest={(slot) =>
                        setEquipRequest((current) => ({
                            slot,
                            token: (current?.token ?? 0) + 1,
                        }))
                    }
                    onMoveBankItem={(sourceSlot, targetSlot) =>
                        setReorderBankRequest((current) => ({
                            sourceSlot,
                            targetSlot,
                            token: (current?.token ?? 0) + 1,
                        }))
                    }
                />
            ) : null}

            {bailState ? (
                <BailModal
                    kills={bailState.kills}
                    citizensKilled={bailState.citizensKilled}
                    fianzaCount={bailState.fianza}
                    goldRequired={bailState.goldRequired}
                    goldAvailable={hud?.gold ?? bailState.goldAvailable}
                    canPay={
                        (hud?.gold ?? bailState.goldAvailable) >=
                        bailState.goldRequired
                    }
                    onClose={() => setBailState(null)}
                    onPay={handlePayBail}
                />
            ) : null}

            {craftingState ? (
                <CraftingModal
                    title={craftingState.title}
                    recipes={craftingState.recipes}
                    inventory={hud?.inventory ?? []}
                    onClose={() => setCraftingState(null)}
                    onCraftRequest={(itemId, amount) =>
                        setCraftRequest((current) => ({
                            profession: craftingState.profession,
                            itemId,
                            amount,
                            token: (current?.token ?? 0) + 1,
                        }))
                    }
                />
            ) : null}

            {retosOpen ? (
                <RetosModal
                    challenges={retosState?.challenges ?? []}
                    currentCharacterId={hud?.id ?? null}
                    currentCharacterName={hud?.nameCharacter ?? null}
                    loading={retosLoading}
                    error={retosError}
                    info={retosInfo}
                    actionKey={retosActionKey}
                    onClose={() => {
                        setRetosOpen(false);
                        setRetosError(null);
                        setRetosInfo(null);
                    }}
                    onRefresh={() => {
                        setRetosActionKey("refresh");
                        requestRetosState("refresh");
                    }}
                    onCreateChallenge={(teamSize) => {
                        setRetosActionKey(`create-${teamSize}`);
                        requestRetosState("create", { teamSize });
                    }}
                    onJoinChallenge={(challengeId) => {
                        setRetosActionKey(`join-${challengeId}`);
                        requestRetosState("join", { challengeId });
                        setRetosOpen(false);
                    }}
                    onCancelChallenge={(challengeId) => {
                        setRetosActionKey(`cancel-${challengeId}`);
                        requestRetosState("cancel", { challengeId });
                    }}
                />
            ) : null}

            <CharacterStatsModal
                hud={hud}
                snapshot={characterStatsSnapshot}
                isOpen={characterStatsOpen}
                isLoading={characterStatsLoading}
                onClose={() => {
                    setCharacterStatsOpen(false);
                    setCharacterStatsLoading(false);
                }}
            />

            {deathHomePromptOpen ? (
                <div className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-6">
                    <div className="w-full max-w-sm rounded-2xl border border-amber-200/20 bg-[linear-gradient(180deg,rgba(28,18,12,0.96),rgba(14,10,8,0.96))] p-4 text-stone-100 shadow-[0_20px_80px_rgba(0,0,0,0.55)] backdrop-blur-md">
                        <p className="text-[11px] uppercase tracking-[0.28em] text-amber-200/75">{localizeText("Personaje muerto")}</p>
                        <h2 className="mt-2 text-lg font-semibold text-[#f3e7c8]">
                            {localizeText(deathHomeTitle)}
                        </h2>
                        <p className="mt-2 text-sm text-stone-300">
                            {localizeText(deathHomeDescription)}
                        </p>

                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setDeathHomePromptOpen(false)}
                                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-stone-200 transition hover:bg-white/10"
                            >{localizeKey("common.cancel")}</button>
                            <button
                                type="button"
                                onClick={handleDeathHomeConfirm}
                                className="rounded-xl px-4 py-2 text-sm font-semibold text-stone-950 transition"
                                style={{
                                    background:
                                        "linear-gradient(135deg, #f8d47b 0%, #d6a546 100%)",
                                }}
                            >{localizeText("Aceptar")}</button>
                        </div>
                    </div>
                </div>
            ) : null}

            {showFullscreenPrompt ? (
                <div className="fixed inset-0 z-[88] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-[28px] border border-cyan-200/20 bg-[linear-gradient(180deg,rgba(16,19,28,0.96),rgba(8,10,18,0.98))] p-6 text-stone-100 shadow-[0_30px_120px_rgba(0,0,0,0.6)]">
                        <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200/75">{localizeKey("fullscreen.recommend")}</p>
                        <h2 className="mt-2 text-xl font-semibold text-cyan-50">{localizeKey("fullscreen.title")}</h2>
                        <p className="mt-3 text-sm leading-6 text-stone-300">{localizeKey("fullscreen.body")}</p>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    dismissFullscreenPrompt();
                                }}
                                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-stone-200 transition hover:bg-white/10"
                            >{localizeKey("fullscreen.stay")}</button>
                            <button
                                type="button"
                                onClick={(event) => {
                                    void toggleFullscreen();
                                    dismissFullscreenPrompt();
                                    event.currentTarget.blur();
                                }}
                                className="rounded-xl px-4 py-2 text-sm font-semibold text-stone-950 transition"
                                style={{
                                    background:
                                        "linear-gradient(135deg, #7dd3fc 0%, #38bdf8 100%)",
                                }}
                            >{localizeKey("fullscreen.open")}</button>
                        </div>
                    </div>
                </div>
            ) : null}

            {adminIntervalsOpen && hud?.privileges === 1 ? (
                <AdminIntervalsModal
                    timing={runtimeTiming}
                    isOpen={adminIntervalsOpen}
                    savingPath={adminIntervalsSavingPath}
                    onClose={() => {
                        setAdminIntervalsOpen(false);
                        setAdminIntervalsSavingPath(null);
                    }}
                    onRefresh={refreshRuntimeTiming}
                    onSave={handleAdminIntervalSave}
                />
            ) : null}

            {overviewOpen && hud?.privileges === 1 ? (
                <OverviewModal
                    snapshot={overviewSnapshot}
                    isOpen={overviewOpen}
                    isRefreshing={overviewRefreshing}
                    onClose={() => {
                        setOverviewOpen(false);
                        setOverviewRefreshing(false);
                    }}
                    onRefresh={refreshOverview}
                />
            ) : null}

            {status.error || fullscreenError ? (
                <div className="fixed left-4 top-24 z-50 max-w-sm rounded-2xl bg-stone-950/88 px-4 py-3 text-sm text-rose-300 shadow-2xl backdrop-blur-md">
                    <LocalizedText source={status.error || fullscreenError} />
                </div>
            ) : null}

            {isHotkeyIntroOpen ? (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 sm:p-6 backdrop-blur-sm">
                    <div role="dialog" aria-modal="true" aria-labelledby="hotkey-intro-title" className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-amber-200/20 bg-[linear-gradient(180deg,rgba(28,18,12,0.98),rgba(14,10,8,0.98))] p-4 sm:max-h-[calc(100dvh-3rem)] sm:p-6 text-stone-100 shadow-[0_30px_120px_rgba(0,0,0,0.6)]">
                        <div className="flex shrink-0 items-start justify-between gap-4">
                            <div>
                                <p className="text-[11px] uppercase tracking-[0.28em] text-amber-200/75">{localizeKey("welcome.hello")}</p>
                                <h2 id="hotkey-intro-title" className="mt-2 text-xl sm:text-2xl font-semibold text-[#f3e7c8]">{localizeKey("welcome.title")}</h2>
                                <p className="mt-2 max-w-xl text-sm leading-6 text-stone-300">{localizeKey("welcome.body")}</p>
                            </div>
                            <button
                                type="button"
                                onClick={dismissHotkeyIntro}
                                className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-stone-300 transition hover:border-amber-300/35 hover:text-white"
                            >{localizeKey("common.close")}</button>
                        </div>

                        <div tabIndex={0} className="mt-4 min-h-0 overflow-y-auto overscroll-contain pr-2 sm:mt-6">
                        <div className="grid gap-2 sm:gap-3 sm:grid-cols-2">
                            {defaultHotkeyIntroItems.map((item) => (
                                <div
                                    key={item.label}
                                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/6 bg-black/20 px-4 py-3"
                                >
                                    <span className="text-sm text-stone-300">
                                        <LocalizedText source={item.label} />
                                    </span>
                                    <span className="rounded-xl border border-amber-300/20 bg-amber-200/10 px-3 py-1 text-sm font-semibold text-amber-100">
                                        {localizeText(item.value)}
                                    </span>
                                </div>
                            ))}
                        </div>
                        </div>

                        <div className="mt-4 flex shrink-0 justify-end sm:mt-6">
                            <button
                                type="button"
                                onClick={dismissHotkeyIntro}
                                className="rounded-2xl border border-amber-300/35 bg-amber-200/10 px-5 py-2.5 text-sm font-semibold text-amber-100 transition hover:border-amber-300/60 hover:bg-amber-200/15"
                            >{localizeKey("welcome.accept")}</button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default function Home() {
    return (
        <Suspense fallback={<main className="min-h-screen bg-black" />}>
            <HomeContent />
        </Suspense>
    );
}
