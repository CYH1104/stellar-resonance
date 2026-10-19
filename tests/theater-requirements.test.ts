import {it,expect} from 'vitest';
import {storyCharacterCount,theaterRequirementError,fanficInstruction} from '../src/domain/theaterRequirements';
import {cleanTheaters,defaultTheaters,cleanTheaterScenes} from '../src/domain/theaters';
import {diaryInstruction,previousDiaryInstruction} from '../src/domain/spiritDiary';
const fanfic=(n:number,complete?:boolean)=>({slot:3,kind:'fanfic' as const,title:'番外',content:'文'.repeat(n)+'\nEND',participantIds:['player','char'],...(complete!==undefined?{complete}:{})});
it('同人文至少800有效字符且明确完篇，标点空白不能充数',()=>{
 expect(storyCharacterCount('  文，\n字。<content>abc</content>')).toBe(5);
 expect(theaterRequirementError(fanfic(799,true))).toBe('MODEL_FANFIC_TOO_SHORT');expect(theaterRequirementError(fanfic(800))).toBe('MODEL_FANFIC_UNFINISHED');expect(theaterRequirementError(fanfic(800,false))).toBe('MODEL_FANFIC_UNFINISHED');expect(theaterRequirementError(fanfic(800,true))).toBeUndefined();
 const scene=cleanTheaterScenes([fanfic(800,true)])[0];expect(scene.complete).toBe(true);expect(()=>cleanTheaterScenes([{...scene,complete:'yes'}])).toThrow();
});
it('精神体日记至少200字，没有已知精神体时允许如实说明缺资料',()=>{
 const scene={slot:4,kind:'custom' as const,title:'日记',content:'',diary:{ownerId:'char',signatureName:'狐狸',signatureDate:'日期未详',title:'糗事',content:'我'.repeat(199)}};
 expect(theaterRequirementError(scene,true,true)).toBe('MODEL_DIARY_TOO_SHORT');scene.diary.content+='我';expect(theaterRequirementError(scene,true,true)).toBeUndefined();expect(theaterRequirementError({...scene,diary:undefined},true,false)).toBeUndefined();
});
it('旧的内置指令升级为新要求，自定义要求不被覆盖',()=>{
 const settings=defaultTheaters();settings[3]={...settings[3],templateId:'spirit',instruction:previousDiaryInstruction};const clean=cleanTheaters(settings);expect(clean[3].instruction).toBe(diaryInstruction);expect(clean[2].instruction).toBe(fanficInstruction);expect(diaryInstruction).toContain('任意已知精神体');expect(diaryInstruction).toContain('幽默');
 settings[3].instruction='用户自己的要求';expect(cleanTheaters(settings)[3].instruction).toBe('用户自己的要求');
});
