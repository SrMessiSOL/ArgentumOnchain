import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../hooks/useAuthRedirect.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function check(search,options,authenticated=true){
 const redirects=[],effects=[],module={exports:{}};
 const router={replace:path=>redirects.push(path)};
 const react={useState:value=>[value,()=>{}],useEffect:effect=>effects.push(effect)};
 const next={usePathname:()=>'/login',useRouter:()=>router};
 new Function('module','exports','require','window','fetch',code)(module,module.exports,name=>name==='react'?react:next,{location:{search}},async()=>({ok:authenticated,json:async()=>({account:{name:'Tester'}})}));
 module.exports.useAuthRedirect(options);effects.forEach(effect=>effect());
 await new Promise(resolve=>setImmediate(resolve));return redirects;
}
const options={redirectTo:'/characters',when:'authenticated'};
assert.deepEqual(await check('?redirect=%2Fwallet',options),['/wallet']);
assert.deepEqual(await check('?reauth=1&redirect=%2Fwallet',{...options,allowReauthentication:true}),[]);
assert.deepEqual(await check('?reauth=1&redirect=%2Fwallet',options),['/wallet']);
assert.deepEqual(await check('?reauth=0',{...options,allowReauthentication:true}),['/characters']);
assert.deepEqual(await check('?reauth=1',{redirectTo:'/login',when:'unauthenticated',allowReauthentication:true},false),['/login']);
console.log('PASS: reauthentication shows login for existing sessions, normal redirects and unauthenticated access checks remain enforced.');
