import type {Request,Response,NextFunction} from 'express';
import {AuthBudget} from './authBudget';
import {getPublicSessionByToken} from './repositories/auth';
const policies=new Map<string,{group:string;account:number;global:number}>([
 ['POST /auth/economy/prepare',{group:'prepare',account:12,global:240}],
 ['POST /auth/game-assets/prepare',{group:'prepare',account:12,global:240}],
 ['POST /auth/economy/submit',{group:'submit',account:30,global:600}],
 ['POST /auth/game-assets/submit',{group:'submit',account:30,global:600}],
 ['POST /auth/economy/reconcile',{group:'reconcile',account:60,global:1200}],
 ['POST /auth/game-assets/reconcile',{group:'reconcile',account:60,global:1200}],
 ['GET /auth/game-assets/wallet',{group:'wallet',account:6,global:180}],
 ['POST /auth/cosmetics/claim',{group:'claim',account:4,global:120}],
]);
/** Process-local cost budgets: rotating sessions cannot evade an account's allowance. */
export function createChainRequestBudget(resolve:(token:string)=>Promise<string|null>=async token=>(await getPublicSessionByToken(token))?.account._id??null,clock:()=>number=Date.now){
 const accountBudget=new AuthBudget(20000,clock),globalBudget=new AuthBudget(10,clock);
 return async(request:Request,response:Response,next:NextFunction)=>{
  const policy=policies.get(request.method+' '+request.path);if(!policy){next();return;}
  const token=request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if(!token){response.status(401).json({error:'economy.signIn'});return;}
  try {
   const account=await resolve(token);if(!account){response.status(401).json({error:'economy.signIn'});return;}
   if(!accountBudget.allow(policy.group+':'+account,policy.account,60000)||!globalBudget.allow(policy.group,policy.global,60000)){
    response.setHeader('Retry-After','60');response.status(429).json({error:'economy.rpcBusy'});return;
   }
   next();
  }catch{response.status(503).json({error:'economy.unavailable'});}
 };
}
