const assert=require('node:assert/strict');
const {settlementPause}=require('../dist/settlementPause');
const previous={pause:process.env.AOWEB_SETTLEMENT_PAUSED,private:process.env.AOWEB_PRIVATE_WALLET_TEST};
try{
 process.env.AOWEB_SETTLEMENT_PAUSED='0';process.env.AOWEB_PRIVATE_WALLET_TEST='1';
 for(const header of ['x-aochain-client-ip','x-forwarded-for'])for(const path of ['/auth/game-assets/prepare','/auth/game-assets/submit','/auth/cosmetics/claim','/auth/economy/submit']){
  let next=false,status=0;settlementPause({method:'POST',path,headers:{[header]:'203.0.113.1'}},{status:n=>{status=n;return {json:()=>{}}}},()=>{next=true;});assert.equal(status,503);assert.equal(next,false);
 }
 let next=false;settlementPause({method:'POST',path:'/auth/game-assets/prepare',headers:{}},{},()=>{next=true});assert(next);
 next=false;settlementPause({method:'POST',path:'/auth/game-assets/reconcile',headers:{'x-aochain-client-ip':'203.0.113.1'}},{},()=>{next=true});assert(next);
 process.env.AOWEB_SETTLEMENT_PAUSED='1';let status=0;settlementPause({method:'POST',path:'/auth/game-assets/prepare',headers:{}},{status:n=>{status=n;return {json:()=>{}}}},()=>{throw Error('Paused request escaped')});assert.equal(status,503);
 console.log('Private wallet settlement guards passed: local rehearsal, forwarded clients denied, recovery retained.');
}finally{for(const [name,value]of [['AOWEB_SETTLEMENT_PAUSED',previous.pause],['AOWEB_PRIVATE_WALLET_TEST',previous.private]]){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
