import { AnimatedSprite, Sprite } from "pixi.js";
import {translateSource, parseLocale} from '@/lib/i18n';
import type { ObjectData } from "../../../types/game";
import { OBJECT_TYPE, type PlayerHudState } from "../../../lib/aowProtocol";
import type { RuntimeTimingConfig } from "../../../lib/runtime-config";
import type { Character } from "../engine/Engine";

const GHOST_ALPHA = 0.45;
const PARTY_INVISIBLE_ALPHA = 0.4;

export type TreeFadeSource = "object" | "layer3";

export type TreeSpriteEntry = {
    tileKey: string;
    x: number;
    y: number;
    sprite: Sprite | AnimatedSprite;
    source: TreeFadeSource;
    isFaded: boolean;
};

function clampAlpha(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function easeInCubic(progress: number): number {
    const clampedProgress = Math.max(0, Math.min(1, progress));

    return clampedProgress * clampedProgress * clampedProgress;
}

function easeOutCubic(progress: number): number {
    const clampedProgress = Math.max(0, Math.min(1, progress));

    return 1 - Math.pow(1 - clampedProgress, 3);
}

function lerp(start: number, end: number, progress: number): number {
    return start + (end - start) * progress;
}

export function hasPulsingInvisibility(
    character: Character | null | undefined,
): boolean {
    return Boolean(character?.invisibleSpell || character?.hiddenSkill);
}

export function isInvisiblePartyMember(
    character: Character | null | undefined,
    localPartyMemberIds?: ReadonlySet<string>,
): boolean {
    if (!character || !hasPulsingInvisibility(character)) {
        return false;
    }

    return Boolean(
        character.isPartyMember ||
        localPartyMemberIds?.has(String(character.id)),
    );
}

export function isInvisibleClanMember(
    character: Character | null | undefined,
    localClanTag?: string,
): boolean {
    if (!character || !hasPulsingInvisibility(character)) {
        return false;
    }

    return Boolean(
        localClanTag && character.clan && character.clan === localClanTag,
    );
}

export function canRenderInvisibleAsTransparent(
    character: Character | null | undefined,
    options?: {
        isLocalCharacter?: boolean;
        localPartyMemberIds?: ReadonlySet<string>;
        localClanTag?: string;
        isAdminViewer?: boolean;
    },
): boolean {
    if (!hasPulsingInvisibility(character)) {
        return false;
    }

    if (options?.isLocalCharacter || options?.isAdminViewer) {
        return true;
    }

    if (isInvisiblePartyMember(character, options?.localPartyMemberIds)) {
        return true;
    }

    return isInvisibleClanMember(character, options?.localClanTag);
}

export function getCharacterNameLabel(
    character: Character | null | undefined,
): string {
    const locale=typeof document==='undefined'?'en':parseLocale(document.documentElement.lang);
    const name=character?.nameCharacter;
    return name ? (character?.isNpc ? translateSource(name,locale):name) : translateSource('Jugador',locale);
}

export function getCharacterClanLabel(
    character: Character | null | undefined,
): string | null {
    return character?.clan ?? null;
}

export function shouldHighlightClanTag(
    character: Character | null | undefined,
    localClanTag: string | null | undefined,
    playerHud: Pick<PlayerHudState, "zonaSegura"> | null | undefined,
): boolean {
    if (!character?.clan || !localClanTag || character.clan !== localClanTag) {
        return false;
    }

    return (playerHud?.zonaSegura ?? character?.zonaSegura) === 0;
}

export function getInvisibilityCycleAlpha(
    startedAt: number,
    timing: RuntimeTimingConfig,
    now = Date.now(),
): number {
    const fadeOutMs = Math.max(1, timing.visualEffects.invisibilityFadeOutMs);
    const fadeInMs = Math.max(1, timing.visualEffects.invisibilityFadeInMs);
    const minAlpha = clampAlpha(timing.visualEffects.invisibilityMinAlpha);
    const maxAlpha = clampAlpha(timing.visualEffects.invisibilityMaxAlpha);
    const hiddenAlpha = Math.min(minAlpha, maxAlpha);
    const visibleAlpha = Math.max(minAlpha, maxAlpha);
    const cycleDurationMs = fadeOutMs + fadeInMs;
    const elapsedInCycle = Math.max(0, now - startedAt) % cycleDurationMs;

    if (elapsedInCycle < fadeOutMs) {
        return lerp(
            visibleAlpha,
            hiddenAlpha,
            easeOutCubic(elapsedInCycle / fadeOutMs),
        );
    }

    return lerp(
        hiddenAlpha,
        visibleAlpha,
        easeInCubic((elapsedInCycle - fadeOutMs) / fadeInMs),
    );
}

export function isTreeObjectData(objectData: ObjectData | undefined): boolean {
    if (!objectData) {
        return false;
    }

    if (objectData.objType === OBJECT_TYPE.arboles) {
        return true;
    }

    const normalizedName = objectData.name
        .normalize("NFD")
        .replace(/[^\x00-\x7F]/g, "")
        .trim()
        .toLowerCase();

    return normalizedName === "arbol" || normalizedName.startsWith("arbol ");
}

export function getCharacterRenderAlpha(
    character: Character | null | undefined,
    timing: RuntimeTimingConfig,
    options?: {
        isLocalCharacter?: boolean;
        localPartyMemberIds?: ReadonlySet<string>;
        localClanTag?: string;
        isAdminViewer?: boolean;
    },
): number {
    if (!character) {
        return 1;
    }

    if (character.invisibleAdmin || character.dead) {
        return GHOST_ALPHA;
    }

    if (hasPulsingInvisibility(character)) {
        if (canRenderInvisibleAsTransparent(character, options)) {
            return PARTY_INVISIBLE_ALPHA;
        }

        return getInvisibilityCycleAlpha(
            character.invisibilityCycleStartedAt ?? Date.now(),
            timing,
        );
    }

    return 1;
}

export function shouldHideRemoteCharacterName(
    character: Character | null | undefined,
    localPartyMemberIds?: ReadonlySet<string>,
    localClanTag?: string,
    isAdminViewer?: boolean,
): boolean {
    if (
        canRenderInvisibleAsTransparent(character, {
            localPartyMemberIds,
            localClanTag,
            isAdminViewer,
        })
    ) {
        return false;
    }

    return hasPulsingInvisibility(character);
}
