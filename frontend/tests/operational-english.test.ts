import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Check authored fragments sent directly to operational logs. Game protocol
// messages are intentionally bilingual at presentation time and are out of scope.
// This is a regression heuristic, not a general language detector.
const spanish = /\b(?:usuario|desconectad[oa]|exploto|cierro|explotando|exportado|mapa|encontrad[oa]|cargando|guardando|iniciando|conectado|invalido|completado|navegando|destino|origen)\b|\b(?:falló|inválido)\b/i;
const violations:string[]=[];
let calls=0;
function walk(dir:string){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);
  if(entry.isDirectory()){walk(file);continue;}
  if(!/\.tsx?$/.test(file)||/\.test\.tsx?$/.test(file))continue;
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  function inspect(node:ts.Node){
   if(ts.isCallExpression(node)&&/^console\.(log|warn|error|info|debug)$/.test(node.expression.getText(source))){
    calls++;
    function fragments(value:ts.Node){
     if(ts.isStringLiteral(value)||ts.isNoSubstitutionTemplateLiteral(value)||ts.isTemplateHead(value)||ts.isTemplateMiddle(value)||ts.isTemplateTail(value)){
      if(spanish.test(value.text))violations.push(`${file}:${source.getLineAndCharacterOfPosition(value.getStart()).line+1}: ${value.text}`);
     }
     // Do not inspect callbacks: their strings are not necessarily log output.
     if(!ts.isArrowFunction(value)&&!ts.isFunctionExpression(value))ts.forEachChild(value,fragments);
    }
    node.arguments.forEach(fragments);
   }
   ts.forEachChild(node,inspect);
  }inspect(source);
 }
}
for(const dir of ['../server/src','../api/src','components','app','lib'])walk(dir);
assert.deepEqual(violations,[],`Spanish operational output:\n${violations.join('\n')}`);
console.log(`PASS: ${calls} operational log calls scanned for Spanish authored fragments.`);
