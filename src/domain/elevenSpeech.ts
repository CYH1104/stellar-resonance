export const elevenSpeechFallback='想看我的底牌？等亮牌再说。';

const chineseDigits:Record<string,number>={零:0,〇:0,一:1,二:2,两:2,兩:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,壹:1,贰:2,貳:2,叁:3,參:3,肆:4,伍:5,陆:6,陸:6,柒:7,捌:8,玖:9};
function numberValue(token:string):number|undefined{
 if(/^\d+(?:\.\d+)?$/.test(token))return Number(token);
 if(token==='半')return .5;
 const decimal=token.split(/[点點]/);if(decimal.length>2)return;
 const whole=decimal[0];let integer:number;
 if(/^\d+$/.test(whole))integer=Number(whole);
 else if(/[十拾]/.test(whole)){
  const parts=whole.split(/[十拾]/);if(parts.length!==2||parts.some(p=>p.length>1))return;
  const tens=parts[0]?chineseDigits[parts[0]]:1,units=parts[1]?chineseDigits[parts[1]]:0;if(tens===undefined||units===undefined)return;integer=tens*10+units;
 }else{
  const values=Array.from(whole).map(x=>chineseDigits[x]);if(!values.length||values.some(x=>x===undefined))return;integer=Number(values.join(''));
 }
 if(decimal.length===1)return integer;
 if(decimal[1]==='半')return integer+.5;
 const fraction=Array.from(decimal[1]).map(x=>/\d/.test(x)?Number(x):chineseDigits[x]);if(!fraction.length||fraction.some(x=>x===undefined))return;
 return integer+Number('0.'+fraction.join(''));
}
function ownPoints(hand:readonly string[]):number|undefined{
 if(!Array.isArray(hand)||!hand.length||hand.length>5||new Set(hand).size!==hand.length)return;
 let units=0;for(const card of hand){const m=/^[SHCD]-(A|[2-9]|10|J|Q|K)$/.exec(card);if(!m)return;units+=m[1]==='A'?2:/[JQK]/.test(m[1])?1:Number(m[1])*2;}return units/2;
}
/** Bounded display grammar, not a guarantee against arbitrary ciphers or semantic innuendo.
 * Apply before writing replies to history/model context/memory; never store the rejected text.
 * Numeric mentions equal to the speaker's real score are conservatively blocked even without 点.
 * Explicit card/suit descriptions are blocked regardless of whether they are true.
 */
export function sanitizeElevenSpeech(text:unknown,ownHand:readonly string[]):string{
 const points=ownPoints(ownHand);if(typeof text!=='string'||!text.trim()||text.length>200||points===undefined)return elevenSpeechFallback;
 const normalized=text.replace(/([\d一二两兩三四五六七八九十])½/g,'$1点五').replace(/½/g,'0.5').normalize('NFKC').replace(/[\p{Cf}\p{M}]/gu,'').replace(/[\s]+/gu,'').replace(/([\d一二两兩三四五六七八九十])(?:½|1⁄2)/g,'$1点五').replace(/½|1⁄2/g,'0.5').replace(/[．。·]/g,'.').replace(/點/g,'点').replace(/(\d+)点五/g,'$1.5');
 // Encoded payloads, markup and non-prose escape notation are outside the public speech format.
 if(/[<>]|\\(?:u|x|n|r)|&#|%[a-f\d]{2}/i.test(normalized))return elevenSpeechFallback;
 if(/[♠♥♡♣♦♤♧♢]|黑桃|红桃|紅桃|红心|紅心|梅花|草花|方片|方块|方塊|花色|底牌是|手牌是/i.test(normalized))return elevenSpeechFallback;
 if(/(?:^|[^a-z])[SHCD][-:：]?(?:A|[2-9]|10|J|Q|K)(?![a-z])/i.test(normalized)||/(?:^|[^a-z])[AJQK](?![a-z])/i.test(normalized)||/[张張]牌|[张張](?:[零〇一二两兩三四五六七八九十\d]|老K|尖儿)|(?:牌|手里|手裡|手上|拿着|拿著).{0,6}(?:老K|尖儿|钩|鈎|圈)/i.test(normalized))return elevenSpeechFallback;
 // Bare numeric ranks may be used for bluff totals; a literal rank-list is an explicit hand disclosure.
 if(/(?:我的牌|底牌|手牌|拿到|拿了|抽到).{0,5}(?:[2-9]|10|[二两兩三四五六七八九十])|(?:[2-9]|10|[二两兩三四五六七八九十])(?:和|加|、|,|，|与|與|\+)(?:[2-9]|10|[二两兩三四五六七八九十])/.test(normalized))return elevenSpeechFallback;
 const tokens=normalized.match(/\d+(?:[.点]\d+|点?半)?|[零〇一二两兩三四五六七八九十拾壹贰貳叁參肆伍陆陸柒捌玖]+(?:点(?:[零〇一二两兩三四五六七八九\d]+|半))?|半/g)||[];
 for(let token of tokens){if(token.endsWith('半')&&token!=='半'&&!token.endsWith('点半'))token=token.slice(0,-1)+'点半';token=token.replace('点', '.');if(/[一二两兩三四五六七八九十拾零〇壹贰貳叁參肆伍陆陸柒捌玖半]/.test(token))token=token.replace('.', '点');const value=numberValue(token);if(value!==undefined&&Math.abs(value-points)<1e-9)return elevenSpeechFallback;}
 return text.trim();
}
