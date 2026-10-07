import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
process.loadEnvFile('.env');
import {PublicKey,Transaction,VersionedTransaction} from '@solana/web3.js';

async function main(){
 const runtime=JSON.parse(fs.readFileSync(path.resolve('../../../work/aoweb-runtime.json'),'utf8'));
 process.env.AOWEB_GOLD_AUTHORITY_FILE=runtime.goldAuthorityFile;
 process.env.AOWEB_DEVNET_METADATA_URL=runtime.metadataUrl;
 const {default:pool}=(await import('../db.js')) as unknown as {default:import('pg').Pool};
 try{
  const {assetIdentity,prepareAssetTransaction}=await import('../game-asset-chain.js');
  const {checkedChain}=await import('../economy-chain.js');
  const id=randomUUID(),identity=assetIdentity(id),connection=await checkedChain();
  const wallets=(await pool.query('SELECT address FROM account_wallets WHERE address<>$1',[identity.issuer])).rows;
  let payer:string|undefined;
  for(const wallet of wallets)if(await connection.getBalance(new PublicKey(wallet.address),'confirmed')>10_000_000){payer=wallet.address;break;}
  if(!payer){console.log('Unsigned simulation unavailable: no funded linked test wallet distinct from issuer.');return;}
  const record={id,kind:'character' as const,character_id:id,asset_address:identity.address,issuer_address:identity.issuer,metadata_uri:new URL('/api/game-assets/metadata?id='+id,runtime.metadataUrl).toString()};
  const prepared=await prepareAssetTransaction('mint',randomUUID(),record,payer,'AOCHAIN · Simulation',{version:1,hash:'a'.repeat(64)});
  const legacy=Transaction.from(Buffer.from(prepared.transaction_bytes,'base64'));
  if(legacy.signatures.find(s=>s.publicKey.toBase58()===payer)?.signature)throw Error('Simulation must never have a payer signature');
  const tx=new VersionedTransaction(legacy.compileMessage());
  for(let i=0;i<legacy.signatures.length;i++)if(legacy.signatures[i].signature)tx.signatures[i]=new Uint8Array(legacy.signatures[i].signature!);
  const result=await connection.simulateTransaction(tx,{sigVerify:false,replaceRecentBlockhash:true,commitment:'confirmed'});
  const report={mode:'unsigned simulation only',payerSignatureAbsent:true,error:result.value.err,unitsConsumed:result.value.unitsConsumed,logs:result.value.logs};
  fs.writeFileSync(path.resolve('../../../work/game-assets-simulation.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({mode:report.mode,payerSignatureAbsent:true,error:report.error,unitsConsumed:report.unitsConsumed}));
  if(report.error)process.exitCode=1;
 }finally{await pool.end();}
}
main().catch(e=>{console.error('Unsigned simulation failed:',e.message);process.exitCode=1;});
