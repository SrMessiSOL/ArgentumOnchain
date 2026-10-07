import assert from "node:assert/strict";
import crypto from "node:crypto";
import pool from "../../db";

export const API_URL = (
    process.env.API_TEST_URL || "http://127.0.0.1:3001"
).replace(/\/+$/, "");
export const API_AUTH =
    process.env.API_TEST_AUTH ||
    process.env.TOKEN_AUTH ||
    "changeme";

export type SessionPayload = {
    sessionToken: string;
    account: {
        _id: string;
        name: string;
        email: string;
    };
    characters: Array<{
        _id: string;
        name: string;
        level: number;
        map: number;
        id_head: number;
        id_body: number;
        id_weapon: number;
        id_shield: number;
        id_helmet: number;
    }>;
    selectedCharacterId?: string | null;
};

export type CreatedCharacter = {
    id: string;
    name: string;
    accountId: string;
    email: string;
    sessionToken: string;
};

export type VaultItem = {
    idPos: number;
    idItem: number;
    cant: number;
};

export type CharacterItem = VaultItem & {
    equipped: boolean;
};

export type VaultResponse = {
    gold: number;
    items: VaultItem[];
};

export type MarketListingResponse = {
    id: string;
    sellerCharacterId: string;
    sellerName: string;
    buyerCharacterId: string | null;
    buyerName: string | null;
    itemId: number;
    quantity: number;
    price: number;
    publicationFee: number;
    status: "active" | "sold" | "expired" | "cancelled";
    expiresAt: string;
    soldAt: string | null;
    createdAt: string;
};

export type MarketClaimResponse = {
    id: string;
    ownerCharacterId: string;
    claimType: "gold" | "item";
    goldAmount: number;
    itemId: number | null;
    itemQuantity: number | null;
    sourceListingId: string | null;
    createdAt: string;
};

export type CharacterLookupResponse = {
    account: {
        _id: string;
        email: string;
    };
    character: {
        _id: string;
        gold?: number;
        clanId?: string | null;
        homeMap?: number;
        homeX?: number;
        homeY?: number;
        items?: CharacterItem[];
    };
};

export type CharacterBankItem = {
    idPos: number;
    idItem: number;
    cant: number;
};

export type CharacterSpell = {
    idPos: number;
    idSpell: number;
};

export type ClanOverviewPayload = {
    currentClan: {
        id: string;
        name: string;
        leaderCharacterId?: string;
        memberCount?: number;
        requests?: Array<{ id: string; characterId: string; name?: string }>;
        members?: Array<{ characterId: string; role: string; name: string }>;
    } | null;
    pendingRequestClanId: string | null;
    clans: Array<{
        id: string;
        name: string;
        alignment: string;
        minJoinLevel: number;
        memberCount: number;
        leaderName: string;
    }>;
};

export type ArenaRoomPayload = {
    id: string;
    name: string;
    isPublic: boolean;
    joinToken: string;
    capacity: number;
    connectedPlayers: number;
    isOwner?: boolean;
    owner: { _id: string; name: string };
    member: { selectedPvpTemplateId: number | null; connected: boolean } | null;
};

export type ClanOverviewResponse = {
    currentClan: {
        id: string;
        name: string;
        requests: Array<{
            id: string;
            characterId: string;
        }>;
    } | null;
};

export type AuthErrorResponse = {
    error?: string;
};

export type ConsumedGameTicketPayload = {
    account?: { _id: string; name: string; email: string };
    character?: { _id: string; name: string };
    arena?: { roomId: string; pvpTemplateId: number };
    mode?: string;
};

export type PasswordResetStatusResponse = {
    valid: boolean;
};

export type GameTicketResponse = {
    ticket: string;
    expiresAt: string;
};

export function uniqueLetters(length: number): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let value = "";

    for (let index = 0; index < length; index += 1) {
        value += alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    return value;
}

export function buildCharacterName(prefix: string): string {
    return `${prefix} ${uniqueLetters(4)}`.slice(0, 15);
}

export function buildClanName(prefix: string): string {
    return `${prefix} ${uniqueLetters(4)}`.slice(0, 18);
}

