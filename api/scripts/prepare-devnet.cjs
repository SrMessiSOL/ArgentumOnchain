// Creates a dedicated test issuer, never reads a personal wallet or uses mainnet.
const fs=require('node:fs');
const {createUmi}=require('@metaplex-foundation/umi-bundle-defaults');
const {sol}=require('@metaplex-foundation/umi');
async function main(){
 const file=process.argv[2];if(!file)throw new Error('Pass a path for the dedicated devnet issuer');
 const umi=createUmi('https://api.devnet.solana.com');
 if(await umi.rpc.getGenesisHash()!=='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')throw new Error('Not devnet');
 const key=fs.existsSync(file)?umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file,'utf8')))):umi.eddsa.generateKeypair();
 if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(Array.from(key.secretKey)),{flag:'wx',mode:0o600});
 console.log('Dedicated devnet issuer: '+key.publicKey);
 let balance=await umi.rpc.getBalance(key.publicKey);console.log('Balance lamports: '+balance.basisPoints);
 if(balance.basisPoints<10000000n){await umi.rpc.airdrop(key.publicKey,sol(0.1),{commitment:'confirmed'});balance=await umi.rpc.getBalance(key.publicKey);}
 console.log('Ready; devnet lamports: '+balance.basisPoints);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
