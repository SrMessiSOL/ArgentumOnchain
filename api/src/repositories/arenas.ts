import {credentialHash} from '../lib/sessionTokens';
import crypto from "crypto";
import { z } from "zod";
import pool from "../db";
import { hashPassword, verifyPassword } from "../lib/passwords";
import type {
  AccountRecord,
  ArenaRoomDetails,
  ArenaRoomMemberRecord,
  ArenaRoomRecord,
  ArenaRoomSummary,
  AuthSessionRecord,
  GameTicketResponse,
} from "../types";

const ARENA_GAME_TICKET_TTL_MS = 1000 * 60;
const ARENA_ROOM_INACTIVITY_TTL_MS = 1000 * 60 * 10;
const DEFAULT_ARENA_MAP_ID = 272;
const DEFAULT_ROOM_CAPACITY = 50;
const MIN_ROOM_CAPACITY = 2;
const MAX_ROOM_CAPACITY = 250;
const MAX_PVP_TEMPLATE_ID = 6;

const createRoomSchema = z.object({
  name: z.string().trim().min(3).max(40),
  isPublic: z.boolean(),
  password: z.string().trim().min(1).max(100).optional().or(z.literal("")),
  capacity: z.coerce.number().int().min(MIN_ROOM_CAPACITY).max(MAX_ROOM_CAPACITY).optional(),
}).superRefine((value, ctx) => {
  if (!value.isPublic && !value.password?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La sala privada requiere password",
      path: ["password"],
    });
  }
});

const joinRoomSchema = z.object({
  password: z.string().trim().max(100).optional(),
});

const selectTemplateSchema = z.object({
  templateId: z.coerce.number().int().min(0).max(MAX_PVP_TEMPLATE_ID),
});

