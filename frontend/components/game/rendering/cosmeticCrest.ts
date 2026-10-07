import {Container, Graphics, Text} from 'pixi.js';
import type {CosmeticKind} from '../../../lib/cosmetic-display';

const crests = new WeakMap<Container, {graphic: Graphics; kind: CosmeticKind}>();

/** A compact pixel crest follows the nameplate, never covering equipment or tiles. */
export function syncCosmeticCrest(container: Container, name: Text | undefined, kind: CosmeticKind | null) {
    let entry = crests.get(container);
    if (!kind || !name || name.destroyed || !name.visible) {
        if (entry && !entry.graphic.destroyed) entry.graphic.visible = false;
        return;
    }
    if (!entry || entry.graphic.destroyed || entry.kind !== kind) {
        if (entry && !entry.graphic.destroyed) entry.graphic.destroy();
        const graphic = new Graphics();
        graphic.eventMode = 'none';
        graphic.zIndex = 0.61;
        const edge = kind === 'first-hunt' ? 0xd8b4fe : 0xfcd879;
        const fill = kind === 'first-hunt' ? 0x382447 : 0x342819;
        // Integer coordinates keep the silhouette crisp at the game's native scale.
        graphic.poly([0,0,12,0,12,8,10,11,6,14,2,11,0,8]).fill(0x100e17);
        graphic.poly([1,1,11,1,11,8,9,10,6,12,3,10,1,8]).fill(edge);
        graphic.poly([2,2,10,2,10,8,6,11,2,8]).fill(fill);
        if (kind === 'first-hunt') {
            graphic.poly([6,3,9,7,8,9,4,9,3,7,5,5,5,7,6,6]).fill(0xc084fc);
            graphic.rect(5,7,2,2).fill(0xfff1bc);
        } else {
            graphic.poly([6,3,7,5,9,6,7,7,6,10,5,7,3,6,5,5]).fill(0xffedb0);
        }
        container.addChild(graphic);
        entry = {graphic,kind};
        crests.set(container,entry);
    }
    if (entry.graphic.parent !== container) container.addChild(entry.graphic);
    entry.graphic.position.set(Math.round(name.x - name.width / 2 - 16), Math.round(name.y));
    entry.graphic.visible = true;
}
