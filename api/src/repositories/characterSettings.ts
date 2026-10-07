import {credentialHash} from '../lib/sessionTokens';
import { z } from "zod";
import pool from "../db";
import type { AuthSessionRecord } from "../types";

const HOTKEY_ACTIONS = [
  "moveUp",
  "moveLeft",
  "moveDown",
  "moveRight",
  "toggleWorldMap",
  "toggleSeguro",
  "toggleClanSeguro",
  "toggleHiddenSkill",
  "pickupItem",
  "attackOrTarget",
  "meditate",
  "equipItem",
  "useItem",
  "dropItem",
] as const;

const MACRO_SLOTS = 8;
const MAX_LABEL_LENGTH = 70;
const MAX_KEYCODE_LENGTH = 70;

type HotkeyAction = (typeof HOTKEY_ACTIONS)[number];

export type HotkeySettings = Record<HotkeyAction, string[]>;

export type StoredMacro = {
  keyCode: string;
  targetType: "item" | "spell" | "command";
  label: string;
  targetSlot?: number;
  targetId?: number;
  command?: string;
  grhIndex?: number;
};

export type CharacterSettingsResponse = {
  characterId: string;
  hotkeys: HotkeySettings;
  macros: Array<StoredMacro | null>;
};

const DEFAULT_HOTKEY_SETTINGS: HotkeySettings = {
  moveUp: ["KeyW"],
  moveLeft: ["KeyA"],
  moveDown: ["KeyS"],
  moveRight: ["KeyD"],
  toggleWorldMap: ["KeyM"],
  toggleSeguro: ["KeyK"],
  toggleClanSeguro: ["KeyJ"],
  toggleHiddenSkill: ["KeyO"],
  pickupItem: ["KeyQ"],
  attackOrTarget: ["Space"],
  meditate: ["KeyN"],
  equipItem: ["KeyE"],
  useItem: ["KeyU"],
  dropItem: ["KeyT"],
};

const hotkeyCodeSchema = z.string().trim().min(1).max(MAX_KEYCODE_LENGTH);
const macroLabelSchema = z.string().trim().min(1).max(MAX_LABEL_LENGTH);

const hotkeyCodesSchema = z.array(hotkeyCodeSchema).max(2);
const macroCommandSchema = z
  .string()
  .trim()
  .regex(/^\/?[a-zA-Z]{1,15}$/, "El comando del macro solo admite letras de la A a la Z y hasta 15 caracteres")
  .transform((value) => {
    const normalized = value.startsWith("/") ? value.slice(1) : value;
    return `/${normalized.toLowerCase()}`;
  });

const storedMacroSchema = z.discriminatedUnion("targetType", [
  z.object({
    keyCode: hotkeyCodeSchema,
    targetType: z.literal("item"),
    label: macroLabelSchema,
    targetSlot: z.number().int(),
    targetId: z.number().int(),
    grhIndex: z.number().int().optional(),
  }),
  z.object({
    keyCode: hotkeyCodeSchema,
    targetType: z.literal("spell"),
    label: macroLabelSchema,
    targetSlot: z.number().int(),
    targetId: z.number().int(),
  }),
  z.object({
    keyCode: hotkeyCodeSchema,
    targetType: z.literal("command"),
    label: macroLabelSchema,
    command: macroCommandSchema,
  }),
]);

const hotkeySettingsSchema = z.object(
  Object.fromEntries(
    HOTKEY_ACTIONS.map((action) => [action, hotkeyCodesSchema]),
  ) as Record<HotkeyAction, typeof hotkeyCodesSchema>,
);

const characterSettingsSchema = z.object({
  hotkeys: hotkeySettingsSchema,
  macros: z.array(storedMacroSchema.nullable()).length(MACRO_SLOTS),
});

function cloneDefaultHotkeySettings(): HotkeySettings {
  return HOTKEY_ACTIONS.reduce((acc, action) => {
    acc[action] = [...DEFAULT_HOTKEY_SETTINGS[action]];
    return acc;
  }, {} as HotkeySettings);
}

