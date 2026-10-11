const assert=require('node:assert/strict'),Module=require('node:module'),path=require('node:path');
const route=path.resolve(__dirname,'../dist/game-asset-routes.js'),load=Module._load;
let absent=true,connected=false,proof='pending',writes=[];
const op={id:'op',kind:'mint',state:'signed',signature:'sig',transaction_bytes:'bytes',last_valid_height:100,asset_id:'asset',character_id:'char',account_id:'owner'};
async function query(sql){
 if(sql.startsWith('SELECT * FROM game_asset_operations'))return {rows:[{...op}]};
 if(sql.startsWith('SELECT asset_address'))return {rows:[{asset_address:'address'}]};
 if(sql.startsWith('SELECT * FROM characters'))return {rows:[{id:'char',economy_lock:'op',connected,chain_state:'offchain',asset_address:null}]};
 if(sql.startsWith('SELECT * FROM game_assets'))return {rows:[{id:'asset',asset_address:'address'}]};
 writes.push(sql);return {rows:[]};
}
Module._load=function(request,parent,...rest){
 if(parent?.filename===route&&request.startsWith('./')){
 if(request==='./db')return {query,connect:async()=>({query,release(){}})};
 if(request==='./expired-mint-proof')return {expiredMintAbsent:async()=>absent};
 if(request==='./economy-chain')return {receiptState:async()=>proof,economyConnection:{sendRawTransaction:async()=>{}},hasPreparedSignatures:()=>false,canWalletBroadcastPrepared:()=>false};
 if(request==='./item-economy')return {inventoryDelivery:async()=>{throw Error('mint must not refund inventory')}};
 return {};
 }
 return load.call(this,request,parent,...rest);
};
const {reconcileAssetOperation}=require(route);Module._load=load;
(async()=>{
 assert.deepEqual(await reconcileAssetOperation('op','owner'),{state:'failed'});
 assert(writes.some(x=>x.includes("UPDATE game_assets SET state='failed'")));assert(writes.some(x=>x.includes('economy_lock=NULL')));
 assert(!writes.some(x=>/DELETE|transaction_bytes\s*=|signature\s*=/.test(x)));
 writes=[];absent=false;assert.deepEqual(await reconcileAssetOperation('op'),{state:'pending'});assert.equal(writes.length,0);
 absent=true;connected=true;writes=[];assert.deepEqual(await reconcileAssetOperation('op'),{state:'pending'});assert(!writes.some(x=>x.startsWith('UPDATE')));
 await assert.rejects(reconcileAssetOperation('op','other'),/notOwned/);
 console.log('Expired mint reconciliation passed: release without deletion/refund, pending on missing proof, connected character guard and ownership.');
})().catch(e=>{console.error(e);process.exitCode=1});
