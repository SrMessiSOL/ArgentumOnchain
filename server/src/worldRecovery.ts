import path from 'node:path';
import { VaultJournal } from './vaultJournal';
const config = require('./config');
const funct = require('./functions');
const vars = require('./vars');

export const worldRecovery = new VaultJournal({
    allowFloorSpawns: true,
    directory: process.env.AOWEB_WORLD_JOURNAL_DIR || path.resolve(config.projectRoot, '../../../work/world-operations'),
    submit: (endpoint, payload) => funct.fetchUrl(endpoint, {
        method: 'PUT', body: payload,
        headers: { 'Content-Type': 'application/json', Authorization: vars.tokenAuth },
    }),
    warn: () => console.warn('[Security] World drop outcome unresolved; retaining receipt journal and bank guard. Retrying.'),
});
