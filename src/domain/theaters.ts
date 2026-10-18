import {forumInstruction,legacyForumInstruction} from './forumRequirements.ts';
import {fanficInstruction,legacyFanficInstruction} from './theaterRequirements.ts';
import {cleanSpiritDiary,isSpiritDiary,diaryInstruction,legacyDiaryInstruction,previousDiaryInstruction} from './spiritDiary.ts';
import type {ActorState,Pairing,Persona,Session,TheaterScene,TheaterSetting} from './contracts';
export const theaterTemplates=[{id:'fanfic',name:'同人文小剧场',kind:'fanfic',instruction:fanficInstruction},{id:'interview',name:'角色访谈',kind:'custom',instruction:'用简短采访呈现角色对一件公开日常小事的回答，不复述主线正文，不泄露秘密设定。'},{id:'spirit',name:'精神体日记',kind:'custom',instruction:diaryInstruction},{id:'off-duty',name:'课后碎片',kind:'custom',instruction:'围绕课后的小事写轻松独立片段，不推进或改变主线事实。'},{id:'custom',name:'自定义',kind:'custom',instruction:''}] as const;
export function defaultTheaters():TheaterSetting[]{return [{slot:1,kind:'forum',enabled:true,title:'星际论坛',instruction:forumInstruction},{slot:2,kind:'group',enabled:true,title:'群聊',instruction:'以群聊消息呈现公开日常互动，不复制正文对白，不改变主线在场人物。'},{slot:3,kind:'fanfic',enabled:false,title:'同人文小剧场',instruction:theaterTemplates[0].instruction},{slot:4,kind:'custom',enabled:false,title:'自定义小剧场',instruction:''}];}
export function cleanTheaters(value:unknown):TheaterSetting[]{
  if(value===undefined)return defaultTheaters();
  if(!Array.isArray(value)||value.length!==4)throw new Error('小剧场设置必须是4个位置');
  const slots=new Set<number>();return value.map((p:any)=>{
    if(!p||!Number.isInteger(p.slot)||p.slot<1||p.slot>4||slots.has(p.slot)||typeof p.enabled!=='boolean'||!['forum','group','fanfic','custom'].includes(p.kind)||typeof p.title!=='string'||!p.title.trim()||p.title.length>80||typeof p.instruction!=='string'||p.instruction.length>4000||(p.charId!==undefined&&(typeof p.charId!=='string'||p.charId.length>128)))throw new Error('小剧场设置格式不正确');
    if(p.templateId!==undefined&&!theaterTemplates.some(t=>t.id===p.templateId))throw new Error('小剧场模板不正确');
    const diary=isSpiritDiary(p);
    slots.add(p.slot);if(p.slot===1&&p.kind!=='forum'||p.slot===2&&p.kind!=='group'||p.slot>=3&&!['fanfic','custom'].includes(p.kind))throw new Error('论坛和群聊的位置不可改为其他类型');
    return {slot:p.slot,kind:p.kind,enabled:p.enabled,title:p.title.trim(),instruction:p.kind==='forum'&&p.instruction===legacyForumInstruction?forumInstruction:diary&&[legacyDiaryInstruction,previousDiaryInstruction].includes(p.instruction)?diaryInstruction:p.kind==='fanfic'&&p.instruction===legacyFanficInstruction?fanficInstruction:p.instruction,...(p.templateId?{templateId:p.templateId}:diary?{templateId:'spirit' as const}:{}),...(p.charId?{charId:p.charId}:{})};
  }).sort((a,b)=>a.slot-b.slot);
}
export function determinePairing(persona:Persona,char:ActorState):Pairing{
  const result:Pairing={charId:char.id,category:'待补充',userRole:'待补充',reason:'缺少明确的第一性别或配对偏好，先写非亲密日常。'};
  const male=(s?:string)=>['男','男性'].includes(s||''),female=(s?:string)=>['女','女性'].includes(s||'');
  const pref=persona.pairingPreference||'',notes=persona.other||'';
  if(male(persona.primaryGender)&&male(char.primaryGender)){
    result.category='BL';if(pref==='BL-攻'||/(?:user|玩家|我|主角).{0,3}(?:是|为)?攻|主攻/.test(notes))result.userRole='攻';else if(pref==='BL-受'||/(?:user|玩家|我|主角).{0,3}(?:是|为)?受|主受/.test(notes))result.userRole='受';
    result.reason=result.userRole==='待补充'?'双方为男性，BL 攻受尚未明确。':'按玩家人设明确的配对偏好安排，char 为互补角色。';
  }else if(male(persona.primaryGender)&&female(char.primaryGender)||female(persona.primaryGender)&&male(char.primaryGender)){
    if(pref==='GB'||/\bGB\b/i.test(notes)){result.category='GB';result.reason='按人设明确的 GB 偏好安排女方主导。';}
    else if(pref==='BG'||/\bBG\b/i.test(notes)){result.category='BG';result.reason='按人设明确的 BG 偏好安排。';}
    else result.reason='第一性别已明确，但 BG／GB 偏好尚未填写。';
  }
  return result;
}
export function cleanTheaterScenes(value:unknown):TheaterScene[]{
  if(!Array.isArray(value)||value.length>3)throw new Error('小剧场结果数量不正确');const slots=new Set<number>();
  return value.map((p:any)=>{
    if(!p||Object.keys(p).some(k=>!['complete','slot','kind','title','content','messages','participantIds','pairing','diary'].includes(k))||!Number.isInteger(p.slot)||p.slot<2||p.slot>4||slots.has(p.slot)||!['group','fanfic','custom'].includes(p.kind)||typeof p.title!=='string'||p.title.length>80||(p.content===undefined?p.diary===undefined:typeof p.content!=='string'||p.content.length>5000))throw new Error('小剧场结果格式不正确');slots.add(p.slot);
    if(p.complete!==undefined&&(p.kind!=='fanfic'||typeof p.complete!=='boolean'))throw new Error('同人文完成标记不正确');
    const out:TheaterScene={slot:p.slot,kind:p.kind,title:p.title,content:p.content||'',...(p.complete!==undefined?{complete:p.complete}:{})};
    if(p.diary!==undefined){if(p.kind!=='custom')throw Error('日记仅用于自定义小剧场');out.diary=cleanSpiritDiary(p.diary);out.content=out.diary.content;}
    if(p.messages!==undefined){if(!Array.isArray(p.messages)||p.messages.length>24||p.messages.some((m:any)=>!m||Object.keys(m).some(k=>!['speaker','content'].includes(k))||typeof m.speaker!=='string'||m.speaker.length>80||typeof m.content!=='string'||m.content.length>1000))throw new Error('群聊消息格式不正确');out.messages=p.messages.map((m:any)=>({speaker:m.speaker,content:m.content}));}
    if(p.participantIds!==undefined){if(!Array.isArray(p.participantIds)||p.participantIds.length!==2||p.participantIds[0]!=='player'||typeof p.participantIds[1]!=='string'||p.participantIds[1]==='player')throw new Error('同人文主角必须是 user 与一名 char');out.participantIds=[...p.participantIds];}
    if(p.kind==='fanfic'&&!out.participantIds)throw new Error('同人文缺少 user 与 char 主角信息');
    if(p.pairing!==undefined){const r=p.pairing;if(!r||typeof r.charId!=='string'||!['BL','BG','GB','待补充'].includes(r.category)||!['攻','受','待补充'].includes(r.userRole)||typeof r.reason!=='string'||r.reason.length>500||r.charId!==out.participantIds?.[1])throw new Error('配对信息不正确');out.pairing={charId:r.charId,category:r.category,userRole:r.userRole,reason:r.reason};}
    return out;
  });
}
export function visibleTheaters(session:Session){
  const latest=new Map<number,TheaterScene&{round:number}>();
  session.turns.forEach((turn,index)=>{const v=turn.variants[turn.selected];if(v?.status!=='complete'||!v.outcome)return;for(const scene of cleanTheaterScenes(v.outcome.theaters||[]))latest.set(scene.slot,{...scene,round:index+1});});
  return [...latest.values()].sort((a,b)=>a.slot-b.slot);
}
