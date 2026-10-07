CREATE TABLE IF NOT EXISTS floor_spawn_receipts(operation_id UUID PRIMARY KEY,payload_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
