import {beforeAll,afterAll,expect,test,vi} from 'vitest';
import express from 'express';
import type {Server} from 'node:http';
const fake=vi.hoisted(()=>({rows:[] as any[],asset:null as any,fail:false,queries:0}));
vi.mock('../db',()=>({default:{query:async()=>{fake.queries++;return {rows:fake.rows}}}}));
vi.mock('../config',()=>({default:{tokenAuth:'internal-test-only'}}));
vi.mock('../cosmetic-chain',()=>({cosmeticChainReady:()=>true,cosmeticChain:async()=>({fetch:async()=>{if(fake.fail)throw Error('RPC down');return fake.asset}})}));
import {installCosmeticInspection} from '../cosmetic-inspection';
import {HUNT_SEASON,COSMETIC_SEASON} from '../cosmetic-policy';
let server:Server,base:string;
beforeAll(async()=>{const app=express();installCosmeticInspection(app);await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',()=>resolve())});base=`http://127.0.0.1:${(server.address() as any).port}/internal/characters/00000000-0000-0000-0000-000000000001/cosmetic-title`;});
afterAll(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()))});
async function request(auth='internal-test-only',url=base){const r=await fetch(url,{headers:{Authorization:auth}});return {status:r.status,body:await r.json()};}
test('requires internal authentication and a valid character ID',async()=>{
 expect((await request('Bearer player-token')).status).toBe(401);expect(fake.queries).toBe(0);
 expect((await request('internal-test-only',base.replace('00000000-0000-0000-0000-000000000001','invalid'))).status).toBe(400);expect(fake.queries).toBe(0);
});
test('verified ownership, transfer, wrong issuer, missing asset, outage and unequip',async()=>{
 expect((await request()).body).toEqual({kind:null});
 fake.rows=[{wallet:'owner',asset_address:'asset',issuer_address:'issuer',season:HUNT_SEASON}];
 fake.asset={owner:'owner',issuer:'issuer'};
 expect((await request()).body).toEqual({kind:'first-hunt'});
 fake.rows[0].season=COSMETIC_SEASON;expect((await request()).body).toEqual({kind:'explorer'});
 fake.asset.owner='buyer';expect((await request()).body).toEqual({kind:null});
 fake.asset={owner:'owner',issuer:'wrong'};expect((await request()).body).toEqual({kind:null});
 fake.asset=null;expect((await request()).body).toEqual({kind:null});
 fake.fail=true;expect((await request()).status).toBe(503);fake.fail=false;
 fake.rows=[];expect((await request()).body).toEqual({kind:null});
});
