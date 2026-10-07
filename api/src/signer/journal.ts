import fs from 'node:fs';
import path from 'node:path';
export type SignedReceipt={id:string;message:string;bytes:string;signature:string};
/** A retry returns the same durable receipt; never overwrite a conflicting record. */
export function recordSignedReceipt(directory:string,receipt:SignedReceipt){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receipt.id))throw Error('signer.denied');
 const file=path.join(directory,receipt.id+'.json');
 if(fs.existsSync(file)){
  const previous=JSON.parse(fs.readFileSync(file,'utf8')) as SignedReceipt;
  if(previous.message!==receipt.message||previous.bytes!==receipt.bytes||previous.signature!==receipt.signature)throw Error('signer.receiptConflict');
  return previous;
 }
 // Exclusive creation + fsync. A crash leaving a partial record fails closed.
 const fd=fs.openSync(file,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(receipt));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 return receipt;
}
