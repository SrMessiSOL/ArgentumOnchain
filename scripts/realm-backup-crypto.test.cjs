const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {encrypt,decrypt}=require('./realm-backup-crypto.cjs');
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aochain-encryption-fixture-'));try{
 const source=path.join(dir,'source'),key=path.join(dir,'key'),encrypted=path.join(dir,'encrypted'),restored=path.join(dir,'restored');
 fs.writeFileSync(key,crypto.randomBytes(32));fs.writeFileSync(source,crypto.randomBytes(1024*1024));
 await encrypt(source,encrypted,key);await decrypt(encrypted,restored,key);assert.equal(fs.readFileSync(source).equals(fs.readFileSync(restored)),true);
 await assert.rejects(()=>encrypt(source,encrypted,key));await assert.rejects(()=>decrypt(encrypted,restored,key));
 const wrong=path.join(dir,'wrong');fs.writeFileSync(wrong,crypto.randomBytes(32));await assert.rejects(()=>decrypt(encrypted,path.join(dir,'wrong-output'),wrong));assert.equal(fs.existsSync(path.join(dir,'wrong-output')),false);
 const data=fs.readFileSync(encrypted);data[100]^=1;fs.writeFileSync(path.join(dir,'tampered'),data);await assert.rejects(()=>decrypt(path.join(dir,'tampered'),path.join(dir,'tampered-output'),key));assert.equal(fs.existsSync(path.join(dir,'tampered-output')),false);assert.equal(fs.existsSync(path.join(dir,'tampered-output.partial')),false);
 console.log('Backup encryption round trip, wrong key, tampering and overwrite refusal passed.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
