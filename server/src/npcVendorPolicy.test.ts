import {strict as assert} from 'node:assert';
import {canNpcVendorTrade,canBuyFromNpc} from './npcVendorPolicy';
const objects = {3:{objType:2},32:{objType:3},99:{objType:2},15:{objType:11},1100:{objType:16,name:'Escudo de Hierro'}};
const hostile = {1:{hp:20,exp:10,drop:[{item:3,cant:1},{item:15,cant:1},{item:1100,cant:1}]}};
assert.equal(canNpcVendorTrade(3,objects,hostile,[]),false,'selected hostile drop blocked');
assert.equal(canNpcVendorTrade(32,objects,{},[{itemId:32}]),false,'selected recipe blocked');
assert.equal(canNpcVendorTrade(32,objects,{},[{itemId:32,deleted:true}]),true,'deleted recipe ignored');
assert.equal(canNpcVendorTrade(3,objects,{1:{hp:20,drop:[{item:3,cant:1}]}},[]),false,'all NPC drops blocked');
assert.equal(canNpcVendorTrade(15,objects,hostile,[{itemId:15}]),true,'potion exception');
assert.equal(canNpcVendorTrade(99,objects,hostile,[{itemId:99}]),false,'all crafting outputs blocked');
assert.equal(canNpcVendorTrade(1100,objects,hostile,[]),false,'drop without owner list covered');
assert.equal(canNpcVendorTrade(3,objects,{},[]),true,'unobtainable selected gear stays available');


assert.equal(canNpcVendorTrade(198,{198:{objType:2}},{1:{drop:[{item:198,cant:1}]}},[{itemId:198}]),true,'worker tool exception');
assert.equal(canNpcVendorTrade(99,objects,{},[],[{ingotItemId:99}]),false,'smelting output blocked');

assert.equal(canBuyFromNpc(99,objects,{},[]),false,'unknown vendor stock denied even without source data');
assert.equal(canBuyFromNpc(195,{195:{objType:3}}, {},[]),false,'advanced armor denied without recipe or drop');
assert.equal(canBuyFromNpc(32,objects,{},[]),true,'basic clothes allowed');
assert.equal(canBuyFromNpc(32,objects,{},[{itemId:32}]),false,'basic gear cannot bypass acquisition rule');
assert.equal(canBuyFromNpc(15,objects,hostile,[{itemId:15}]),true,'potions remain exception');
assert.equal(canBuyFromNpc(561,{561:{objType:2}}, {},[{itemId:561}]),false,'newbie tool denied despite missing flag');
assert.equal(canBuyFromNpc(1054,{1054:{objType:12}}, {},[]),true,'travel ticket allowed');
assert.equal(canBuyFromNpc(1048,{1048:{objType:16,newbie:1}}, {},[]),false,'starter shield denied');
assert.equal(canBuyFromNpc(103,{103:{objType:9}}, {},[]),false,'house keys excluded');
assert.equal(canBuyFromNpc(5,{5:{objType:5}}, {},[]),false,'gold excluded');
for(const object of [{objType:11,newbie:1},{objType:11,newbie:'1'},{objType:11,newbie:true},{objType:2,newbie:1}]){
 assert.equal(canBuyFromNpc(127,{127:object},{},[]),false,'newbie override blocks buying even worker tools/potions');
 assert.equal(canNpcVendorTrade(127,{127:object},{},[]),false,'newbie override blocks selling even worker tools/potions');
}
assert.equal(canNpcVendorTrade(855,{855:{objType:11}},{},[]),false,'legacy newbie potion cannot bypass absent flag');
assert.equal(canBuyFromNpc(38,{38:{objType:11,newbie:0}},{},[]),true,'normal potion still allowed');
const sewingKit={2000:{objType:2,name:'Costurero',newbie:0}};
assert.equal(canBuyFromNpc(2000,sewingKit,{},[{itemId:2000}]),true,'sewing kit is worker tool');
assert.equal(canNpcVendorTrade(2000,sewingKit,{},[{itemId:2000}]),true,'sewing kit can be sold to vendor');
assert.equal(canBuyFromNpc(2000,{2000:{...sewingKit[2000],newbie:1}},{},[]),false,'newbie sewing kit excluded');
assert.equal(canNpcVendorTrade(2000,{2000:{...sewingKit[2000],newbie:1}},{},[]),false,'newbie sewing kit cannot be sold');
assert.equal(canBuyFromNpc(2000,{2000:{objType:2,name:'Costurero de combate'}},{},[]),false,'unreviewed names do not gain exemption');
console.log('NPC vendor acquisition, catalog, sewing kit and newbie exclusion tests passed');
