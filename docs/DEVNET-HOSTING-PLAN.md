# Public devnet hosting decision and migration plan

Decision dated 2026-10-06. Preserve PostgreSQL and all game state; move the complete stack off the Windows PC. No database deletion, public cutover, account provisioning or secret transfer performed.

## Provider choice
Preferred: Oracle Always Free Ampere A1 VM, within current entitlement of 2 OCPUs and 12 GB RAM, with persistent storage in the account home region. Capacity is not guaranteed. The user previously had no Oracle account; registration and verification remain prerequisites. Select only Always Free resources and verify quotas before provisioning; do not enable a paid fallback.

Fallback for a bounded small trial: Render web compute plus separately managed PostgreSQL such as Neon. This requires fitting the actual game process memory and traffic into free quotas. It is not a claim of 100-player capacity. Render Free PostgreSQL expires after 30 days, so it is unsuitable for preserving the community realm. Koyeb's 0.1 vCPU/512 MB free instance is not recommended for the complete stack.

Sources checked:
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://render.com/docs/free
- https://www.koyeb.com/docs/reference/instances
- https://neon.com/blog/neon-free-plan-1-gb-per-project

## Deployment topology
Internet HTTPS/WSS -> TLS reverse proxy -> production Next frontend and game WebSocket. API accessible only to the frontend/game server on a private network. PostgreSQL accessible only to API. No public database or internal API port. One authoritative game process for the shared world; do not horizontally duplicate it.

Existing PostgreSQL holds accounts, character progression, equipment, game data and transaction reconciliation. Solana ownership does not replace these realtime and recovery records.

## Required packaging work before cutover
1. Build Linux/ARM containers on the target builder and verify assets, maps and all database schema resources are included. Existing Dockerfiles are legacy candidates, not verified deployment artifacts for current economy features.
2. Replace localhost/host.docker.internal examples and changeme secrets with private service names and fresh environment-provided credentials. Public browser traffic uses same-origin /api and /game-socket.
3. Provision a stable HTTPS endpoint and configure SITE_URL, CORS_ORIGIN, wallet challenge domain and cookies consistently. Keep internal admin routes blocked.
4. Audit password storage and login throttling, mutation origin/CSRF checks, one-use game tickets, socket connection/message limits and transaction replay protections. Existing Secure/HttpOnly/SameSite cookie code and gateway WebSocket origin checks were inspected; they do not establish a complete security audit. API CORS currently defaults to wildcard and must be explicitly configured.
5. Keep issuer secrets only on the server in restricted mounted files; never in image build args, repository, public directory or NEXT_PUBLIC variables. Use devnet-only issuer and enforce devnet runtime configuration. Preserve existing asset authorities or use an explicit authority migration; replacing issuer blindly can break existing NFTs.
6. Run services as non-root, patch host, restrict SSH to operator/key access, expose only HTTPS/HTTP and restricted SSH, and configure service restarts, log rotation and resource limits.

## Data migration and rollback
- Use existing Backup-AOWeb.ps1 with VerifyRestore, inspect receipt and compare core plus economy/game-asset row counts. Restore rehearsal must target a new database.
- The runtime backup uses Windows DPAPI CurrentUser. It cannot simply be decrypted on Linux; migrate only necessary secrets through a separately secured operator-controlled channel.
- Configure target PostgreSQL least-privilege runtime role and a separate migration role. Backups must be encrypted and stored outside the VM; rehearse restoration.
- Validate target with copied data before opening gameplay writes. At final cutover, stop new game writes, disconnect/save players gracefully, take final backup, restore and check row counts/asset links. Reconcile outstanding signed operations before reopening.
- Switch the public endpoint only after health, login, wallet challenge, stake guard, inventory, purchase reconciliation and WSS checks pass.
- Keep old instance stopped and backup intact. Do not run both realms with independent writable copies. Rollback after target writes requires moving those writes back, not simply starting the stale local DB.

## Capacity and release gate
Start with 10 invited testers, then exercise 25 and 50 concurrent authenticated connections in an isolated load test. Measure CPU, RSS, tick/event-loop delay, DB pool waits, save latency, packet rates and reconnect recovery. Set an admission cap from evidence. 100+ players is unverified. Do not use third-party uptime pings to evade free-tier sleep limits.

A secure public release claim requires the security checks above, backup restoration proof, no exposed private services, and signed-player smoke tests. This plan is preparation, not a deployment or penetration-test result.

## No-card revision — 2026-10-06
Oracle rejected because signup requests a credit card. Preferred database candidate is Aiven Free PostgreSQL: official documentation states no card, 1 GB storage, 1 GB RAM, one CPU, backups, 20 connections, no VPC or connection pool, possible inactivity shutdown. Before migration: verify data size, certificate-verified TLS, restricted runtime privileges and restore compatibility. Lower API pool from default 20 to at most 10 to leave operational headroom.

Game compute remains unresolved. Existing work/render-memory-probe.log measured 294 maps at 1117 MiB RSS on Windows, excluding NPCs and players. This older local measurement is sizing evidence, not a current Linux deployment proof. Render Free has 512 MB RAM and cannot be assumed to host the current complete world. Koyeb Free also has 512 MB. Hugging Face current documentation requires a paid plan for new Docker compute Spaces. Do not promise full-stack no-card hosting or migrate the game before verifying a viable compute host. Do not reduce the world or remove maps without an explicit design decision.

Sources: https://aiven.io/docs/products/postgresql/concepts/pg-free-tier ; https://render.com/docs/compute-plans ; https://huggingface.co/docs/hub/spaces-overview

## Aiven provisioned — 2026-10-06
Created aochain-devnet in the authenticated Aiven account, permanent Free tier (not Developer trial): PostgreSQL 18, free-1-1gb, one CPU, 1 GB RAM, 1 GB storage, 20 connection limit, disaster-recovery backups. Provider selected DigitalOcean sfo. Initial observed status Building. No payment method or paid upgrade used; no data restored and local services unchanged. Default network allowlist is Open to all and must be restricted before importing application records. TLS CA certificate is available in console. Evidence: task work/aiven-free-created.png, connection information collapsed to avoid showing credentials. Compute migration remains blocked by lack of a verified suitable free host.

Aiven follow-up: replaced all-open IPv4/IPv6 allowlist with only the migration PC IPv4 /32; verified console applied the restriction. Created a fresh local backup and restored it into a new isolated database successfully (6 accounts, 9 characters, 1062 objects, 340 NPCs, 4 claims). Cloud connection credentials and CA remain in ignored task-private files, not application config. Certificate-verified connection probe attempted: DNS ENOTFOUND while console still reports Building. No remote restore or live cutover performed; wait for service provisioning/DNS before retrying. Backup receipt: task work/backups/aoweb-20261006-232927-678.dump.receipt.json. Snapshot may become stale while local gameplay continues; final cutover needs a write pause and final backup.
