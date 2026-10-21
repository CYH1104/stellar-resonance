import {it,expect} from 'vitest';
import {theaterRuleEnabled} from '../src/domain/theaterRegexBindings';
it('explicit empty binding disables regex rather than restoring global fallback',()=>{const settings=[{slot:3,regexIds:['a']},{slot:4}];expect(theaterRuleEnabled(settings,3,'a')).toBe(true);expect(theaterRuleEnabled(settings,4,'a')).toBe(false);settings[0].regexIds=[];expect(theaterRuleEnabled(settings,3,'a')).toBe(false);expect(theaterRuleEnabled(settings,3,'b')).toBe(false);settings[0].regexIds=['b'];expect(theaterRuleEnabled(settings,3,'a')).toBe(false);expect(theaterRuleEnabled(settings,3,'b')).toBe(true);});
it('legacy unconfigured theaters retain unbound global rules',()=>{expect(theaterRuleEnabled([{slot:3}],3,'legacy')).toBe(true);});
