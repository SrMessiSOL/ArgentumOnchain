import {translateSource} from './i18n';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
export const socialImageSize={width:1200,height:630};
export const socialImageContentType='image/png';
let backdrop:Promise<string>|null=null;
export function getSocialBackdropSrc(){return backdrop??=readFile(path.join(process.cwd(),'public','brand','realm-hero-v1.png')).then(b=>'data:image/png;base64,'+b.toString('base64'));}
type SocialCardProps={eyebrow:string;title:string;description:string;bullets:string[];accent:string;backdropSrc:string};
export function SocialCard({eyebrow,title,description,backdropSrc}:SocialCardProps){return <div style={{width:'100%',height:'100%',display:'flex',position:'relative',background:'#090d0d',color:'#ede6d7',overflow:'hidden'}}><img src={backdropSrc} width={1200} height={630} style={{position:'absolute',left:0,top:0,objectFit:'cover'}}/><div style={{position:'absolute',left:0,top:0,width:'100%',height:'100%',background:'linear-gradient(90deg,rgba(7,12,13,0.97),rgba(7,12,13,0.6) 55%,rgba(7,12,13,0.12))'}}/><div style={{display:'flex',flexDirection:'column',justifyContent:'center',padding:'64px',width:'76%',position:'relative'}}><div style={{display:'flex',color:'#d8b77a',fontSize:17,letterSpacing:6,marginBottom:26}}>{translateSource(eyebrow,'en')}</div><div style={{display:'flex',fontSize:78,fontWeight:600,lineHeight:1.08,letterSpacing:-2,marginBottom:27}}>{translateSource(title,'en')}</div><div style={{display:'flex',fontSize:23,lineHeight:1.6,color:'#c0c6bc',maxWidth:590}}>{translateSource(description,'en')}</div><div style={{display:'flex',fontSize:14,color:'#d8b77a',marginTop:40,letterSpacing:2}}>ARGENTUM ONCHAIN · BROWSER MMORPG · DEVNET</div></div></div>;}
