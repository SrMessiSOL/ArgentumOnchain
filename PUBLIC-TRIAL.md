# Prueba publica desde la PC

URL de esta sesion: https://soon-losses-laugh-blake.trycloudflare.com

Todos entran al mismo mundo persistente de esta PC. Crear una cuenta propia y un personaje desde el enlace. No usar la cuenta de pruebas Tunnel Tester.

El enlace requiere la PC encendida, conectada y sin suspension. Reiniciar el tunel genera otra URL. No hay garantia de disponibilidad ni prueba de capacidad para 100 jugadores. Cloudflare Quick Tunnels tiene un limite de 200 solicitudes simultaneas, que no equivale a 200 jugadores.

Para cerrar el acceso publico: ejecutar `Stop-Public.ps1` con PowerShell. Conserva el servidor local y los datos. No modifica router ni firewall.

## Implementacion

- Cloudflared oficial 2026.9.3; firma Authenticode Cloudflare validada.
- Un tunel HTTPS hacia el gateway local 127.0.0.1:3103.
- Gateway: HTTP a Next en produccion 127.0.0.1:3102; /game-socket a WebSocket 127.0.0.1:7766, solo mismo Origin.
- La API 3101 y PostgreSQL 55432 no se publican directamente. Se bloquean rutas internas y administracion en el gateway.
- Compilacion de produccion separada en .next-public. El servidor de desarrollo 3100 permanece local.
- La API usa el origen publico para los mensajes de vinculacion de wallet durante esta sesion. No se realizo ninguna transaccion Solana.
- Procesos y URL registrados bajo work/aoweb-public*.json; logs en work/tunnel.*, gateway.* y public-web.*.
- Validado: compilacion y TypeScript; registro publico; creacion de personaje; cookie Secure/HttpOnly; rechazo de game-ticket sin sesion; bloqueo de rutas internas/admin/arenas.

Referencia: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/

Prueba visual completada: ingreso al mundo por HTTPS/WSS, personaje Tunnelwalker en Ullathorpe, movimiento confirmado (49,59) -> (49,58), vida 20/20 y sin errores de consola. Evidencia: ../aoweb-public-play.png.

Actualizacion 2026-10-04: idioma global y mision devnet disponibles. Compilacion actual .next-public-next; emision on-chain deshabilitada hasta verificar fondos de prueba. Ver ENGLISH-SOLANA-STATUS.md.
