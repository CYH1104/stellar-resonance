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
 const date=scene.日期||prose.match(/星历\s*\d{1,8}(?:年\d{1,2}月\d{1,2}日|[-/]\d{1,2}[-/]\d{1,2})|\d{4}(?:年\d{1,2}月\d{1,2}日|[-/]\d{1,2}[-/]\d{1,2})/)?.[0]||'';
 const weekday=(scene.日期||prose).match(/(?:星期|周)([一二三四五六日天])/);
 let day=weekday?'一二三四五六日天'.indexOf(weekday[1])%7+1:0;
 // A numeric story date does not establish a Gregorian calendar. Only use explicit weekdays.
 return {time,label:date||prose.match(/第[一二三四五六七八九十百\d]+[日天]|星期[一二三四五六日天]|周[一二三四五六日天]/)?.[0]||'剧情日期待明确',day,location:scene.地点};
}

export interface SceneSnapshot {日期:string;时间:string;地点:string;星期?:string;人物?:string[]}
export function cleanSceneSnapshot(value:unknown):SceneSnapshot{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('开场场景格式不正确');
 const v=value as Record<string,unknown>;if(Object.keys(v).some(k=>!['日期','时间','地点','星期','人物'].includes(k))||Object.keys(scenePaths).some(k=>!validSceneValue(scenePaths[k as keyof typeof scenePaths],v[k]))||v.星期!==undefined&&(typeof v.星期!=='string'||!/^$|^星期[一二三四五六日天]$/.test(v.星期)))throw Error('开场场景格式不正确');
 if(v.人物!==undefined&&(!Array.isArray(v.人物)||v.人物.length>100||v.人物.some(name=>typeof name!=='string'||!name.trim()||name.length>80||/[\r\n\u0000-\u001f]/.test(name))||new Set(v.人物.map(name=>(name as string).trim())).size!==v.人物.length))throw Error('开场人物格式不正确');
  return {...Object.fromEntries(Object.keys(scenePaths).map(k=>[k,v[k]])),...(v.星期!==undefined?{星期:v.星期}:{}),...(v.人物!==undefined?{人物:(v.人物 as string[]).map(name=>name.trim())}:{})} as SceneSnapshot;
}
export function sceneSnapshotLabel(scene:SceneSnapshot){return [scene.日期,scene.星期||'',scene.时间,scene.地点].filter(Boolean).join(' · ')||'时间地点待明确';}
