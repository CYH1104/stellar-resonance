import {defaultGreeting} from './greeting.mjs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {isPlaceholderCharacter} from './placeholders.mjs';
import {bundledCharacters} from './character-catalog.mjs';

// 世界卡是用户数据，跟着实例的私有目录走；root 只用来找随代码发布的兜底示例与角色目录。
// 从发布快照启动时 root 是快照目录，里面没有 server/private——必须显式传入真实数据目录，
// 否则旧卡会被示例卡顶掉（地点、院系、世界设定全部退化）。
export async function loadCard(root,privateDirectory=resolve(root,'server/private')){
  let raw;
  try{raw=await readFile(resolve(privateDirectory,'extracted-pro.json'),'utf8');}
  catch(error){if(error.code!=='ENOENT')throw error;raw=await readFile(resolve(root,'server/example/feature-demo.json'),'utf8');}
  const card=JSON.parse(raw);if(card.world)card.world.greeting=defaultGreeting(card.world.greeting);if(Array.isArray(card.characters)){card.characters=card.characters.filter(c=>!isPlaceholderCharacter(c));if(!card.characters.length)card.characters=await bundledCharacters(root);}return card;
}
