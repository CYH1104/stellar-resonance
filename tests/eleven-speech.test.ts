import {it,expect} from 'vitest';
import {sanitizeElevenSpeech as safe,elevenSpeechFallback as fallback} from '../src/domain/elevenSpeech';
it('blocks Arabic, Chinese, financial, fullwidth and invisible-spaced true score claims including bare numbers',()=>{
 const seven=['S-3','H-4'];
 for(const line of ['我才7点。','我手里是7','我手里是七','我只有柒。','我手上是７','我手里是7\u200b','手里是 七','我只有七个点'])expect(safe(line,seven),line).toBe(fallback);
 const eleven=['S-10','H-A','C-J'];for(const line of ['我十一点半。','我11.5点','我11点半','我11半','我十壹点五','我１１．５','我11½'])expect(safe(line,eleven),line).toBe(fallback);
 const tenHalf=['S-10','H-J'];for(const line of ['十点五','十点半','10.5','１０点半'])expect(safe(line,tenHalf),line).toBe(fallback);
});
it('allows false score bluffing and personality talk while never returning card or suit descriptions',()=>{
 const seven=['S-3','H-4'];for(const line of ['我才两点。','我牌很小，别盯着我。','这局我可不怕你。','我才十点半。'])expect(safe(line,seven)).toBe(line);
 for(const line of ['我的黑桃三。','我拿S-3','我有♠3','我这两张牌不错。','一张七，一张Q。','我的A。','我的花色很好。','我是三加四。','我的牌是3。','刚抽到四。'])expect(safe(line,seven),line).toBe(fallback);
});
it('rejects malformed, oversized or encoded output and does not mutate the original speech/hand',()=>{
 const hand=['S-3','H-4'],line='想骗我？再看看。';expect(safe(line,hand)).toBe(line);expect(hand).toEqual(['S-3','H-4']);
 for(const value of [null,undefined,{},'', '字'.repeat(201),'<b>7</b>','我有\\u0037','我有&#55;'])expect(safe(value,hand)).toBe(fallback);
 expect(safe('我不说',[])).toBe(fallback);
});
