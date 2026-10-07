import assert from 'node:assert/strict';
import {connectionIdentity,canonicalIp} from '../src/connectionIdentity';
assert.equal(connectionIdentity('203.0.113.1',{'x-aochain-client-ip':'198.51.100.9','x-real-ip':'198.51.100.8','cf-connecting-ip':'198.51.100.7','x-forwarded-for':'198.51.100.6'}),'203.0.113.1');
assert.equal(connectionIdentity('::ffff:127.0.0.1',{'x-aochain-client-ip':'198.51.100.9'}),'198.51.100.9');
assert.equal(connectionIdentity('::1',{'x-aochain-client-ip':'2001:0db8:0:0:0:0:0:1'}),'2001:db8::1');
for(const value of ['invalid','198.51.100.9, 203.0.113.1','a'.repeat(100)])assert.equal(connectionIdentity('127.0.0.1',{'x-aochain-client-ip':value}),'127.0.0.1');
assert.equal(connectionIdentity('127.0.0.1',{'x-aochain-client-ip':['198.51.100.9'],'cf-connecting-ip':'198.51.100.8'}),'127.0.0.1');
assert.equal(canonicalIp('::ffff:198.51.100.9'),'198.51.100.9');assert.equal(canonicalIp('::FFFF:198.51.100.9'),'198.51.100.9');assert.equal(canonicalIp(undefined),undefined);
console.log('Connection identity tests passed: trusted-loopback headers, external spoof rejection, canonical IPv6/mapped IPv4 and malformed-header rejection.');
