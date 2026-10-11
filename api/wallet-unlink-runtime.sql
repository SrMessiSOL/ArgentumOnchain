-- Additive grants for the restricted API role; no wallet or asset rows change.
-- Row-share membership locks require UPDATE privilege on at least one column.
GRANT SELECT, INSERT, DELETE ON account_linked_wallets TO aoweb_runtime;
GRANT UPDATE(address) ON account_linked_wallets TO aoweb_runtime;
GRANT DELETE ON account_wallets TO aoweb_runtime;
