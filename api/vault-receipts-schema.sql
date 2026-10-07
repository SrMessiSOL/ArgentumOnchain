CREATE TABLE IF NOT EXISTS vault_operation_receipts (
    operation_id UUID PRIMARY KEY,
    scope TEXT NOT NULL CHECK (scope IN ('account', 'clan')),
    owner_id UUID NOT NULL,
    payload_hash TEXT NOT NULL,
    response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
