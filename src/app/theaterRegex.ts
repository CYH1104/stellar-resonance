import {computed,provide,type InjectionKey,type ComputedRef} from 'vue';
import type {ViewModel} from './useWorkspace';
import type {RegexRule,RegexContext} from '../domain/regex';
export const theaterRegexKey:InjectionKey<ComputedRef<{rules:RegexRule[];context:RegexContext}>>=Symbol('theaterRegex');
export function provideTheaterRegex(w:()=>ViewModel){provide(theaterRegexKey,computed(()=>({rules:(w().preferences.regexRules||[]).filter(r=>!r.setId||r.setId===w().currentPreset),context:{placement:7,scope:'display',depth:0,user:w().state?.player.name||w().active?.persona.name||'',char:'星穹学院'}})));}
