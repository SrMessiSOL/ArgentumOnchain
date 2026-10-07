import path from 'node:path';
import { VaultJournal } from './vaultJournal';
const config = require('./config');
const funct = require('./functions');
const vars = require('./vars');

export const vaultRecovery = new VaultJournal({
    directory: process.env.AOWEB_VAULT_JOURNAL_DIR || path.resolve(config.projectRoot, '../../../work/vault-operations'),
    submit: (endpoint, payload) => funct.fetchUrl(endpoint, {
        method: 'PUT', body: payload,
        headers: { 'Content-Type': 'application/json', Authorization: vars.tokenAuth },
    }),
    warn: () => console.warn('[Security] Vault outcome unresolved; retaining receipt journal and bank guard. Retrying.'),
});
