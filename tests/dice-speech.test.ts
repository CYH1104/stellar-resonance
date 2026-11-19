import {it,expect} from 'vitest';import {sanitizeDiceSpeech,diceSpeechFallback} from '../src/domain/diceSpeech';
it('keeps spoken bluffing, uncertainty and ordinary remarks rather than converting them to narration',()=>{
 const roll=[1,2,2,4,6];for(const line of ['我可不怕你开。','我可能有，也可能没有。','我这边有三个6，信不信随你。','这次运气不错。'])expect(sanitizeDiceSpeech(line,roll)).toBe(line);
 expect(sanitizeDiceSpeech('我有两个2。',roll)).toBe(diceSpeechFallback);
});
it('filters inner monologue, stage directions, encoded text and full-roll disclosures before saving',()=>{
 for(const line of ['内心想着他肯定撒谎。','他挑眉一笑。','【旁白】摇摇头','（心想：应该开了）','我骰子是1,2,3,4,5','他有6、6、2、1、4','我有两个3，三个5','\\u0031\\u0032','<think>骰子</think>'])expect(sanitizeDiceSpeech(line,[1,2,3,4,5]),line).toBe(diceSpeechFallback);
});
