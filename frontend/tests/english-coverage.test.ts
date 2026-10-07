import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {translateSource} from '../lib/i18n';
import {localizeConsoleEntry} from '../lib/game-i18n';
import templates from '../locales/message-templates-en.json';
import world from '../locales/world-en.json';
import signs from '../locales/signs-en.json';
import signGraphics from './fixtures/localized-sign-graphics.json';
import worldSource from './fixtures/world-source-text.json';
import properNamesAndCodes from './fixtures/world-proper-names-and-codes.json';

const root=path.resolve('..');
const slots=(s:string)=>[...new Set([...s.matchAll(/\{(\d+)\}/g)].map(m=>m[1]))].sort();
for(const [source,english]of Object.entries(templates)) {
 assert.deepEqual(slots(source),slots(english),`Placeholder mismatch: ${source}`);
 const sample=source.replace(/\{(\d+)\}/g,(_,i)=>`VALUE_${i}`);
 const output=translateSource(sample,'en');
 for(const i of slots(source))assert.ok(output.includes(`VALUE_${i}`),`Value lost: ${source}`);
 assert.equal(translateSource(sample,'es'),sample);
 assert.equal(localizeConsoleEntry({text:sample,source:'dialog'},'en'),sample);
 assert.equal(localizeConsoleEntry({text:sample,source:'console',senderName:'Player'},'en'),sample);
}
for(const source of Object.keys(world)) {
 assert.notEqual(translateSource(source,'en'),source,source);
 assert.equal(translateSource(source,'es'),source);
}
assert.equal(Object.keys(signs).length,72);
const graphics=JSON.parse(fs.readFileSync(path.join(root,'frontend/public/init/graficos_optimized.json'),'utf8'));
for(const sign of signGraphics){
 assert.ok((signs as Record<string,string>)[sign.graphicId],`Missing sign ${sign.graphicId}`);
 assert.deepEqual(graphics[sign.graphicId],[sign.imageFile,0,0,sign.width,sign.height]);
}
for(const source of worldSource) {
    if(!properNamesAndCodes.includes(source))assert.notEqual(translateSource(source,'en'),source,`Untranslated world data: ${source}`);
}
assert.equal(translateSource('Has fabricado 3 Lingote de Oro.','en'),'You crafted 3 Gold ingot.');
assert.equal(translateSource('Info sobre Tacticas de combate','en'),'About Combat tactics');
assert.equal(translateSource('Te enlistaste en Armada.','en'),'You enlisted in Royal Army.');
assert.equal(translateSource('El nombre debe tener al menos 7 caracteres.','en'),'Name must contain at least 7 characters.');
assert.equal(translateSource('Mago te invitó a su party. Escribe /aceptar para unirte.','en'),'Mago invited you to their party. Type /accept to join.');
assert.equal(translateSource('/party nombredeusuario','en'),'/party playername');
const recipes=JSON.parse(fs.readFileSync(path.join(root,'api/src/jsons/craftingRecipes.json'),'utf8')) as Array<{category:string}>;
for(const {category}of recipes)assert.notEqual(translateSource(category,'en'),category,`Untranslated crafting category: ${category}`);
// Detect newly introduced, untranslated direct console messages, including concatenations.
function encode(n:ts.Node, values:string[]):string {
 if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return n.text;
 if(ts.isParenthesizedExpression(n))return encode(n.expression,values);
 if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.PlusToken)return encode(n.left,values)+encode(n.right,values);
 if(ts.isTemplateExpression(n))return n.head.text+n.templateSpans.map(s=>encode(s.expression,values)+s.literal.text).join('');
 values.push(n.getText());return `{${values.length-1}}`;
}
const passthrough=new Set(['{0}','[INFO] {0}','{0} - {1}']);
function branches(n:ts.Node):ts.Node[]{
 if(ts.isParenthesizedExpression(n))return branches(n.expression);
 return ts.isConditionalExpression(n)?[...branches(n.whenTrue),...branches(n.whenFalse)]:[n];
}
let checked=0;const missing:string[]=[];
function walk(dir:string){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,entry.name);if(entry.isDirectory()){walk(file);continue;}
 if(!file.endsWith('.ts')||file.endsWith('.test.ts'))continue;
 const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 function visit(n:ts.Node){
  if(ts.isCallExpression(n)&&/(?:handleProtocol\.console(?:ToAll)?|sendMatchConsole|addConsoleMessage)$/.test(n.expression.getText(ast))){
   const arg=n.arguments[n.expression.getText(ast).endsWith('sendMatchConsole')?1:0];
   if(arg)for(const branch of branches(arg)){const source=encode(branch,[]);if(!passthrough.has(source)&&!/^\[[A-Z ]+\]$/.test(source)){
    checked++;const sample=source.replace(/\{(\d+)\}/g,(_,i)=>`VALUE_${i}`);
    if(translateSource(sample,'en')===sample)missing.push(`${path.relative(root,file)}: ${source}`);
   }}
  }ts.forEachChild(n,visit);
 }visit(ast);
}}
walk(path.join(root,'server/src'));walk(path.join(root,'frontend/components/game'));
assert.deepEqual(missing,[]);
console.log(`PASS: ${checked} console call sites, ${Object.keys(templates).length} message patterns, ${Object.keys(world).length} world translations, ${Object.keys(signs).length} signs; placeholders, Spanish and player chat preserved.`);
