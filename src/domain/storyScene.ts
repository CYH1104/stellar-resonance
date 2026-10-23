import type {WorldState} from './contracts';
export const scenePaths={日期:'/custom/时间地点/日期',时间:'/custom/时间地点/时间',地点:'/custom/时间地点/地点'} as const;
export const emptyScene=()=>({日期:'',时间:'',地点:''});
export function storyScene(state?:WorldState){
 const value=state?.variables?.时间地点;
 const scene=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 return {日期:typeof scene.日期==='string'?scene.日期:'',时间:typeof scene.时间==='string'?scene.时间:'',地点:typeof scene.地点==='string'?scene.地点:''};
}
export function isScenePath(path:string){return Object.values(scenePaths).some(p=>p===path);}
export function validSceneValue(path:string,value:unknown){
 return isScenePath(path)&&typeof value==='string'&&value.length<=(path===scenePaths.地点?200:80)&&(path!==scenePaths.时间||value===''||/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value));
}
export function terminalStoryClock(state?:WorldState,prose=''){
 const scene=storyScene(state);
 const time=scene.时间||prose.match(/(?:^|[^\d])((?:[01]?\d|2[0-3]):[0-5]\d)(?!\d)/)?.[1]||'— : —';
 const date=scene.日期||prose.match(/\d{4}(?:年\d{1,2}月\d{1,2}日|[-/]\d{1,2}[-/]\d{1,2})/)?.[0]||'';
 const weekday=(date||prose).match(/(?:星期|周)([一二三四五六日天])/);
 let day=weekday?'一二三四五六日天'.indexOf(weekday[1])%7+1:0;
 const numeric=date.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/);
 if(!day&&numeric){const d=new Date(Date.UTC(+numeric[1],+numeric[2]-1,+numeric[3]));if(d.getUTCFullYear()===+numeric[1]&&d.getUTCMonth()===+numeric[2]-1&&d.getUTCDate()===+numeric[3])day=d.getUTCDay()||7;}
 return {time,label:date||prose.match(/第[一二三四五六七八九十百\d]+[日天]|星期[一二三四五六日天]|周[一二三四五六日天]/)?.[0]||'剧情日期待明确',day,location:scene.地点};
}

export interface SceneSnapshot {日期:string;时间:string;地点:string;星期?:string}
export function cleanSceneSnapshot(value:unknown):SceneSnapshot{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('开场场景格式不正确');
 const v=value as Record<string,unknown>;if(Object.keys(v).some(k=>!['日期','时间','地点','星期'].includes(k))||Object.keys(scenePaths).some(k=>!validSceneValue(scenePaths[k as keyof typeof scenePaths],v[k]))||v.星期!==undefined&&(typeof v.星期!=='string'||!/^$|^星期[一二三四五六日天]$/.test(v.星期)))throw Error('开场场景格式不正确');
 return {...Object.fromEntries(Object.keys(scenePaths).map(k=>[k,v[k]])),...(v.星期!==undefined?{星期:v.星期}:{})} as SceneSnapshot;
}
export function sceneSnapshotLabel(scene:SceneSnapshot){const numeric=scene.日期.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/);let weekday=scene.星期||'';if(!weekday&&numeric){const d=new Date(Date.UTC(+numeric[1],+numeric[2]-1,+numeric[3]));if(d.getUTCFullYear()===+numeric[1]&&d.getUTCMonth()===+numeric[2]-1&&d.getUTCDate()===+numeric[3])weekday='星期'+'日一二三四五六'[d.getUTCDay()];}return [scene.日期,weekday,scene.时间,scene.地点].filter(Boolean).join(' · ')||'时间地点待明确';}
