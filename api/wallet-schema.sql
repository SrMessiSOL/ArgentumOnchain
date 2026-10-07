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
