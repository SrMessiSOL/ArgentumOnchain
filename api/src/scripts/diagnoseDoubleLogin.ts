import fs from "fs";
import path from "path";

type AuthCharacter = {
  _id: string;
  name: string;
  level: number;
  map: number;
};

type AuthLoginResponse = {
  sessionToken: string;
  characters: AuthCharacter[];
  selectedCharacterId: string | null;
};

type GameTicketResponse = {
  ticket: string;
  expiresAt: string;
};

type ConsumedGameTicket = {
  account?: {
    _id: string;
    name: string;
    email: string;
  };
  character?: {
    _id: string;
    name: string;
  };
  mode?: string;
};

function readEnvFile(): void {
  const envPath = path.resolve(__dirname, "../../.env");

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

function getArg(name: string): string | undefined {
  const key = `--${name}`;
  const index = process.argv.indexOf(key);

  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function requireValue(label: string, value: string | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error(`Missing ${label}`);
  }

  return trimmed;
}

async function requestJson<T>(
  baseUrl: string,
  pathname: string,
  options?: {
    method?: string;
    bearerToken?: string;
    authorizationHeader?: string;
    json?: unknown;
  },
): Promise<T> {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options?.method ?? "GET",
    headers: {
      ...(options?.authorizationHeader
        ? { Authorization: options.authorizationHeader }
        : options?.bearerToken
          ? { Authorization: `Bearer ${options.bearerToken}` }
          : {}),
      ...(options?.json ? { "Content-Type": "application/json" } : {}),
    },
    body: options?.json ? JSON.stringify(options.json) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText} at ${pathname}: ${text}`);
  }

  return (await response.json()) as T;
}

function pickCharacter(characters: AuthCharacter[], requestedId?: string, requestedName?: string): AuthCharacter {
  if (requestedId) {
    const match = characters.find((character) => character._id === requestedId);

    if (!match) {
      throw new Error(`No character exists with ID ${requestedId}`);
    }

    return match;
  }

  if (requestedName) {
    const normalizedName = requestedName.trim().toLocaleLowerCase("es-AR");
    const match = characters.find((character) => character.name.trim().toLocaleLowerCase("es-AR") === normalizedName);

    if (!match) {
      throw new Error(`No character exists with name ${requestedName}`);
    }

    return match;
  }

  if (characters.length === 0) {
    throw new Error("The account has no characters");
  }

  return characters[0];
}

async function main(): Promise<void> {
  readEnvFile();

  const baseUrl = (getArg("base-url") ?? process.env.API_BASE_URL ?? "http://localhost:3001").replace(/\/+$/, "");
  const email = requireValue("EMAIL or --email", getArg("email") ?? process.env.DIAG_EMAIL ?? process.env.EMAIL);
  const password = requireValue(
    "PASSWORD or --password",
    getArg("password") ?? process.env.DIAG_PASSWORD ?? process.env.PASSWORD,
  );
  const internalToken = requireValue(
    "TOKEN_AUTH or --token-auth",
    getArg("token-auth") ?? process.env.TOKEN_AUTH,
  );
  const requestedCharacterId = getArg("character-id") ?? process.env.DIAG_CHARACTER_ID;
  const requestedCharacterName = getArg("character-name") ?? process.env.DIAG_CHARACTER_NAME;

  console.log(`[diag] API: ${baseUrl}`);
  console.log(`[diag] Logging in with account: ${email}`);

  const login = await requestJson<AuthLoginResponse>(baseUrl, "/auth/login", {
    method: "POST",
    json: {
      identifier: email,
      password,
    },
  });

  const selectedCharacter = pickCharacter(login.characters, requestedCharacterId, requestedCharacterName);

  console.log(`[diag] Selected character: ${selectedCharacter.name} (${selectedCharacter._id})`);

  await requestJson(baseUrl, "/auth/select-character", {
    method: "POST",
    bearerToken: login.sessionToken,
    json: {
      characterId: selectedCharacter._id,
    },
  });

  const [ticketA, ticketB] = await Promise.all([
    requestJson<GameTicketResponse>(baseUrl, "/auth/game-ticket", {
      method: "POST",
      bearerToken: login.sessionToken,
    }),
    requestJson<GameTicketResponse>(baseUrl, "/auth/game-ticket", {
      method: "POST",
      bearerToken: login.sessionToken,
    }),
  ]);

  console.log(`[diag] Ticket A: ${ticketA.ticket}`);
  console.log(`[diag] Ticket B: ${ticketB.ticket}`);

  const [consumeA, consumeB] = await Promise.allSettled([
    requestJson<ConsumedGameTicket>(baseUrl, "/game-ticket/consume", {
      method: "POST",
      authorizationHeader: internalToken,
      json: {
        ticket: ticketA.ticket,
        clientIp: "127.0.0.1",
      },
    }),
    requestJson<ConsumedGameTicket>(baseUrl, "/game-ticket/consume", {
      method: "POST",
      authorizationHeader: internalToken,
      json: {
        ticket: ticketB.ticket,
        clientIp: "127.0.0.1",
      },
    }),
  ]);

  const resultA = consumeA.status === "fulfilled" ? consumeA.value : null;
  const resultB = consumeB.status === "fulfilled" ? consumeB.value : null;

  console.log("[diag] Consume result A:", consumeA.status === "fulfilled" ? "OK" : consumeA.reason);
  console.log("[diag] Consume result B:", consumeB.status === "fulfilled" ? "OK" : consumeB.reason);

  const bothSucceeded = Boolean(resultA?.character?._id && resultB?.character?._id);
  const sameCharacter = resultA?.character?._id === selectedCharacter._id && resultB?.character?._id === selectedCharacter._id;

  if (bothSucceeded && sameCharacter) {
    console.log("\n[diag][vulnerable] Both tickets were consumed for the same character.");
    console.log("[diag][vulnerable] This confirms the base duplicate-session/snapshot vulnerability.");
    process.exitCode = 2;
    return;
  }

  console.log("\n[diag][ok] This flow could not consume the same character twice.");
}

void main().catch((error) => {
  console.error("[diag][error]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