export async function requestJson<T>(
    path: string,
    init?: RequestInit,
): Promise<{ status: number; ok: boolean; data: T }> {
    const response = await fetch(`${API_URL}${path}`, init);
    const data = (await response.json().catch(() => null)) as T;
    return { status: response.status, ok: response.ok, data };
}

export function expectSuccessPayload<T>(data: unknown): T {
    assert.equal(
        typeof (data as { error?: unknown } | null)?.error,
        "undefined",
        JSON.stringify(data),
    );
    return data as T;
}

export function expectErrorPayload(data: unknown): { error: string } {
    assert.equal(
        typeof (data as { error?: unknown } | null)?.error,
        "string",
        JSON.stringify(data),
    );
    return data as { error: string };
}

export async function ensureApiReady(): Promise<void> {
    const response = await requestJson<{ ok?: boolean }>("/health");
    assert.equal(response.ok, true, "La API no está disponible para los tests");
}

export async function registerAccount(
    name: string,
    email: string,
    password: string,
) {
    const response = await requestJson<SessionPayload | { error: string }>(
        "/auth/register",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ name, email, password }),
        },
    );

    assert.equal(response.ok, true, JSON.stringify(response.data));
    return response.data as SessionPayload;
}

export async function loginAccount(identifier: string, password: string) {
    return requestJson<SessionPayload | AuthErrorResponse>("/auth/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ identifier, password }),
    });
}

export async function getAuthSession(sessionToken: string) {
    return requestJson<SessionPayload | AuthErrorResponse>("/auth/session", {
        headers: {
            Authorization: `Bearer ${sessionToken}`,
        },
    });
}

export async function getAuthMe(sessionToken: string) {
    return requestJson<SessionPayload | AuthErrorResponse>("/auth/me", {
        headers: {
            Authorization: `Bearer ${sessionToken}`,
        },
    });
}

export async function logoutSession(sessionToken: string) {
    return requestJson<{ ok?: boolean } | AuthErrorResponse>("/auth/logout", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${sessionToken}`,
        },
    });
}

export async function createCharacter(
    sessionToken: string,
    name: string,
): Promise<SessionPayload> {
    const response = await requestJson<SessionPayload | { error: string }>(
        "/auth/create-character",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({
                name,
                class: "guerrero",
                race: "humano",
                gender: "male",
                headId: 1,
            }),
        },
    );

    assert.equal(response.ok, true, JSON.stringify(response.data));
    return response.data as SessionPayload;
}

export async function selectCharacter(
    sessionToken: string,
    characterId: string,
): Promise<void> {
    const response = await requestJson<SessionPayload | { error: string }>(
        "/auth/select-character",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({ characterId }),
        },
    );

    assert.equal(response.ok, true, JSON.stringify(response.data));
}

export async function selectCharacterRequest(
    sessionToken: string,
    characterId: string,
) {
    return requestJson<SessionPayload | AuthErrorResponse>(
        "/auth/select-character",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({ characterId }),
        },
    );
}

export async function deleteCharacter(
    sessionToken: string,
    characterId: string,
) {
    return requestJson<SessionPayload | AuthErrorResponse>(
        `/auth/characters/${encodeURIComponent(characterId)}`,
        {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${sessionToken}`,
            },
        },
    );
}

export async function patchCharacter(
    characterId: string,
    patch: Record<string, unknown>,
): Promise<void> {
    const response = await requestJson<{ error?: string }>(
        `/character_save/${encodeURIComponent(characterId)}`,
        {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: API_AUTH,
            },
            body: JSON.stringify(patch),
        },
    );

    assert.equal(response.ok, true, JSON.stringify(response.data));
}

export async function connectCharacter(characterId: string) {
    return requestJson<{ ok?: boolean; error?: string }>(
        `/internal/characters/${encodeURIComponent(characterId)}/connect`,
        {
            method: "POST",
            headers: {
                Authorization: API_AUTH,
            },
        },
    );
}

