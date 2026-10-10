import {strict as assert} from 'node:assert';
import {connectionBudgetFromEnvironment} from './connectionBudget';
const budget=connectionBudgetFromEnvironment({GAME_MAX_CONNECTIONS:'2',GAME_MAX_CONNECTIONS_PER_ADDRESS:'1'});
const a=budget.acquire('a');assert.ok(a);assert.equal(budget.acquire('a'),null);
const b=budget.acquire('b');assert.ok(b);assert.equal(budget.acquire('c'),null);
a();a();const c=budget.acquire('c');assert.ok(c);assert.equal(budget.acquire('d'),null);
for(const value of ['0','-1','513','NaN','1.2',''])assert.throws(()=>connectionBudgetFromEnvironment({GAME_MAX_CONNECTIONS:value}));
console.log('Configurable connection admission limits passed');
