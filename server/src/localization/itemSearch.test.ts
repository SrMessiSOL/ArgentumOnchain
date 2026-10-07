import assert from 'node:assert/strict';
import {itemMatchesSearch} from './itemSearch';
assert.equal(itemMatchesSearch('Manzana Roja','apple'),true);
assert.equal(itemMatchesSearch('Manzana Roja','manzana'),true);
assert.equal(itemMatchesSearch('Poción Roja','pocion'),true);
assert.equal(itemMatchesSearch('Manzana Roja','sword'),false);
assert.equal(itemMatchesSearch('Long Sword','long'),true);
console.log('PASS: English/Spanish item searches, accents and unrelated queries.');
