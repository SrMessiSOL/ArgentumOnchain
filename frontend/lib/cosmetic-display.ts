export type CosmeticKind = 'explorer' | 'first-hunt';
export type VerifiedCosmetic = {kind: CosmeticKind; expiresAt: number};

/** Presentation only. The API verifies ownership; this never grants game rights. */
export function verifiedCosmetic(status: unknown, now: number): VerifiedCosmetic | null {
    if (!status || typeof status !== 'object') return null;
    const value = status as Record<string, unknown>;
    if (value.equipped !== true || value.verification !== 'verified' ||
        typeof value.equippedAsset !== 'string' || !value.equippedAsset ||
        !['explorer', 'first-hunt'].includes(String(value.equippedKind))) return null;
    return {kind: value.equippedKind as CosmeticKind, expiresAt: now + 35_000};
}

export function visibleCosmetic(value: VerifiedCosmetic | null, now: number, hidden: boolean): CosmeticKind | null {
    return value && value.expiresAt > now && !hidden ? value.kind : null;
}
