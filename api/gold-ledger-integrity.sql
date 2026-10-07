BEGIN;
CREATE TABLE IF NOT EXISTS gold_ledger_corrections (
 intent_id UUID PRIMARY KEY,character_id UUID NOT NULL,delta BIGINT NOT NULL,created_at TIMESTAMPTZ NOT NULL,
 reason TEXT NOT NULL,corrected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO gold_ledger_corrections(intent_id,character_id,delta,created_at,reason)
SELECT l.intent_id,l.character_id,l.delta,l.created_at,'Non-gold settlement preserved outside token accounting'
FROM gold_ledger l JOIN economy_intents i ON i.id=l.intent_id WHERE i.kind NOT IN ('deposit','withdraw')
ON CONFLICT(intent_id) DO NOTHING;
DELETE FROM gold_ledger l USING economy_intents i WHERE i.id=l.intent_id AND i.kind NOT IN ('deposit','withdraw');
CREATE OR REPLACE FUNCTION validate_gold_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE operation economy_intents%ROWTYPE;
BEGIN
 SELECT * INTO operation FROM economy_intents WHERE id=NEW.intent_id;
 IF NOT FOUND OR operation.kind NOT IN ('deposit','withdraw') OR operation.state<>'complete'
 OR NEW.character_id<>operation.character_id
 OR NEW.delta<>(CASE WHEN operation.kind='deposit' THEN operation.amount ELSE -operation.amount END)
 THEN RAISE EXCEPTION 'Gold ledger must match a completed token settlement'; END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS validate_gold_ledger ON gold_ledger;
CREATE CONSTRAINT TRIGGER validate_gold_ledger AFTER INSERT OR UPDATE ON gold_ledger DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_gold_ledger();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aoweb_runtime') THEN
  REVOKE UPDATE,DELETE ON gold_ledger FROM aoweb_runtime;
  GRANT SELECT,INSERT ON gold_ledger TO aoweb_runtime;
  GRANT SELECT ON gold_ledger_corrections TO aoweb_runtime;
 END IF;
END $$;
COMMIT;
