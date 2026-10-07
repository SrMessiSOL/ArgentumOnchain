CREATE TABLE IF NOT EXISTS account_preferences (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en','es')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
