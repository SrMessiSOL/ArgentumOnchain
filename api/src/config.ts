import fs from "fs";
import path from "path";

type Config = {
  port: number;
  databaseUrl: string;
  databasePoolMax: number;
  databaseConnectionTimeoutMs: number;
  databaseIdleTimeoutMs: number;
  databaseStatementTimeoutMs: number;
  databaseIdleInTransactionTimeoutMs: number;
  tokenAuth: string;
  gameServiceToken: string | null;
  nodeEnv: string;
  corsOrigin: string;
  siteUrl: string;
  sesRegion: string | null;
  sesAccessKeyId: string | null;
  sesSecretAccessKey: string | null;
  sesFromEmail: string | null;
  sesFromName: string;
  gameDataAdminEmail: string;
  gameDataAdminAccountId: string | null;
  gameDataAdminProxyToken: string | null;
};

const projectRoot = path.resolve(__dirname, "..");

function readEnvFile(): void {
  const envPath = path.join(projectRoot, ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getOptionalNumberEnv(name: string, fallback: number): number {
  const value = process.env[name]?.trim();

  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

readEnvFile();

const config: Config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: getRequiredEnv("DATABASE_URL"),
  databasePoolMax: getOptionalNumberEnv("DATABASE_POOL_MAX", 20),
  databaseConnectionTimeoutMs: getOptionalNumberEnv("DATABASE_CONNECTION_TIMEOUT_MS", 5000),
  databaseIdleTimeoutMs: getOptionalNumberEnv("DATABASE_IDLE_TIMEOUT_MS", 30000),
  databaseStatementTimeoutMs: getOptionalNumberEnv("DATABASE_STATEMENT_TIMEOUT_MS", 15000),
  databaseIdleInTransactionTimeoutMs: getOptionalNumberEnv("DATABASE_IDLE_IN_TX_TIMEOUT_MS", 10000),
  tokenAuth: getRequiredEnv("TOKEN_AUTH"),
  gameServiceToken: process.env.GAME_SERVICE_TOKEN?.trim() || null,
  nodeEnv: process.env.NODE_ENV ?? "development",
  corsOrigin: process.env.CORS_ORIGIN?.trim() || "*",
  siteUrl: (process.env.SITE_URL?.trim() || "https://aoweb.app").replace(/\/+$/, ""),
  sesRegion: process.env.SES_REGION?.trim() || null,
  sesAccessKeyId: process.env.SES_ACCESS_KEY_ID?.trim() || null,
  sesSecretAccessKey: process.env.SES_SECRET_ACCESS_KEY?.trim() || null,
  sesFromEmail: process.env.SES_FROM_EMAIL?.trim() || null,
  sesFromName: process.env.SES_FROM_NAME?.trim() || "AOWeb",
  gameDataAdminEmail: (process.env.GAME_DATA_ADMIN_EMAIL?.trim() || "").toLowerCase(),
  gameDataAdminAccountId: process.env.GAME_DATA_ADMIN_ACCOUNT_ID?.trim() || null,
  gameDataAdminProxyToken: process.env.GAME_DATA_ADMIN_PROXY_TOKEN?.trim() || null,
};

export default config;
