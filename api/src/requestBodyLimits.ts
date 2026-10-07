import express from 'express';
import type {Express,ErrorRequestHandler} from 'express';
export function installBodyLimits(app:Express):void {
 // Wallet proofs and transactions are small; game saves retain their existing larger limit.
 app.use(['/auth/economy','/auth/game-assets','/auth/wallet','/auth/cosmetics'],express.json({limit:'8kb'}));
 app.use(express.json({limit:'2mb'}));
 const rejectBody:ErrorRequestHandler=(error,_req,res,_next)=>{
  const status=error?.type==='entity.too.large'?413:400;
  res.status(status).json({error:status===413?'Request body too large':'Invalid request body'});
 };
 app.use(rejectBody);
}
