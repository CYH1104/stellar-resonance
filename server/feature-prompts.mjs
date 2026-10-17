import {internalPrompt} from './internal-prompts.mjs';
import {isSpiritDiary} from '../src/domain/spiritDiary.ts';
export function featurePrompts(plans,suggestions=true){
 const ids=new Set();if(suggestions)ids.add('suggestions');
 for(const plan of plans){ids.add(plan.kind);if(isSpiritDiary(plan))ids.add('diary');}
 return [...ids].map(id=>internalPrompt('feature.'+id)).join('\n');
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
