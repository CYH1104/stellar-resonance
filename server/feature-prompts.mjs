import {internalPrompt} from './internal-prompts.mjs';
import {isSpiritDiary} from '../src/domain/spiritDiary.ts';
export function featurePrompts(plans,suggestions=true){
 plans=plans.filter(p=>p.enabled!==false);
 const ids=new Set();if(suggestions)ids.add('suggestions');
 for(const plan of plans){ids.add(plan.kind);if(isSpiritDiary(plan))ids.add('diary');}
 return [...ids].map(id=>internalPrompt('feature.'+id)).join('\n');
}
export function featureContract(plans,suggestions=true){
 plans=plans.filter(p=>p.enabled!==false);
 const required={};if(suggestions)required.suggestions=['A possible next action at the scene ending'];
 if(plans.some(p=>p.slot===1))required.forum=[{id:'unique-this-turn',authorName:'Generic campus alias',type:'Student update',time:'Just now',content:'A casual campus mood or public service reminder, never a scene recap',comments:[{id:'reply-1',authorName:'Passing student',content:'A short public reply; use [] if no comments fit.'}]}];
 const scenes=plans.filter(p=>p.slot>1).map(p=>({slot:p.slot,kind:p.kind,title:p.title,content:p.kind==='group'?'':p.kind==='fanfic'?'Complete standalone story followed by a final line\nEND':'New content for this turn',...(p.kind==='group'?{messages:[{speaker:'Public speaker name',content:'A fresh in-world message'}]}:{}),...(p.kind==='fanfic'?{participantIds:p.participantIds||['player','known-character-id'],complete:true}:{}),...(isSpiritDiary(p)?{diary:{ownerId:p.diaryOwners?.[0]?.ownerId||'known-spirit-owner-id',title:'New entry title',content:'A complete first-person spirit diary',signatureName:'Known spirit name or spirit designation, never the owner name',signatureDate:'Known story date or 日期未详'}}:{})}));
 for(const scene of scenes){const plan=plans.find(p=>p.slot===scene.slot);if(isSpiritDiary(plan))scene.content='';else if(plan.templateId==='interview')scene.content='Question: A public everyday topic.\nAnswer: A fresh in-character reply.';else if(plan.templateId==='off-duty')scene.content='A complete independent after-class vignette grounded in character traits.';}
 if(scenes.length)required.theaters=scenes;
 if(!Object.keys(required).length)return '';
 const completionRules='\nCompletion contract: fanfic content must finish with a standalone END line, only after the story is fully concluded; complete:true alone is insufficient. For spirit diaries, return signatureName and signatureDate only after finishing the entire diary. Use the spirit’s own known name (or known spirit designation), never the owner’s name. Use the story date, or 日期未详 when unknown, never the real-world date. Missing markers mean unconfirmed completion; never fake an ending after a cutoff.';
 const blocks=[];
 if(suggestions)blocks.push('<choices>'+JSON.stringify(required.suggestions)+'</choices>');
 for(const scene of scenes)blocks.push('Output template for slot '+scene.slot+' ('+(plans.find(p=>p.slot===scene.slot)?.templateId||scene.kind)+'):\n<theater slot="'+scene.slot+'">'+JSON.stringify(scene)+'</theater>');
 if(required.forum)blocks.push('<forum>'+JSON.stringify(required.forum)+'</forum>');
 blocks.push('Output each enabled section exactly once. Keep the scene as narrative only: never append a second Markdown forum, a forum instruction manual, or a second group-chat transcript. Apply preset style inside the corresponding JSON values. Finish enabled theater blocks before the forum; keep companion content concise enough to close every block within the output budget. Choices must be ONE JSON array of strings.');
 return internalPrompt('feature.required',{p0:JSON.stringify(required),p1:featurePrompts(plans,suggestions)})+(required.forum?'\nIn the enabled campus forum, NPCs may post fan fiction as fictional posts (type: 同人文); do not treat those posts as main-story facts. Do not generate like counts; the application assigns and saves them locally.':'')+'\n'+internalPrompt('feature.envelope',{p0:blocks.join('\n')})+(plans.some(p=>p.kind==='fanfic'||isSpiritDiary(p))?completionRules:'');
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
