import {PublicKey,Transaction,TransactionInstruction} from '@solana/web3.js';
import {createUmi} from '@metaplex-foundation/umi-bundle-defaults';
import {createNoopSigner,signerIdentity,publicKey} from '@metaplex-foundation/umi';
import {create,mplCore} from '@metaplex-foundation/mpl-core';
import {COSMETIC_SEASON,HUNT_SEASON} from './cosmetic-policy';
import {createEconomyTransaction} from './economy-chain';

/** Public-only construction; signing occurs only after committed-state approval. */
export function prepareCosmeticTransaction(id:string,season:string,asset:string,owner:string,issuer:string,uri:string,blockhash:string){
 if(![COSMETIC_SEASON,HUNT_SEASON].includes(season))throw Error('cosmetic.invalidSeason');
 const umi=createUmi('https://api.devnet.solana.com').use(mplCore());
 const signer=createNoopSigner(publicKey(issuer));umi.use(signerIdentity(signer));
 const builder=create(umi,{asset:createNoopSigner(publicKey(asset)),owner:publicKey(owner),updateAuthority:signer.publicKey,name:season===HUNT_SEASON?'AOWeb First Hunt — Devnet':'AOWeb Explorer — Devnet',uri});
 const tx=createEconomyTransaction(new PublicKey(issuer),blockhash);
 for(const instruction of builder.getInstructions())tx.add(new TransactionInstruction({programId:new PublicKey(instruction.programId),keys:instruction.keys.map(k=>({pubkey:new PublicKey(k.pubkey),isSigner:k.isSigner,isWritable:k.isWritable})),data:Buffer.from(instruction.data)}));
 tx.add(new TransactionInstruction({programId:new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),keys:[],data:Buffer.from(`aochain:cosmetic:v1:${id}:${season}`)}));
 return {transaction_bytes:tx.serialize({requireAllSignatures:false}).toString('base64'),message_bytes:tx.serializeMessage().toString('base64')};
}
