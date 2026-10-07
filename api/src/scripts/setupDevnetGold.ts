import fs from 'node:fs';
import path from 'node:path';
import {Keypair} from '@solana/web3.js';
import {createMint,getMint,TOKEN_PROGRAM_ID} from '@solana/spl-token';
import '../config';
import {checkedChain} from '../economy-chain';
async function main(){
 const work=path.resolve(__dirname,'../../../../../work');const runtime=JSON.parse(fs.readFileSync(path.join(work,'aoweb-runtime.json'),'utf8'));
 if(!runtime.devnetEnabled||!runtime.issuerFile)throw Error('Dedicated devnet issuer is required');
 const authority=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(runtime.issuerFile,'utf8'))));
 const keyFile=path.join(work,'aoweb-gold-mint-key.json');let mint:Keypair;
 if(fs.existsSync(keyFile))mint=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keyFile,'utf8'))));else {mint=Keypair.generate();fs.writeFileSync(keyFile,JSON.stringify(Array.from(mint.secretKey)));}
 const connection=await checkedChain();const existing=await connection.getAccountInfo(mint.publicKey,'finalized');
 if(!existing)await createMint(connection,authority,authority.publicKey,null,0,mint,{commitment:'finalized'},TOKEN_PROGRAM_ID);
 const info=await getMint(connection,mint.publicKey,'finalized',TOKEN_PROGRAM_ID);if(info.decimals!==0||info.freezeAuthority||!info.mintAuthority?.equals(authority.publicKey))throw Error('Gold mint configuration mismatch');
 runtime.goldMint=mint.publicKey.toString();runtime.goldAuthorityFile=runtime.issuerFile;runtime.characterAchievements=true;
 fs.writeFileSync(path.join(work,'aoweb-runtime.json'),JSON.stringify(runtime,null,2));
 console.log(JSON.stringify({network:'devnet',mint:runtime.goldMint,decimals:0,supply:info.supply.toString(),authority:authority.publicKey.toString()}));
}
main().catch(()=>{console.error('Devnet gold setup could not be confirmed. Stored mint identity is preserved for retry.');process.exitCode=1;});
