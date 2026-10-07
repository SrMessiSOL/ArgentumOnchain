import {createHmac} from 'node:crypto';
import {Keypair} from '@solana/web3.js';
/** Keep the original derivation domain so existing NFT addresses remain stable. */
export function deriveAssetIdentity(issuer:Keypair,id:string){
 const key=Keypair.fromSeed(createHmac('sha256',issuer.secretKey).update(`aochain:game-asset:v1:${id}`).digest());
 return {key,address:key.publicKey.toBase58(),issuer:issuer.publicKey.toBase58()};
}
