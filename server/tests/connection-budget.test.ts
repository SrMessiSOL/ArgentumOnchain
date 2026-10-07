import assert from 'node:assert/strict';
import {ConnectionBudget,outboundWithinBudget,MAX_OUTBOUND_BUFFER_BYTES} from '../src/connectionBudget';
const budget=new ConnectionBudget(3,2);
const a=budget.acquire('a')!,a2=budget.acquire('a')!;assert.ok(a&&a2);assert.equal(budget.acquire('a'),null);
const b=budget.acquire('b')!;assert.ok(b);assert.equal(budget.acquire('c'),null);
a();a();const c=budget.acquire('c')!;assert.ok(c);assert.equal(budget.acquire('d'),null);
a2();b();c();assert.ok(budget.acquire('a'));
assert.equal(outboundWithinBudget(MAX_OUTBOUND_BUFFER_BYTES-1,1),true);assert.equal(outboundWithinBudget(MAX_OUTBOUND_BUFFER_BYTES,1),false);assert.equal(outboundWithinBudget(NaN,1),false);assert.equal(outboundWithinBudget(0,Infinity),false);assert.equal(outboundWithinBudget(-1,1),false);
console.log('Connection budget tests passed: total/IP admission, idempotent release, outbound boundary and invalid-size rejection.');
