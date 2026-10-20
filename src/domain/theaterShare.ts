import {theaterTemplates} from './theaters.ts';
export interface TheaterShare {version:1;title:string;kind:'custom'|'fanfic'|'group';instruction:string;templateId?:string}
export function cleanTheaterShare(v:unknown):TheaterShare {
  const p=v as TheaterShare;
  if(!p||p.version!==1||typeof p.title!=='string'||!p.title.trim()||p.title.length>80||!['custom','fanfic','group'].includes(p.kind)||typeof p.instruction!=='string'||p.instruction.length>4000||p.templateId!==undefined&&!theaterTemplates.some(t=>t.id===p.templateId))throw Error('分享模板格式不正确');
  return {version:1,title:p.title.trim(),kind:p.kind,instruction:p.instruction,...(p.templateId?{templateId:p.templateId}:{})};
}
