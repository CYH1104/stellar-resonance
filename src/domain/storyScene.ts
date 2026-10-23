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
