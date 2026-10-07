# Wallet creation and deposits

Activated October 6, 2026: frontend `aochain-wallets-20261006-v35`; existing local API restarted with the inventory endpoint. Game server left running.

Solana Foundation ConnectorKit `@solana/connector` 0.3.0 replaces direct Phantom globals. Source: https://github.com/solana-foundation/connectorkit and its package README. Wallet Standard discovery selects compatible browser wallets; ConnectorKit mobile support is enabled. Devnet is the only configured cluster. No WalletConnect project/QR service is configured, and wallets that cannot sign the required transaction or wallet-link message are unsupported. Hardware/mobile wallet compatibility was not individually rehearsed.

Creation connects and verifies the wallet before creating a draft. The creation button then prepares the existing mint-and-stake transaction and requests a wallet signature. Cancellation after draft creation preserves that character for recovery, and retries within the page reuse its ID. Cancelling the initial picker saves nothing. Confirmations and pending operations remain on the Solana page. PostgreSQL creation and chain minting are separate recoverable steps.

Wallet inventory queries registered active AOCHAIN assets and verifies current finalized on-chain owner, issuer, URI and identity attributes. Received characters/item receipts can therefore be selected without knowing their addresses. Manual address entry remains available. Gold reads the configured mint's associated token account, matching the account the deposit transaction burns from. Amounts remain decimal strings until bounded game-gold validation. Failed reads remain unknown rather than displayed as zero.

The Solana page supports character staking, item burn/deposit and SPL gold deposit with target-character selection. The marketplace gold bridge also shows wallet balance and a refresh action. Deposits reject unavailable/insufficient balances, fractions, exponent strings and values over the game gold limit. The server revalidates every operation.

Validation passed:

- Production frontend build and backend TypeScript.
- Seven character/item lifecycle tests plus twelve economy regressions in isolated PostgreSQL databases.
- Four real Core SDK transaction tests and three wallet-inventory tests, including changed ownership, forged assets, large integer balances and RPC failure.
- Real ConnectorKit byte-signing test with ephemeral keys: devnet chain binding, exact message preservation, issuer partial signature preservation and wallet-link message signing. No broadcast or funds used.
- English release suite.
- Browser inspection: wallet picker, initial creation cancellation, selectors, zero-balance deposit disabled, automatic focus and Escape dismissal, Spanish controls, desktop and 390px layout without horizontal overflow.
- Live read-only wallet verification found the registered exported item receipt (quantity one) and three SPL gold for the SrMessi-linked wallet. The cancelled creation QA name had zero database rows.

No mint, burn, gold deposit, wallet relink or payment was signed/sent by the agent. Full user-wallet creation and deposit confirmations still require human rehearsal.
