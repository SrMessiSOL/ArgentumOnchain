import {test,expect} from 'vitest';
import express from 'express';
import {installBodyLimits} from '../requestBodyLimits';
test('wallet/settlement bodies are bounded before parsing while larger game saves remain supported',async()=>{
 const app=express();installBodyLimits(app);app.post(/.*/,(_req,res)=>res.json({ok:true}));app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.status??500).json({error:'Rejected'}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base='http://127.0.0.1:'+(server.address() as any).port;
 try {
  for(const path of ['/auth/economy/prepare','/auth/game-assets/submit','/auth/wallet/verify','/auth/cosmetics/claim']){
   const tooLarge=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transaction:'a'.repeat(9000)})});expect(tooLarge.status).toBe(413);expect(await tooLarge.json()).toEqual({error:'Request body too large'});
   const normal=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transaction:'a'.repeat(2200)})});expect(normal.status).toBe(200);
  }
  const malformed=await fetch(base+'/auth/wallet/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:'{broken'});expect(malformed.status).toBe(400);expect(await malformed.json()).toEqual({error:'Invalid request body'});
  expect((await fetch(base+'/character_save/fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:'a'.repeat(10000)})})).status).toBe(200);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});
