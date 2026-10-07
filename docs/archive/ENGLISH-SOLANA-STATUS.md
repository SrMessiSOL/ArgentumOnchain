# AOCHAIN brand release — 2026-10-06

AOCHAIN / Argentum Onchain now has a cinematic landing page, a shared studio-style theme, actual game sprite previews for marketplace characters and items, original gold artwork, and branded metadata/social images. Active build: aochain-brand-20261006-v18 (.next-public-next). See AOCHAIN-BRAND-VALIDATION.md for screenshots and validation boundaries.

# Item exchange — 2026-10-05

The website now includes an Items tab using the same devnet test SOL payment and automatic receipt recovery as characters. Newbie gear, gold, NPC shop stock and equipped items are excluded. Listing escrows inventory; purchase delivers to the chosen offline character after finalization. English and Spanish, desktop/mobile checks, 21 database/payment tests, and live listing/cancellation rehearsal passed. No new item wallet payment was sent in this task. See `ITEM-MARKETPLACE-VALIDATION.md`.

# Marketplace UX release — 2026-10-05

Automatic purchase confirmation, Play action and responsive marketplace styling are live. See [MARKETPLACE-UX-VALIDATION.md](MARKETPLACE-UX-VALIDATION.md) for browser proof, tests and the observed public-RPC boundary.

# Character economy release — 2026-10-05

Character marketplace and 1:1 SPL gold are implemented and tested on devnet. Current public link: https://double-test-audience-examinations.trycloudflare.com/character-market. See [CHARACTER-ECONOMY-VALIDATION.md](CHARACTER-ECONOMY-VALIDATION.md) for real receipts, tests and remaining wallet-UI/production boundaries.

# Current localization status — 2026-10-04

The full English localization pass is implemented and live. See [FULL-ENGLISH-VALIDATION.md](../FULL-ENGLISH-VALIDATION.md) for coverage, browser checks and validation boundaries. Older entries below are historical, including their incomplete-translation and initial devnet status statements.

---

# Primera entrega — 4 de octubre de 2026

Disponible en https://soon-losses-laugh-blake.trycloudflare.com mientras siga activo el servidor de esta PC.

## Ingles

174 claves bilingues en frontend/locales/catalog.json, ingles predeterminado y espanol opcional. Selector global, cookie para renderizado inicial y preferencia por cuenta en PostgreSQL. La pantalla de wallet usa ahora la misma preferencia.

Traducidos el acceso/registro, seleccion y creacion de personajes, clases y razas, controles de bienvenida y partes del HUD, inventario y acciones. Traducciones de nombres del equipo inicial se aplican solo en presentacion: los IDs, protocolos, nombres de personajes y estadisticas no se cambian. La barra de vida Canvas tambien responde al idioma.

NO es una traduccion completa: faltan muchos objetos, hechizos, NPCs/dialogos, mensajes dinamicos del servidor, comercio avanzado, clanes, wiki, recuperacion de contrasena y texto dibujado en assets. Los textos sin catalogar conservan el original; no se oculta la falta de cobertura. Siguiente lote: catalogos por ID y eventos del servidor con clave/parametros, conservando compatibilidad con los parsers actuales.

## Solana

Implementado un reclamo de insignia Explorer en Metaplex Core, exclusivamente devnet:

- Requiere cuenta autenticada, wallet vinculada por firma y un personaje con nivel persistido >= 2. Salir del personaje guarda el progreso; no se acepta progreso enviado por el cliente.
- Una emision por cuenta/temporada. Direccion derivada de una clave exclusiva del servidor y el ID de cuenta; reserva persistida antes del envio. Bloqueo por cuenta y recuperacion de resultado incierto consultando el mismo asset.
- El servidor patrocina la transaccion con SOL de prueba. No pide ni usa la clave privada del jugador.
- Equipamiento verificado contra ownership actual e issuer registrado. Un objeto transferido deja de mostrarse en el HUD del anterior propietario en la siguiente comprobacion (cada 30 segundos); error RPC oculta el cosmetico. Sin bonus de combate. Es una insignia del HUD propio, no un cambio de sprite visible a terceros todavia.
- El endpoint de equipamiento tambien admite un asset transferido y registrado si la wallet actual demuestra ownership. Falta la interfaz para introducir esos assets recibidos.
- RPC fijado a api.devnet.solana.com y comprobacion del genesis completo. Mainnet se rechaza.

