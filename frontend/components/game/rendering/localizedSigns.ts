import {Container,Graphics,Text, type Sprite, type AnimatedSprite} from 'pixi.js';
import {getLocalizedSignLabel} from '@/lib/sign-labels';
import {getSignFace} from '@/lib/sign-layout';


/** Language-aware UI lettering over legacy sign faces. Original textures stay intact. */
export function addLocalizedSign(sprite:Sprite|AnimatedSprite,graphicId:number,width:number,height:number,mapNumber:number) {
    const label=getLocalizedSignLabel(graphicId,mapNumber);
    if(!label||typeof document==='undefined')return;
    const layer=new Container();
    const large=width>80;
    const plaque=width>=300;
    const {x,y,w,h}=getSignFace(graphicId,width,height);
    const wood=new Graphics().rect(x,y,w,h).fill(0x392310);
    wood.rect(x+1,y+1,w-2,1).fill(0x80552c);
    wood.rect(x+2,y+h-2,w-4,1).fill(0x1f140b);
    const lettering=new Text({text:label,style:{fontFamily:'Georgia',fontSize:plaque?12:large?11:9,fontWeight:'bold',fill:0xf3dfb5,align:'center',wordWrap:true,wordWrapWidth:w-6}});
    // Long notices and memorials must fit the face without hiding the wooden posts.
    lettering.scale.set(Math.min(1,(w-6)/Math.max(1,lettering.width),(h-4)/Math.max(1,lettering.height)));
    lettering.anchor.set(0.5);lettering.x=x+w/2;lettering.y=y+h/2;
    layer.addChild(wood,lettering);sprite.addChild(layer);
    const update=()=>{layer.visible=document.documentElement.lang!=='es';};update();
    window.addEventListener('aoweb:locale',update);
    sprite.once('destroyed',()=>window.removeEventListener('aoweb:locale',update));
}
