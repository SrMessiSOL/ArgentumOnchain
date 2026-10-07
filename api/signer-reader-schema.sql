-- Manual, additive preparation only. Run as the realm database administrator.
-- NOLOGIN until a protected, locally generated credential is provisioned.
-- Never grant the API or game membership in this role.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aoweb_signer_reader') THEN
  CREATE ROLE aoweb_signer_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aoweb_signer_reader' AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication))
 OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='aoweb_signer_reader')) THEN
  RAISE EXCEPTION 'Existing signer reader role is privileged; refused to repurpose it';
 END IF;
END $$;
GRANT CONNECT ON DATABASE aochain_fresh TO aoweb_signer_reader;
GRANT USAGE ON SCHEMA public TO aoweb_signer_reader;
GRANT SELECT ON economy_intents TO aoweb_signer_reader;
GRANT SELECT(id,account_id,economy_lock,connected,deleted_at,asset_address,name,chain_state,chain_required) ON characters TO aoweb_signer_reader;
GRANT SELECT(account_id,address) ON account_wallets TO aoweb_signer_reader;
GRANT SELECT(id,seller_id,seller_wallet,state,intent_id,buyer_id,price) ON character_sales,item_sales TO aoweb_signer_reader;
GRANT SELECT ON game_asset_operations,game_assets TO aoweb_signer_reader;
GRANT SELECT(character_id,version,hash,settled) ON character_snapshots TO aoweb_signer_reader;
ALTER ROLE aoweb_signer_reader SET default_transaction_read_only=on;
ALTER ROLE aoweb_signer_reader SET statement_timeout='3s';
ALTER ROLE aoweb_signer_reader SET lock_timeout='1s';