Estado REAL: no se emitio ningun NFT todavia. La solicitud automatica al faucet fallo y el sitio oficial pide CAPTCHA. La emision publica sigue deshabilitada; los tests de reclamos usan un adaptador de cadena simulado. No se conecto ninguna wallet humana ni se hizo ninguna operacion mainnet.

## Habilitar y verificar devnet

La clave dedicada se genero fuera del repo, en work/aoweb-devnet-issuer.json. No publicarla ni reutilizarla para mainnet. Direccion publica: 2kriWP5JgZDj4NXMMxtcYWFMJns1kPe7p85HGJdNPG7v.

Tras completar el faucet y verificar saldo, arrancar SOLO la API con AOWEB_DEVNET_ISSUER_FILE apuntando a ese archivo y AOWEB_DEVNET_METADATA_URL apuntando a /api/cosmetics/metadata del sitio HTTPS. La metadata y la imagen son temporales y dependen de este tunel: no sirven como almacenamiento permanente para un lanzamiento. No rotar el issuer durante una emision preparada; su direccion se comprueba antes de continuar.

Luego verificar emision real, lectura del asset en Explorer, reintento sin duplicados y transferencia con dos wallets de prueba. La prueba de recorrido humano con Phantom sigue pendiente. No presentar pruebas simuladas como confirmacion on-chain.

## Validacion realizada

- Build de produccion y TypeScript de frontend/API.
- Prueba de catalogo: 174 entradas en ambos idiomas, fallback ingles, conservacion de nombres propios y valores del protocolo.
- Tres pruebas de integracion agrupan mas de veinte comprobaciones: sesiones, idiomas separados por cuenta, valores invalidos, nivel insuficiente, wallet ausente, reclamos simultaneos, timeout despues de emision simulada, reintentos, issuer falso, cambio de wallet y transferencia.
- Cuenta y personaje desechables para QA; no se alteraron personajes del usuario.
- Navegador sobre el enlace HTTPS publico: acceso, ingles/espanol y persistencia tras recarga, creacion de personaje y pantalla de recompensa.

La compilacion publica actual usa .next-public-next. API y web se actualizaron; el proceso realtime y la base existente se conservaron. Stop-Public.ps1 sigue cerrando el acceso exterior.

Fuentes de implementacion: https://www.metaplex.com/docs/smart-contracts/core/create-asset y https://solana.com/docs/references/clusters.

## Gameplay translation batch — 2026-10-04

The catalog now contains 282 bilingual entries. Added 33 spell names, descriptions for Magic Antidote, Magic Dart, Heal Minor Wounds and Heal Major Wounds, 16 NPC dialogue sources (including starter-town merchants and priest), 27 combat/trading messages, shop controls/stat labels, chat toggles and the empty spell-list message. Repeated NPC dialogue sources share their translation. Existing starter-item names remain localized.

Localization runs only at presentation boundaries. Console entries retain their original text for gameplay handlers; player dialogue, named senders and chat channels bypass translation. Experience amounts and resurrection target names are preserved. Merchant stats are translated only after their original Spanish wire format has been parsed. NPC bubbles use an explicit NPC check and the current locale without reconnecting the game session.

Validation: production build/TypeScript pass; catalog smoke check passes. The regression test in `frontend/tests/game-i18n.test.ts` covers Spanish preservation, player-chat isolation, numeric messages, unchanged item stats and the actual incoming NPC/player-dialog handler. From the repository root: `node --import ./api/node_modules/tsx/dist/loader.mjs frontend/tests/game-i18n.test.ts`.

This remains a partial translation. Advanced item names, most spell descriptions, many NPCs, dynamic shop summaries and other game screens still need coverage. NPC bubbles already on screen retain their current text until the next dialogue. Real devnet minting remains unverified and disabled pending test SOL; this batch makes no on-chain changes.

Live browser check after activation: Tunnelwalker connects to the shared world; chat toggles, logout guidance and the empty spell list render in English, then Spanish, then English again without a game reconnect. Screenshot: `../aoweb-gameplay-english.png`. NPC dialogue and merchant-stat translations were verified by regression tests, not by a complete live merchant/combat walkthrough in this batch. The active build remains `.next-public-next`; the realtime server and API were not restarted.

