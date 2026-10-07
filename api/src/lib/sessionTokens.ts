import {createHash} from 'node:crypto';
// A database read must not yield a reusable bearer credential.
export function credentialHash(value:string):string { return 'sha256:'+createHash('sha256').update(value,'utf8').digest('hex'); }
