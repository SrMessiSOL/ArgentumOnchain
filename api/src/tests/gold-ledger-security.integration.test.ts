import {beforeAll,afterAll,test,expect} from 'vitest';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import pool from '../db';
const account=randomUUID(),character=randomUUID(),old=randomUUID();
const migration=fs.readFileSync('gold-ledger-integrity.sql','utf8');
async function intent(id:string,kind:string,state='complete'){
 await pool.query(`INSERT INTO economy_intents(id,account_id,character_id,kind,amount,wallet,state,transaction_bytes,message_bytes,last_valid_height) VALUES($1,$2,$3,$4,10,'fixture',$5,'fixture','fixture',1)`,[id,account,character,kind,state]);
}
beforeAll(async()=>{
 if(!process.env.DATABASE_URL?.includes('aoweb_ledger_test_'))throw Error('Isolated database required');
 for(const f of ['schema.sql','economy-schema.sql'])await pool.query(fs.readFileSync(f,'utf8'));
 await pool.query("INSERT INTO accounts(id,name,email) VALUES($1,'Ledger','ledger@example.invalid')",[account]);
 await pool.query("INSERT INTO characters(id,account_id,name) VALUES($1,$2,'Ledgerhero')",[character,account]);
 await intent(old,'item-purchase');await pool.query('INSERT INTO gold_ledger(intent_id,character_id,delta) VALUES($1,$2,-10)',[old,character]);
});
afterAll(async()=>{await pool.end();});
test('historical non-token settlement is preserved in corrections without changing character gold',async()=>{
 await pool.query(migration);await pool.query(migration);
 expect((await pool.query('SELECT count(*)::int n FROM gold_ledger WHERE intent_id=$1',[old])).rows[0].n).toBe(0);
 expect((await pool.query('SELECT delta FROM gold_ledger_corrections WHERE intent_id=$1',[old])).rows[0].delta).toBe('-10');
 expect((await pool.query('SELECT gold FROM characters WHERE id=$1',[character])).rows[0].gold).toBe(0);
});
test('a signed operation and matching ledger can complete atomically in either statement order',async()=>{
 const id=randomUUID();await intent(id,'withdraw','signed');const c=await pool.connect();try{
 await c.query('BEGIN');await c.query('INSERT INTO gold_ledger(intent_id,character_id,delta) VALUES($1,$2,-10)',[id,character]);await c.query("UPDATE economy_intents SET state='complete' WHERE id=$1",[id]);await c.query('COMMIT');
 }finally{c.release();}
 expect((await pool.query('SELECT delta FROM gold_ledger WHERE intent_id=$1',[id])).rows[0].delta).toBe('-10');
});
test('wrong amount, wrong settlement kind and unconfirmed settlement cannot enter the ledger',async()=>{
 for(const [kind,state,delta]of [['withdraw','complete',-9],['item-purchase','complete',-10],['deposit','signed',10]] as const){
  const id=randomUUID();await intent(id,kind,state);const c=await pool.connect();try{
   await c.query('BEGIN');await c.query('INSERT INTO gold_ledger(intent_id,character_id,delta) VALUES($1,$2,$3)',[id,character,delta]);await expect(c.query('COMMIT')).rejects.toThrow('completed token settlement');await c.query('ROLLBACK');
  }finally{c.release();}
  expect((await pool.query('SELECT count(*)::int n FROM gold_ledger WHERE intent_id=$1',[id])).rows[0].n).toBe(0);
 }
});
