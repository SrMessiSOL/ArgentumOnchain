import assert from 'node:assert/strict';
import {createInboundPacketValidator} from '../src/inboundPacketValidation';
import pkg = require('../src/package');
import * as wire from '../../frontend/lib/aowProtocol';
const validate=createInboundPacketValidator(pkg.serverPacketID);
const packets=[wire.createConnectCharacterPacket({ticket:'a'.repeat(64)}),wire.createPositionPacket(1,42),wire.createResyncPositionPacket(),wire.createClickPacket(1,100),wire.createChangeHeadingPacket(2),wire.createPingPacket(99),wire.createChangeSeguroPacket(),wire.createChangeClanSeguroPacket(),wire.createDialogPacket('hello ñ 👑'),wire.createEquipItemPacket(1),wire.createUseItemClickPacket(2),wire.createUseItemUPacket(3),wire.createDropItemPacket(4,10),wire.createPickupItemPacket(),wire.createBuyItemPacket(1,10),wire.createSellItemPacket(1,10),wire.createAttackMeleePacket(),wire.createAttackRangePacket(1,100),wire.createAttackSpellPacket(1,10,20,true),wire.createReorderSpellPacket(1,2),wire.createReorderInventoryItemPacket(1,2),wire.createReorderBankItemPacket(1,2),wire.createChangeBankTabPacket('clan'),wire.createDepositBankGoldPacket(100),wire.createWithdrawBankGoldPacket(100),wire.createCloseTradePacket(),wire.createMarketActionPacket('refresh'),wire.createRetosActionPacket('refresh'),wire.createToggleHiddenSkillPacket(),wire.createCraftItemPacket('blacksmith',1,10)];
for(const packet of packets){assert.equal(validate(packet),true);const bytes=Buffer.from(packet);assert.equal(validate(Buffer.concat([bytes,Buffer.from([255])])),false);assert.equal(validate(bytes.subarray(0,Math.max(0,bytes.length-2))),false);}
for(const [id,length] of [[pkg.serverPacketID.click,3],[pkg.serverPacketID.attackSpell,4],[pkg.serverPacketID.ping,1]]){const bytes=Buffer.alloc(length);bytes[0]=id;assert.equal(validate(bytes),true);}
assert.equal(validate(Buffer.alloc(0)),false);assert.equal(validate(Buffer.from([0])),false);assert.equal(validate('text frame'),false);
assert.equal(validate(Buffer.from([pkg.serverPacketID.dialog,1,0,0xc0,0xaf])),false);
assert.equal(validate(Buffer.from([pkg.serverPacketID.dialog,0xff,0xff])),false);
assert.equal(validate(wire.createDialogPacket('a'.repeat(4097))),false);
for(const packet of [Buffer.from([pkg.serverPacketID.dialog]),Buffer.from([pkg.serverPacketID.dialog,1,0])]){pkg.setData(packet);pkg.getPackageID();assert.throws(()=>pkg.getString());}
pkg.setData(Buffer.from(wire.createDialogPacket('ñ 👑')));pkg.getPackageID();assert.equal(pkg.getString(),'ñ 👑');
// Deterministic malformed-length corpus; every byte identifier is exercised without a live player.
let seed=123456;for(let i=0;i<10000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const bytes=Buffer.alloc(seed%40);if(bytes.length){bytes[0]=i%256;for(let j=1;j<bytes.length;j++)bytes[j]=(seed>>>((j%4)*8))&255;}assert.equal(typeof validate(bytes),'boolean');}
console.log('Inbound packet tests passed: all 30 current client constructors, legacy shapes, trailing/truncated frames, Unicode and 10,000 malformed frames.');