export async function disconnectCharacter(characterId: string) {
    return requestJson<{ ok?: boolean; error?: string }>(
        `/internal/characters/${encodeURIComponent(characterId)}/disconnect`,
        {
            method: "POST",
            headers: {
                Authorization: API_AUTH,
            },
        },
    );
}

export async function putCharacterItems(characterId: string, items: unknown) {
    return requestJson<{ ok?: boolean; error?: string }>(
        `/character_save/${encodeURIComponent(characterId)}/items`,
        {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: API_AUTH,
            },
            body: JSON.stringify({ items }),
        },
    );
}

export async function putCharacterBank(
    characterId: string,
    bankItems: unknown,
) {
    return requestJson<{ ok?: boolean; error?: string }>(
        `/character_save/${encodeURIComponent(characterId)}/bank`,
        {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: API_AUTH,
            },
            body: JSON.stringify({ bankItems }),
        },
    );
}

export async function putCharacterStorage(
    characterId: string,
    payload: unknown,
) {
    return requestJson<{ ok?: boolean; error?: string }>(
        `/character_save/${encodeURIComponent(characterId)}/storage`,
        {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: API_AUTH,
            },
            body: JSON.stringify(payload),
        },
    );
}

export async function putCharacterSpells(characterId: string, spells: unknown) {
    return requestJson<{ ok?: boolean; error?: string }>(
        `/character_save/${encodeURIComponent(characterId)}/spells`,
        {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: API_AUTH,
            },
            body: JSON.stringify({ spells }),
        },
    );
}

