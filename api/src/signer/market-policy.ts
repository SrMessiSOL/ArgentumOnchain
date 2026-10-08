import {Keypair,Transaction} from '@solana/web3.js';
import type {EconomyApproval,SignerPolicy} from './economy-policy';
import {prepareCharacterPurchase,signAssetSubmission,type AssetRecord} from '../game-asset-chain';
import {recordSignedReceipt} from './journal';
import {reserveIssuance,type IssuanceBudget} from './budget';

export type CharacterPurchaseApproval=EconomyApproval&{chain_state:string;character_asset:string|null;record:AssetRecord&{state:string}|null};
/** The delegated NFT transfer and seller payment must be one exact transaction. */
export function checkCharacterPurchaseApproval(row:CharacterPurchaseApproval,issuer:string,metadataOrigin:string,policy:SignerPolicy){
 const deny=()=>{throw Error('signer.denied');};
 if(!row||row.kind!=='purchase'||row.tokenized!==true||!['prepared','signed'].includes(row.state)||row.connected!==false||row.deleted_at!==null)deny();
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)||row.linked_wallet!==row.wallet||row.chain_state!=='unstaked')deny();
 const amount=Number(row.amount);
 if(!Number.isSafeInteger(amount)||amount<=0||!Number.isSafeInteger(policy.maximumLamports)||policy.maximumLamports<=0||amount>policy.maximumLamports)deny();
 if(!row.listing_id||row.item_listing_id||row.listing_state!=='reserved'||row.listing_intent!==row.id||row.economy_lock!==row.listing_id||row.buyer_id!==row.account_id)deny();
 if(!row.seller_id||row.seller_id===row.account_id||row.owner_id!==row.seller_id||!row.seller_wallet||row.seller_linked_wallet!==row.seller_wallet||row.price!==row.amount)deny();
 const asset=row.record;
 if(!asset||asset.state!=='active'||asset.kind!=='character'||asset.id!==row.character_id||asset.character_id!==row.character_id||asset.asset_address!==row.character_asset||asset.issuer_address!==issuer)deny();
 const expected=new URL('/api/game-assets/metadata',metadataOrigin);expected.searchParams.set('id',asset!.id);
 if(expected.protocol!=='https:'||new URL(asset!.metadata_uri).toString()!==expected.toString())deny();
 return asset!;
}

export async function signCommittedCharacterPurchase(row:CharacterPurchaseApproval,raw:string,issuer:Keypair,metadataOrigin:string,policy:SignerPolicy,journal:string,budget:IssuanceBudget){
 const asset=checkCharacterPurchaseApproval(row,issuer.publicKey.toBase58(),metadataOrigin,policy);
 if(typeof raw!=='string'||raw.length>2200)throw Error('signer.denied');
 const walletTx=Transaction.from(Buffer.from(raw,'base64'));
 if(!walletTx.recentBlockhash)throw Error('signer.denied');
 // Preparation independently verifies finalized ownership, unfrozen state and
 // the issuer transfer delegate before reconstructing the payment + delivery.
 const expected=await prepareCharacterPurchase(row.id,asset,row.wallet,row.seller_wallet!,Number(row.amount),walletTx.recentBlockhash,issuer);
 if(expected.message_bytes!==row.message_bytes)throw Error('signer.denied');
 const signed=signAssetSubmission(raw,row.message_bytes,row.wallet,'purchase',asset,issuer);
 if(row.signature&&row.signature!==signed.signature)throw Error('signer.denied');
 reserveIssuance(budget,row.id,row.message_bytes,{gold:0,assets:0,cosmetics:0});
 return recordSignedReceipt(journal,{id:row.id,message:row.message_bytes,...signed});
}
