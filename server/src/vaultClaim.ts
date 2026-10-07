/** Claim only after loading: another request may have acquired the vault during I/O. */
export function claimLoadedVault<T>(sessions: Map<string, T>, key: string, candidate: T): T {
    const existing = sessions.get(key);
    if (existing) return existing;
    sessions.set(key, candidate);
    return candidate;
}
