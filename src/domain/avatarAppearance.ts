export const avatarSizes={small:48,medium:96,large:160} as const;
export type AvatarSize=keyof typeof avatarSizes;
export type AvatarShape='square'|'circle'|'rectangle';
export interface AvatarFrame {zoom:number;x:number;y:number}
export interface AvatarAppearance {size:AvatarSize;shape:AvatarShape;frames?:Partial<Record<AvatarSize,AvatarFrame>>}
const defaultFrames:Record<AvatarSize,AvatarFrame>={small:{zoom:1.9,x:0,y:.4},medium:{zoom:1.35,x:0,y:.15},large:{zoom:1,x:0,y:0}};
export function cleanAvatarAppearance(value?:Partial<AvatarAppearance>|null):AvatarAppearance {
 const result:AvatarAppearance={size:value?.size&&Object.hasOwn(avatarSizes,value.size)?value.size:'medium',shape:['square','circle','rectangle'].includes(value?.shape||'')?value!.shape!:'circle'};
 for(const size of Object.keys(avatarSizes) as AvatarSize[]){const f=value?.frames?.[size];if(f&&[f.zoom,f.x,f.y].every(v=>typeof v==='number'&&Number.isFinite(v))){result.frames||={};result.frames[size]={zoom:Math.max(1,Math.min(4,f.zoom)),x:Math.max(-1,Math.min(1,f.x)),y:Math.max(-1,Math.min(1,f.y))};}}
 return result;
}
export function avatarFrame(value?:Partial<AvatarAppearance>):AvatarFrame {const clean=cleanAvatarAppearance(value);return {...(clean.frames?.[clean.size]||defaultFrames[clean.size])};}
export function avatarImageStyle(value?:Partial<AvatarAppearance>,framed=true){const f=framed?avatarFrame(value):{zoom:1,x:0,y:0};return {objectFit:'contain' as const,transform:`translate(${f.x*100}%, ${f.y*100}%) scale(${f.zoom})`};}
export function avatarAppearanceStyle(value?:Partial<AvatarAppearance>){
 const clean=cleanAvatarAppearance(value),width=avatarSizes[clean.size],height=clean.shape==='rectangle'?Math.round(width*1.4):width;
 return {width:width+'px',height:height+'px',flex:'0 0 auto',borderRadius:clean.shape==='circle'?'50%':'0'};
}
