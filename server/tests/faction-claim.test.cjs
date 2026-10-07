const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const server=path.resolve(__dirname,'..'),ts=require(path.join(server,'node_modules/typescript'));
const ast=ts.createSourceFile('game.ts',fs.readFileSync(path.join(server,'src/game.ts'),'utf8'),ts.ScriptTarget.Latest,true);
let method;function visit(node){if(ts.isBinaryExpression(node)&&node.left.getText(ast)==='this.claimFactionRewards')method=node.right.getText(ast);ts.forEachChild(node,visit);}visit(ast);assert.ok(method);
let release,reject;let gate=new Promise((yes,no)=>{release=yes;reject=no;});let saves=0,patch;
const user={id:'p',_id:'character',faction:'armada',inv:{},factionRewardsArmada:0,factionRankArmada:0};let space=true;
const context={result:{},getCharacterById:()=>user,normalizeFaction:x=>x,getFactionRewardsValue:u=>u.factionRewardsArmada,getFactionConfig:()=>({ranks:[]}),cloneInventoryRecord:record=>structuredClone(record),getRewardsFieldName:()=> 'factionRewardsArmada',getRankFieldName:()=> 'factionRankArmada',getFactionRewardItemIdsUpToRank:(_,rank)=>rank?[1,2]:[],addItemToRecord:(record,id)=>{if(!space)return null;record[id]={idItem:id,cant:1};return [String(id)];},serializeInventory:record=>Object.values(record),persistCharacterPatch:async(_,p)=>{saves++;patch=p;await gate;},replaceInventoryRecord:(record,next)=>Object.assign(record,next),withUserClient:(_,f)=>f({}),handleProtocol:{agregarUserInvItem:()=>{}}};
const code=ts.transpileModule('result.claim='+method,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,context);
(async()=>{
 const game={getMaxEligibleFactionRank:()=>1};const pending=context.result.claim.call(game,'p');await Promise.resolve();
 assert.deepEqual(user.inv,{});assert.equal(user.factionRewardsArmada,0);assert.equal(patch.factionRewardsArmada,1);assert.equal(patch.items.length,2);
 release();assert.equal((await pending).ok,true);assert.equal(user.factionRewardsArmada,1);assert.equal(Object.keys(user.inv).length,2);
 user.inv={};user.factionRewardsArmada=0;user.factionRankArmada=0;space=false;
 assert.equal((await context.result.claim.call(game,'p')).ok,false);assert.deepEqual(user.inv,{});assert.equal(user.factionRewardsArmada,0);assert.equal(saves,1);
 space=true;gate=Promise.reject(Error('Disk unavailable'));gate.catch(()=>{});
 await assert.rejects(context.result.claim.call(game,'p'),/Disk unavailable/);assert.deepEqual(user.inv,{});assert.equal(user.factionRewardsArmada,0);
 console.log('Faction claim tests passed: staged inventory/rank commit together, full inventory and failed save preserve the unclaimed reward.');
})().catch(e=>{console.error(e);process.exitCode=1;});
