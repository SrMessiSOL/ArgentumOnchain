CREATE TABLE IF NOT EXISTS character_save_receipts (
    operation_id UUID PRIMARY KEY,
    character_id UUID NOT NULL,
    payload_hash TEXT NOT NULL,
    response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
