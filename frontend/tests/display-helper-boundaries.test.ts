import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import vm from 'node:vm';
import {translateSource} from '../lib/i18n';
import {getBrowserHardwareAccelerationHelp} from '../lib/hardware-acceleration';
import {localizeItemDetails} from '../lib/game-i18n';
import {buildPageMetadata} from '../lib/seo';

const failures:string[]=[];
// Metadata does not render through JSX localization components.
const rankingMetadata=buildPageMetadata({title:'Ranking de jugadores',description:'Consulta el ranking publico de AOWeb y segui a los mejores jugadores por nivel o kills.',path:'/ranking',keywords:['ranking AOWeb','top kills','top nivel']});
assert.ok((rankingMetadata.keywords as string[]).includes('highest level'));
assert.ok(!(rankingMetadata.keywords as string[]).includes('top nivel'));
assert.notEqual(rankingMetadata.title,'Ranking de jugadores');
assert.equal(rankingMetadata.openGraph?.locale,'en_US');
let checked=0;
function walk(dir:string){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);
  if(entry.isDirectory()){walk(file);continue;}
  if(!file.endsWith('.tsx'))continue;
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),99,true);
  for(const statement of source.statements){
   if(ts.isVariableStatement(statement)&&statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)){
    for(const declaration of statement.declarationList.declarations){
     if(declaration.name.getText(source)==='alt'&&declaration.initializer&&ts.isStringLiteral(declaration.initializer)){
      const alt=declaration.initializer.text;
      assert.equal(translateSource(alt,'en'),alt,`Untranslated exported image alt: ${file}`);
     }
    }
   }
  }
  const helpers=new Set<string>();
  function definitions(node:ts.Node){
   if(ts.isFunctionDeclaration(node)&&node.name){
    function returns(child:ts.Node){
     if(ts.isReturnStatement(child)&&child.expression&&ts.isStringLiteral(child.expression)&&translateSource(child.expression.text,'en')!==child.expression.text)helpers.add(node.name!.text);
     ts.forEachChild(child,returns);
    }returns(node);
   }ts.forEachChild(node,definitions);
  }definitions(source);
  function uses(node:ts.Node){
   if(ts.isCallExpression(node)&&helpers.has(node.expression.getText(source))){
    let ancestor:ts.Node|undefined=node.parent,jsx=false,localized=false;
    while(ancestor&&!ts.isSourceFile(ancestor)){
     if(ts.isJsxExpression(ancestor))jsx=true;
     if(ts.isCallExpression(ancestor)&&/localize|translate|^text$/.test(ancestor.expression.getText(source)))localized=true;
     if(ts.isJsxSelfClosingElement(ancestor)&&/Localized/.test(ancestor.tagName.getText(source)))localized=true;
     if(ts.isJsxElement(ancestor)&&/Localized/.test(ancestor.openingElement.tagName.getText(source)))localized=true;
     ancestor=ancestor.parent;
    }
    if(jsx){checked++;if(!localized)failures.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line+1}: ${node.expression.getText(source)}`);}
   }ts.forEachChild(node,uses);
  }uses(source);
 }
}
walk('components');walk('app');
assert.deepEqual(failures,[],`Unlocalized helper output: ${failures.join('\n')}`);

// Exercise real marketplace helpers at expired and normal duration boundaries.
const market=ts.createSourceFile('MarketModal.tsx',fs.readFileSync('components/MarketModal.tsx','utf8'),99,true);
const names=['formatListingStatus','formatRemainingTime'];
const definitions=market.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name&&names.includes(n.name.text)).map(n=>n.getText(market));
assert.equal(definitions.length,2);
const code=ts.transpileModule(definitions.join('\n')+`\n({${names.join(',')}})`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
class FixedDate extends Date {static now(){return Date.parse('2026-10-04T12:00:00Z')}}
const helpers=vm.runInNewContext(code,{Date:FixedDate});
for(const [status,es,en]of [['active','Activa','Active'],['sold','Vendida','Sold'],['expired','Expirada','Expired'],['cancelled','Cancelada','Canceled']]){
 const label=helpers.formatListingStatus(status);
 assert.equal(translateSource(label,'en'),en);
 assert.equal(translateSource(label,'es'),es);
}
for(const input of ['invalid','2026-10-04T11:59:00Z','2026-10-04T12:00:00Z'])assert.equal(translateSource(helpers.formatRemainingTime(input),'en'),'Expired');
assert.equal(helpers.formatRemainingTime('2026-10-04T13:30:00Z'),'1h 30m');
assert.equal(translateSource('oro','en'),'gold');
assert.equal(translateSource('Manzana Roja','en'),'Red apple');
console.log(`PASS: ${checked} helper display boundaries and bilingual marketplace status/expiry output.`);

for(const agent of ['Firefox/1','Edg/1','OPR/1','Chrome/1','Unknown desktop']){
 const help=getBrowserHardwareAccelerationHelp(agent)!;
 for(const step of help.steps){assert.notEqual(translateSource(step,'en'),step);assert.equal(translateSource(step,'es'),step);}
}
for(const [es,en]of [
 ['Mapa 1 (48, 64)','Map 1 (48, 64)'],
 ['Necesitas nivel 25 para postularte a este clan.','You need level 25 to apply to this clan.'],
 ['Tu faccion no puede ingresar a un clan ciudadano.','Your faction cannot join a citizen clan.'],
 ['Tu faccion no puede ingresar a un clan criminal.','Your faction cannot join a criminal clan.'],
 ['Mago','Mage'],['Sí','Yes'],['tipo de NPC','NPC type'],['spawn de combate','combat spawn']
]){assert.equal(translateSource(es,'en'),en);assert.equal(translateSource(es,'es'),es);}
const stats='Daño: 2/5 | Apuñala | Bonus daño mágico: 10%';
assert.equal(localizeItemDetails(stats,'en'),'Damage: 2/5 | Can backstab | Magic damage bonus: 10%');
assert.equal(localizeItemDetails(stats,'es'),stats);
const inventory=fs.readFileSync('components/InventoryFloatingPanel.tsx','utf8');
assert.match(inventory,/<LocalizedText source=\{step\}/);
assert.match(inventory,/<LocalizedText source=\{issue\}/);
assert.match(inventory,/localizeText\(`Mapa \$\{member.map\}/);
assert.doesNotMatch(fs.readFileSync('app/play/page.tsx','utf8'),/\{activeChatTabLabel\.toLowerCase\(\)\}/);
console.log('PASS: browser help, party, clan eligibility, challenge class, crafting stats, and compact-chat regressions.');
assert.doesNotMatch(fs.readFileSync('app/users-online-stats/page.tsx','utf8'), />\s*\{latestLabel\}\s*</);
