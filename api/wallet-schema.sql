-- Additive, optional account identity. No changes to game objects or gold.
CREATE TABLE IF NOT EXISTS account_wallets (
    account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    address TEXT NOT NULL UNIQUE,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS wallet_link_challenges (
    account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    session_hash TEXT NOT NULL,
    address TEXT NOT NULL,
    message TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

-- Linked membership is separate from the active wallet used by existing settlement policy.
CREATE TABLE IF NOT EXISTS account_linked_wallets (
 account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 address TEXT NOT NULL UNIQUE,
 linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(account_id,address)
);
INSERT INTO account_linked_wallets(account_id,address,linked_at)
 SELECT account_id,address,linked_at FROM account_wallets
 ON CONFLICT(address) DO NOTHING;
