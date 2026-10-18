import {expect,it} from 'vitest';
import {eventCardDescription} from '../src/domain/randomEvents';
import {backup,parseBackup,defaults} from '../src/domain/story';
it('shows a concrete consequence or actual prose rather than a compatibility status',()=>{
 expect(eventCardDescription({text:'你接到了邀请。',outcome:{event:'本轮剧情已生成，状态按有效字段更新。'}})).toBe('你接到了邀请。');
 expect(eventCardDescription({text:'正文',outcome:{event:'广播恢复。'}})).toBe('广播恢复。');
 expect(eventCardDescription({text:'正文',outcome:{event:'广播恢复。',diceEvent:{direction:'positive',description:'同学交给你一封信。'}}})).toBe('同学交给你一封信。');
 expect(eventCardDescription({text:'<think>秘密</think>你收到来信。\\n打开信封。'})).toBe('你收到来信。\n打开信封。');
 expect(eventCardDescription()).toBe('');
});
it('event creative direction survives backup restore without altering probability or routing',()=>{
 const preferences={...defaults(),randomEventInstruction:'尽量日常。',randomEventProbability:30};
 const restored=parseBackup(backup({version:1,preferences,sessions:[]}));
 expect(restored.preferences.randomEventInstruction).toBe('尽量日常。');expect(restored.preferences.randomEventProbability).toBe(30);expect(restored.preferences.randomEventProfile).toBe('main');
});
