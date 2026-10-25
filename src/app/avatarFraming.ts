export interface AvatarFrameView {scale?:number;x?:number;y?:number}
/** Fixed terminal avatar frames always crop to fill; offsets pan the cover image instead of moving it off-canvas. */
export function avatarFrameStyle(view?:AvatarFrameView){
 const rawScale=typeof view?.scale==='number'&&Number.isFinite(view.scale)?view.scale:1;
 const scale=Math.min(4,Math.max(1,rawScale));
 const axis=(value:number|undefined)=>Math.min(100,Math.max(0,50+(typeof value==='number'&&Number.isFinite(value)?value:0)));
 const position=`${axis(view?.x)}% ${axis(view?.y)}%`;
 return {objectFit:'cover' as const,objectPosition:position,transform:`scale(${scale})`,transformOrigin:position};
}
