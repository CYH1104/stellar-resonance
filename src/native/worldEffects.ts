import {cleanNativeEffects,type NativeTimedEffects} from '../domain/nativeWorldState';
export interface NativeBookName {id:string;name:string}
const fail=()=>Error('世界书与本轮跨轮状态的关联已改变，已停止请求；原存档保留。');
/** Only translate identifiers. Timing/hash/activation logic stays in original WorldInfoTimedEffects. */
export function runtimeWorldEffects(value:NativeTimedEffects,books:NativeBookName[]):NativeTimedEffects{
  const source=cleanNativeEffects(value),result:NativeTimedEffects={sticky:{},cooldown:{}};
  for(const kind of ['sticky','cooldown']as const)for(const [key,effect]of Object.entries(source[kind])){
    const match=/^PlayerRuntime-(.+)\.(\d+)$/.exec(key),book=match&&books.find(book=>book.id===match[1]);if(!book)throw fail();
    const name=book.name+'.'+match![2];if(result[kind][name])throw fail();result[kind][name]={...effect};
  }
  return result;
}
export function archiveWorldEffects(value:unknown,books:NativeBookName[]):NativeTimedEffects{
  if(!value||typeof value!=='object')return {sticky:{},cooldown:{}};
  const source=value as NativeTimedEffects,result:NativeTimedEffects={sticky:{},cooldown:{}};
  for(const kind of ['sticky','cooldown']as const){
    if(!source[kind]||typeof source[kind]!=='object'||Array.isArray(source[kind]))throw fail();
    for(const [key,effect]of Object.entries(source[kind])){
      const match=/^(.*)\.(\d+)$/.exec(key),book=match&&books.find(book=>book.name===match[1]);if(!book)throw fail();
      const name='PlayerRuntime-'+book.id+'.'+match![2];if(result[kind][name])throw fail();result[kind][name]={...effect};
    }
  }
  return cleanNativeEffects(result);
}