## Mage walkthrough — 2026-10-04

Created Spelltester (human mage) on the disposable Tunnel Tester account through the public browser UI. No database level/gold edits or special combat fixtures were used.

Verified live:
- Character creation, equipping starter robe/staff, selecting Magic Dart, explicitly pressing Cast and clicking a creature. Each successful cast spent 10 mana.
- A wild rat kill granted a total of 80 XP and 6 gold. Further ordinary combat brought the character to level 2 with 10/420 XP and 12 gold; max health/mana increased to 27/198.
- Healing potion use consumed inventory. The intermediate save/reconnect check preserved 155 XP, 6 gold, 487 red potions, equipped staff/robe and map 1 position 77,65.
- Death, return to town, opening the church door and priest resurrection. Priest dialogue renders in English. Death strips equipped state as expected; gear can be re-equipped. Several deaths occurred during the manual walkthrough; this is not a claim of polished first-session difficulty.
- Merchant UI opens and a purchase without enough gold is rejected with the English server message. A successful purchase is NOT yet verified: the tested tools cost more than the earned gold. No gold was granted to bypass this constraint.
- After the final resurrection and normal character exit, the character list shows LEVEL 2. The Solana page reads Level 2/2, Mission complete. Claim is correctly disabled because issuance is not enabled and no wallet is linked.

Fixes from the walkthrough: mage gear names, spell accessibility labels, spell-information heading, world-map controls, case-sensitive STR/CHA labels, death prompts, connected-as text, welcome-link prefixes, live cast/hit/miss/kill/gold messages, additional NPC speech and shop names/summaries. Corrected a presentation bug where translated merchant details had accidentally been placed in the React key instead of the visible text. Raw protocol messages and original stat parsing remain unchanged; player chat bypasses translation.

Validation: 324 bilingual catalog entries; production build and TypeScript pass; expanded gameplay regression tests pass. Public frontend activated from `.next-public-en`; API/game server were not restarted. New live screenshots: `../mage-priest-english.png`, `../mage-level-two-saved.png`, `../mage-badge-unlocked.png`.

Remaining: verify a successful affordable purchase, translate snake names and remaining level-up/status/map text, complete wider world-data coverage, and rehearse a real devnet mint with test funding and a linked test wallet. This run did not connect a wallet or mint an asset.

## Dedicated test-wallet rehearsal — 2026-10-04

Linked a newly generated dedicated Ed25519 test wallet to the disposable Tunnel Tester account using the local API's signed, account/session/origin-bound challenge. Public address: `AzjWUVPHE9ABSntnhmFTuReXuCCfEzPAFkrUxVTwCFbG`. The private key remains outside the repository in the local work directory. This validates the signed API integration, not the Phantom browser-extension flow. Re-running the helper preserves the same wallet and refuses to replace a different existing link.

The server confirms level 2 and badge eligibility. The public receipt is `../devnet-wallet-rehearsal.json`. All 12 wallet integration checks pass, including concurrent/repeated proof rejection, session/account isolation, expiry, and address uniqueness. The smoke test now accepts an explicit expected site origin so it can verify this public trial's challenge origin.

The dedicated issuer still has zero devnet SOL. The official RPC airdrop returned an internal error, and the official browser faucet is pending CAPTCHA completion for a 0.5 devnet SOL request. Issuance remains disabled; no asset was minted or equipped. The next step is funding completion, then real devnet mint, ownership verification and equip/retry rehearsal. No personal wallet or mainnet funds were used.

## Real devnet badge verified — 2026-10-04

After the user funded the dedicated issuer, a devnet RPC read confirmed 1,000,000,000 lamports. Enabled issuance in the local API process environment and restarted only that API. The realtime game server was not restarted. These issuer settings are process-local and must be supplied again after a future API restart.

Successfully minted Metaplex Core asset `ACwt4J5nN2AofrXswaqaiprKQHom6otNNQaFHukuMaUq` to the dedicated test wallet `AzjWUVPHE9ABSntnhmFTuReXuCCfEzPAFkrUxVTwCFbG`. Transaction: `5UTAV957ioJdW3sXoxFizXronV93AC5RQhGybErFQvkTGcWhJQeXer31aSxCp8CSJ558GQbsQBA2NDJuyTvAk5ob` (devnet).

