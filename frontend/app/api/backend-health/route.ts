import {fetchApi} from '../auth/shared';
export const dynamic='force-dynamic';
export async function GET():Promise<Response>{
 try{
  const response=await fetchApi('/proxy-health',{cache:'no-store'});
  const body=await response.json();
  if(!response.ok||body.proxyVerified!==true)return Response.json({proxyVerified:false},{status:503,headers:{'Cache-Control':'no-store'}});
  return Response.json({proxyVerified:true,gatewayClosed:body.gatewayClosed===true},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({proxyVerified:false},{status:503,headers:{'Cache-Control':'no-store'}});}
}
