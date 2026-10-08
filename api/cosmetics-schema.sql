CREATE TABLE IF NOT EXISTS cosmetic_claims (
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  asset_address TEXT NOT NULL UNIQUE,
  wallet_address TEXT NOT NULL,
  issuer_address TEXT NOT NULL,
  metadata_uri TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','confirmed')),
  signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(account_id,season)
);
CREATE TABLE IF NOT EXISTS cosmetic_equipment (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  asset_address TEXT NOT NULL REFERENCES cosmetic_claims(asset_address)
);
-- Durable signing handoff: never replace existing authority/address or receipts.
ALTER TABLE cosmetic_claims ADD COLUMN IF NOT EXISTS operation_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE cosmetic_claims ADD COLUMN IF NOT EXISTS transaction_bytes TEXT;
ALTER TABLE cosmetic_claims ADD COLUMN IF NOT EXISTS message_bytes TEXT;
ALTER TABLE cosmetic_claims ADD COLUMN IF NOT EXISTS last_valid_height BIGINT;
ALTER TABLE cosmetic_claims ADD COLUMN IF NOT EXISTS signed_bytes TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS cosmetic_claims_operation_id_unique ON cosmetic_claims(operation_id);
-- Permanent season reservations survive account deletion and ambiguous RPC results.
CREATE TABLE IF NOT EXISTS cosmetic_supply_reservations (
  season TEXT NOT NULL,
  account_id UUID NOT NULL,
  asset_address TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(season,account_id)
);
