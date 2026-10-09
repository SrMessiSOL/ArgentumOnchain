import type {Request,Response,NextFunction} from 'express';
const sensitive=new Set(['/auth/economy/prepare','/auth/economy/submit','/auth/economy/list','/auth/economy/item-list','/auth/game-assets/prepare','/auth/game-assets/submit','/auth/cosmetics/claim']);
export function settlementPause(request:Request,response:Response,next:NextFunction):void{
 if(process.env.AOWEB_PRIVATE_WALLET_TEST==='1'&&request.method==='POST'&&sensitive.has(request.path)&&
    (request.headers?.['x-aochain-client-ip']||request.headers?.['x-forwarded-for'])){
  response.status(503).json({error:'Wallet verification is restricted to the local host.'});return;
 }
 if(process.env.AOWEB_SETTLEMENT_PAUSED==='1'&&request.method==='POST'&&sensitive.has(request.path)){
  response.status(503).json({error:'Settlement is temporarily paused. Existing operations can still be checked.'});return;
 }
 next();
}
