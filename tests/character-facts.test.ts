import {it,expect} from 'vitest';
import {syncCharacterFacts} from '../src/domain/characterFacts';
import {newSession,stateAt} from '../src/domain/story';
it('作者固定性别补入同一世界卡的旧存档和旧补丁，不改变玩家人设及剧情',()=>{
 const s=newSession('旧存档',{name:'user',primaryGender:'自定义',appearance:'',personality:'',background:''},'');s.sourceDataset='world-one';s.initial.characters=[{id:'chu',name:'楚昭南',present:true},{id:'other',name:'其他',present:false}];
 s.turns.push({id:'t',input:'原输入',selected:0,variants:[{id:'v',text:'原正文',status:'complete',createdAt:'',outcome:{event:'原事件',characters:[{id:'chu',primaryGender:'错误值',affinity:8}]}}]});
 const persona=JSON.stringify(s.persona);syncCharacterFacts(s,'world-one',[{id:'chu',primaryGender:'女'},{id:'other',primaryGender:'男'}]);
 expect(stateAt(s).characters.map(c=>c.primaryGender)).toEqual(['女','男']);expect(stateAt(s).characters[0].affinity).toBe(8);expect(s.turns[0].variants[0].text).toBe('原正文');expect(JSON.stringify(s.persona)).toBe(persona);
 const before=JSON.stringify(s);syncCharacterFacts(s,'another-world',[{id:'chu',primaryGender:'男'}]);expect(JSON.stringify(s)).toBe(before);
});
it('同源旧 char 身份以权威资料投影，历史和玩家人设不被改写',()=>{
 const s=newSession('旧存档',{name:'user',identity:'我自己的身份',appearance:'',personality:'',background:''},'');s.sourceDataset='same';s.initial.characters=[{id:'one',name:'角色',present:false}];
 s.turns.push({id:'t',input:'行动',selected:0,variants:[{id:'v',text:'原正文',status:'complete',createdAt:'',outcome:{event:'任职',characters:[{id:'one',present:true,identity:'学生会 会长'}]}}]});
 syncCharacterFacts(s,'same',[{id:'one',primaryGender:'男',identity:'领航者系 四年级首席'}]);expect(stateAt(s).characters[0].identity).toBe('领航者系 四年级首席');expect(s.initial.characters[0].identity).toBe('领航者系 四年级首席');expect(s.persona.identity).toBe('我自己的身份');
 syncCharacterFacts(s,'same',[{id:'one',primaryGender:'男',identity:'作者手动更新身份'}]);expect(s.initial.characters[0].identity).toBe('领航者系 四年级首席');expect(stateAt(s).characters[0].identity).toBe('作者手动更新身份');
});
