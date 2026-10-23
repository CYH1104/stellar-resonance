import {characterImageCatalog} from './characterImageCatalog.ts';
export interface CharacterImage {no:string;url:string;scale:number;x:number;y:number}
export function majorCharacter(name:string){return characterImageCatalog.find(c=>c.name===name.replace(/\s/g,''));}
export function imageUrl(value:string){
 const url=value.trim();
 if(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url)&&url.length<=1500000)return url;
 try{const parsed=new URL(url);if(['http:','https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password&&url.length<=4000)return parsed.href;}catch{}
 throw Error('请使用 HTTP/HTTPS 图片地址，或上传 PNG、JPEG、WebP 图片。');
}
export function cleanCharacterImages(value:unknown):Record<string,CharacterImage>{
 if(value===undefined)return {};
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>100)throw Error('角色图片设置格式不正确');
 const result:Record<string,CharacterImage>={};
 for(const [id,item] of Object.entries(value)){
  const v=item as CharacterImage;
  if(['__proto__','constructor','prototype'].includes(id)||!id||id.length>200||!v||!characterImageCatalog.some(c=>c.no===v.no)||typeof v.url!=='string'||!Number.isFinite(v.scale)||v.scale<1||v.scale>4||!Number.isFinite(v.x)||Math.abs(v.x)>100||!Number.isFinite(v.y)||Math.abs(v.y)>100)throw Error('角色图片或构图参数不正确');
  result[id]={no:v.no,url:v.url?imageUrl(v.url):'',scale:v.scale,x:v.x,y:v.y};
 }
 return result;
}
