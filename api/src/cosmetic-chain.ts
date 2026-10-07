import fs from 'node:fs';
import {Connection} from '@solana/web3.js';
import {createDevnetFetch} from './economy-rpc';
import {createHmac} from 'node:crypto';
import {createUmi} from '@metaplex-foundation/umi-bundle-defaults';
import {createSignerFromKeypair, keypairIdentity, publicKey} from '@metaplex-foundation/umi';
import {create, mplCore, safeFetchAssetV1} from '@metaplex-foundation/mpl-core';
import bs58 from 'bs58';
import {COSMETIC_SEASON, requireDevnet} from './cosmetic-policy';

// Hard-coded public devnet endpoint: no mainnet override or user's wallet secret.
export const DEVNET_RPC='https://api.devnet.solana.com';
const cosmeticConnection=new Connection(DEVNET_RPC,{commitment:'finalized',disableRetryOnRateLimit:true,fetch:createDevnetFetch()});
export function cosmeticChainReady() {return Boolean(process.env.AOWEB_DEVNET_ISSUER_FILE && process.env.AOWEB_DEVNET_METADATA_URL);}
export async function cosmeticChain() {
  if(!cosmeticChainReady()) throw new Error('cosmetic.unavailable');
  const secret=Uint8Array.from(JSON.parse(fs.readFileSync(process.env.AOWEB_DEVNET_ISSUER_FILE!, 'utf8')));
  const umi=createUmi(cosmeticConnection).use(mplCore());
  const key=umi.eddsa.createKeypairFromSecretKey(secret);
  umi.use(keypairIdentity(key));
  requireDevnet(await umi.rpc.getGenesisHash());
  return {
    issuer: key.publicKey.toString(),
    derive(accountId: string, season = COSMETIC_SEASON) {
      const seed=createHmac('sha256',secret).update(`${season}:${accountId}`).digest();
      return createSignerFromKeypair(umi,umi.eddsa.createKeypairFromSeed(seed));
    },
    async fetch(address:string) {
      const asset=await safeFetchAssetV1(umi,publicKey(address),{commitment:'finalized'});
      if(!asset)return null;
      return {owner:asset.owner.toString(),issuer:asset.updateAuthority.type==='Address' ? asset.updateAuthority.address?.toString() ?? '' : '',name:asset.name,uri:asset.uri};
    },
    async mint(accountId:string,owner:string,uri:string,season=COSMETIC_SEASON,name='AOWeb Explorer — Devnet') {
      const asset=this.derive(accountId,season);
      const receipt=await create(umi,{asset,owner:publicKey(owner),updateAuthority:key.publicKey,name,uri}).sendAndConfirm(umi,{confirm:{commitment:'finalized'}});
      return bs58.encode(receipt.signature);
    },
  };
}
