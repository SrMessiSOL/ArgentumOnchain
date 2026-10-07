# Running and recovering the local AOWeb trial

This is one shared realm on this PC. Gameplay remains authoritative and off-chain. Solana cosmetics use devnet only.

## Start, check and stop

Run these PowerShell scripts from this directory:

```powershell
./Start-AOWeb.ps1
./Check-AOWeb.ps1
./Stop-AOWeb.ps1 -KeepDatabase
```

The launcher starts the isolated PostgreSQL cluster, waits for the API and game health checks, reuses matching processes, and refuses unknown port owners. It also starts a hidden maintenance process. `-NoWeb` skips the local development frontend; `-NoMaintenance` suppresses maintenance startup for controlled diagnostics. Runtime settings in the workspace's `work/aoweb-runtime.json` preserve the dedicated devnet issuer and metadata origin across API restarts. That file contains paths/configuration, not private key bytes.

Maintenance checks the local API/game every 30 seconds, starts a missing service, and saves then backs up the database every 30 minutes. It does not forcibly kill a hung process, manage the temporary Cloudflare tunnel, or guarantee availability while Windows is asleep/offline. Status and errors are recorded in `work/maintenance-status.json` and `work/maintenance.*.log`. `Maintain-AOWeb.ps1 -Once -ForceBackup` runs the same save/backup path once.

The game autosaves connected characters at least once a minute (configurable ceiling via `AOWEB_AUTOSAVE_MS`, minimum 10 seconds). Startup through the launcher clears stale connected flags for this single-realm database. An abrupt crash can still lose progress since the most recent successful save. This is not a zero-data-loss design.

Stop refuses while characters are online. After normal logout it stops maintenance, saves the world, creates a backup, verifies tracked process identities, and stops the local services. `-KeepDatabase` leaves PostgreSQL running. The public frontend/tunnel are separate; `Stop-Public.ps1` stops only public access. Closing the Codex browser does not stop these services.

## Backups and restore verification

```powershell
./Backup-AOWeb.ps1 -VerifyRestore
```

Custom-format PostgreSQL archives, SHA-256 receipts and encrypted runtime bundles are saved under `work/backups/`. Verification creates a new `aoweb_restore_<timestamp>` database, restores the archive there, and checks table counts. It never restores over the live database. These databases are intentionally retained for inspection.

Runtime bundles protect the API/game/frontend environment files and dedicated issuer key with Windows DPAPI CurrentUser. Decryption round-trip is checked. These bundles require this Windows user profile; they are not a portable, off-device disaster-recovery solution. Player-owned wallet recovery is the player's responsibility; generated test-player keys remain in the private work directory. Database archives contain account data: keep backups private. No backup or key is served by the public gateway.

Retention is non-destructive: backups are not automatically deleted. Monitor disk space. For a live restore, first stop the realm, create a fresh backup, verify the exact target database and use the isolated restore as the candidate; do not run a restore into the live database while players are connected.

## Public preview and limitations

The current preview URL and frontend build are recorded in `work/aoweb-public.json`. The active production frontend uses port 3102, the gateway 3103, API 3101, game 7766 and PostgreSQL 55432; listeners stay on loopback. The temporary tunnel is not a permanent domain or a 24/7 hosting SLA. If its URL changes, rebuild the frontend with the new origin and update API runtime configuration and metadata. Already minted cosmetics currently refer to temporary metadata URLs; moving to permanent metadata hosting remains a release requirement.

The load test demonstrates short local idle/walking workloads, not production capacity for 110 simultaneous combatants. Wider world translations, embedded Spanish text in original artwork, asset redistribution/licensing review, stable hosting/metadata and a human Phantom signing walkthrough remain outside the completed five-step trial.
