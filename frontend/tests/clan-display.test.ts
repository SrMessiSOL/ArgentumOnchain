import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {translateSource, type Locale} from '../lib/i18n';

// Exercise the real component's pure display helpers without creating clans,
// altering accounts, or mounting the full game renderer.
const file='components/InventoryFloatingPanel.tsx';
const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),99,true);
const names=['formatClanAlignment','formatClassName','formatClanRole'];
const definitions=new Map<string,string>();
function visit(node:ts.Node){
 if(ts.isFunctionDeclaration(node)&&node.name&&names.includes(node.name.text))definitions.set(node.name.text,node.getText(source));
 if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='classLabels')definitions.set('classLabels',`const ${node.getText(source)};`);
 ts.forEachChild(node,visit);
}visit(source);
assert.equal(definitions.size,4);
const code=ts.transpileModule([...definitions.values()].join('\n')+`\n({${names.join(',')}})`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
const englishClasses=['Mage','Cleric','Warrior','Assassin','Bard','Druid','Paladin','Hunter'];
const spanishClasses=['Mago','Clerigo','Guerrero','Asesino','Bardo','Druida','Paladin','Cazador'];
for(const locale of ['en','es'] as Locale[]){
 const helpers=vm.runInNewContext(code,{localizeText:(value:string)=>translateSource(value,locale)});
 assert.equal(helpers.formatClanAlignment('citizen'),locale==='en'?'Citizen':'Ciudadano');
 assert.equal(helpers.formatClanAlignment('criminal'),'Criminal');
 for(const [role,en,es]of [['leader','Leader','Lider'],['co_leader','Co-leader','Co-lider'],['member','Member','Miembro']])assert.equal(helpers.formatClanRole(role),locale==='en'?en:es);
 [1,2,3,4,6,7,8,9].forEach((id,index)=>assert.equal(helpers.formatClassName(id),(locale==='en'?englishClasses:spanishClasses)[index]));
 assert.equal(helpers.formatClassName(99),locale==='en'?'Class 99':'Clase 99');
 assert.equal(translateSource('sin muestra',locale),locale==='en'?'no sample':'sin muestra');
}
console.log('PASS: actual clan display helpers in both locales, all eight classes, roles, alignments and unknown class fallback.');
