export interface GameLine {id:string;text:string}
export interface GameDialogue {version:1;lines:GameLine[]}
/** Only already-public NPC utterances belong here. Game decisions remain in separate structures. */
export function validateGameDialogue(value:unknown,allowedIds:readonly string[]):asserts value is GameDialogue{
 const obj=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const fail=()=>{throw Error('游戏对话格式不正确');};
 if(!obj(value)||Object.keys(value).some(k=>k!=='version'&&k!=='lines')||value.version!==1||!Array.isArray(value.lines)||value.lines.length>32)fail();
 for(const line of (value as GameDialogue).lines){if(!obj(line)||Object.keys(line).some(k=>k!=='id'&&k!=='text')||!allowedIds.includes(line.id)||typeof line.text!=='string'||!line.text.trim()||line.text.length>500)fail();}
}
