CREATE TABLE IF NOT EXISTS ranked_sessions (
 id UUID PRIMARY KEY, account_id UUID NOT NULL REFERENCES accounts(id), character_id UUID NOT NULL REFERENCES characters(id),
 region TEXT NOT NULL, ticket_id UUID NOT NULL UNIQUE, revision TEXT NOT NULL, wallet TEXT NOT NULL, profile JSONB NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('queued','playing','complete','cancelled')), match_id UUID,
 admission_expires_at TIMESTAMPTZ NOT NULL, heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ended_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ranked_character_active ON ranked_sessions(character_id) WHERE state IN ('queued','playing');
CREATE TABLE IF NOT EXISTS ranked_matches (
 id UUID PRIMARY KEY, region TEXT NOT NULL, locks UUID[] NOT NULL, state TEXT NOT NULL CHECK(state IN ('playing','complete')),
 result_hash TEXT, receipt JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS ranked_rpc_nonces (
 region TEXT NOT NULL, nonce UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(region,nonce)
);
