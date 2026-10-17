import {internalPrompt} from './internal-prompts.mjs';
import {isSpiritDiary} from '../src/domain/spiritDiary.ts';
export function featurePrompts(plans,suggestions=true){
 const ids=new Set();if(suggestions)ids.add('suggestions');
 for(const plan of plans){ids.add(plan.kind);if(isSpiritDiary(plan))ids.add('diary');}
 return [...ids].map(id=>internalPrompt('feature.'+id)).join('\n');
}
export function featureContract(plans,suggestions=true){
 const required={};if(suggestions)required.suggestions=['围绕本轮正文末尾的下一步行动'];
 if(plans.some(p=>p.slot===1))required.forum=[{id:'本轮唯一ID',authorName:'公开作者称呼',content:'与本轮剧情相关的新帖子'}];
 const scenes=plans.filter(p=>p.slot>1).map(p=>({slot:p.slot,kind:p.kind,title:p.title,content:p.kind==='group'?'':'本轮新内容',...(p.kind==='group'?{messages:[{speaker:'公开姓名',content:'与本轮剧情相关的新消息'}]}:{}),...(p.kind==='fanfic'?{participantIds:p.participantIds||['player','已知charID'],complete:true}:{}),...(isSpiritDiary(p)?{diary:{ownerId:p.diaryOwners?.[0]?.ownerId||'已有精神体的主人ID',title:'新篇名',content:'精神体第一人称完整日记'}}:{})}));
 if(scenes.length)required.theaters=scenes;
 if(!Object.keys(required).length)return '';
 return internalPrompt('feature.required',{p0:JSON.stringify(required),p1:featurePrompts(plans,suggestions)});
}
export function featureContext(context,plans,{stateEnabled=true,suggestionsEnabled=true}={}){
 const out={...context};
 if(out.previousTheaters)out.previousTheaters=out.previousTheaters.filter(s=>plans.some(p=>p.slot===s.slot));
 if(!plans.some(p=>p.slot===1))delete out.forumContext;
 if(!plans.length){delete out.previousTheaters;delete out.theaterPlans;}
 if(!out.dice){delete out.dice;delete out.dicePlan;}
 if(!out.specialEvent)delete out.specialEvent;
 if(!stateEnabled){delete out.mvu;delete out.state;}
 return out;
}
