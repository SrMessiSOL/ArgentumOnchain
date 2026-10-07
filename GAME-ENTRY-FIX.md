# Public game entry repair - 2026-10-07

The v60/v61 manual frontend builds omitted NEXT_PUBLIC_WS_URL=/game-socket, inheriting the local ws://127.0.0.1:7766 value. The URL resolver changed the host for public users but retained port 7766 and root path. The renderer initialized while the WebSocket handshake never reached the gateway; KeHago's game ticket remained unconsumed.

v62 explicitly sets the public endpoint. The resolver now maps a private/local configured endpoint on a public page to the page origin plus /game-socket, clearing the local port. Malformed configuration uses the same gateway fallback. Local development connections are retained.

Four routing regression checks passed, both local and public WebSocket handshakes opened, and the frontend production build passed. The game server and character records were not changed. Use Build-Public.ps1 for future releases; it already sets the public socket endpoint and prevents overwriting the active build.
