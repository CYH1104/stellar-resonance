export const diceSpeechFallback='想知道？开了再看。';
/** Public speech, not private narration. Conservative syntax checks are not a guarantee against ciphers. */
export function sanitizeDiceSpeech(value:unknown,ownDice:readonly number[]=[]){
 if(typeof value!=='string'||!value.trim()||value.length>240)return diceSpeechFallback;
 const s=value.normalize('NFKC').replace(/[\p{Cf}\p{M}]/gu,'');
 if(/内心|心里|心中|心想|暗想|暗自|心声|独白|旁白|OS[:：]|\*|[【】<>]|[（(][^）)]*(?:想|心|骰|点)|[他她]的(?:声音|嘴角|目光|眼神)|[他她](?:想道|想着|暗笑|冷笑|轻笑|皱眉|挑眉|抿嘴|摇头|微笑)/i.test(s))return diceSpeechFallback;
 // A full face-list or count-list gives away a roll. Do not publish it, true or false.
 if(/(?:[1-6一二两三四五六][,，、\s]){3,}[1-6一二两三四五六]|(?:一|二|两|三|四|五|\d)[颗个粒].*?(?:一|二|两|三|四|五|\d)[颗个粒]|\\(?:u|x)|&#|%[a-f\d]{2}/i.test(s))return diceSpeechFallback;
 const chinese:Record<string,number>={一:1,二:2,两:2,三:3,四:4,五:5,六:6};
 for(const m of s.matchAll(/(?:我|手里|手上|骰子)[^。！？\n]{0,10}?(\d+|[一二两三四五])\s*[个颗粒]\s*([1-6一二两三四五六])/g)){const count=Number(m[1])||chinese[m[1]],face=Number(m[2])||chinese[m[2]];if(ownDice.length===5&&ownDice.filter(n=>n===face).length===count)return diceSpeechFallback;}
 return value.trim();
}
