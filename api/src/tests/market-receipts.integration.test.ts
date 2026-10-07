import { beforeAll, afterAll, test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import pool from '../db';
import {createMarketListing,buyMarketListing,cancelMarketListing,claimMarket,getMarketClaims} from '../repositories/market';
const seller=randomUUID(),buyer=randomUUID();
beforeAll(async()=>{
 if(!process.env.DATABASE_URL?.includes('aoweb_market_test_'))throw Error('Isolated database required');
 await pool.query(`CREATE TABLE characters(id UUID PRIMARY KEY,account_id UUID,gold INTEGER,deleted_at TIMESTAMPTZ,updated_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE character_items(character_id UUID REFERENCES characters(id),id_pos INTEGER,id_item INTEGER,cant INTEGER CHECK(cant<>13),equipped BOOLEAN,PRIMARY KEY(character_id,id_pos));`);
 const schema=fs.readFileSync('schema.sql','utf8');
 await pool.query(schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS market_listings ('),schema.indexOf('CREATE INDEX IF NOT EXISTS idx_market_listings_status_price_created')));
 await pool.query(fs.readFileSync('market-receipts-schema.sql','utf8'));
 await pool.query('INSERT INTO characters(id,account_id,gold) VALUES($1,$1,1000),($2,$2,1000)',[seller,buyer]);
});
afterAll(async()=>{await pool.end();});
const listing=()=>({operationId:randomUUID(),sellerCharacterId:seller,sellerName:'Seller',itemId:1,quantity:1,price:100,publicationFee:1,durationHours:24,characterGold:999,characterItems:[]});
test('concurrent listing retries create one listing and replay cannot overwrite later inventory',async()=>{
 const p=listing();const results=await Promise.all(Array.from({length:5},()=>createMarketListing(p)));
 expect(new Set(results.map(r=>r.listing.id)).size).toBe(1);
 await pool.query('UPDATE characters SET gold=900 WHERE id=$1',[seller]);
 expect(await createMarketListing(p)).toEqual(results[0]);
 expect((await pool.query('SELECT gold FROM characters WHERE id=$1',[seller])).rows[0].gold).toBe(900);
 await expect(createMarketListing({...p,price:999})).rejects.toThrow('does not match');
});
test('buy retries credit exactly one seller and buyer claim',async()=>{
 const made=await createMarketListing(listing());const p={operationId:randomUUID(),buyerCharacterId:buyer,buyerName:'Buyer',listingId:made.listing.id,characterGold:800,characterItems:[]};
 const first=await buyMarketListing(p);expect(await buyMarketListing(p)).toEqual(first);
 expect((await pool.query('SELECT count(*)::int n FROM market_claims WHERE source_listing_id=$1',[made.listing.id])).rows[0].n).toBe(2);
 await expect(cancelMarketListing({operationId:p.operationId,sellerCharacterId:seller,listingId:made.listing.id})).rejects.toThrow('does not match');
});
test('cancel retries preserve one return claim',async()=>{
 const made=await createMarketListing(listing());const p={operationId:randomUUID(),sellerCharacterId:seller,listingId:made.listing.id};
 const first=await cancelMarketListing(p);expect(await cancelMarketListing(p)).toEqual(first);
 expect((await pool.query('SELECT count(*)::int n FROM market_claims WHERE source_listing_id=$1',[made.listing.id])).rows[0].n).toBe(1);
});
test('collection consumes only selected claims; replay cannot consume later proceeds',async()=>{
 const before=(await getMarketClaims(buyer)).claims;const chosen=before[0];
 const extra=randomUUID();await pool.query("INSERT INTO market_claims(id,owner_character_id,claim_type,gold_amount) VALUES($1,$2,'gold',77)",[extra,buyer]);
 const p={operationId:randomUUID(),characterId:buyer,claimIds:[chosen.id],characterGold:800,characterItems:[{idPos:1,idItem:1,cant:1,equipped:false}]};
 const first=await claimMarket(p);expect(await claimMarket(p)).toEqual(first);
 expect(((await getMarketClaims(buyer)).claims).map(c=>c.id)).toContain(extra);
 await expect(claimMarket({...p,operationId:randomUUID()})).rejects.toThrow();
});
test('failed inventory mutation rolls back the claim and receipt',async()=>{
 const claims=(await getMarketClaims(seller)).claims;const p={operationId:randomUUID(),characterId:seller,claimIds:[claims[0].id],characterGold:1,characterItems:[{idPos:1,idItem:1,cant:13,equipped:false}]};
 await expect(claimMarket(p)).rejects.toThrow();
 expect(((await getMarketClaims(seller)).claims).map(c=>c.id)).toContain(claims[0].id);
 expect((await pool.query('SELECT count(*)::int n FROM market_operation_receipts WHERE operation_id=$1',[p.operationId])).rows[0].n).toBe(0);
});
