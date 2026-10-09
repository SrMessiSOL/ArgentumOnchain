import {getApiBaseUrlCandidates} from '@/lib/api-base-url';
export async function GET(request:Request){
 const id=new URL(request.url).searchParams.get('id');if(!id||!/^[a-f0-9-]{36}$/i.test(id))return Response.json({error:'Not found'},{status:404});
 for(const base of getApiBaseUrlCandidates())try{const r=await fetch(`${base}/game-assets/metadata?id=${encodeURIComponent(id)}`,{cache:'no-store',headers:{'ngrok-skip-browser-warning':'1'},signal:AbortSignal.timeout(10000)});return Response.json(await r.json(),{status:r.status,headers:{'Cache-Control':'no-store'}});}catch{}
 return Response.json({error:'Metadata unavailable'},{status:503});
}
