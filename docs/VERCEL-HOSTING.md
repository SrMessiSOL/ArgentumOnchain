# Vercel frontend and Windows backend

Import SrMessiSOL/ArgentumOnchain into Vercel with **Root Directory `frontend`**, Next.js, Node.js 24.x, and the checked-in frozen pnpm install/build commands. The API and authoritative game server remain on the Windows host. No paid plan is selected by this procedure.

Vercel production environment:

- `API_BASE_URL=https://<backend-host>/player-api` (server-side configuration)
- `NEXT_PUBLIC_WS_URL=wss://<backend-host>/game-socket`
- `NEXT_PUBLIC_SITE_URL=https://<production-website-host>`
- `NEXT_PUBLIC_REALM_ENABLED=0` until the release gate passes. Vercel defaults to disabled gameplay. This UI setting is not backend authorization; keep the gateway disabled too.

Never upload database credentials, operations/game credentials, authority keys, private realm files or backups to Vercel. Deploy only `frontend/`. Preview deployments must use a separate disposable test backend, or leave the backend unavailable; do not add wildcard preview origins to the realm.

Run `node scripts/backend-gateway.cjs <protected-config.json>` on the Windows host. It binds to `127.0.0.1:3103`; a TLS tunnel targets that loopback listener. The config contains `enabled: false`, `backendOrigin` and `siteOrigin` as exact HTTPS origins. Change `enabled` only after deployment checks pass. API stays on loopback 3101, game on loopback 7766, PostgreSQL on loopback 55432. Use the backend gateway instead of the original website gateway for this topology.

The gateway permits an explicit method/path list of player endpoints under `/player-api`, and `/game-socket` with the exact website Origin. Internal routes, admin content tools, arbitrary auth routes and path-encoding tricks are denied. User session bearer tokens retain their existing validation. Neither internal service credential is forwarded or injected. Client-supplied identity headers are stripped; authentication IP budgets currently group gateway traffic together. Authenticated per-player IP forwarding is required before wider testing. Origin checks are browser protections, not independent authentication.

Set protected API `SITE_URL` and `CORS_ORIGIN` to the exact production website origin. Keep settlement paused and authority files absent until signer custody and wallet lifecycle checks are completed. The fresh database is not a playable blockchain-enabled realm merely because the website deploys.

Verify the Vercel build, public homepage, cookie/session behavior, API responses and cross-origin game socket. Verify internal/admin requests return 404, untrusted origins fail, and unknown hosts or disabled config return 503. Then test gameplay, persistence/reconnect and provider/outage behavior as required by COMMUNITY-TESTING-GATE.md. A temporary trycloudflare URL is not stable metadata or backend hosting. Do not forward router ports.

Rollback: disable gateway config; restore the previous frontend deployment. Preserve realm data and journals. Website rollback does not roll back database state or blockchain operations.
