import {internalPrompt} from './internal-prompts.mjs';
import {isSpiritDiary} from '../src/domain/spiritDiary.ts';
export function featurePrompts(plans,suggestions=true){
 const ids=new Set();if(suggestions)ids.add('suggestions');
 for(const plan of plans){ids.add(plan.kind);if(isSpiritDiary(plan))ids.add('diary');}
 return [...ids].map(id=>internalPrompt('feature.'+id)).join('\n');
}
export function featureContract(plans,suggestions=true){
 const required={};if(suggestions)required.suggestions=['A possible next action at the scene ending'];
 if(plans.some(p=>p.slot===1))required.forum=[{id:'unique-this-turn',authorName:'Generic campus alias',type:'Student update',time:'Just now',content:'A casual campus mood or public service reminder, never a scene recap',comments:[]}];
 const scenes=plans.filter(p=>p.slot>1).map(p=>({slot:p.slot,kind:p.kind,title:p.title,content:p.kind==='group'?'':'New content for this turn',...(p.kind==='group'?{messages:[{speaker:'Public speaker name',content:'A fresh in-world message'}]}:{}),...(p.kind==='fanfic'?{participantIds:p.participantIds||['player','known-character-id'],complete:true}:{}),...(isSpiritDiary(p)?{diary:{ownerId:p.diaryOwners?.[0]?.ownerId||'known-spirit-owner-id',title:'New entry title',content:'A complete first-person spirit diary'}}:{})}));
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
