import assert from 'node:assert/strict';
import { continuousMovementOffset as offset } from '../components/game/engine/movementContinuity.ts';
import { getSmoothedPingDisplay as ping } from '../components/game/network/ping.ts';
for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
 const previous={x:-8,y:4}; const next=offset(32,dx,dy,previous,true);
 assert.equal(32*dx+next.x,previous.x);
 assert.equal(32*dy+next.y,previous.y);
 assert.deepEqual(offset(32,dx,dy,previous,false),{x:-32*dx,y:-32*dy});
}
assert.deepEqual(offset(32,1,0,{x:-1000,y:0},true),{x:-32,y:-0});
assert.deepEqual(offset(32,1,0,{x:NaN,y:0},true),{x:-32,y:-0});
assert.deepEqual(offset(32,5,0,{x:-8,y:4},true),{x:-160,y:-0});
assert.equal(ping([100,100],100).jitter,0);
assert.equal(ping([100,200],100).jitter,100);
assert.equal(ping([],100).jitter,0);
assert.equal(ping([1,2,3,4,5,6],7).samples.length,6);
console.log('Remote step continuity, local prediction isolation, correction bound and ping jitter passed');