function createOpaqueTicket(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function createJoinToken(): string {
  return crypto.randomBytes(18).toString("base64url");
}

async function getSessionRecord(token: string): Promise<AuthSessionRecord | null> {
  const sessionResult = await pool.query<AuthSessionRecord>(
    `
      SELECT token, account_id, selected_character_id, created_at, expires_at
      FROM auth_sessions
      WHERE token = $1
        AND created_at > NOW() - INTERVAL '30 days'
        AND expires_at > NOW()
      LIMIT 1
    `,
    [credentialHash(token)],
  );

  return sessionResult.rows[0] ?? null;
}

async function getAccountById(accountId: string): Promise<AccountRecord | null> {
  const accountResult = await pool.query<AccountRecord>(
    `
      SELECT *
      FROM accounts
      WHERE id = $1
      LIMIT 1
    `,
    [accountId],
  );

  return accountResult.rows[0] ?? null;
}

async function getRoomRecord(roomId: string): Promise<ArenaRoomRecord | null> {
  const roomResult = await pool.query<ArenaRoomRecord>(
    `
      SELECT *
      FROM arena_rooms
      WHERE id = $1
      LIMIT 1
    `,
    [roomId],
  );

  return roomResult.rows[0] ?? null;
}

async function getRoomRecordByJoinToken(joinToken: string): Promise<ArenaRoomRecord | null> {
  const roomResult = await pool.query<ArenaRoomRecord>(
    `
      SELECT *
      FROM arena_rooms
      WHERE join_token = $1
      LIMIT 1
    `,
    [joinToken],
  );

  return roomResult.rows[0] ?? null;
}

async function getMemberRecord(roomId: string, accountId: string): Promise<ArenaRoomMemberRecord | null> {
  const memberResult = await pool.query<ArenaRoomMemberRecord>(
    `
      SELECT room_id, account_id, selected_pvp_template_id, connected, joined_at, updated_at
      FROM arena_room_members
      WHERE room_id = $1
        AND account_id = $2
      LIMIT 1
    `,
    [roomId, accountId],
  );

  return memberResult.rows[0] ?? null;
}

async function countConnectedMembers(roomId: string): Promise<number> {
  const countResult = await pool.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM arena_room_members
      WHERE room_id = $1
        AND connected = TRUE
    `,
    [roomId],
  );

  return Number(countResult.rows[0]?.count ?? 0);
}

async function buildRoomSummary(room: ArenaRoomRecord): Promise<ArenaRoomSummary> {
  const [owner, connectedPlayers] = await Promise.all([
    getAccountById(room.owner_account_id),
    countConnectedMembers(room.id),
  ]);

  return {
    id: room.id,
    name: room.name,
    isPublic: room.is_public,
    joinToken: room.join_token,
    mapId: room.map_id,
    capacity: room.capacity,
    connectedPlayers,
    owner: {
      _id: owner?.id ?? room.owner_account_id,
      name: owner?.name ?? "Cuenta",
    },
  };
}

async function buildRoomDetails(room: ArenaRoomRecord, accountId: string): Promise<ArenaRoomDetails> {
  const [summary, member] = await Promise.all([
    buildRoomSummary(room),
    getMemberRecord(room.id, accountId),
  ]);

  return {
    ...summary,
    isOwner: room.owner_account_id === accountId,
    member: member
      ? {
          selectedPvpTemplateId: member.selected_pvp_template_id,
          connected: member.connected,
        }
      : null,
  };
}

async function touchRoomActivity(roomId: string): Promise<void> {
  await pool.query(
    `
      UPDATE arena_rooms
      SET updated_at = NOW()
      WHERE id = $1
    `,
    [roomId],
  );
}

async function ensureRoomCanAcceptConnectedPlayer(room: ArenaRoomRecord, accountId: string): Promise<void> {
  const member = await getMemberRecord(room.id, accountId);

  if (member?.connected) {
    return;
  }

  const connectedMembers = await countConnectedMembers(room.id);

  if (connectedMembers >= room.capacity) {
    throw new Error("La sala alcanzo su capacidad maxima");
  }
}

async function upsertRoomMember(roomId: string, accountId: string): Promise<void> {
  await pool.query(
    `
      INSERT INTO arena_room_members (room_id, account_id, connected)
      VALUES ($1, $2, FALSE)
      ON CONFLICT (room_id, account_id)
      DO UPDATE SET updated_at = NOW()
    `,
    [roomId, accountId],
  );
}

async function removeAccountFromOtherRooms(accountId: string, keepRoomId?: string): Promise<void> {
  const removedRoomsResult = keepRoomId
    ? await pool.query<{ room_id: string }>(
        `
          DELETE FROM arena_room_members
          WHERE account_id = $1
            AND room_id <> $2
          RETURNING room_id
        `,
        [accountId, keepRoomId],
      )
    : await pool.query<{ room_id: string }>(
        `
          DELETE FROM arena_room_members
          WHERE account_id = $1
          RETURNING room_id
        `,
        [accountId],
      );

  if (removedRoomsResult.rows.length > 0) {
    await pool.query(
      `
        UPDATE arena_rooms
        SET updated_at = NOW()
        WHERE id = ANY($1::uuid[])
      `,
      [removedRoomsResult.rows.map((row) => row.room_id)],
    );
  }

  await cleanupEmptyRooms();
}

export async function listPublicArenaRooms(token: string): Promise<ArenaRoomSummary[] | null> {
  const session = await getSessionRecord(token);

  if (!session) {
    return null;
  }

  const roomsResult = await pool.query<ArenaRoomRecord>(
    `
      SELECT *
      FROM arena_rooms
      WHERE is_public = TRUE
      ORDER BY created_at DESC
    `,
  );

  return Promise.all(roomsResult.rows.map((room) => buildRoomSummary(room)));
}

export async function createArenaRoom(token: string, payload: unknown): Promise<ArenaRoomDetails | null> {
  const session = await getSessionRecord(token);

  if (!session) {
    return null;
  }

  const data = createRoomSchema.parse(payload);
  const password = data.password?.trim() || null;
  const passwordHash = password ? await hashPassword(password) : null;
  const joinToken = createJoinToken();

  await removeAccountFromOtherRooms(session.account_id);

  const roomResult = await pool.query<ArenaRoomRecord>(
    `
      INSERT INTO arena_rooms (
        owner_account_id,
        name,
        is_public,
        password_hash,
        join_token,
        map_id,
        capacity
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7
      )
      RETURNING *
    `,
    [
      session.account_id,
      data.name,
      data.isPublic,
      passwordHash,
      joinToken,
      DEFAULT_ARENA_MAP_ID,
      data.capacity ?? DEFAULT_ROOM_CAPACITY,
    ],
  );

  const room = roomResult.rows[0];

  await upsertRoomMember(room.id, session.account_id);

  return buildRoomDetails(room, session.account_id);
}

export async function joinArenaRoom(token: string, roomId: string, payload: unknown): Promise<ArenaRoomDetails | null> {
  const session = await getSessionRecord(token);

  if (!session) {
    return null;
  }

  const room = await getRoomRecord(roomId);

  if (!room) {
    throw new Error("Sala no encontrada");
  }

  const { password } = joinRoomSchema.parse(payload);

  if (!room.is_public) {
    if (!password?.trim()) {
      throw new Error("La sala privada requiere password");
    }

    const isValid = await verifyPassword(password.trim(), room.password_hash ?? "");

    if (!isValid) {
      throw new Error("Password invalida");
    }
  }

  await removeAccountFromOtherRooms(session.account_id, room.id);
  await upsertRoomMember(room.id, session.account_id);
  await touchRoomActivity(room.id);

  return buildRoomDetails(room, session.account_id);
}

export async function joinArenaRoomByLink(token: string, joinToken: string): Promise<ArenaRoomDetails | null> {
  const session = await getSessionRecord(token);

  if (!session) {
    return null;
  }

  const room = await getRoomRecordByJoinToken(joinToken);

  if (!room) {
    throw new Error("Sala no encontrada");
  }

  await removeAccountFromOtherRooms(session.account_id, room.id);
  await upsertRoomMember(room.id, session.account_id);
  await touchRoomActivity(room.id);

  return buildRoomDetails(room, session.account_id);
}

export async function getArenaRoom(token: string, roomId: string): Promise<ArenaRoomDetails | null> {
  const session = await getSessionRecord(token);

  if (!session) {
    return null;
  }

  const room = await getRoomRecord(roomId);

  if (!room) {
    return null;
  }

  return buildRoomDetails(room, session.account_id);
}

export async function leaveArenaRoom(token: string, roomId: string): Promise<{ ok: true } | null> {
  const session = await getSessionRecord(token);

  if (!session) {
    return null;
  }

  await leaveArenaRoomByAccount(roomId, session.account_id);
  return { ok: true };
}

export async function createArenaGameTicket(token: string, roomId: string, payload: unknown): Promise<GameTicketResponse | null> {
  const session = await getSessionRecord(token);

  if (!session) {
    return null;
  }

  const room = await getRoomRecord(roomId);

  if (!room) {
    throw new Error("Sala no encontrada");
  }

  const member = await getMemberRecord(room.id, session.account_id);

  if (!member) {
    throw new Error("Primero debes unirte a la sala");
  }

  await ensureRoomCanAcceptConnectedPlayer(room, session.account_id);

  const { templateId } = selectTemplateSchema.parse(payload);
  const ticket = createOpaqueTicket();

  await pool.query(
    `
      UPDATE arena_room_members
      SET selected_pvp_template_id = $3,
          updated_at = NOW()
      WHERE room_id = $1
        AND account_id = $2
    `,
    [room.id, session.account_id, templateId],
  );

  await touchRoomActivity(room.id);

  const result = await pool.query<{ expires_at: Date }>(
    `
      INSERT INTO game_tickets (
        ticket,
        auth_token,
        account_id,
        character_id,
        mode,
        arena_room_id,
        pvp_template_id,
        expires_at
      )
      VALUES ($1, $2, $3, NULL, 'arena', $4, $5, NOW() + ($6 * INTERVAL '1 millisecond'))
      RETURNING expires_at
    `,
    [credentialHash(ticket), credentialHash(token), session.account_id, room.id, templateId, ARENA_GAME_TICKET_TTL_MS],
  );

  return {
    ticket,
    expiresAt: result.rows[0].expires_at,
  };
}

export async function leaveArenaRoomByAccount(roomId: string, accountId: string): Promise<void> {
  await pool.query(
    `
      DELETE FROM arena_room_members
      WHERE room_id = $1
        AND account_id = $2
    `,
    [roomId, accountId],
  );

  await touchRoomActivity(roomId);

  await cleanupEmptyRooms();
}

export async function disconnectArenaRoomByAccount(roomId: string, accountId: string): Promise<void> {
  await pool.query(
    `
      UPDATE arena_room_members
      SET connected = FALSE,
          updated_at = NOW()
      WHERE room_id = $1
        AND account_id = $2
    `,
    [roomId, accountId],
  );

  await touchRoomActivity(roomId);

  await cleanupEmptyRooms();
}

export async function connectArenaRoomByAccount(roomId: string, accountId: string): Promise<void> {
  const room = await getRoomRecord(roomId);

  if (!room) {
    throw new Error("Sala no encontrada");
  }

  const member = await getMemberRecord(roomId, accountId);

  if (!member) {
    throw new Error("Primero debes unirte a la sala");
  }

  await ensureRoomCanAcceptConnectedPlayer(room, accountId);

  await pool.query(
    `
      UPDATE arena_room_members
      SET connected = TRUE,
          updated_at = NOW()
      WHERE room_id = $1
        AND account_id = $2
    `,
    [roomId, accountId],
  );

  await touchRoomActivity(roomId);
}

export async function resetAllArenaRoomMembersConnectedStatus(): Promise<number> {
  const result = await pool.query(
    `
      UPDATE arena_room_members
      SET connected = FALSE,
          updated_at = NOW()
      WHERE connected = TRUE
    `,
  );

  return result.rowCount ?? 0;
}

export async function cleanupEmptyRooms(): Promise<void> {
  await pool.query(
    `
      DELETE FROM arena_rooms
      WHERE id IN (
        SELECT room.id
        FROM arena_rooms room
        LEFT JOIN arena_room_members member ON member.room_id = room.id
       GROUP BY room.id
        HAVING COUNT(*) FILTER (WHERE member.connected = TRUE) = 0
           AND COALESCE(MAX(member.updated_at), room.updated_at) < NOW() - ($1 * INTERVAL '1 millisecond')
      )
    `,
    [ARENA_ROOM_INACTIVITY_TTL_MS],
  );
}
