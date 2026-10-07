CREATE TABLE IF NOT EXISTS market_operation_receipts(operation_id UUID PRIMARY KEY,payload_hash TEXT NOT NULL,response JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