function normalizeHotkeySettings(value: unknown): HotkeySettings {
  const fallback = cloneDefaultHotkeySettings();
  const hasStoredMeditateBinding =
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as Partial<Record<HotkeyAction, unknown>>).meditate);

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const normalized = HOTKEY_ACTIONS.reduce((acc, action) => {
    const parsedCodes = hotkeyCodesSchema.safeParse(
      (value as Partial<Record<HotkeyAction, unknown>>)[action],
    );
    acc[action] = parsedCodes.success ? [...parsedCodes.data] : [...fallback[action]];
    return acc;
  }, {} as HotkeySettings);

  if (
    !hasStoredMeditateBinding &&
    HOTKEY_ACTIONS.some(
      (action) => action !== "meditate" && normalized[action].includes("KeyN"),
    )
  ) {
    normalized.meditate = [];
  }

  return normalized;
}

function normalizeMacros(value: unknown): Array<StoredMacro | null> {
  if (!Array.isArray(value)) {
    return Array.from({ length: MACRO_SLOTS }, () => null);
  }

  return Array.from({ length: MACRO_SLOTS }, (_unused, index) => {
    const parsed = storedMacroSchema.nullable().safeParse(value[index] ?? null);
    return parsed.success ? parsed.data : null;
  });
}

async function getSessionWithSelectedCharacter(token: string): Promise<AuthSessionRecord | null> {
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

  const session = sessionResult.rows[0] ?? null;

  if (!session?.selected_character_id) {
    return null;
  }

  return session;
}

async function assertSelectedCharacterBelongsToSession(
  accountId: string,
  characterId: string,
): Promise<boolean> {
  const result = await pool.query<{ id: string }>(
    `
      SELECT id
      FROM characters
      WHERE id = $1
        AND account_id = $2
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [characterId, accountId],
  );

  return Boolean(result.rows[0]);
}

export async function getCharacterSettingsBySessionToken(
  token: string,
): Promise<CharacterSettingsResponse | null> {
  const session = await getSessionWithSelectedCharacter(token);

  if (!session?.selected_character_id) {
    return null;
  }

  const characterBelongsToSession = await assertSelectedCharacterBelongsToSession(
    session.account_id,
    session.selected_character_id,
  );

  if (!characterBelongsToSession) {
    return null;
  }

  const settingsResult = await pool.query<{
    hotkeys: unknown;
    macros: unknown;
  }>(
    `
      SELECT hotkeys, macros
      FROM character_settings
      WHERE character_id = $1
      LIMIT 1
    `,
    [session.selected_character_id],
  );

  const row = settingsResult.rows[0];

  return {
    characterId: session.selected_character_id,
    hotkeys: normalizeHotkeySettings(row?.hotkeys),
    macros: normalizeMacros(row?.macros),
  };
}

export async function saveCharacterSettingsBySessionToken(
  token: string,
  payload: unknown,
): Promise<CharacterSettingsResponse | null> {
  const session = await getSessionWithSelectedCharacter(token);

  if (!session?.selected_character_id) {
    return null;
  }

  const characterBelongsToSession = await assertSelectedCharacterBelongsToSession(
    session.account_id,
    session.selected_character_id,
  );

  if (!characterBelongsToSession) {
    return null;
  }

  const parsed = characterSettingsSchema.parse(payload);

  await pool.query(
    `
      INSERT INTO character_settings (character_id, hotkeys, macros)
      VALUES ($1, $2::jsonb, $3::jsonb)
      ON CONFLICT (character_id)
      DO UPDATE SET hotkeys = EXCLUDED.hotkeys,
                    macros = EXCLUDED.macros,
                    updated_at = NOW()
    `,
    [
      session.selected_character_id,
      JSON.stringify(parsed.hotkeys),
      JSON.stringify(parsed.macros),
    ],
  );

  return {
    characterId: session.selected_character_id,
    hotkeys: normalizeHotkeySettings(parsed.hotkeys),
    macros: normalizeMacros(parsed.macros),
  };
}
