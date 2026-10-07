import path from 'node:path';
import { VaultJournal } from './vaultJournal';
const config = require('./config');
const funct = require('./functions');
const vars = require('./vars');

export const marketRecovery = new VaultJournal({
    allowMarket: true,
    directory: process.env.AOWEB_MARKET_JOURNAL_DIR || path.resolve(config.projectRoot, '../../../work/market-operations'),
    submit: (endpoint, payload) => funct.fetchUrl(endpoint, {
        method: 'POST', body: payload,
        headers: { 'Content-Type': 'application/json', Authorization: vars.tokenAuth },
    }),
    warn: () => console.warn('[Security] Market outcome unresolved; retaining receipt journal and bank guard. Retrying.'),
});
