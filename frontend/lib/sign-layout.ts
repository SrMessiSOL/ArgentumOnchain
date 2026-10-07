/** Lettering regions inside the actual painted board, excluding transparent padding and posts. */
export function getSignFace(graphicId:number,width:number,height:number) {
    if ([531,545,660].includes(graphicId)) return {x:4,y:7,w:120,h:30};
    if (graphicId===22474) return {x:4,y:6,w:152,h:31};
    if (width>=300) return {x:14,y:14,w:width-28,h:height-28};
    if (width===128&&height===64) return {x:16,y:6,w:96,h:43};
    return {x:2,y:2,w:width-4,h:12};
}

