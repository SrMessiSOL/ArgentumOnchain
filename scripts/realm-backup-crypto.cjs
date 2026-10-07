const fs=require('node:fs'),crypto=require('node:crypto'),{pipeline}=require('node:stream/promises');
const MAGIC=Buffer.from('AOBAK001');
async function encrypt(input,output,keyFile){
 const key=fs.readFileSync(keyFile);if(key.length!==32)throw Error('Invalid backup key');
 const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(MAGIC);
 const fd=fs.openSync(output,'wx',0o600);fs.writeSync(fd,Buffer.concat([MAGIC,nonce]));fs.closeSync(fd);
 try{await pipeline(fs.createReadStream(input),cipher,fs.createWriteStream(output,{flags:'a'}));fs.appendFileSync(output,cipher.getAuthTag());const file=fs.openSync(output,'r+');try{fs.fsyncSync(file);}finally{fs.closeSync(file);}}catch(error){fs.unlinkSync(output);throw error;}finally{key.fill(0);}
}
async function decrypt(input,output,keyFile){
 if(fs.existsSync(output)||fs.existsSync(output+'.partial'))throw Error('Restore output already exists');
 const key=fs.readFileSync(keyFile);if(key.length!==32)throw Error('Invalid backup key');
 const size=fs.statSync(input).size;if(size<36)throw Error('Invalid backup');
 const fd=fs.openSync(input,'r'),header=Buffer.alloc(20),tag=Buffer.alloc(16);try{fs.readSync(fd,header,0,20,0);fs.readSync(fd,tag,0,16,size-16);}finally{fs.closeSync(fd);}
 if(!header.subarray(0,8).equals(MAGIC))throw Error('Invalid backup');
 const decipher=crypto.createDecipheriv('aes-256-gcm',key,header.subarray(8));decipher.setAAD(MAGIC);decipher.setAuthTag(tag);
 try{await pipeline(fs.createReadStream(input,{start:20,end:size-17}),decipher,fs.createWriteStream(output+'.partial',{flags:'wx',mode:0o600}));fs.renameSync(output+'.partial',output);}catch(error){if(fs.existsSync(output+'.partial'))fs.unlinkSync(output+'.partial');throw error;}finally{key.fill(0);}
}
module.exports={encrypt,decrypt};
if(require.main===module){
 const [mode,input,output,key]=process.argv.slice(2);
 if(mode==='keygen'){try{fs.writeFileSync(input,crypto.randomBytes(32),{flag:'wx',mode:0o600});}catch{console.error('Backup key creation failed; existing keys are never replaced.');process.exitCode=1;}}
 else if(['encrypt','decrypt'].includes(mode)&&input&&output&&key){(mode==='encrypt'?encrypt:decrypt)(input,output,key).catch(()=>{console.error('Backup encryption/authentication failed; no verified restore output produced.');process.exitCode=1;});}
 else{console.error('Invalid backup command');process.exitCode=1;}
}
