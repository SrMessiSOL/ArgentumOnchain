import {test,expect,vi,beforeEach,afterEach} from 'vitest';
const state=vi.hoisted(()=>({rows:[] as any[],assets:new Map<string,any>(),query:vi.fn(),batch:vi.fn()}));
vi.mock('../db',()=>({default:{query:state.query}}));
vi.mock('../economy-chain',()=>({checkedChain:async()=>({})}));
vi.mock('../game-asset-chain',()=>({fetchGameAssets:state.batch,attributes:(r:any)=>[{key:'aochain_id',value:r.id}]}));
import {readWalletInventory} from '../wallet-inventory';
beforeEach(()=>{vi.stubEnv('AOWEB_GOLD_MINT','');state.rows=[];state.assets=new Map();state.query.mockReset().mockImplementation(async()=>({rows:state.rows}));state.batch.mockReset().mockImplementation(async()=>state.assets);});
afterEach(()=>vi.unstubAllEnvs());
function register(id:string,owner='wallet'){
 const record={id,asset_address:id,issuer_address:'issuer',metadata_uri:'https://metadata.invalid/'+id,kind:'item',quantity:1,name:id,character_id:'character'};
 state.rows.push(record);const asset={owner,uri:record.metadata_uri,updateAuthority:{type:'Address',address:'issuer'},attributes:{attributeList:[{key:'aochain_id',value:id}]}};state.assets.set(id,asset);return asset;
}
test('one batched read preserves ownership, issuer, metadata and registration attribute checks',async()=>{
 register('good');register('other-owner','another wallet');register('wrong-issuer').updateAuthority.address='another issuer';register('wrong-uri').uri='https://untrusted.invalid';register('wrong-id').attributes.attributeList[0].value='another id';register('burned');state.assets.delete('burned');
 const result=await readWalletInventory('wallet');expect(result.assets.map(a=>a.address)).toEqual(['good']);expect(state.batch).toHaveBeenCalledExactlyOnceWith(state.rows.map(a=>a.asset_address));expect(state.query.mock.calls[0][0]).toContain('LIMIT 5001');
});
test('oversized registry fails visibly instead of silently returning partial assets',async()=>{
 state.rows=Array.from({length:5001},()=>({}));await expect(readWalletInventory('wallet')).rejects.toThrow('economy.rpcBusy');expect(state.batch).not.toHaveBeenCalled();
});
test('provider failure propagates without reporting an empty wallet',async()=>{
 register('good');state.batch.mockRejectedValueOnce(Error('Unavailable'));await expect(readWalletInventory('wallet')).rejects.toThrow('Unavailable');
});
