const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {validate}=require('../scripts/start-hosted.cjs');
test('hosted game rejects unsafe configuration without disclosing values',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aochain-hosted-game-'));t.after(()=>fs.rmSync(root,{recursive:true}));
  const good={NODE_ENV:'production',HOST:'127.0.0.1',PORT:'7766',TOKEN_AUTH:'test-credential-'.repeat(4),API_BASE_URL:'http://127.0.0.1:3101',RESET_CONNECTED_CHARACTERS_ON_STARTUP:'false'};
  for(const key of ['VAULT','CHARACTER','WORLD','MARKET'])good['AOWEB_'+key+'_JOURNAL_DIR']=root;
  assert.doesNotThrow(()=>validate(good,root));
  for(const patch of [{HOST:'0.0.0.0'},{NODE_ENV:'development'},{PORT:'7666'},{TOKEN_AUTH:'short'},{DATABASE_URL:'private-db-value'},{GAME_SERVICE_TOKEN:'private-ops-value'},{API_BASE_URL:'https://external.example'},{RESET_CONNECTED_CHARACTERS_ON_STARTUP:'true'},{AOWEB_VAULT_JOURNAL_DIR:'relative'}]) {
    assert.throws(()=>validate({...good,...patch},root),error=>!error.message.includes(good.TOKEN_AUTH)&&!error.message.includes('private-db-value'));
  }
  fs.writeFileSync(path.join(root,'.env'),'TOKEN_AUTH=untrusted');assert.throws(()=>validate(good,root),/checkout/);
});
