import {beforeAll,afterAll,test,expect,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Keypair,Transaction,SystemProgram} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID} from '@solana/spl-token';
import {DEVNET_GENESIS} from '../cosmetic-policy';
const state=vi.hoisted(()=>({issuer:null as any}));
vi.mock('@solana/spl-token',async original=>({...await original<object>(),getMint:async()=>({decimals:0,mintAuthority:state.issuer.publicKey,freezeAuthority:null})}));
import {economyConnection,prepareTransaction,validateSignedTransaction,canWalletBroadcastPrepared} from '../economy-chain';
const wallet=Keypair.generate(),seller=Keypair.generate(),mint=Keypair.generate();let directory:string;
beforeAll(()=>{
 state.issuer=Keypair.generate();directory=fs.mkdtempSync(path.join(os.tmpdir(),'aochain-signing-fixture-'));const file=path.join(directory,'authority.json');fs.writeFileSync(file,JSON.stringify(Array.from(state.issuer.secretKey)),{mode:0o600});
 vi.stubEnv('AOWEB_GOLD_AUTHORITY_FILE',file);vi.stubEnv('AOWEB_GOLD_MINT',mint.publicKey.toBase58());
 vi.spyOn(economyConnection,'getGenesisHash').mockResolvedValue(DEVNET_GENESIS);
 vi.spyOn(economyConnection,'getLatestBlockhash').mockImplementation(async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}));
});
afterAll(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();if(directory){fs.unlinkSync(path.join(directory,'authority.json'));fs.rmdirSync(directory);}});
for(const kind of ['deposit','withdraw','purchase'] as const)test(kind+' cannot broadcast with wallet-only signatures; issuer approval preserves the prepared message',async()=>{
 const p=await prepareTransaction(kind,'fixture',wallet.publicKey.toBase58(),12,seller.publicKey.toBase58());const tx=Transaction.from(Buffer.from(p.transaction_bytes,'base64'));
 expect(tx.signatures.every(s=>!s.signature)).toBe(true);expect(canWalletBroadcastPrepared(p.transaction_bytes,wallet.publicKey.toBase58())).toBe(false);
 if(kind==='deposit')expect(tx.instructions.some(i=>i.programId.equals(TOKEN_PROGRAM_ID))).toBe(true);
 if(kind==='purchase')expect(tx.instructions.some(i=>i.programId.equals(SystemProgram.programId))).toBe(true);
 tx.partialSign(wallet);expect(tx.verifySignatures()).toBe(false);expect(()=>tx.serialize()).toThrow();const raw=tx.serialize({requireAllSignatures:false}).toString('base64');
 expect(()=>validateSignedTransaction(raw,p.message_bytes,wallet.publicKey.toBase58())).toThrow('economy.invalidTransaction');
 const result=validateSignedTransaction(raw,p.message_bytes,wallet.publicKey.toBase58(),[state.issuer]);const signed=Transaction.from(Buffer.from(result.bytes,'base64'));expect(signed.verifySignatures()).toBe(true);expect(signed.serializeMessage().toString('base64')).toBe(p.message_bytes);
});
test('legacy wallet-only messages are detected, remain valid for recovery and malformed preparations fail closed',()=>{
 const tx=new Transaction({feePayer:wallet.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(SystemProgram.transfer({fromPubkey:wallet.publicKey,toPubkey:seller.publicKey,lamports:12}));
 const message=tx.serializeMessage().toString('base64');expect(canWalletBroadcastPrepared(tx.serialize({requireAllSignatures:false}).toString('base64'),wallet.publicKey.toBase58())).toBe(true);
 tx.partialSign(wallet);const signed=validateSignedTransaction(tx.serialize().toString('base64'),message,wallet.publicKey.toBase58(),[state.issuer]);expect(Transaction.from(Buffer.from(signed.bytes,'base64')).verifySignatures()).toBe(true);
 expect(canWalletBroadcastPrepared('malformed',wallet.publicKey.toBase58())).toBe(true);
});
