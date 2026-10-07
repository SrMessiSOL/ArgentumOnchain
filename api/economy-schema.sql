ALTER TABLE characters ADD COLUMN IF NOT EXISTS economy_lock UUID;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS economy_login_until TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS character_achievements (
 character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
 kind TEXT CHECK(kind IN ('explorer','first-hunt')), earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(character_id,kind)
);
CREATE TABLE IF NOT EXISTS character_titles (
 character_id UUID PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
 kind TEXT NOT NULL, FOREIGN KEY(character_id,kind) REFERENCES character_achievements(character_id,kind)
);
CREATE TABLE IF NOT EXISTS character_sales (
 id UUID PRIMARY KEY, character_id UUID NOT NULL REFERENCES characters(id), seller_id UUID NOT NULL REFERENCES accounts(id),
 seller_wallet TEXT NOT NULL, price BIGINT NOT NULL CHECK(price BETWEEN 1000000 AND 1000000000000),
 state TEXT NOT NULL CHECK(state IN ('listed','reserved','sold','cancelled')), buyer_id UUID REFERENCES accounts(id),
 intent_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), sold_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS character_sale_active ON character_sales(character_id) WHERE state IN ('listed','reserved');
CREATE TABLE IF NOT EXISTS economy_intents (
 id UUID PRIMARY KEY, account_id UUID NOT NULL REFERENCES accounts(id), character_id UUID NOT NULL REFERENCES characters(id),
 kind TEXT NOT NULL CHECK(kind IN ('purchase','deposit','withdraw')), amount BIGINT NOT NULL CHECK(amount>0),
 wallet TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','signed','complete','failed')),
 transaction_bytes TEXT NOT NULL, message_bytes TEXT NOT NULL, signature TEXT UNIQUE, last_valid_height BIGINT NOT NULL,
 listing_id UUID REFERENCES character_sales(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_gold_intent ON economy_intents(character_id) WHERE kind IN ('deposit','withdraw') AND state IN ('prepared','signed');
CREATE TABLE IF NOT EXISTS gold_ledger (
 intent_id UUID PRIMARY KEY REFERENCES economy_intents(id), character_id UUID NOT NULL REFERENCES characters(id),
 delta BIGINT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS economy_config (id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(id), mint TEXT NOT NULL, authority TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS item_sales (
 id UUID PRIMARY KEY, character_id UUID NOT NULL REFERENCES characters(id), seller_id UUID NOT NULL REFERENCES accounts(id),
 seller_wallet TEXT NOT NULL, item_id INTEGER NOT NULL REFERENCES game_objects(id), quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10000),
 price BIGINT NOT NULL CHECK(price BETWEEN 1000000 AND 1000000000000),
 state TEXT NOT NULL CHECK(state IN ('listed','reserved','sold','cancelled')), buyer_id UUID REFERENCES accounts(id),
 intent_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), sold_at TIMESTAMPTZ
);
ALTER TABLE economy_intents DROP CONSTRAINT IF EXISTS economy_intents_kind_check;
ALTER TABLE economy_intents ADD CONSTRAINT economy_intents_kind_check CHECK(kind IN ('purchase','item-purchase','deposit','withdraw'));
ALTER TABLE economy_intents ADD COLUMN IF NOT EXISTS item_listing_id UUID REFERENCES item_sales(id);
CREATE INDEX IF NOT EXISTS item_sales_active ON item_sales(seller_id) WHERE state IN ('listed','reserved');

INSERT INTO character_achievements(character_id,kind)
SELECT id,'explorer' FROM characters c WHERE deleted_at IS NULL AND level>=2 AND NOT EXISTS(SELECT 1 FROM character_achievements a WHERE a.character_id=c.id AND a.kind='explorer') ON CONFLICT DO NOTHING;
INSERT INTO character_achievements(character_id,kind)
SELECT id,'first-hunt' FROM characters c WHERE deleted_at IS NULL AND level>=2 AND npc_matados>=4 AND NOT EXISTS(SELECT 1 FROM character_achievements a WHERE a.character_id=c.id AND a.kind='first-hunt') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION guard_character_economy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('aoweb.economy_writer',true)='yes' THEN RETURN NEW; END IF;
 IF (NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at)
 AND EXISTS (SELECT 1 FROM item_sales WHERE character_id=OLD.id AND state IN ('listed','reserved')) THEN
  RAISE EXCEPTION 'Character has escrowed marketplace items';
 END IF;
 IF OLD.economy_lock IS NOT NULL AND (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at') THEN
  RAISE EXCEPTION 'Character is locked for an economy operation';
 END IF;
 IF NEW.economy_lock IS DISTINCT FROM OLD.economy_lock THEN RAISE EXCEPTION 'Economy lock is protected'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_character_economy ON characters;
CREATE TRIGGER guard_character_economy BEFORE UPDATE ON characters FOR EACH ROW EXECUTE FUNCTION guard_character_economy();
CREATE OR REPLACE FUNCTION guard_character_assets() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE locked UUID; char_id UUID;
BEGIN
 char_id=COALESCE(NEW.character_id,OLD.character_id);
 SELECT economy_lock INTO locked FROM characters WHERE id=char_id FOR UPDATE;
 IF locked IS NOT NULL AND current_setting('aoweb.economy_writer',true) IS DISTINCT FROM 'yes' THEN
  RAISE EXCEPTION 'Character assets are locked';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_character_items ON character_items;
CREATE TRIGGER guard_character_items BEFORE INSERT OR UPDATE OR DELETE ON character_items FOR EACH ROW EXECUTE FUNCTION guard_character_assets();
DROP TRIGGER IF EXISTS guard_character_bank ON character_bank_items;
CREATE TRIGGER guard_character_bank BEFORE INSERT OR UPDATE OR DELETE ON character_bank_items FOR EACH ROW EXECUTE FUNCTION guard_character_assets();
DROP TRIGGER IF EXISTS guard_character_spells ON character_spells;
CREATE TRIGGER guard_character_spells BEFORE INSERT OR UPDATE OR DELETE ON character_spells FOR EACH ROW EXECUTE FUNCTION guard_character_assets();