export async function createWorldGameTicket(sessionToken: string) {
    return requestJson<GameTicketResponse | AuthErrorResponse>(
        "/auth/game-ticket",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${sessionToken}`,
            },
        },
    );
}

export async function consumeGameTicket(ticket: string, clientIp?: string) {
    return requestJson<ConsumedGameTicketPayload | AuthErrorResponse>(
        "/game-ticket/consume",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: API_AUTH,
            },
            body: JSON.stringify({ ticket, clientIp }),
        },
    );
}

export async function requestPasswordReset(email: string, ip?: string) {
    return requestJson<{ message?: string; error?: string }>(
        "/auth/password-reset/request",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(ip ? { "x-forwarded-for": ip } : {}),
            },
            body: JSON.stringify({ email }),
        },
    );
}

export async function getAuthClans(sessionToken: string) {
    return requestJson<ClanOverviewPayload | AuthErrorResponse>("/auth/clans", {
        headers: {
            Authorization: `Bearer ${sessionToken}`,
        },
    });
}

export async function getAuthClanDetails(sessionToken: string, clanId: string) {
    return requestJson<{
        id?: string;
        name?: string;
        alignment?: string;
        requests?: Array<{ id: string; characterId: string; name?: string }>;
        members?: Array<{ characterId: string; role: string; name: string }>;
        error?: string;
    }>(`/auth/clans/${encodeURIComponent(clanId)}`, {
        headers: {
            Authorization: `Bearer ${sessionToken}`,
        },
    });
}

export async function createClan(payload: unknown) {
    return requestJson<{ ok?: boolean; clanId?: string; error?: string }>(
        "/internal/clans",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: API_AUTH,
            },
            body: JSON.stringify(payload),
        },
    );
}

export async function createClanRequest(payload: unknown) {
    return requestJson<{
        ok?: boolean;
        requestClanId?: string;
        error?: string;
    }>("/internal/clans/requests", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: API_AUTH,
        },
        body: JSON.stringify(payload),
    });
}

export async function acceptClanRequest(requestId: string, payload: unknown) {
    return requestJson<{
        ok?: boolean;
        applicantCharacterId?: string;
        error?: string;
    }>(`/internal/clans/requests/${encodeURIComponent(requestId)}/accept`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: API_AUTH,
        },
        body: JSON.stringify(payload),
    });
}

export async function deleteClan(payload: unknown) {
    return requestJson<{
        ok?: boolean;
        clanId?: string;
        memberCharacterIds?: string[];
        error?: string;
    }>("/internal/clans/delete", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: API_AUTH,
        },
        body: JSON.stringify(payload),
    });
}

export async function rejectClanRequest(requestId: string, payload: unknown) {
    return requestJson<{
        ok?: boolean;
        applicantCharacterId?: string;
        error?: string;
    }>(`/internal/clans/requests/${encodeURIComponent(requestId)}/reject`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: API_AUTH,
        },
        body: JSON.stringify(payload),
    });
}

export async function leaveClan(payload: unknown) {
    return requestJson<{ ok?: boolean; characterId?: string; error?: string }>(
        "/internal/clans/leave",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: API_AUTH,
            },
            body: JSON.stringify(payload),
        },
    );
}

export async function kickClanMember(payload: unknown) {
    return requestJson<{
        ok?: boolean;
        targetCharacterId?: string;
        error?: string;
    }>("/internal/clans/kick", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: API_AUTH,
        },
        body: JSON.stringify(payload),
    });
}

export async function setClanMemberRole(payload: unknown) {
    return requestJson<{
        ok?: boolean;
        clanId?: string;
        targetCharacterId?: string;
        role?: "leader" | "co_leader" | "member";
        error?: string;
    }>("/internal/clans/member-role", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: API_AUTH,
        },
        body: JSON.stringify(payload),
    });
}

export async function transferClanLeadership(payload: unknown) {
    return requestJson<{
        ok?: boolean;
        clanId?: string;
        previousLeaderCharacterId?: string;
        newLeaderCharacterId?: string;
        error?: string;
    }>("/internal/clans/transfer-leadership", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: API_AUTH,
        },
        body: JSON.stringify(payload),
    });
}

export async function listArenaRooms(sessionToken: string) {
    return requestJson<{ rooms?: ArenaRoomPayload[]; error?: string }>(
        "/arenas/rooms",
        {
            headers: {
                Authorization: `Bearer ${sessionToken}`,
            },
        },
    );
}

export async function createArenaRoom(sessionToken: string, payload: unknown) {
    return requestJson<ArenaRoomPayload | AuthErrorResponse>("/arenas/rooms", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(payload),
    });
}

export async function getArenaRoom(sessionToken: string, roomId: string) {
    return requestJson<ArenaRoomPayload | AuthErrorResponse>(
        `/arenas/rooms/${encodeURIComponent(roomId)}`,
        {
            headers: {
                Authorization: `Bearer ${sessionToken}`,
            },
        },
    );
}

export async function joinArenaRoom(
    sessionToken: string,
    roomId: string,
    payload: unknown,
) {
    return requestJson<ArenaRoomPayload | AuthErrorResponse>(
        `/arenas/rooms/${encodeURIComponent(roomId)}/join`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify(payload),
        },
    );
}

export async function joinArenaRoomByLink(
    sessionToken: string,
    joinToken: string,
) {
    return requestJson<ArenaRoomPayload | AuthErrorResponse>(
        `/arenas/join/${encodeURIComponent(joinToken)}`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${sessionToken}`,
            },
        },
    );
}