The executable rehearsal independently checked devnet genesis, metadata availability, level eligibility, on-chain asset owner, issuer/update authority, name and metadata URI. Repeating the claim returned the same asset. Equip succeeded and a subsequent API read returned equipped=true and verification=verified. Receipt: `../devnet-badge-receipt.json`; helper: `api/scripts/rehearse-devnet-badge.cjs` (preflight by default, explicit --execute for claim/equip).

This is an actual devnet mint, not a mocked chain result. Wallet linking/claiming were exercised through the API with a dedicated test key, not through Phantom. Metadata still uses the temporary public tunnel. No mainnet deployment, tradable economy, or transferable combat items are claimed by this proof.

## Progression translation batch — 2026-10-04

Added render-only translations for the server's level-up, health/mana growth and minimum/maximum damage growth notifications. Added Snake and Anthares Snake names plus 12 previously untranslated death, resurrection and paralysis messages. Catalog total: 338 bilingual entries. Source strings were checked against server messages and shipped NPC data; game data and protocol strings were not modified.

Regression checks cover exact numeric preservation, English output, Spanish preservation, global-chat isolation and rejection of partial pattern matches. Gameplay regression tests and production build/TypeScript pass. Activated frontend `.next-public-next`; API and realtime game processes were left running. This batch was verified through regression/build checks, not another live level-up combat walkthrough. Translation remains partial; successful shop purchase and wider world-data coverage still need validation.

## English command aliases — 2026-10-04

Added English command-token aliases for gameplay, party, clan, faction and staff commands. Examples: /home, /sethome, /meditate, /logout, /accept, /leaveparty, /kickparty, /createclan, /applyclan, /enlist and /reward. Existing Spanish commands remain valid. Aliases are normalized before the existing dispatcher and do not bypass its permissions or change argument names/messages. Clan deletion also accepts the English confirmation word `confirm`. /help (also /ayuda) lists player commands in English.

Updated English catalog guidance, macro command examples and console command references. Player-authored chat bypasses command-name replacement. Corrected the English priest hint to recommend double-clicking; the advertised original /RESUCITAR command has no handler. Internal hotkey/button commands can continue using the compatible Spanish wire names. Some server response prose and advanced staff argument keywords remain Spanish; this is not a claim of complete message/parameter translation.

Validation: alias dispatch coverage checks, gameplay/chat-isolation regression tests, server TypeScript and frontend production build pass. No characters were connected before the game restart. Activated server aliases and frontend `.next-public-en`, preserving the running devnet-enabled API. Live browser checks: /help lists English commands; /kickparty with no target returns `Usage: /kickparty {player}`; /logout closes the test mage session. Screenshot: `../english-commands.png`. Catalog: 362 bilingual entries.

## Five-step validation completed — 2026-10-04

Completed the normal merchant and persistence journey; expanded the bilingual catalog to 385 entries; added guarded startup/shutdown, 60-second autosaves, encrypted configuration backups, restore verification and a running maintenance service. Automatic recovery of the empty game server took 14.9 seconds with saved character data intact.

Measured 25, 60 and 110 authenticated clients on an isolated restored database. At 110 walking clients, ping p95 was 65.8 ms with zero disconnects or decode errors. This short loopback test is not a production mass-combat capacity claim.

Verified actual Explorer badge transfers in both directions on Solana devnet and ownership-based equip restrictions. Added and browser-claimed the First Hunt cosmetic, verified its chain owner and issuer, and equipped it. Its 100-claim season limit is enforced by the application/database. No mainnet or personal-wallet transaction was used.

Final active frontend: `.next-public-en`. Live final checks confirmed the English Safety indicator, map text/accessibility, Strength label, saved level-2 character, purchased apple and 8 gold. Spanish remains selectable; wider world translation is still partial.

See [FIVE-STEPS-VALIDATION.md](FIVE-STEPS-VALIDATION.md) for the full evidence and limits, and [OPERATIONS.md](../OPERATIONS.md) for operation and recovery. Final screenshot: `../final-english-game.png`.
