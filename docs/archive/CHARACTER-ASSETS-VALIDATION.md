# Character NFT and item receipt validation

Validated and activated locally on October 6, 2026. Public temporary preview: https://annie-skills-considering-savings.trycloudflare.com/wallet. Production frontend build: `aochain-assets-20261006-v32`. API restarted; game process retained.

## Verified

- Six isolated PostgreSQL lifecycle tests passed: required mint/stake before play, sealed unstaked bundles, ownership reassignment, pending-operation locks, failed mint/unstake recovery, item quantity export/import, single-credit burn settlement, single refund on expiry, starter/equipped item restrictions and full inventory rejection before burning.
- Twelve existing economy integration tests passed in a separate disposable database.
- Four real Metaplex Core SDK transaction tests passed: wallet/issuer signatures, frozen character creation without permanent delegates, stake/thaw instructions, atomic SOL payment plus character NFT delivery, and registered item export/burn instructions. Existing asset reads were mocked in these tests; instruction construction was real.
- Backend TypeScript and production frontend build passed.
- English release regression suite passed; new controls inspected in English and Spanish. Desktop and 390px viewport inspected; no horizontal overflow.
- Devnet character mint simulation succeeded, consuming 61,802 compute units. Payer signature was absent; signature verification disabled for simulation. No transaction was submitted, no funds spent, no asset minted. Evidence: `work/game-assets-simulation.json` in the task directory.
- Live signed-in test account showed both existing characters as unminted, with Mint & stake controls and item export/import tools. No test or player character was minted or sold by the agent.

## Human wallet rehearsal still required

1. Log out of the game; open Solana and connect the linked Phantom wallet on devnet.
2. Mint & stake one character, signing in Phantom. Wait for completion and inspect its NFT.
3. Play, change progress/inventory, then log out and Sync & unstake.
4. Confirm the character is sealed and cannot enter play while unstaked.
5. List it, purchase with a different account/wallet, then stake to play. Check inventory, equipment, personal bank, gold, spells and titles follow the same character ID.
6. Export one eligible unequipped item; verify it leaves inventory. Transfer its receipt NFT to another linked wallet and Burn & deposit into an offline playable character. Verify the exact registered quantity returns once.

## Current boundaries

Staking uses Core Freeze Delegate in the wallet and a trusted operator co-signer; it is not a custom trustless escrow program. Gameplay and full character data remain in PostgreSQL; the NFT records ownership and settled snapshot version/hash. Character purchases transfer SOL and NFT atomically, with database receipt settlement afterward. Existing unminted characters retain access; newly created characters require mint/stake. Individual receipt NFT trading currently uses wallet transfers/external trading; existing website item listings retain their database escrow flow.

Only devnet is supported. Temporary tunnel metadata URLs need stable hosting before a durable release. Operator authority/key migration and a complete human wallet rehearsal have not been validated. Shared account/clan vaults are excluded from character sales.
