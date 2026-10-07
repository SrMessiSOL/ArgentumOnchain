import {beforeAll,afterAll,expect,test,vi} from 'vitest';
import express from 'express';
import type {Server} from 'node:http';
import crypto from 'node:crypto';
const fake=vi.hoisted(()=>({assets:new Map<string,{owner:string;issuer:string;uri:string}>(),mints:0,ambiguous:false,wait:0}));
vi.mock('../cosmetic-chain',()=>({cosmeticChainReady:()=>true,cosmeticChain:async()=>({
 issuer:'test-issuer',derive:(id:string,season?:string)=>({publicKey:{toString:()=>`test-asset-${id}${season?'-'+season:''}`}}),
 fetch:async(address:string)=>fake.assets.get(address)??null,
 mint:async(id:string,owner:string,uri:string,season?:string)=>{fake.mints++;await new Promise(r=>setTimeout(r,fake.wait));fake.assets.set(`test-asset-${id}${season?'-'+season:''}`,{owner,issuer:'test-issuer',uri});if(fake.ambiguous){fake.ambiguous=false;throw new Error('Simulated timeout AFTER chain success');}return 'test-signature';},
})}));
import pool from '../db';
import {registerAccount} from '../repositories/auth';
import {installCosmeticRoutes} from '../cosmetic-routes';
import {installPreferencesRoutes} from '../preferences-routes';
import {requireDevnet,DEVNET_GENESIS} from '../cosmetic-policy';
import fs from 'node:fs';
let server:Server,base:string;
const accounts:string[]=[];
const reservations:string[]=[];
async function request(path:string,token?:string,body?:unknown,method=body===undefined?'GET':'POST'){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json()};
}
async function account(){
 const suffix=Array.from(crypto.randomBytes(8),v=>String.fromCharCode(97+v%26)).join('');const data=await registerAccount({name:`Test ${suffix}`,email:`cosmetic-${suffix}@example.invalid`,password:crypto.randomBytes(20).toString('hex')});accounts.push(data.account._id);return data;
}
beforeAll(async()=>{
 // Tests are permitted only on the isolated local game database.
 if(!process.env.DATABASE_URL?.includes('127.0.0.1:55432/aoweb_local'))throw new Error('Set DATABASE_URL to the isolated local test DB');
 for(const file of ['wallet-schema.sql','preferences-schema.sql','cosmetics-schema.sql'])await pool.query(fs.readFileSync(file,'utf8'));
 process.env.AOWEB_DEVNET_METADATA_URL='https://test.invalid/explorer.json';
 const app=express();app.use(express.json());installCosmeticRoutes(app);installPreferencesRoutes(app);
 await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',()=>resolve());});base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
afterAll(async()=>{try{for(const id of [...accounts,...reservations])await pool.query('DELETE FROM cosmetic_supply_reservations WHERE account_id=$1',[id]);for(const id of accounts)await pool.query('DELETE FROM cosmetic_equipment WHERE account_id=$1',[id]);for(const id of accounts)await pool.query('DELETE FROM accounts WHERE id=$1',[id]);}finally{await pool.end();await new Promise<void>(resolve=>server.close(()=>resolve()));}});
test('mainnet and unknown network are rejected',()=>{expect(()=>requireDevnet('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')).toThrow();expect(()=>requireDevnet('unknown')).toThrow();expect(()=>requireDevnet(DEVNET_GENESIS)).not.toThrow();});
test('locale requires a session, validates values, persists and is account-isolated',async()=>{
 const a=await account(),b=await account();expect((await request('/auth/preferences')).status).toBe(401);
 expect((await request('/auth/preferences',a.sessionToken,{locale:'fr'},'PUT')).status).toBe(400);
 expect((await request('/auth/preferences',a.sessionToken,{locale:'es'},'PUT')).status).toBe(200);
 expect((await request('/auth/preferences',a.sessionToken)).data.locale).toBe('es');
 expect((await request('/auth/preferences',b.sessionToken)).data.locale).toBeNull();
});
test('eligibility, concurrent claims, ambiguous transaction recovery and transfer ownership',async()=>{
 const a=await account(),b=await account();const token=a.sessionToken,id=a.account._id;
 expect((await request('/auth/cosmetics')).status).toBe(401);
 expect((await request('/auth/cosmetics/claim',undefined,{})).status).toBe(401);
 expect((await request('/auth/cosmetics/claim',token,{level:999,wallet:'forged'})).status).toBe(409);
 await pool.query('INSERT INTO account_wallets(account_id,address) VALUES($1,$2)',[id,'fixture-wallet-'+id]);
 expect((await request('/auth/cosmetics/claim',token,{level:999})).status).toBe(403);
 await pool.query("INSERT INTO characters(account_id,name,level) VALUES($1,$2,2)",[id,`Cosmetic test ${id}`]);
 fake.ambiguous=true;fake.wait=150;
 const concurrent=await Promise.all([request('/auth/cosmetics/claim',token,{}),request('/auth/cosmetics/claim',token,{})]);
 expect(concurrent.map(r=>r.status).sort()).toEqual([409,503]);expect(fake.mints).toBe(1);
 const recovered=await request('/auth/cosmetics/claim',token,{});expect(recovered.status).toBe(200);expect(fake.mints).toBe(1);
 expect((await request('/auth/cosmetics/claim',token,{})).data.asset).toBe(recovered.data.asset);expect(fake.mints).toBe(1);
 expect((await request('/auth/cosmetics/equip',token,{asset:'unknown-asset'})).status).toBe(404);
 expect((await request('/auth/cosmetics/equip',token,{asset:recovered.data.asset})).status).toBe(200);
 expect((await request('/auth/cosmetics',token)).data.equipped).toBe(true);
 fake.assets.get(recovered.data.asset)!.issuer='forged-issuer';
 expect((await request('/auth/cosmetics/equip',token,{asset:recovered.data.asset})).status).toBe(403);
 fake.assets.get(recovered.data.asset)!.issuer='test-issuer';
 fake.assets.get(recovered.data.asset)!.owner='new-owner-'+id;
 expect((await request('/auth/cosmetics',token)).data.equipped).toBe(false);
 expect((await request('/auth/cosmetics/equip',token,{asset:recovered.data.asset})).status).toBe(403);
 await pool.query('INSERT INTO account_wallets(account_id,address) VALUES($1,$2)',[b.account._id,'new-owner-'+id]);
 expect((await request('/auth/cosmetics/equip',b.sessionToken,{asset:recovered.data.asset})).status).toBe(200);
 expect((await request('/auth/cosmetics',b.sessionToken)).data.equipped).toBe(true);
 await pool.query('UPDATE account_wallets SET address=$2 WHERE account_id=$1',[id,'changed-wallet-'+id]);
 expect((await request('/auth/cosmetics/claim',token,{})).status).toBe(409);
 expect(fake.mints).toBe(1);
},15000);
test('first-hunt eligibility, distinct asset, persistent cap and retry at sold-out supply',async()=>{
 const a=await account(),b=await account();fake.wait=0;
 for(const user of [a,b])await pool.query('INSERT INTO account_wallets(account_id,address) VALUES($1,$2)',[user.account._id,'hunt-wallet-'+user.account._id]);
 await pool.query('INSERT INTO characters(account_id,name,level,npc_matados) VALUES($1,$2,2,3)',[a.account._id,'Hunt '+a.account._id]);
 expect((await request('/auth/cosmetics/claim',a.sessionToken,{kind:'unknown'})).status).toBe(400);
 expect((await request('/auth/cosmetics/claim',a.sessionToken,{kind:'first-hunt',kills:999,level:999})).status).toBe(403);
 await pool.query('UPDATE characters SET npc_matados=4 WHERE account_id=$1',[a.account._id]);
 const first=await request('/auth/cosmetics/claim',a.sessionToken,{kind:'first-hunt'});expect(first.status).toBe(200);
 expect((await request('/auth/cosmetics',a.sessionToken)).data.hunt.claim.asset_address).toBe(first.data.asset);
 const explorer=await request('/auth/cosmetics/claim',a.sessionToken,{});expect(explorer.status).toBe(200);expect(explorer.data.asset).not.toBe(first.data.asset);
 expect((await request('/auth/cosmetics/equip',a.sessionToken,{asset:first.data.asset})).status).toBe(200);
 expect((await request('/auth/cosmetics',a.sessionToken)).data.equippedKind).toBe('first-hunt');
 const count=Number((await pool.query("SELECT count(*) FROM cosmetic_supply_reservations WHERE season='first-hunt-devnet-v1'")).rows[0].count);
 for(let i=count;i<99;i++){const id=crypto.randomUUID();reservations.push(id);await pool.query("INSERT INTO cosmetic_supply_reservations(season,account_id,asset_address) VALUES('first-hunt-devnet-v1',$1,$2)",[id,'test-reserved-'+id]);}
 await pool.query('INSERT INTO characters(account_id,name,level,npc_matados) VALUES($1,$2,2,4)',[b.account._id,'Hunt '+b.account._id]);
 const before=fake.mints;
 const c=await account();
 await pool.query('INSERT INTO account_wallets(account_id,address) VALUES($1,$2)',[c.account._id,'hunt-wallet-'+c.account._id]);
 await pool.query('INSERT INTO characters(account_id,name,level,npc_matados) VALUES($1,$2,2,4)',[c.account._id,'Hunt '+c.account._id]);
 fake.wait=150;
 const finalSlot=await Promise.all([b,c].map(user=>request('/auth/cosmetics/claim',user.sessionToken,{kind:'first-hunt'})));
 expect(finalSlot.map(r=>r.status).sort()).toEqual([200,409]);
 const loser=finalSlot[0].status===409?b:c;
 expect((await request('/auth/cosmetics/claim',loser.sessionToken,{kind:'first-hunt'})).data.error).toBe('cosmetic.soldOut');
 expect((await request('/auth/cosmetics/claim',a.sessionToken,{kind:'first-hunt'})).data.asset).toBe(first.data.asset);
 expect(fake.mints).toBe(before+1);
 expect((await request('/auth/cosmetics',a.sessionToken)).data.hunt.remaining).toBe(0);
 // A deleted account cannot free a reserved edition slot.
 await pool.query('DELETE FROM cosmetic_equipment WHERE account_id=$1',[a.account._id]);
 await pool.query('DELETE FROM accounts WHERE id=$1',[a.account._id]);
 expect((await pool.query('SELECT 1 FROM cosmetic_supply_reservations WHERE account_id=$1',[a.account._id])).rowCount).toBe(1);
},15000);
