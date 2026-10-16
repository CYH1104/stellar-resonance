import type {SpiritDiary,TheaterSetting} from './contracts';
export const legacyDiaryInstruction='从已知精神体的视角记录一段轻松日常；没有精神体资料时不要擅自发明种类。';
export const previousDiaryInstruction='写一篇已知精神体的第一人称日记：“我”是精神体，主人用姓名或“我的主人”指称。用小标题、已知的故事日期（不知道就不写日期）、心情和完整日记正文，回顾一件独立日常，写感受、偏好、小发现和结尾感想。不能只列动作、复述主线或复制状态栏精神体OS。没有精神体资料时不要擅自发明种类。';
export const diaryInstruction='从任意已知精神体中选择一位写第一人称日记，不限于user或在场角色的精神体；“我”是该精神体，主人用姓名或“我的主人”指称。正文不少于200字（不计空白和标点），文风偏幽默，可写日常见闻、糗事、搞笑互动、小发现及自己的吐槽，尊重该精神体已有性格，结尾有感想或回扣。使用篇名、已知故事日期（不知道就省略）、心情与完整分段正文。不能只列动作、复述主线或复制状态栏OS；不擅自创造未知精神体、能力或私密情报。';
export function isSpiritDiary(setting:TheaterSetting){return setting.kind==='custom'&&(setting.templateId?setting.templateId==='spirit':setting.title.trim()==='精神体日记'||setting.instruction===legacyDiaryInstruction);}
export function cleanSpiritDiary(value:unknown):SpiritDiary{
  const v=value as SpiritDiary;if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['ownerId','title','content','date','mood','ownerName','spiritAnimal'].includes(k)))throw Error('精神体日记格式不正确');
  const out={} as SpiritDiary;
  for(const [key,max,required] of [['ownerId',128,true],['title',120,true],['content',5000,true],['date',80,false],['mood',80,false],['ownerName',80,false],['spiritAnimal',1500,false]] as const){const text=v[key];if(text===undefined&&!required)continue;if(typeof text!=='string'||text.length>max||required&&!text.trim())throw Error('精神体日记字段不正确');if(text?.trim())out[key]=text.trim();}
  return out;
}
