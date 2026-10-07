import type {Request,Response,NextFunction} from 'express';
const sensitive=new Set(['/auth/economy/prepare','/auth/economy/submit','/auth/economy/list','/auth/economy/item-list','/auth/game-assets/prepare','/auth/game-assets/submit','/auth/cosmetics/claim']);
export function settlementPause(request:Request,response:Response,next:NextFunction):void{
 if(process.env.AOWEB_SETTLEMENT_PAUSED==='1'&&request.method==='POST'&&sensitive.has(request.path)){
  response.status(503).json({error:'Settlement is temporarily paused. Existing operations can still be checked.'});return;
 }
 next();
}
