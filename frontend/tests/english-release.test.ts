import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {translateSource} from '../lib/i18n';
import catalog from '../locales/catalog.json';
import legacy from '../locales/legacy-en.json';
import world from '../locales/world-en.json';
import extra from '../locales/extra-en.json';
import ui from '../locales/ui-en.json';
import proper from './fixtures/world-proper-names-and-codes.json';
import exceptions from './fixtures/english-data-exceptions.json';

const root=path.resolve('..');
const allowed=new Set([...proper,...Object.keys(exceptions)]);
let dataChecked=0;
function checkData(value:unknown,ref:string):void {
 if(typeof value==='string' && /[a-záéíóúñ]/i.test(value)) {
  dataChecked++;
  const colorCode=/^#[0-9a-f]{6}$/i.test(value);
  assert.ok(colorCode||allowed.has(value)||translateSource(value,'en')!==value,`Unclassified data: ${ref}: ${value}`);
 } else if(value && typeof value==='object')for(const [key,child]of Object.entries(value))checkData(child,`${ref}.${key}`);
}
for(const file of ['api/src/jsons/spells.json','api/src/jsons/craftingRecipes.json','api/src/jsons/smeltingRecipes.json','frontend/data/changelog.json','frontend/data/roadmap.json','frontend/public/init/world-map.json','frontend/public/init/world-map-grid-general.json','frontend/public/init/objs.json','frontend/public/init/npcs_optimized.json','frontend/public/init/spells.json']) {
 checkData(JSON.parse(fs.readFileSync(path.join(root,file),'utf8')),file);
}
for(const dir of fs.readdirSync(path.join(root,'server/mapas_source'))) {
 const file=path.join(root,'server/mapas_source',dir,'meta.json');
 if(fs.existsSync(file))checkData(JSON.parse(fs.readFileSync(file,'utf8')).name,`${dir}.name`);
}

// Expand literal conditional branches inside messages, not just their outer template.
function samples(n:ts.Node):string[] {
 if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return[n.text];
 if(ts.isParenthesizedExpression(n))return samples(n.expression);
 if(ts.isConditionalExpression(n))return [...samples(n.whenTrue),...samples(n.whenFalse)];
 if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.PlusToken)return samples(n.left).flatMap(a=>samples(n.right).map(b=>a+b));
 if(ts.isTemplateExpression(n)){
  let result=[n.head.text];
  for(const span of n.templateSpans)result=result.flatMap(a=>samples(span.expression).map(b=>a+b+span.literal.text));
  return result;
 }
 return ['VALUE'];
}
const sourceTexts=new Set([...Object.values(catalog).map(v=>v.es),...Object.keys({...legacy,...world,...extra,...ui})]);
const passthrough=new Set(['VALUE','[INFO] VALUE','VALUE - VALUE']);
let combinations=0,displayLiterals=0;
const failures:string[]=[];
function inspect(dir:string){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,entry.name);if(entry.isDirectory()){inspect(file);continue;}
 if(!/\.tsx?$/.test(file)||file.endsWith('.test.ts'))continue;
 const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 const ref=(n:ts.Node)=>`${path.relative(root,file)}:${ast.getLineAndCharacterOfPosition(n.getStart()).line+1}`;
 function visit(n:ts.Node){
  if(ts.isCallExpression(n)&&/(?:handleProtocol\.console(?:ToAll)?|sendMatchConsole|addConsoleMessage)$/.test(n.expression.getText(ast))){
   const arg=n.arguments[n.expression.getText(ast).endsWith('sendMatchConsole')?1:0];
   if(arg)for(const sample of samples(arg)){
    if(passthrough.has(sample))continue;
    combinations++;
    const output=translateSource(sample,'en');
    if(output===sample||/\b(?:fijo|error desconocido|guardar\|fijo|mover\|movil)\b/.test(output))failures.push(`${ref(n)}: ${output}`);
   }
  }
  // Check direct JSX text and literal fallback expressions. Shared label components
  // and data-driven labels have separate localization boundaries.
  if(ts.isJsxText(n))checkDisplay(n,n.text);
  if(ts.isJsxExpression(n)&&!ts.isJsxAttribute(n.parent)&&n.expression){
   // Player-authored names and announcements are intentionally not translated.
   // All other direct data-name/detail fields must pass through a display adapter.
   if(ts.isPropertyAccessExpression(n.expression)&&/^(name|itemName|npcName|mapName|className|stats|desc|description|details|label|title|message|text)$/.test(n.expression.name.text)){
    const expression=n.expression.getText(ast);
    const playerText=new Set(['session.account.name','deadCharacterContextMenu.character.name','member.name','request.name','character.name','participant.name','activeRoom.name','activeRoom.owner.name','room.name','room.owner.name','deleteCandidate.name','globalCanvasNotice.text']);
    const packetRankingName=path.basename(file)==='OverviewModal.tsx'&&expression==='entry.name';
    const characterChoiceName=path.basename(file)==='CharacterChoices.tsx'&&expression==='c.name';
    const ownCharacterListingName=path.basename(file)==='MarketExchange.tsx'&&expression==='l.name';
    let walletCharacterName=false;
    if(path.basename(file)==='GameAssets.tsx'&&expression==='a.name'){
     for(let parent:ts.Node|undefined=n.parent;parent;parent=parent.parent){
      if(ts.isJsxExpression(parent)&&/filter\(a\s*=>\s*a\.kind\s*===\s*['"]character['"]/.test(parent.getText(ast))){walletCharacterName=true;break;}
     }
    }
    if(!playerText.has(expression)&&!packetRankingName&&!characterChoiceName&&!ownCharacterListingName&&!walletCharacterName)failures.push(`${ref(n)}: untranslated data display: ${expression}`);
   }
   function checkExpression(v:ts.Node):void {
    if(ts.isStringLiteral(v)||ts.isNoSubstitutionTemplateLiteral(v))checkDisplay(v,v.text);
    else if(ts.isParenthesizedExpression(v))checkExpression(v.expression);
    else if(ts.isConditionalExpression(v)){
     // English release validation must not reject the explicitly Spanish-only branch.
     const condition=v.condition.getText(ast).replace(/\s+/g,'');
     const spanishLocale=/^locale===['"]es['"]$/.test(condition);
     const declaredSpanishAlias=condition==='es'&&/\bes\s*=\s*locale\s*===\s*['"]es['"]/.test(ast.text);
     if(!spanishLocale&&!declaredSpanishAlias)checkExpression(v.whenTrue);
     checkExpression(v.whenFalse);
    }
    else if(ts.isBinaryExpression(v)&&[ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken].includes(v.operatorToken.kind)){checkExpression(v.left);checkExpression(v.right);}
   }
   checkExpression(n.expression);
  }
  ts.forEachChild(n,visit);
 }
 function checkDisplay(n:ts.Node,text:string){
  const source=text.replace(/\s+/g,' ').trim();
  if(!sourceTexts.has(source)||translateSource(source,'en')===source)return;
  displayLiterals++;
  failures.push(`${ref(n)}: raw JSX text: ${source}`);
 }
 visit(ast);
}}
inspect(path.join(root,'server/src'));
inspect(path.join(root,'frontend/components'));
inspect(path.join(root,'frontend/app'));
assert.deepEqual(failures,[]);
console.log(`PASS: ${dataChecked} current static data strings, ${combinations} expanded console combinations, no known Spanish literal bypasses in direct JSX (${displayLiterals}).`);
