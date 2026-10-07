import assert from 'node:assert/strict';
import {createPrivateKey,sign} from 'node:crypto';
import {createTransactionSigner} from '@solana/connector/headless';
import {Keypair,PublicKey,SystemProgram,Transaction,TransactionInstruction} from '@solana/web3.js';

const user=Keypair.generate(),issuer=Keypair.generate();
const account={address:user.publicKey.toBase58(),publicKey:new Uint8Array(user.publicKey.toBytes()),chains:['solana:devnet'] as const,features:['solana:signTransaction','solana:signMessage']};
let requestedChain='';
const wallet={version:'1.0.0',name:'Test Standard Wallet',icon:'data:image/svg+xml;base64,',chains:['solana:devnet'],accounts:[account],features:{
 'solana:signTransaction':{version:'1.0.0',supportedTransactionVersions:['legacy',0],signTransaction:async(...inputs:any[])=>inputs.map(input=>{requestedChain=input.chain;assert.equal(input.account.address,account.address);const tx=Transaction.from(input.transaction);tx.partialSign(user);return {signedTransaction:new Uint8Array(tx.serialize())};})},
 'solana:signMessage':{version:'1.0.0',signMessage:async(...inputs:any[])=>inputs.map(input=>({signedMessage:input.message,signature:new Uint8Array(sign(null,input.message,createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.from(user.secretKey.slice(0,32))]),format:'der',type:'pkcs8'})))}))}
 }} as unknown as Parameters<typeof createTransactionSigner>[0]['wallet'];
const signer=createTransactionSigner({wallet,account,cluster:{id:'solana:devnet',label:'Devnet',url:'https://api.devnet.solana.com'}})!;
assert.equal(signer.address,account.address);
const tx=new Transaction({feePayer:user.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(SystemProgram.transfer({fromPubkey:user.publicKey,toPubkey:issuer.publicKey,lamports:1}),new TransactionInstruction({programId:new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),keys:[{pubkey:issuer.publicKey,isSigner:true,isWritable:false}],data:Buffer.from('local signature test')}));
tx.partialSign(issuer);
async function main(){
 const signed=await signer.signTransaction(new Uint8Array(tx.serialize({requireAllSignatures:false})));
 assert(signed instanceof Uint8Array);const result=Transaction.from(signed);
 assert.equal(requestedChain,'solana:devnet');assert.deepEqual(result.serializeMessage(),tx.serializeMessage());assert.deepEqual(result.signatures.find(s=>s.publicKey.equals(issuer.publicKey))?.signature,tx.signatures.find(s=>s.publicKey.equals(issuer.publicKey))?.signature);assert(result.verifySignatures());
 assert.equal((await signer.signMessage!(new TextEncoder().encode('AOCHAIN wallet link'))).length,64);
 console.log('PASS: real ConnectorKit Wallet Standard byte signing preserves server signatures and exact messages, with devnet chain binding and wallet-link message signing. No network or funds used.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
import {canDepositWalletGold} from '../lib/wallet-gold';
assert(canDepositWalletGold('3','3'));
for(const value of ['0','-1','1.5','1e3','','9007199254740993'])assert.equal(canDepositWalletGold(value,'9007199254740993'),false);
assert.equal(canDepositWalletGold('4','3'),false);
assert.equal(canDepositWalletGold('1',null),false);
