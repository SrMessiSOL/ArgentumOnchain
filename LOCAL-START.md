# Existing AOWeb, running locally

**Current instructions (2026-10-04):** see [OPERATIONS.md](OPERATIONS.md) for the verified startup, maintenance, backup/restore and devnet configuration. The historical notes below describe the first local run; their statements that no assets exist on Solana and that the game is entirely Spanish are superseded by [FIVE-STEPS-VALIDATION.md](FIVE-STEPS-VALIDATION.md).

Open http://127.0.0.1:3100. This is the original AOWeb client/server and game content, not the separate Canvas prototype.

Local demo login: `explorer@example.invalid` / `LocalOnly-AO-2026!`. This is a disposable local-only account, not a personal credential. Character: Wayfarer, human mage, Ullathorpe. You can create your own local account instead.

Controls shown by the game: W/A/S/D movement, Space attack/aim, E equip selected item, U use item, Q pick up, N meditate, Enter chat. The full original first-run controls dialog remains available.

## Restart on this computer

Run `Start-AOWeb.ps1` with PowerShell. Dependencies, ignored local environment files and the isolated database have already been prepared on this computer. The script reuses its running services and waits for the API before starting the game server.

This is a development run, not a production deployment. Local PostgreSQL 16 uses a new workspace cluster under `work/aoweb-postgres`, loopback port 55432, local trust authentication and no imported account records. Do not expose that cluster to the network. The original PostgreSQL installation and any existing databases/services are unchanged. Browser/API/game ports are 3100/3101/7766, all loopback.

The public PostgreSQL 18 seed was copied into `work/aoweb-pg16.sql`, removing only psql restrict/unrestrict directives and the unsupported transaction_timeout setting. The upstream dump remains unchanged. Additive wallet tables are in `api/wallet-schema.sql` and included in the API migration command.

## Solana scope

Use the Solana navigation link, or http://127.0.0.1:3100/wallet. The new page defaults to English and offers Spanish, with typed translation keys in `frontend/lib/wallet-locales.ts`. The original game remains Spanish; this is not a complete English translation.

The feature links a Phantom wallet to an authenticated account using an Ed25519 signed message. It binds the proof to the configured site origin, account, session, address, nonce and two-minute expiry. The server verifies and stores the link in PostgreSQL; challenges are single-use and a wallet cannot be claimed by two accounts. Connecting/signing requires your own explicit wallet interaction in a browser with Phantom. The in-app browser may not have that extension.

There are no Solana RPC calls, transactions, minted items, tokenized gold, mainnet operations or on-chain ownership yet. Wallet linking proves control only. A separately scoped collectible/cosmetic is the next on-chain increment. Original combat, movement, progression, inventory and economy logic stay in the existing game server.

## Verification (2026-10-03)

- Imported seed successfully: 1,062 objects, 340 NPC templates, 70 crafting recipes, 3 smelting recipes.
- Original browser flow verified: login, character creation, enter Ullathorpe, artwork/inventory/stats rendering, keyboard movement from (49,59) to (49,57).
- API and frontend TypeScript checks passed.
- `node scripts/wallet-smoke.cjs` from the API folder: 12 integration checks passed, including session/account substitution, tampered/expired/replaced proofs, concurrent replay, persistence and wallet uniqueness. Tests use disposable generated keys, not a human wallet or on-chain transaction.
- No full-game regression, complete PvP/playthrough, load test or production build is claimed.

Licensing remains unresolved for the repository as a whole, frontend and bundled assets; the server package alone declares ISC. No public fork/push or deployment was made. Resolve redistribution/commercial rights before launch. See LOCAL-PIVOT.md.

Additional proxy checks passed: authenticated same-origin requests reach address validation; cross-origin wallet writes return 403. The configured public origin handles Next's internal localhost normalization.


## One shared world
The home page now opens character selection directly. All normal characters enter the existing shared world. Arena rooms/invitation mode are disabled in navigation, page routing, API routes and ticket consumption. This remains a local server until a public hosting deployment is performed; it is not yet a publicly available official realm.

