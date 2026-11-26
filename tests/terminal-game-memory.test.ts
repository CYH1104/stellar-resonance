import {createWerewolf} from '../src/domain/werewolf';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
import {expect,it} from 'vitest';
import {newSession,backup,parseBackup,defaults} from '../src/domain/story';
import {emptyTerminal} from '../src/domain/personalTerminal';
import {terminalAnchor,terminalBucket,terminalOrigin,recordTerminalChat,syncTerminalMemoryNotes} from '../src/domain/terminalLedger';
import {terminalGameFacts,terminalNarrativeRecall} from '../src/domain/terminalStoryContext';
import {terminalMainContext,cleanTerminalMainContext} from '../src/domain/terminalMain';
import {createPartyRoom} from '../src/domain/partyGames';
import {rig,ids,styles} from './helpers/mahjong';
import {applyMahjongStep} from '../src/domain/mahjong';
function fixture(){
 const s=newSession('游戏记忆',{name:'玩家',appearance:'',personality:'',background:''},'开场');s.terminal=emptyTerminal();
 s.initial.characters=['a','b','c'].map(id=>({id,name:id,present:true}));s.initial.variables={时间地点:{日期:'星历578年09月01日',时间:'14:20',地点:'宿舍'}};
 const b=terminalBucket(s.terminal,terminalAnchor(s));b.games.push({id:'room:1',kind:'mahjong',name:'日麻',round:1,king:'player',command:'旧版动作摘要'.repeat(120),penalties:'',complete:true,knownBy:ids});
 const round=rig({0:'m1199p1199s11z557'},'z7');round.anchor=terminalAnchor(s);applyMahjongStep(round,{hule:'-'},styles);
 const room=createPartyRoom('mahjong',['a','b','c'],'日麻','轻松','room');room.invitations={a:'accepted',b:'accepted',c:'accepted'};room.mahjongStyles=Object.fromEntries(['a','b','c'].map(id=>[id,styles[id]]));room.rounds=[round];room.scores=round.result!.scores;s.terminal.partyRooms=[room];return s;
}
it('old long summaries recover public result and original story time, without hidden hands',()=>{
 const s=fixture(),text=terminalGameFacts(s,s.turns.length,['player','a'])[0].text;
 expect(text).toContain('自摸');expect(text).toContain('14:20');expect(text).toContain('578年09月01日');expect(text).toContain('点');expect(text).not.toContain('旧版动作摘要');expect(text.length).toBeLessThanOrEqual(800);
 const snapshot=JSON.stringify(s);terminalGameFacts(s);expect(JSON.stringify(s)).toBe(snapshot);
 expect(()=>cleanTerminalMainContext(terminalMainContext(s),s.initial.characters)).not.toThrow();
});
it('later chats do not displace game results in narration; local backup roundtrips the existing schema',()=>{
 const s=fixture();s.turns.push({id:'later',input:'回到教室',selected:0,variants:[{id:'v2',text:'晚些时候',status:'complete',createdAt:'now'}]});
 recordTerminalChat(s.terminal!,terminalAnchor(s),{id:'chat',title:'同学群',group:true},['a'],'聊上课',[],ids);syncTerminalMemoryNotes(s);
 expect(terminalNarrativeRecall(s).join('\n')).toContain('自摸');expect(terminalNarrativeRecall(s).join('\n')).toContain('知情：player、a、b、c');
 const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0];expect(terminalGameFacts(restored)).toEqual(terminalGameFacts(s));
 const cloud=parseCloudSave(createCloudSave({version:1,sessions:[s],preferences:defaults()},defaults()));expect(terminalGameFacts(cloud.snapshot.sessions[0])).toEqual(terminalGameFacts(s));
 expect(terminalMainContext(s).memories?.some(m=>m.text.includes('自摸'))).toBe(true);
});
it('unknown audience, absent players, archived rounds and edited origins do not gain game knowledge',()=>{
 const s=fixture();expect(terminalGameFacts(s,0,['outsider'])).toEqual([]);
 const g=s.terminal!.memories![0].games[0];delete g.knownBy;expect(terminalGameFacts(s)).toEqual([]);g.knownBy=ids;
 s.terminal!.partyRooms![0].rounds[0].archived=true;expect(terminalGameFacts(s)).toEqual([]);delete s.terminal!.partyRooms![0].rounds[0].archived;
 s.turns.push({id:'action',input:'去玩',selected:0,variants:[]});g.origin=terminalOrigin(s,0);expect(terminalGameFacts(s)).toHaveLength(1);s.turns[0].input='不玩';expect(terminalGameFacts(s)).toEqual([]);
});
it('changed branches hide results; missing story time remains explicitly unknown',()=>{
 const s=fixture();s.initial.variables={};const text=terminalGameFacts(s)[0].text;expect(text).toContain('剧情日期待明确');expect(text).not.toContain('2026');
 s.turns.push({id:'turn',input:'玩牌',selected:0,variants:[{id:'v1',text:'牌局',status:'complete',createdAt:'now'},{id:'v2',text:'别的剧情',status:'complete',createdAt:'now'}]});
 const anchor=terminalAnchor(s);s.terminal!.memories![0].anchor=anchor;s.terminal!.partyRooms![0].rounds[0].anchor=anchor;
 expect(terminalGameFacts(s)).toHaveLength(1);s.turns[0].selected=1;expect(terminalGameFacts(s)).toEqual([]);
});
it('king game retains the participants actual response, not only the command',()=>{
 const s=fixture();s.terminal!.partyRooms=[];s.terminal!.rooms=[{id:'king',name:'国王游戏',style:'轻松',members:['player','a','b'],invitations:{a:'accepted',b:'accepted'},drunk:{},rounds:[{number:1,king:'a',numbers:{player:1,b:2},command:'分享趣事',targets:[2],replies:[{id:'b',text:'讲了昨天在食堂迷路的事',refused:false,penalty:''}],phase:'complete',anchor:terminalAnchor(s)}]}];
 s.terminal!.memories![0].games=[{id:'king:1',name:'国王游戏',round:1,king:'a',command:'分享趣事',penalties:'',complete:true,knownBy:['player','a','b']}];
 expect(terminalGameFacts(s,0,['a'])[0].text).toContain('讲了昨天在食堂迷路的事');
});

it('werewolf history cannot crowd out newer card results or all card results on the same anchor',()=>{
 const s=fixture(),seats=['player','a','b','c','d','e'].map(id=>({id,name:id}));
 s.terminal!.werewolfGames=Array.from({length:4},()=>createWerewolf(seats,terminalAnchor(s),'星历578年9月1日'));
 expect(terminalGameFacts(s).some(f=>f.text.includes('自摸'))).toBe(true);
 expect(terminalGameFacts(s).some(f=>f.text.includes('六人狼人杀'))).toBe(true);
 s.turns.push({id:'later',input:'再打日麻',selected:0,variants:[{id:'v2',text:'打牌',status:'complete',createdAt:'now'}]});
 const anchor=terminalAnchor(s);s.terminal!.memories![0].anchor=anchor;s.terminal!.partyRooms![0].rounds[0].anchor=anchor;
 expect(terminalGameFacts(s)[0].text).toContain('自摸');
 expect(terminalGameFacts(s,undefined,['outsider'])).toEqual([]);
});
