import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('../../server/node_modules/typescript');
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const commands=JSON.parse(read('../lib/wiki-commands.json')),exports={};
vm.runInNewContext(ts.transpileModule(read('../../server/src/commandAliases.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
const handlers=new Set([...read('../../server/src/commands.ts').matchAll(/case "(\/[^"]+)":/g)].map(m=>m[1]));
const tokens=commands.map(c=>c.syntax.split(' ')[0]);
assert.equal(new Set(tokens).size,tokens.length);
for(const c of commands){assert.ok(handlers.has(exports.resolveCommandAlias(c.syntax.split(' ')[0])),`No server handler: ${c.syntax}`);assert.ok(c.description.en&&c.description.es);assert.ok(c.group);}
for(const token of exports.playerCommandHelp.join(' ').match(/\/[a-z]+/g))assert.ok(tokens.includes(token),`Missing player help command: ${token}`);
for(const token of ['/givegold','/giveexp','/spawnnpc','/shutdown','/ban','/devrevive'])assert.ok(!tokens.includes(token));
assert.ok(commands.filter(c=>c.group==='skills').every(c=>c.pending),'Inactive skills must not appear as active commands');
assert.ok(commands.some(c=>c.syntax==='/w "<player>" <message>'));
assert.ok(commands.some(c=>c.syntax==='/deleteclan confirm'));
console.log(`PASS: ${commands.length} bilingual player commands resolve to actual server handlers; help coverage, permissions and pending skills verified.`);
