-- Existing characters keep legacy access; only future creations require a minted stake.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS chain_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE characters ALTER COLUMN chain_required SET DEFAULT TRUE;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS chain_state TEXT NOT NULL DEFAULT 'offchain' CHECK(chain_state IN ('offchain','staked','unstaked'));
ALTER TABLE characters ADD COLUMN IF NOT EXISTS asset_address TEXT UNIQUE;
CREATE TABLE IF NOT EXISTS game_assets (
 id UUID PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('character','item')),
 character_id UUID NOT NULL REFERENCES characters(id),asset_address TEXT NOT NULL UNIQUE,
 issuer_address TEXT NOT NULL,metadata_uri TEXT NOT NULL,item_id INT REFERENCES game_objects(id),quantity INT,
 state TEXT NOT NULL CHECK(state IN ('reserved','active','burned','failed')),
 CHECK((kind='character' AND item_id IS NULL AND quantity IS NULL) OR (kind='item' AND item_id IS NOT NULL AND quantity BETWEEN 1 AND 10000)),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_character_nft ON game_assets(character_id) WHERE kind='character' AND state<>'failed';
CREATE TABLE IF NOT EXISTS character_snapshots (
 character_id UUID NOT NULL REFERENCES characters(id),version INT NOT NULL CHECK(version>0),
 hash TEXT NOT NULL CHECK(length(hash)=64),bundle JSONB NOT NULL,summary JSONB NOT NULL,
 settled BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(character_id,version)
);
CREATE TABLE IF NOT EXISTS game_asset_operations (
 id UUID PRIMARY KEY,account_id UUID NOT NULL REFERENCES accounts(id),character_id UUID NOT NULL REFERENCES characters(id),
 asset_id UUID NOT NULL REFERENCES game_assets(id),kind TEXT NOT NULL CHECK(kind IN ('mint','stake','unstake','item-export','item-import')),
 state TEXT NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','signed','complete','failed')),
 wallet TEXT NOT NULL,transaction_bytes TEXT NOT NULL,message_bytes TEXT NOT NULL,signature TEXT UNIQUE,last_valid_height BIGINT NOT NULL,
 snapshot_version INT,source_slot INT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),completed_at TIMESTAMPTZ,
 FOREIGN KEY(character_id,snapshot_version) REFERENCES character_snapshots(character_id,version)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_asset_operation ON game_asset_operations(asset_id) WHERE state IN ('prepared','signed');
CREATE OR REPLACE FUNCTION guard_chain_character() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('aoweb.economy_writer',true)='yes' THEN RETURN NEW; END IF;
 IF NEW.asset_address IS DISTINCT FROM OLD.asset_address OR NEW.chain_state IS DISTINCT FROM OLD.chain_state OR NEW.chain_required IS DISTINCT FROM OLD.chain_required THEN RAISE EXCEPTION 'Character chain state is protected'; END IF;
 IF OLD.asset_address IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN RAISE EXCEPTION 'Minted characters cannot be deleted'; END IF;
 IF OLD.chain_required AND OLD.chain_state<>'staked' AND (NEW.connected OR NEW.economy_login_until IS NOT NULL) THEN RAISE EXCEPTION 'Mint and stake the character before playing'; END IF;
 IF OLD.asset_address IS NOT NULL AND OLD.chain_state<>'staked' THEN
  IF (to_jsonb(NEW)-'updated_at'-'connected'-'economy_login_until') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at'-'connected'-'economy_login_until') OR NEW.connected OR NEW.economy_login_until IS NOT NULL THEN RAISE EXCEPTION 'Mint and stake the character before playing or changing inventory'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_chain_character ON characters;
CREATE TRIGGER guard_chain_character BEFORE UPDATE ON characters FOR EACH ROW EXECUTE FUNCTION guard_chain_character();
CREATE OR REPLACE FUNCTION guard_chain_items() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c characters%ROWTYPE;
BEGIN
 IF current_setting('aoweb.economy_writer',true)='yes' THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
 SELECT * INTO c FROM characters WHERE id=COALESCE(NEW.character_id,OLD.character_id) FOR UPDATE;
 IF c.asset_address IS NOT NULL AND c.chain_state<>'staked' THEN RAISE EXCEPTION 'Unstaked character inventory is sealed'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_chain_items ON character_items;
CREATE TRIGGER guard_chain_items BEFORE INSERT OR UPDATE OR DELETE ON character_items FOR EACH ROW EXECUTE FUNCTION guard_chain_items();
DROP TRIGGER IF EXISTS guard_chain_bank ON character_bank_items;
CREATE TRIGGER guard_chain_bank BEFORE INSERT OR UPDATE OR DELETE ON character_bank_items FOR EACH ROW EXECUTE FUNCTION guard_chain_items();
DROP TRIGGER IF EXISTS guard_chain_spells ON character_spells;
CREATE TRIGGER guard_chain_spells BEFORE INSERT OR UPDATE OR DELETE ON character_spells FOR EACH ROW EXECUTE FUNCTION guard_chain_items();
DROP TRIGGER IF EXISTS guard_chain_achievements ON character_achievements;
CREATE TRIGGER guard_chain_achievements BEFORE INSERT OR UPDATE OR DELETE ON character_achievements FOR EACH ROW EXECUTE FUNCTION guard_chain_items();
DROP TRIGGER IF EXISTS guard_chain_titles ON character_titles;
CREATE TRIGGER guard_chain_titles BEFORE INSERT OR UPDATE OR DELETE ON character_titles FOR EACH ROW EXECUTE FUNCTION guard_chain_items();
CREATE OR REPLACE FUNCTION guard_character_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Character snapshots are immutable'; END IF;
 IF (to_jsonb(NEW)-'settled') IS DISTINCT FROM (to_jsonb(OLD)-'settled') OR (OLD.settled AND NOT NEW.settled) THEN RAISE EXCEPTION 'Character snapshots are immutable'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_character_snapshot ON character_snapshots;
CREATE TRIGGER guard_character_snapshot BEFORE UPDATE ON character_snapshots FOR EACH ROW EXECUTE FUNCTION guard_character_snapshot();
