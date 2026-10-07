import {beforeEach,it,expect,vi} from 'vitest';
import {Keypair} from '@solana/web3.js';
const state=vi.hoisted(()=>({records:[] as any[],assets:new Map<string,any>(),rpc:vi.fn(),account:undefined as any}));
vi.mock('../db',()=>({default:{query:async()=>({rows:state.records})}}));
vi.mock('../economy-chain',()=>({checkedChain:async()=>({getAccountInfo:state.rpc})}));
vi.mock('../game-asset-chain',()=>({fetchGameAsset:async(address:string)=>state.assets.get(address),attributes:(record:any)=>[{key:'aochain_kind',value:record.kind},{key:'aochain_id',value:record.id}]}));
vi.mock('@solana/spl-token',async(importOriginal)=>({...await importOriginal<any>(),unpackAccount:()=>state.account}));
import {readWalletInventory} from '../wallet-inventory';
const wallet=Keypair.generate().publicKey;
beforeEach(()=>{state.records=[];state.assets.clear();state.rpc.mockReset().mockResolvedValue(null);process.env.AOWEB_GOLD_MINT=Keypair.generate().publicKey.toBase58();});
function asset(id:string,kind='item'){
 const record={id,kind,asset_address:id,character_id:'original-character',issuer_address:'issuer',metadata_uri:'https://aochain.test/'+id,name:'Receipt',quantity:3,item_id:42,id_body:21,id_head:5,id_weapon:2,id_shield:3,id_helmet:4};state.records.push(record);
 const item={owner:wallet.toBase58(),updateAuthority:{type:'Address',address:'issuer'},uri:record.metadata_uri,attributes:{attributeList:[{key:'aochain_kind',value:kind},{key:'aochain_id',value:id}]},freezeDelegate:{frozen:false}};state.assets.set(id,item);return item;
}
it('finds received characters and receipts by actual ownership, excluding transferred and forged assets',async()=>{
 asset('received-character','character');asset('received-item');asset('transferred').owner='another-wallet';asset('forged').updateAuthority.address='imposter';asset('changed-quantity').attributes.attributeList=[];
 const result=await readWalletInventory(wallet.toBase58());expect(result.assets.map(a=>a.address)).toEqual(['received-character','received-item']);expect(result.assets[1].quantity).toBe(3);expect(result.assets[0].appearance).toEqual({bodyId:21,headId:5,weaponId:2,shieldId:3,helmetId:4});expect(result.assets[1].itemId).toBe(42);expect(result.assets[1].appearance).toBeUndefined();expect(result.goldBalance).toBe('0');
});
it('reads exact ATA gold amounts without losing integer precision',async()=>{
 state.rpc.mockResolvedValue({});state.account={owner:wallet,mint:new (wallet.constructor as any)(process.env.AOWEB_GOLD_MINT),isFrozen:false,amount:9007199254740993n};
 expect((await readWalletInventory(wallet.toBase58())).goldBalance).toBe('9007199254740993');
});
it('fails closed on RPC errors and invalid token accounts rather than reporting an empty wallet',async()=>{
 state.rpc.mockRejectedValue(Error('RPC unavailable'));await expect(readWalletInventory(wallet.toBase58())).rejects.toThrow('RPC unavailable');
 state.rpc.mockResolvedValue({});state.account={owner:wallet,mint:wallet,isFrozen:true,amount:1n};await expect(readWalletInventory(wallet.toBase58())).rejects.toThrow('invalidAsset');
});
