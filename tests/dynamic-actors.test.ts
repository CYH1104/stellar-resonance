import {it,expect} from 'vitest';
import {applyMvu} from '../src/domain/mvu';
import {newSession,stateAt,finishVariant,backup,parseBackup,defaults,truncate} from '../src/domain/story';
const npc={id:'npc-brother',name:'林川',present:false,relationship:'哥哥',affinity:35};
const session=()=>newSession('动态角色',{name:'玩家',appearance:'',background:'哥哥叫林川',personality:''},'开场');
it('registers new status NPCs and preserves IDs/relationships through later updates, backups and rewind',()=>{
 const s=session();const append=(out:unknown)=>{const v={id:crypto.randomUUID(),text:'正文',status:'incomplete' as const,createdAt:''};s.turns.push({id:crypto.randomUUID(),input:'行动',selected:0,variants:[v]});finishVariant(s,s.turns.length-1,v,out);};
 append({event:'提及哥哥',characters:[npc]});expect(stateAt(s).characters.find(c=>c.id===npc.id)).toEqual(npc);
 append({event:'关系变化',mvu:[{op:'delta',path:'/characters/npc-brother/affinity',value:-50}]});expect(stateAt(s).characters.find(c=>c.id===npc.id)?.affinity).toBe(-15);
 const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0];expect(stateAt(restored)).toEqual(stateAt(s));
 truncate(s,1);expect(stateAt(s).characters.find(c=>c.id===npc.id)?.affinity).toBe(35);truncate(s,0);expect(stateAt(s).characters.find(c=>c.id===npc.id)).toBeUndefined();
});
it('supports MVU add and subsequent field updates atomically while rejecting malformed additions and deletion',()=>{
 const state=stateAt(session()),out=applyMvu(state,[{op:'add',path:'/characters/npc-brother',value:npc},{op:'delta',path:'/characters/npc-brother/affinity',value:2}]);
 expect(out.characters.find(c=>c.id===npc.id)?.affinity).toBe(37);expect(state.characters.find(c=>c.id===npc.id)).toBeUndefined();
 for(const value of [{id:npc.id},{...npc,affinity:201},{...npc,id:'player'},{...npc,unknown:'bad'}])expect(()=>applyMvu(state,[{op:'add',path:'/characters/npc-brother',value}])).toThrow();
 expect(()=>applyMvu(out,[{op:'remove',path:'/characters/npc-brother'}])).toThrow();
});
