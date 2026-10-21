export const avatarSizes={small:26,medium:34,large:48} as const;
export type AvatarSize=keyof typeof avatarSizes;
export type AvatarShape='square'|'circle'|'rectangle';
export interface AvatarAppearance {size:AvatarSize;shape:AvatarShape}
export function cleanAvatarAppearance(value?:Partial<AvatarAppearance>|null):AvatarAppearance {
 return {size:value?.size&&Object.hasOwn(avatarSizes,value.size)?value.size:'medium',shape:['square','circle','rectangle'].includes(value?.shape||'')?value!.shape!:'circle'};
}
export function avatarAppearanceStyle(value?:Partial<AvatarAppearance>){
 const clean=cleanAvatarAppearance(value),height=avatarSizes[clean.size],width=clean.shape==='rectangle'?Math.round(height*1.4):height;
 return {width:width+'px',height:height+'px',flexBasis:width+'px',borderRadius:clean.shape==='circle'?'50%':'0'};
}
