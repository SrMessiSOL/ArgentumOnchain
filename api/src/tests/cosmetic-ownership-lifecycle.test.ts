import {afterAll,beforeAll,beforeEach,expect,test,vi} from 'vitest';
import express from 'express';import type {Server} from 'node:http';
const f=vi.hoisted(()=>({wallets:new Map<string,string>(),equips:new Map<string,string>(),owner:'alice-wallet',issuer:'official',missing:false,fail:false,ready:true}));
vi.mock('../config',()=>({default:{tokenAuth:'internal-fixture'}}));
vi.mock('../repositories/auth',()=>({getPublicSessionByToken:async(t:string)=>['alice','bob','charlie'].includes(t)?{account:{_id:t}}:null}));
vi.mock('../cosmetic-chain',()=>({cosmeticChainReady:()=>f.ready,cosmeticChain:async()=>({fetch:async()=>{if(f.fail)throw Error('RPC unavailable');return f.missing?null:{owner:f.owner,issuer:f.issuer};}})}));
vi.mock('../db',()=>({default:{query:async(sql:string,p:any[])=>{
 const row=(who:string)=>f.equips.has(who)?[{wallet:f.wallets.get(who),asset_address:'issued',issuer_address:'official',season:'first-hunt-devnet-v1'}]:[];
 if(sql.includes('FROM characters p JOIN cosmetic_equipment'))return {rows:row(p[0].endsWith('001')?'alice':'bob')};
 if(sql.includes('FROM accounts a LEFT JOIN account_wallets'))return {rows:[{address:f.wallets.get(p[0]),level:2,hunt_eligible:true,kills:4}]};
 if(sql.startsWith('SELECT asset_address,state'))return {rows:p[0]==='alice'&&p[1]==='first-hunt-devnet-v1'?[{asset_address:'issued',state:'confirmed'}]:[]};
 if(sql.includes('FROM cosmetic_equipment e JOIN'))return {rows:row(p[0])};
 if(sql.includes('count(*) FROM cosmetic_supply'))return {rows:[{count:'1'}]};
 if(sql.startsWith('SELECT issuer_address'))return {rows:p[0]==='issued'?[{issuer_address:'official'}]:[]};
 if(sql.startsWith('INSERT INTO cosmetic_equipment')){f.equips.set(p[0],p[1]);return {rows:[]};}
 if(sql.startsWith('DELETE FROM cosmetic_equipment')){f.equips.delete(p[0]);return {rows:[]};}
 throw Error('Unexpected fixture query');
}}}));
import {installCosmeticRoutes} from '../cosmetic-routes';
let server:Server,base:string;
beforeAll(async()=>{const app=express();app.use(express.json());installCosmeticRoutes(app);await new Promise<void>(r=>{server=app.listen(0,'127.0.0.1',()=>r())});base=`http://127.0.0.1:${(server.address() as any).port}`;});
afterAll(async()=>new Promise<void>(r=>server.close(()=>r())));
beforeEach(()=>{f.wallets=new Map([['alice','alice-wallet'],['bob','bob-wallet'],['charlie','charlie-wallet']]);f.equips.clear();f.owner='alice-wallet';f.issuer='official';f.missing=false;f.fail=false;f.ready=true;});
async function req(path:string,token?:string,body?:unknown){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:token==='internal-fixture'?token:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};}
const equip=(who:string,asset:string|null='issued')=>req('/auth/cosmetics/equip',who,{asset});
const status=(who:string)=>req('/auth/cosmetics',who);
const inspect=(id=1)=>req(`/internal/characters/00000000-0000-0000-0000-${String(id).padStart(12,'0')}/cosmetic-title`,'internal-fixture');
test('transfer removes old-owner access and receiver equips same issued NFT without claiming',async()=>{
 expect((await equip('alice')).status).toBe(200);expect((await inspect()).body).toEqual({kind:'first-hunt'});
 f.owner='bob-wallet';expect((await status('alice')).body).toMatchObject({equipped:false,equippedAsset:null});expect((await inspect()).body).toEqual({kind:null});
 expect((await equip('alice')).status).toBe(403);expect((await equip('charlie')).status).toBe(403);
 expect((await status('bob')).body.hunt.claim).toBeNull();expect((await equip('bob')).status).toBe(200);
 expect((await status('bob')).body).toMatchObject({equipped:true,equippedAsset:'issued',equippedKind:'first-hunt'});expect((await inspect(2)).body).toEqual({kind:'first-hunt'});
 f.owner='alice-wallet';expect((await inspect(2)).body).toEqual({kind:null});expect((await equip('bob')).status).toBe(403);expect((await equip('alice')).status).toBe(200);
});
test('wrong issuer, unknown/burned asset and replaced linked wallet fail closed',async()=>{
 expect((await equip('alice','unknown')).status).toBe(404);await equip('alice');f.issuer='forged';expect((await equip('alice')).status).toBe(403);expect((await inspect()).body).toEqual({kind:null});
 f.missing=true;expect((await status('alice')).body.equipped).toBe(false);f.missing=false;f.issuer='official';f.wallets.set('alice','replacement');expect((await equip('alice')).status).toBe(403);expect((await inspect()).body).toEqual({kind:null});
});
test('outage, recovery and unequip during outage preserve gameplay-facing fail-closed state',async()=>{
 await equip('alice');f.fail=true;expect((await status('alice')).body).toMatchObject({equipped:false,verification:'unavailable'});expect((await inspect()).status).toBe(503);expect((await equip('alice')).status).toBe(503);
 f.fail=false;expect((await inspect()).body).toEqual({kind:'first-hunt'});f.fail=true;expect((await equip('alice',null)).status).toBe(200);expect((await inspect()).body).toEqual({kind:null});f.ready=false;expect((await status('alice')).body.equipped).toBe(false);
});
test('player credentials cannot inspect private API and response contains only a fixed kind',async()=>{
 expect((await req('/auth/cosmetics/equip',undefined,{asset:'issued'})).status).toBe(401);expect((await req('/internal/characters/00000000-0000-0000-0000-000000000001/cosmetic-title','alice')).status).toBe(401);await equip('alice');expect(Object.keys((await inspect()).body)).toEqual(['kind']);
});
