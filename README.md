# AOCHAIN — Argentum Onchain

AOCHAIN is a browser-first, English-first fork of [AOWeb](https://github.com/dcatanzaro/aoweb), bringing the existing Argentum Online world to a shared multiplayer realm with Solana devnet ownership and trading.

The project keeps the original game: maps, classes, races, combat, spells, NPCs, crafting, inventory, banking, factions, parties, clans and progression. It adds an English presentation layer, a redesigned player website, wallet integration, character assets, item exports and SPL gold.

**Current stage: community devnet testing.** Gameplay runs on an authoritative game server and PostgreSQL. Solana handles asset ownership and economic settlement. Movement, combat and NPC AI stay off-chain. The minting and staking system currently trusts the game operator; it is not a trustless staking contract or a mainnet release.

## What changed from upstream

### One shared browser game

- Normal characters enter one persistent shared world. Arena rooms and invitation flows are disabled in the public experience; their source remains preserved.
- Account registration/sign-in, character creation and selection connect to the existing realtime game rather than a replacement prototype.
- The game console stays visible on the left. Global, party, clan and private chat choose message recipients without hiding game events.
- Responsive game dialogs, merchant controls, logout/session handling and character-entry fixes improve the browser experience.

### English-first, Spanish optional

The localization pass covers account screens, character creation, HUD, controls, item/NPC/spell names and descriptions, dialogue, console events, command help, player and administrator command aliases, wiki content, operational logs and password-reset templates. Spanish remains selectable, with account and browser preferences.

Translation runs at presentation boundaries: game IDs and protocol values remain compatible, while player chat, character names and clan names are preserved. English command aliases retain Spanish compatibility. Text overlays localize legacy signs while preserving their original artwork for Spanish; map-aware signage corrects town labels.

The source and artwork review closed the known translation gaps. This does not mean every late-game encounter was manually played. New content must extend the catalogs and regression fixtures. See [English validation](FULL-ENGLISH-VALIDATION.md) and [sign review](SIGN-LOCATION-REVIEW.md).

### Player website and interface

- AOCHAIN / Argentum Onchain branding, shared styles, landing page and social metadata.
- Top navigation for Play, Marketplace, Profile and Wiki, with wallet connection at the top right.
- Marketplace browsing for characters and items, plus a separate marketplace activity view.
- Profile asset cards with character/item management actions in modals instead of duplicated forms and status panels.
- Equipped character sprite previews, item images, transaction progress and completion dialogs.
- Wiki monster images and numeric map references, without duplicate monster variants that differ only by location.
- Account and wallet guidance, sign-in routing and support for compatible Solana wallets through `@solana/connector`, rather than a Phantom-only interface.

Wallet compatibility depends on the wallet's supported message/transaction signing features; universal testing across every wallet is not claimed.

## Solana: how assets work

Connecting a wallet selects a wallet in the browser. Linking it to an authenticated game account requires a signed challenge proving control. The account handles game access; the linked wallet authorizes asset operations. The website never asks for a player's private key.

| Asset | In the game | Withdrawal / wallet state | Deposit / play |
| --- | --- | --- | --- |
| Character | Server-owned gameplay state associated with a persistent character ID | Metaplex Core NFT; withdrawal snapshots the character bundle and unfreezes the asset | Wallet ownership is verified and the asset is frozen/staked before play |
| Item | Ordinary off-chain inventory | Eligible item quantity is reserved/removed and represented by a registered receipt NFT | The owned receipt is burned and its recorded item/quantity is credited once |
| Gold | Integer game balance | Game gold is reserved, then zero-decimal SPL gold is minted 1:1 | SPL gold is burned, then game gold is credited 1:1 |
| Titles / badges | Attached to the character ID | Follow the character's ownership | Cannot be transferred separately as account rewards |

### Characters: mint, stake, withdraw and sell

New characters require wallet-approved minting/staking before entering the world. Existing characters use the migration flow. A character cannot play while unstaked, listed, or locked by an unresolved asset/economy operation.

Withdrawal requires the character to be offline. The server reserves it, invalidates login tickets and stores a canonical versioned snapshot. Snapshot hash/version attributes and the unfreeze operation are included in the Solana transaction. The full bundle stays server-side; the NFT does not store the entire inventory or world state on-chain.

Character sales preserve the same character ID, including inventory, equipment, personal bank, spells, progression, character gold and titles. Shared account/clan vaults are excluded. Marketplace payment and NFT delivery are combined in the prepared Solana transaction, followed by finalized, idempotent database settlement. Chain confirmation and database settlement remain separate steps.

Staking uses Metaplex delegated freeze authority and wallet authorization. The operator co-signs relevant transactions. There is no standalone Anchor escrow/staking program in this version. See [character asset design](CHARACTER-ASSETS-PLAN.md) and [validation](CHARACTER-ASSETS-VALIDATION.md).

### Items and gold

Items remain off-chain unless exported. Exported quantities are absent from the character bundle, preventing the same item from remaining in a sold character and also existing as a wallet receipt. Item marketplace rules exclude newbie gear, equipped items and other ineligible stock. Website item sales and wallet exports have separate lifecycle checks.

Gold withdrawals mint; deposits burn. There is no fixed reserve of pre-minted tokens being transferred back and forth. This is an operator-controlled bridge for the devnet test economy. See [economy design](CHARACTER-ECONOMY-PLAN.md), [economy validation](CHARACTER-ECONOMY-VALIDATION.md) and [item marketplace validation](ITEM-MARKETPLACE-VALIDATION.md).

All chain flows validate prepared transaction contents and wallet signatures. Signed bytes and operation receipts support retries and recovery. An ambiguous RPC response does not authorize a refund or unlock: the operation stays reserved until reconciliation establishes its outcome. A wallet showing a transaction does not alone prove database settlement completed.

## Architecture

```text
Browser: Next.js / React / PixiJS
   | same-origin HTTP                    | WebSocket
   v                                     v
Website API routes --> Node/Express API <--> Authoritative game server
                           |
                           +--> PostgreSQL: accounts, world state, snapshots,
                           |    reservations, ledgers and operation receipts
                           |
                           +--> Solana devnet: Core assets, SPL gold,
                                wallet authorization and finalized settlement
```

| Directory / file | Purpose |
| --- | --- |
| `frontend/` | Website, browser game, localization, wallet UI and sprite previews |
| `server/` | Realtime game rules, socket handling and durable save/recovery journals |
| `api/` | Accounts, persistence, wallet proofs, asset/economy operations and migrations |
| `database/aoweb.sql` | Upstream game seed; not a backup of the running realm |
| `Start-AOWeb.ps1`, `Check-AOWeb.ps1`, `Stop-AOWeb.ps1` | Prepared Windows trial operations |
| `Backup-AOWeb.ps1` | Private database/runtime backup and isolated restore verification |

PostgreSQL is required. This project has not removed the database or moved the complete game state onto Solana.

## Local development

Requirements: Node.js 22 or newer, pnpm, PostgreSQL and a compatible browser. The current Windows trial uses PostgreSQL 16 with an adapted seed; the upstream SQL dump targets PostgreSQL 18. Docker is optional.

### 1. Prepare a development database

Run from the repository root. The credentials below are disposable local examples, never public-hosting credentials.

```bash
docker run --name aoweb-postgres \
  -e POSTGRES_DB=aoweb \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=local-development-only \
  -p 127.0.0.1:5432:5432 \
  -d postgres:18-alpine

docker exec -i aoweb-postgres psql -U postgres -d aoweb < database/aoweb.sql
```

The import command uses POSIX shell input redirection. On Windows, use a compatible shell or PostgreSQL tooling. Import only reviewed game seed content; never publish account/session records or a live database dump.

### 2. Configure the services

Copy `api/.env.example` to `api/.env`, `server/.env.example` to `server/.env`, and `frontend/.env.example` to `frontend/.env.local`.

- API: set `DATABASE_URL` to your local database, `PORT=3001`, and `SITE_URL` / `CORS_ORIGIN` to `http://localhost:3000`.
- Game server: set `PORT=7666` and `API_BASE_URL=http://127.0.0.1:3001`.
- Frontend: set `API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL` to `http://localhost:3001`, `NEXT_PUBLIC_WS_URL=ws://localhost:7666`, and `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
- Set the same freshly generated private `TOKEN_AUTH` for the three services. Do not use `changeme`, commit environment files, or expose this value through a `NEXT_PUBLIC_` setting.

Apply migrations with a database owner during initial setup; use restricted runtime credentials with `AOWEB_RUN_MIGRATIONS=0` for hosted operation. The API startup checks supplemental schemas, and existing databases require the documented additive migrations, including session hashes and ledger integrity. Back up before migrating existing data.

In three separate terminals:

```bash
cd api
pnpm install --frozen-lockfile
pnpm exec tsx src/migrate.ts
pnpm dev
```

```bash
cd server
pnpm install --frozen-lockfile
pnpm exec tsx src/server.ts
```

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`. Without the devnet asset configuration, wallet-dependent creation/staking/settlement is unavailable; starting the services alone does not enable those flows.

### 3. Enable the devnet asset system

Configure the API with a dedicated devnet issuer/authority stored outside the repository:

- `AOWEB_DEVNET_RPC`: devnet RPC URL; the chain genesis is verified.
- `AOWEB_GOLD_MINT`: configured zero-decimal SPL mint.
- `AOWEB_GOLD_AUTHORITY_FILE`: private authority keypair file path.
- `AOWEB_DEVNET_ISSUER_FILE`: dedicated cosmetic issuer file path, where enabled.
- `AOWEB_DEVNET_METADATA_URL`: public metadata base URL used by the asset flows.
- `AOWEB_CHARACTER_ACHIEVEMENTS=1`: enables the character achievement mode used by the trial.

The mint must match the configured authority and expected mint policy. Issuers need test SOL. These settings do not automatically create/fund a mint or deploy a new program. Use HTTPS for wallet-facing public testing and durable metadata hosting before a broader release. Mainnet is outside the current implementation scope.

## Prepared Windows trial and hosting

For the already prepared workspace, use:

```powershell
./Start-AOWeb.ps1
./Check-AOWeb.ps1
./Backup-AOWeb.ps1 -VerifyRestore
./Stop-AOWeb.ps1 -KeepDatabase
```

These scripts depend on the workspace's private `work/` directory, installed PostgreSQL and prepared environment files. They are not a one-command bootstrap for an arbitrary fresh clone. See [operations](OPERATIONS.md) for ports, maintenance, backup recovery and runtime configuration.

The trial can run on a desktop computer with the website and game exposed through a gateway/tunnel. PostgreSQL and internal service endpoints should remain private. Temporary tunnel URLs change and are not permanent deployment addresses or availability guarantees; this README intentionally does not pin one.

24/7 hosting and at least 100 simultaneous players remain deployment/load-test requirements, not proven capacity claims. See [hosting plan](DEVNET-HOSTING-PLAN.md).

## Security changes and verification

The October 7 hardening release adds:

- Hashed session/ticket credentials, absolute session expiry and active-session checks for sockets.
- Recent-authentication and pending-operation checks for wallet changes; explicit administrator account IDs.
- Bounded authentication budgets, bcrypt cost 12 and UTF-8 password-length validation.
- Durable marketplace receipts, exact claim IDs and journal-before-send retries for disk failures.
- Atomic faction reward persistence and fair recovery scans for unresolved settlements.
- Socket admission/heartbeat/outbound limits and fail-closed malformed-packet handling.
- Secure-cookie handling, browser security headers and request-log redaction.
- Quiescent backup verification, a corrected gold ledger with database constraints, read-only health checks and an emergency settlement pause.
- Compatible framework/network dependency updates and pinned transitive patches.

Validated on October 7, 2026: 64 isolated API security tests, the server security suite, API/server TypeScript checks and a frontend production build. The activated realm reported no pending settlement operations or snapshot/ledger mismatches; two staked characters verified, and the gold ledger matched devnet supply. These checks are a dated snapshot, not continuous monitoring or full economic reconciliation.

```bash
# From server/
pnpm run test:security

# From api/, using explicitly configured LOCAL admin credentials:
# AOCHAIN_SECURITY_ADMIN_DATABASE_URL must point to a local test server.
pnpm run test:security

# Read-only operational checks with the API's runtime environment loaded:
pnpm run security:health
pnpm run security:health -- --chain

# From frontend/
pnpm run test:english
pnpm build
```

The API security runner creates and drops isolated temporary databases. Other integration tests are not necessarily isolated: never run them against the live realm. Chain health checks require the same devnet configuration as the service and do not repair data.

Set `AOWEB_SETTLEMENT_PAUSED=1` and restart the API to block new settlement requests while retaining recovery/status paths. A pause cannot revoke a transaction already signed in a wallet.

Read [the remediation report](SECURITY-REMEDIATION.md) for exact validation, remaining dependency advisories and the incident procedure, and [the security policy](SECURITY.md) for handling sensitive reports.

## Remaining release work

Signer isolation, narrower internal authorization, unreported-transaction discovery, account recovery/email verification/MFA, complete reconciliation, storage/backup policies, stable origins/metadata, broader fault/load/wallet rehearsals and an independent security review remain open. The game-server dependency scan was clean on October 7; API/frontend advisories remain documented. The project is not presented as fully audited or mainnet-ready.

Some validation documents contain historical URLs, build IDs and superseded early-stage notes. Use their dated evidence and limitations, rather than assuming an old preview remains online.

## Upstream credit and licensing

Original AOWeb created by **Damián Catanzaro** ([X](https://x.com/DamianCatanzaro)). AOCHAIN builds on that client, server and game content instead of recreating Argentum Online from scratch.

The upstream server package declares ISC, but a complete license grant for the repository, frontend, bundled artwork and game data has not been established. Fork availability does not establish redistribution or commercial rights. Asset and licensing review remains a release requirement; this README does not grant a new license to upstream material.
