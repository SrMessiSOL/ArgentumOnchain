/** Bounded API reads tolerate one reset; writes require their durable journal. */
export async function apiRequest<T>(url:string,options:RequestInit={},timeoutMs=8000):Promise<T>{
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 const signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal;
 const method=(options.method||'GET').toUpperCase();
 try{
  let response:Response|undefined;
  for(let attempt=0;attempt<2;attempt++){
   try{response=await fetch(url,{...options,redirect:'error',signal});break;}
   catch(error){
    const code=(error as {cause?:{code?:string}})?.cause?.code;
    if(attempt===0&&method==='GET'&&options.body==null&&!signal.aborted&&['ECONNRESET','EPIPE','UND_ERR_SOCKET'].includes(code||''))continue;
    throw error;
   }
  }
  if(!response)throw Error('API response unavailable');
  const result=await response.json();
  if(!response.ok)throw Error(typeof result==='object'&&result&&'error' in result&&typeof result.error==='string'?result.error:`Request failed with status ${response.status}`);
  return result as T;
 }catch(error){
  if(controller.signal.aborted)throw Error(`API request timed out after ${timeoutMs}ms`);
  throw error;
 }finally{clearTimeout(timer);}
}
