import type {TheaterScene} from './contracts';
export const FANFIC_MIN=800,DIARY_MIN=200;
export const legacyFanficInstruction='以 user 与一名 char 为主角写独立番外，不写 char 与 char 的配对。依据明确人设决定配对类型与关系，资料不足时写非亲密日常。';
export const previousFanficInstruction='以 user 与一名 char 为主角写一篇完整独立番外，不写 char 与 char 配对。正文不少于800字（不计空白和标点），有开端、发展、收束与合理结尾，不能卡在中途或用待续结束；实际写完后设置 complete:true。依据已明确人设与配对偏好，可以写双方成年且自愿的恋爱、拥抱、亲吻等亲密互动，性情节以含蓄转场处理，不作露骨描写；年龄或意愿不明确时只写非性化互动，不擅自确定攻受。不改变主线事实。';
export const fanficInstruction=previousFanficInstruction+' 只有完整收束后，在 content 最后独立一行输出 END，再设置 complete:true；截断或未收束时不要输出 END。';
export function fanficEnding(text:string){return /(?:^|\n)[ \t]*END[ \t]*$/.test(text.trimEnd());}
export function fanficBody(text:string){return fanficEnding(text)?text.trimEnd().replace(/(?:^|\n)[ \t]*END[ \t]*$/,'').trimEnd():text;}
export function diarySigned(scene:TheaterScene){return !!scene.diary?.signatureName?.trim()&&!!scene.diary?.signatureDate?.trim();}
export function storyCharacterCount(text:string):number{return (text.replace(/<[^>]*>/g,'').match(/[\p{L}\p{N}]/gu)||[]).length;}
export function theaterRequirementError(scene:TheaterScene,diary=false,knownSpirits=true):string|undefined{
  if(scene.kind==='fanfic'){
    if(storyCharacterCount(fanficBody(scene.content))<FANFIC_MIN)return 'MODEL_FANFIC_TOO_SHORT';
    if(scene.complete!==true||!fanficEnding(scene.content))return 'MODEL_FANFIC_UNFINISHED';
  }
  if(diary&&knownSpirits){
    if(scene.diary&&storyCharacterCount(scene.diary.content)<DIARY_MIN)return 'MODEL_DIARY_TOO_SHORT';
    if(!diarySigned(scene))return 'MODEL_DIARY_UNFINISHED';
  }
}