export async function leaveArenaRoom(sessionToken: string, roomId: string) {
    return requestJson<{ ok?: boolean; error?: string }>(
        `/arenas/rooms/${encodeURIComponent(roomId)}/leave`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${sessionToken}`,
            },
        },
    );
}

export async function createArenaTicket(
    sessionToken: string,
    roomId: string,
    templateId: number,
) {
    return requestJson<GameTicketResponse | AuthErrorResponse>(
        `/arenas/rooms/${encodeURIComponent(roomId)}/select-template`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({ templateId }),
        },
    );
}

export async function connectArenaRoom(roomId: string, accountId: string) {
    return requestJson<{ ok?: boolean; error?: string }>(
        `/internal/arenas/rooms/${encodeURIComponent(roomId)}/connect`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: API_AUTH,
            },
            body: JSON.stringify({ accountId }),
        },
    );
}

export async function disconnectArenaRoom(roomId: string, accountId: string) {
    return requestJson<{ ok?: boolean; error?: string }>(
        `/internal/arenas/rooms/${encodeURIComponent(roomId)}/disconnect`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: API_AUTH,
            },
            body: JSON.stringify({ accountId }),
        },
    );
}

export async function banCharacter(
    name: string,
    bannedUntil: string,
    authHeader = API_AUTH,
) {
    return requestJson<{ error?: string }>(
        "/internal/moderation/ban-character",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: authHeader,
            },
            body: JSON.stringify({ name, bannedUntil }),
        },
    );
}

export async function banIp(
    name: string,
    bannedUntil: string,
    authHeader = API_AUTH,
) {
    return requestJson<{ error?: string }>("/internal/moderation/ban-ip", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
        },
        body: JSON.stringify({ name, bannedUntil }),
    });
}

export async function unbanCharacter(name: string, authHeader = API_AUTH) {
    return requestJson<{ error?: string }>(
        "/internal/moderation/unban-character",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: authHeader,
            },
            body: JSON.stringify({ name }),
        },
    );
}

export async function unbanIp(name: string, authHeader = API_AUTH) {
    return requestJson<{ error?: string }>("/internal/moderation/unban-ip", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
        },
        body: JSON.stringify({ name }),
    });
}

export async function jailCharacter(payload: unknown, authHeader = API_AUTH) {
    return requestJson<{ error?: string }>(
        "/internal/moderation/jail-character",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: authHeader,
            },
            body: JSON.stringify(payload),
        },
    );
}

export async function getPasswordResetStatus(token: string) {
    return requestJson<PasswordResetStatusResponse | AuthErrorResponse>(
        `/auth/password-reset/${encodeURIComponent(token)}`,
    );
}

export async function confirmPasswordReset(token: string, password: string) {
    return requestJson<{ message?: string; error?: string }>(
        "/auth/password-reset/confirm",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ token, password }),
        },
    );
}

export async function createCharacterFixture(options?: {
    level?: number;
    gold?: number;
    items?: CharacterItem[];
    namePrefix?: string;
}): Promise<CreatedCharacter> {
    const nonce = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const email = `vault-api-${nonce}@local.test`;
    const password = "VaultApi123";
    const accountName = `Aow ${uniqueLetters(8)}`.slice(0, 15);
    const characterName = buildCharacterName(options?.namePrefix ?? "Vault");
    const session = await registerAccount(accountName, email, password);
    const created = await createCharacter(session.sessionToken, characterName);
    const character = created.characters.find(
        (entry) => entry.name === characterName,
    );

    assert.ok(character?._id, "No se creó el personaje de prueba");
    await selectCharacter(session.sessionToken, character._id);

    if (options?.level || options?.gold || options?.items) {
        await patchCharacter(character._id, {
            level: options.level ?? 1,
            gold: options.gold ?? 0,
            items: options.items ?? [],
            map: 1,
            posX: 50,
            posY: 50,
        });
    }

    return {
        id: character._id,
        name: characterName,
        accountId: session.account._id,
        email,
        sessionToken: session.sessionToken,
    };
}

export async function createAccountFixture(options?: {
    name?: string;
    email?: string;
    password?: string;
}) {
    const nonce = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const name = options?.name ?? `Acct ${uniqueLetters(8)}`.slice(0, 15);
    const email = options?.email ?? `acct-${nonce}@local.test`;
    const password = options?.password ?? "VaultApi123";
    const session = await registerAccount(name, email, password);

    return {
        name,
        email,
        password,
        session,
    };
}

export async function getCharacterState(
    accountId: string,
    characterId: string,
    email: string,
): Promise<{ gold: number; items: CharacterItem[]; clanId: string | null }> {
    const response = await requestJson<CharacterLookupResponse>(
        `/character?idAccount=${encodeURIComponent(accountId)}&idCharacter=${encodeURIComponent(characterId)}&email=${encodeURIComponent(email)}`,
        {
            headers: {
                Authorization: API_AUTH,
            },
        },
    );

    assert.equal(response.ok, true, JSON.stringify(response.data));

    return {
        gold: Number(response.data.character.gold ?? 0),
        items: normalizeCharacterItems(response.data.character.items ?? []),
        clanId: response.data.character.clanId ?? null,
    };
}

export async function getCharacterHomeState(
    accountId: string,
    characterId: string,
    email: string,
): Promise<{ homeMap: number; homeX: number; homeY: number }> {
    const response = await requestJson<CharacterLookupResponse>(
        `/character?idAccount=${encodeURIComponent(accountId)}&idCharacter=${encodeURIComponent(characterId)}&email=${encodeURIComponent(email)}`,
        {
            headers: {
                Authorization: API_AUTH,
            },
        },
    );

    assert.equal(response.ok, true, JSON.stringify(response.data));

    return {
        homeMap: Number(response.data.character.homeMap ?? 0),
        homeX: Number(response.data.character.homeX ?? 0),
        homeY: Number(response.data.character.homeY ?? 0),
    };
}

export async function getAccountVaultState(
    accountId: string,
): Promise<VaultResponse> {
    const response = await requestJson<VaultResponse | { error: string }>(
        `/internal/vaults/account/${encodeURIComponent(accountId)}`,
        {
            headers: {
                Authorization: API_AUTH,
            },
        },
    );

    assert.equal(response.ok, true, JSON.stringify(response.data));
    return normalizeVaultResponse(response.data as VaultResponse);
}

export async function getClanVaultState(
    clanId: string,
): Promise<VaultResponse> {
    const response = await requestJson<VaultResponse | { error: string }>(
        `/internal/vaults/clan/${encodeURIComponent(clanId)}`,
        {
            headers: {
                Authorization: API_AUTH,
            },
        },
    );

    assert.equal(response.ok, true, JSON.stringify(response.data));
    return normalizeVaultResponse(response.data as VaultResponse);
}

export async function putAccountVault(accountId: string, payload: unknown) {
    return requestJson<{ ok?: true; error?: string }>(
        `/internal/vaults/account/${encodeURIComponent(accountId)}`,
        {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: API_AUTH,
            },
            body: JSON.stringify(payload),
        },
    );
}

export async function putClanVault(clanId: string, payload: unknown) {
    return requestJson<{ ok?: true; error?: string }>(
        `/internal/vaults/clan/${encodeURIComponent(clanId)}`,
        {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: API_AUTH,
            },
            body: JSON.stringify(payload),
        },
    );
}

export async function listMarketListings(query?: {
    sellerCharacterId?: string;
    includeInactive?: boolean;
    limit?: number;
    sortPrice?: "recent" | "asc" | "desc";
}) {
    const params = new URLSearchParams();

    if (query?.sellerCharacterId) {
        params.set("sellerCharacterId", query.sellerCharacterId);
    }

    if (typeof query?.includeInactive === "boolean") {
        params.set("includeInactive", String(query.includeInactive));
    }

    if (typeof query?.limit === "number") {
        params.set("limit", String(query.limit));
    }

    if (query?.sortPrice) {
        params.set("sortPrice", query.sortPrice);
    }

    const suffix = params.toString();

    return requestJson<{ listings: MarketListingResponse[]; error?: string }>(
        `/internal/market/listings${suffix ? `?${suffix}` : ""}`,
        {
            headers: {
                Authorization: API_AUTH,
            },
        },
    );
}

export async function createMarketListing(payload: unknown) {
    return requestJson<{ listing?: MarketListingResponse; error?: string }>(
        "/internal/market/listings",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: API_AUTH,
            },
            body: JSON.stringify({operationId:crypto.randomUUID(),...(payload as object)}),
        },
    );
}

export async function buyMarketListing(payload: unknown) {
    return requestJson<{ listing?: MarketListingResponse; error?: string }>(
        "/internal/market/buy",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: API_AUTH,
            },
            body: JSON.stringify({operationId:crypto.randomUUID(),...(payload as object)}),
        },
    );
}

export async function cancelMarketListing(listingId: string, payload: unknown) {
    return requestJson<{ listing?: MarketListingResponse; error?: string }>(
        `/internal/market/listings/${encodeURIComponent(listingId)}/cancel`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: API_AUTH,
            },
            body: JSON.stringify({operationId:crypto.randomUUID(),...(payload as object)}),
        },
    );
}

export async function getMarketClaims(characterId: string) {
    return requestJson<{ claims: MarketClaimResponse[]; error?: string }>(
        `/internal/market/claims/${encodeURIComponent(characterId)}`,
        {
            headers: {
                Authorization: API_AUTH,
            },
        },
    );
}

export async function claimMarket(characterId: string, payload: unknown) {
    const claims=await getMarketClaims(characterId);
    payload={claimIds:claims.data.claims?.map(claim=>claim.id)??[],...(payload as object)};
    return requestJson<{ claims?: MarketClaimResponse[]; error?: string }>(
        `/internal/market/claims/${encodeURIComponent(characterId)}/claim`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: API_AUTH,
            },
            body: JSON.stringify({operationId:crypto.randomUUID(),...(payload as object)}),
        },
    );
}

export function normalizeVaultResponse(vault: VaultResponse): VaultResponse {
    return {
        gold: Number(vault.gold ?? 0),
        items: [...(vault.items ?? [])]
            .map((item) => ({
                idPos: Number(item.idPos),
                idItem: Number(item.idItem),
                cant: Number(item.cant),
            }))
            .sort((left, right) => left.idPos - right.idPos),
    };
}

export function normalizeCharacterItems(
    items: CharacterItem[],
): CharacterItem[] {
    return [...items]
        .map((item) => ({
            idPos: Number(item.idPos),
            idItem: Number(item.idItem),
            cant: Number(item.cant),
            equipped: Boolean(item.equipped),
        }))
        .sort((left, right) => left.idPos - right.idPos);
}

export async function createClanFixture(): Promise<{
    clanId: string;
    leader: CreatedCharacter;
    member: CreatedCharacter;
    outsider: CreatedCharacter;
}> {
    const leader = await createCharacterFixture({
        namePrefix: "Lead",
        level: 30,
        gold: 1_600_000,
        items: [{ idPos: 1, idItem: 1, cant: 2, equipped: false }],
    });
    const member = await createCharacterFixture({
        namePrefix: "Memb",
        level: 30,
        gold: 500,
        items: [{ idPos: 1, idItem: 474, cant: 1, equipped: false }],
    });
    const outsider = await createCharacterFixture({
        namePrefix: "Outs",
        level: 30,
        gold: 500,
        items: [{ idPos: 1, idItem: 2, cant: 1, equipped: false }],
    });
    const clanName = buildClanName("Vault");

    const createClanResponse = await requestJson<
        { ok: true; clanId: string } | { error: string }
    >("/internal/clans", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: API_AUTH,
        },
        body: JSON.stringify({
            characterId: leader.id,
            name: clanName,
            minJoinLevel: 1,
        }),
    });

    assert.equal(
        createClanResponse.ok,
        true,
        JSON.stringify(createClanResponse.data),
    );
    const clanId = (createClanResponse.data as { clanId: string }).clanId;

    const createRequestResponse = await requestJson<
        { ok: true } | { error: string }
    >("/internal/clans/requests", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: API_AUTH,
        },
        body: JSON.stringify({
            characterId: member.id,
            clanId,
            message: "quiero entrar",
        }),
    });

    assert.equal(
        createRequestResponse.ok,
        true,
        JSON.stringify(createRequestResponse.data),
    );

    const leaderClanView = await requestJson<
        ClanOverviewResponse | { error: string }
    >("/auth/clans", {
        headers: {
            Authorization: `Bearer ${leader.sessionToken}`,
        },
    });

    assert.equal(leaderClanView.ok, true, JSON.stringify(leaderClanView.data));
    const requestId = (leaderClanView.data as ClanOverviewResponse).currentClan
        ?.requests?.[0]?.id;
    assert.ok(requestId, "No apareció la solicitud de clan para aceptarla");

    const acceptResponse = await requestJson<{ ok: true } | { error: string }>(
        `/internal/clans/requests/${encodeURIComponent(requestId)}/accept`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: API_AUTH,
            },
            body: JSON.stringify({
                reviewerCharacterId: leader.id,
            }),
        },
    );

    assert.equal(acceptResponse.ok, true, JSON.stringify(acceptResponse.data));
    return { clanId, leader, member, outsider };
}

export async function countAuthSessions(accountId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
        `
            SELECT COUNT(*)::text AS count
            FROM auth_sessions
            WHERE account_id = $1
        `,
        [accountId],
    );

    return Number(result.rows[0]?.count ?? 0);
}

export async function countGameTickets(accountId: string): Promise<number> {
    const result = await pool.query<{ count: string }>(
        `
            SELECT COUNT(*)::text AS count
            FROM game_tickets
            WHERE account_id = $1
        `,
        [accountId],
    );

    return Number(result.rows[0]?.count ?? 0);
}

export async function getCharacterBankAndSpells(characterId: string): Promise<{
    bankItems: CharacterBankItem[];
    spells: CharacterSpell[];
}> {
    const [bankResult, spellsResult] = await Promise.all([
        pool.query<{ id_pos: number; id_item: number; cant: number }>(
            `
                SELECT id_pos, id_item, cant
                FROM character_bank_items
                WHERE character_id = $1
                ORDER BY id_pos ASC
            `,
            [characterId],
        ),
        pool.query<{ id_pos: number; id_spell: number }>(
            `
                SELECT id_pos, id_spell
                FROM character_spells
                WHERE character_id = $1
                ORDER BY id_pos ASC
            `,
            [characterId],
        ),
    ]);

    return {
        bankItems: bankResult.rows.map((row) => ({
            idPos: row.id_pos,
            idItem: row.id_item,
            cant: row.cant,
        })),
        spells: spellsResult.rows.map((row) => ({
            idPos: row.id_pos,
            idSpell: row.id_spell,
        })),
    };
}

export async function getArenaMembership(accountId: string): Promise<{
    roomId: string | null;
    connected: boolean | null;
    selectedPvpTemplateId: number | null;
}> {
    const result = await pool.query<{
        room_id: string;
        connected: boolean;
        selected_pvp_template_id: number | null;
    }>(
        `
            SELECT room_id, connected, selected_pvp_template_id
            FROM arena_room_members
            WHERE account_id = $1
            ORDER BY updated_at DESC
            LIMIT 1
        `,
        [accountId],
    );

    const row = result.rows[0];

    return {
        roomId: row?.room_id ?? null,
        connected: row?.connected ?? null,
        selectedPvpTemplateId: row?.selected_pvp_template_id ?? null,
    };
}

export async function countPasswordResetRequests(
    email: string,
): Promise<number> {
    const emailHash = crypto
        .createHash("sha256")
        .update(email.trim().toLowerCase())
        .digest("hex");
    const result = await pool.query<{ count: string }>(
        `
            SELECT COUNT(*)::text AS count
            FROM password_reset_requests
            WHERE email_hash = $1
        `,
        [emailHash],
    );

    return Number(result.rows[0]?.count ?? 0);
}

export async function expireMarketListing(listingId: string): Promise<void> {
    await pool.query(
        `
            UPDATE market_listings
            SET expires_at = NOW() - INTERVAL '1 minute'
            WHERE id = $1
        `,
        [listingId],
    );
}

export async function countPasswordResetRequestsByIp(
    ip: string,
): Promise<number> {
    const result = await pool.query<{ count: string }>(
        `
            SELECT COUNT(*)::text AS count
            FROM password_reset_requests
            WHERE requested_ip = $1
        `,
        [ip],
    );

    return Number(result.rows[0]?.count ?? 0);
}

export async function createPasswordResetToken(
    accountId: string,
    options?: {
        token?: string;
        expiresInMinutes?: number;
    },
): Promise<string> {
    const token =
        options?.token ?? crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresInMinutes = options?.expiresInMinutes ?? 30;

    await pool.query(
        `
            INSERT INTO password_reset_tokens (account_id, token_hash, expires_at)
            VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 minute'))
        `,
        [accountId, tokenHash, expiresInMinutes],
    );

    return token;
}

export async function markPasswordResetTokenConsumed(
    token: string,
): Promise<void> {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    await pool.query(
        `
            UPDATE password_reset_tokens
            SET consumed_at = NOW()
            WHERE token_hash = $1
        `,
        [tokenHash],
    );
}
