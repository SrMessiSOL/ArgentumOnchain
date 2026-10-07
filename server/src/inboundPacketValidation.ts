import {TextDecoder} from 'node:util';
import type {ServerPacketID} from './package';
const decode=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});
/** Wire shapes mirror frontend/lib/aowProtocol.ts, including legacy optional fields. */
export function createInboundPacketValidator(ids:ServerPacketID){
 const sizes=new Map<number,readonly number[]>([
  [ids.changeHeading,[2]],[ids.click,[3,4]],[ids.useItemClick,[5]],[ids.equiparItem,[5]],
  [ids.position,[6]],[ids.ping,[1,5]],[ids.attackMele,[1]],[ids.attackRange,[3]],[ids.attackSpell,[4,5]],
  [ids.tirarItem,[7]],[ids.agarrarItem,[1]],[ids.buyItem,[4]],[ids.sellItem,[4]],[ids.resyncPosition,[1]],
  [ids.changeSeguro,[1]],[ids.changeClanSeguro,[1]],[ids.reorderSpell,[3]],[ids.reorderInventoryItem,[3]],
  [ids.reorderBankItem,[3]],[ids.changeBankTab,[2]],[ids.depositBankGold,[5]],[ids.withdrawBankGold,[5]],
  [ids.closeTrade,[1]],[ids.toggleHiddenSkill,[1]],[ids.useItemU,[5]],[ids.craftItem,[8]],
 ]);
 const strings=new Map<number,{tail:number;max:number}>([
  [ids.connectCharacter,{tail:2,max:512}],[ids.dialog,{tail:0,max:4096}],
  [ids.marketAction,{tail:0,max:8192}],[ids.retosAction,{tail:0,max:8192}],
 ]);
 return (raw:unknown):boolean=>{
  if(!Buffer.isBuffer(raw)&&!(raw instanceof ArrayBuffer))return false;
  const bytes=Buffer.isBuffer(raw)?raw:Buffer.from(raw);if(bytes.length===0)return false;
  const fixed=sizes.get(bytes[0]);if(fixed)return fixed.includes(bytes.length);
  const text=strings.get(bytes[0]);if(!text||bytes.length<3+text.tail)return false;
  const count=bytes.readUInt16LE(1);if(count>text.max)return false;
  try{return Array.from(decode.decode(bytes.subarray(3,bytes.length-text.tail))).length===count;}catch{return false;}
 };
}
