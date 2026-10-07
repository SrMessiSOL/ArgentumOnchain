import {describe,it,expect,vi,beforeEach} from 'vitest';
import {Keypair,PublicKey,SystemProgram,Transaction,ComputeBudgetProgram} from '@solana/web3.js';
import {publicKey} from '@metaplex-foundation/umi';
import {MPL_CORE_PROGRAM_ID,getCreateV2InstructionDataSerializer,getUpdatePluginV1InstructionDataSerializer} from '@metaplex-foundation/mpl-core';
const state=vi.hoisted(()=>({asset:null as any,issuer:null as any}));
vi.mock('../economy-chain',async(importOriginal)=>{
 const actual=await importOriginal<typeof import('../economy-chain')>();
 const web3=await import('@solana/web3.js');
 return {validateSignedTransaction:actual.validateSignedTransaction,economyAuthority:()=>state.issuer,checkedChain:async()=>({getLatestBlockhash:async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:99}),getAccountInfo:async()=>state.asset?{owner:new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d'),lamports:1,executable:false,rentEpoch:0,data:Buffer.from([1])}:null}),createEconomyTransaction:(payer:PublicKey,blockhash:string)=>new web3.Transaction({feePayer:payer,recentBlockhash:blockhash}).add(ComputeBudgetProgram.setComputeUnitLimit({units:200000}))};
});
vi.mock('@metaplex-foundation/mpl-core',async(importOriginal)=>({...await importOriginal<object>(),deserializeAssetV1:()=>state.asset}));
import {assetIdentity,signAssetSubmission,prepareAssetTransaction,prepareCharacterPurchase,attributes,type AssetRecord} from '../game-asset-chain';
const wallet=Keypair.generate();let record:AssetRecord;
beforeEach(()=>{state.issuer=Keypair.generate();state.asset=null;process.env.AOWEB_GOLD_AUTHORITY_FILE='test';const id='11111111-1111-4111-8111-111111111111';const key=assetIdentity(id);record={id,kind:'character',character_id:id,asset_address:key.address,issuer_address:key.issuer,metadata_uri:'https://test.invalid/character.json'};});
function existing(frozen:boolean,owner=wallet.publicKey.toBase58()){
 state.asset={publicKey:publicKey(record.asset_address),owner:publicKey(owner),name:'Hero',uri:record.metadata_uri,updateAuthority:{type:'Address',address:publicKey(record.issuer_address)},freezeDelegate:{frozen,authority:{type:'Address',address:publicKey(record.issuer_address)}},transferDelegate:{authority:{type:'Address',address:publicKey(record.issuer_address)}},attributes:{attributeList:attributes(record,{version:1,hash:'a'.repeat(64)})}};
}
function core(tx:Transaction){return tx.instructions.filter(i=>i.programId.toBase58()===MPL_CORE_PROGRAM_ID);}
function finalize(tx:Transaction,p:any,action:any){expect(tx.signatures.every(s=>!s.signature)).toBe(true);tx.partialSign(wallet);const signed=signAssetSubmission(tx.serialize({requireAllSignatures:false}).toString('base64'),p.message_bytes,wallet.publicKey.toBase58(),action,record);expect(Transaction.from(Buffer.from(signed.bytes,'base64')).verifySignatures()).toBe(true);}
describe('real Core SDK transaction construction; no network or funds',()=>{
 it('mints a frozen wallet-owned character with issuer-authorized snapshot attributes and no permanent delegate',async()=>{
  const p=await prepareAssetTransaction('mint','operation',record,wallet.publicKey.toBase58(),'Hero',{version:1,hash:'a'.repeat(64)});const tx=Transaction.from(Buffer.from(p.transaction_bytes,'base64'));
  const [data]=getCreateV2InstructionDataSerializer().deserialize(core(tx)[0].data);
  expect(data.name).toBe('Hero');expect(data.uri).toBe(record.metadata_uri);
  expect(JSON.stringify(data.plugins)).toContain('FreezeDelegate');expect(JSON.stringify(data.plugins)).toContain('TransferDelegate');expect(JSON.stringify(data.plugins)).not.toContain('Permanent');
  expect(tx.feePayer?.toBase58()).toBe(wallet.publicKey.toBase58());expect(tx.signatures.find(s=>s.publicKey.equals(wallet.publicKey))?.signature).toBeNull();
  finalize(tx,p,'mint');expect(tx.serializeMessage().toString('base64')).toBe(p.message_bytes);
 });
 it('settles snapshot and thaws in one message; restake keeps existing delegates',async()=>{
  existing(true);const out=await prepareAssetTransaction('unstake','out',record,wallet.publicKey.toBase58(),'Hero',{version:2,hash:'b'.repeat(64)});const tx=Transaction.from(Buffer.from(out.transaction_bytes,'base64'));const instructions=core(tx);
  expect(instructions).toHaveLength(2);const updates=instructions.map(i=>getUpdatePluginV1InstructionDataSerializer().deserialize(i.data)[0]);expect(JSON.stringify(updates[0])).toContain('snapshot_hash');expect(JSON.stringify(updates[1])).toContain('false');finalize(tx,out,'unstake');
  existing(false);const incoming=await prepareAssetTransaction('stake','in',record,wallet.publicKey.toBase58(),'Hero');const stake=Transaction.from(Buffer.from(incoming.transaction_bytes,'base64'));expect(core(stake)).toHaveLength(1);finalize(stake,incoming,'stake');
 });
 it('reauthorizes delegates reset to Owner after a character transfer',async()=>{
  existing(false);state.asset.freezeDelegate.authority={type:'Owner'};state.asset.transferDelegate.authority={type:'Owner'};
  const incoming=await prepareAssetTransaction('stake','in',record,wallet.publicKey.toBase58(),'Hero');
  const tx=Transaction.from(Buffer.from(incoming.transaction_bytes,'base64'));expect(core(tx)).toHaveLength(3);finalize(tx,incoming,'stake');
 });
 it('binds SOL payment and NFT transfer atomically and rejects a frozen or foreign character',async()=>{
  const seller=Keypair.generate().publicKey.toBase58();existing(false,seller);const p=await prepareCharacterPurchase('sale',record,wallet.publicKey.toBase58(),seller,1000000);const tx=Transaction.from(Buffer.from(p.transaction_bytes,'base64'));expect(tx.instructions.some(i=>i.programId.equals(SystemProgram.programId))).toBe(true);expect(core(tx)).toHaveLength(1);finalize(tx,p,'purchase');
  existing(true,seller);await expect(prepareCharacterPurchase('sale',record,wallet.publicKey.toBase58(),seller,1000000)).rejects.toThrow('unstakeFirst');
  existing(false);await expect(prepareCharacterPurchase('sale',record,wallet.publicKey.toBase58(),seller,1000000)).rejects.toThrow('notOwned');
 });
 it('builds an item receipt with registered quantity and requires the owner signature to burn it',async()=>{
  record={...record,kind:'item',item_id:42,quantity:3};const p=await prepareAssetTransaction('item-export','export',record,wallet.publicKey.toBase58(),'Sword');const tx=Transaction.from(Buffer.from(p.transaction_bytes,'base64'));const [data]=getCreateV2InstructionDataSerializer().deserialize(core(tx)[0].data);expect(JSON.stringify(data.plugins)).toContain('quantity');expect(JSON.stringify(data.plugins)).not.toContain('FreezeDelegate');finalize(tx,p,'item-export');
  existing(false);state.asset.attributes.attributeList=attributes(record);const imported=await prepareAssetTransaction('item-import','import',record,wallet.publicKey.toBase58(),'Sword');const burn=Transaction.from(Buffer.from(imported.transaction_bytes,'base64'));expect(core(burn)).toHaveLength(1);burn.partialSign(wallet);expect(burn.verifySignatures()).toBe(true);
 });
});
