import {it,expect} from 'vitest';
import {createPartyRoom,startPartyRound,cards,markElevenBatch,applyElevenBatchResult,elevenBatchPrepared,elevenWaveChoice,advanceElevenWave,validatePartyRooms,chooseTruth,finishTruth,elevenWinnerReason,type ElevenRound} from '../src/domain/partyGames';
import {applyLiarMove,applyLiarTurn,completeLiarMove} from '../src/domain/liarDice';
import type {GameDialogue} from '../src/domain/gameDialogue';
const dialogue=(lines:GameDialogue['lines']=[]):GameDialogue=>({version:1,lines});
const decisions=(choice:'hit'|'stand'='stand')=>[{id:'a',choice,text:''},{id:'b',choice,text:''}];
function fixture(kind:'eleven'|'truth'|'liar'='eleven'){
 const room=createPartyRoom(kind,['a','b'],'','','r');room.invitations={a:'accepted',b:'accepted'};const round=startPartyRound(room,undefined,()=>0);if(round.kind==='eleven'){round.hands={player:['S-A'],a:['H-A'],b:['C-A']};round.deck=cards.filter(c=>!Object.values(round.hands).flat().includes(c));}return {room,round};
}
it('modern silent NPC decisions become ready without speakers, while a fresh or legacy silent wave cannot advance',()=>{
 const {room,round}=fixture();if(round.kind!=='eleven')throw Error();markElevenBatch(room);applyElevenBatchResult(room,decisions(),dialogue());expect(elevenBatchPrepared(round)).toBe(true);expect(round.waves![0].speeches).toEqual([]);expect(round.waves![0].dialogueVersion).toBe(1);elevenWaveChoice(room,'player','stand');expect(round.waves![0].status).toBe('ready');advanceElevenWave(room);expect(round.phase).toBe('complete');markElevenBatch(room);validatePartyRooms([room]);
 const next=fixture();if(next.round.kind!=='eleven')throw Error();expect(elevenBatchPrepared(next.round)).toBe(false);next.round.waves![0].choices={player:'stand',a:'stand',b:'stand'};expect(()=>advanceElevenWave(next.room)).toThrow();next.round.waves![0].status='ready';expect(()=>validatePartyRooms([next.room])).toThrow();
});
it('modern ordered repeated NPC turns and one exact player message persist across a deal and stop duplicate player lines',()=>{
 const {room,round}=fixture();if(round.kind!=='eleven')throw Error();markElevenBatch(room);const lines=[{id:'b',text:'先别急。'},{id:'a',text:'我也没急。'},{id:'b',text:'那就来。'}];applyElevenBatchResult(room,decisions('hit'),dialogue(lines));round.waves![0].playerText='我看着你们。';round.waves![0].speeches.push({id:'player',text:'我看着你们。'});elevenWaveChoice(room,'player','stand');advanceElevenWave(room);markElevenBatch(room);validatePartyRooms([room]);expect(round.waves![0].speeches.slice(0,3)).toEqual(lines);expect(elevenBatchPrepared(round)).toBe(false);
 const bad=JSON.parse(JSON.stringify(room));bad.rounds[0].waves[0].speeches.push({id:'player',text:'我看着你们。'});expect(()=>validatePartyRooms([bad])).toThrow();
 markElevenBatch(room);applyElevenBatchResult(room,decisions(),dialogue());const last=round.waves!.at(-1)!;last.playerText='这轮也不拿。';last.speeches.push({id:'player',text:last.playerText});expect(elevenBatchPrepared(round)).toBe(true);advanceElevenWave(room);markElevenBatch(room);validatePartyRooms([room]);expect(round.hands.player).toEqual(['S-A']);
});
it('modern completed batch allows silent final dialogue; missing version never relaxes one-line legacy output',()=>{
 const {room,round}=fixture();if(round.kind!=='eleven')throw Error();markElevenBatch(room);applyElevenBatchResult(room,decisions(),dialogue());elevenWaveChoice(room,'player','stand');advanceElevenWave(room);markElevenBatch(room);applyElevenBatchResult(room,[{id:'a',choice:null},{id:'b',choice:null}],dialogue());expect(round.batch?.finalReplies).toEqual([]);expect(round.batch?.dialogueVersion).toBe(1);validatePartyRooms([room]);
 const bad=JSON.parse(JSON.stringify(room));delete bad.rounds[0].batch.dialogueVersion;expect(()=>validatePartyRooms([bad])).toThrow();bad.rounds[0].batch.dialogueVersion=2;expect(()=>validatePartyRooms([bad])).toThrow();
 const legacy=fixture();markElevenBatch(legacy.room);expect(()=>applyElevenBatchResult(legacy.room,decisions())).toThrow();expect(()=>applyElevenBatchResult(legacy.room,decisions(),{version:2,lines:[]} as unknown as GameDialogue)).toThrow();
});
it('legacy long accepted speeches are preserved instead of being relabeled with a 500-character modern cap',()=>{
 const {room,round}=fixture();if(round.kind!=='eleven')throw Error();const original=[{id:'a',text:'旧'.repeat(800)},{id:'b',text:'旧乙'}];round.waves![0].speeches=original;markElevenBatch(room);applyElevenBatchResult(room,decisions(),dialogue([{id:'a',text:'新'}]));expect(round.waves![0].speeches).toEqual(original);expect(round.waves![0].dialogueVersion).toBeUndefined();validatePartyRooms([room]);
});
it('modern packets enforce per-response caps and NPC ownership atomically rather than widening legacy data',()=>{
 const {room}=fixture();markElevenBatch(room);const before=JSON.stringify(room);for(const lines of [Array.from({length:33},()=>({id:'a',text:'多句'})),[{id:'a',text:'长'.repeat(501)}],[{id:'player',text:'不能代写'}],[{id:'outsider',text:'外人'}]]){expect(()=>applyElevenBatchResult(room,decisions(),dialogue(lines))).toThrow();expect(JSON.stringify(room)).toBe(before);}
 const liar=fixture('liar');const saved=JSON.stringify(liar.room);expect(()=>applyLiarMove(liar.room,'player','bid',{count:3,face:1,pure:true},'',[{id:'a',text:'长'.repeat(501)}],1)).toThrow();expect(()=>applyLiarMove(liar.room,'player','bid',{count:3,face:1,pure:true},'',[],2 as 1)).toThrow();expect(JSON.stringify(liar.room)).toBe(saved);
});
it('generic modern chat retains ordered player/NPC history and legacy long text but keeps limits and old strictness',()=>{
 const {room,round}=fixture('truth');round.replies=[{id:'a',text:'旧'.repeat(3000)},{id:'player',text:'我说的话'},{id:'b',text:'接话'},{id:'a',text:'再接一句'}];round.dialogueVersion=1;validatePartyRooms([room]);
 for(const mutate of [(x:any)=>delete x.dialogueVersion,(x:any)=>x.dialogueVersion=2,(x:any)=>x.replies.push({id:'outsider',text:'坏'}),(x:any)=>x.replies[1].text='长'.repeat(2001),(x:any)=>x.replies=Array.from({length:257},()=>({id:'a',text:'多'}))]){const copy=JSON.parse(JSON.stringify(room));mutate(copy.rounds[0]);expect(()=>validatePartyRooms([copy])).toThrow();}
});
it('truth choice and answer dialogues remain separate and forbid model-controlled player lines',()=>{
 const {room,round}=fixture('truth');if(round.kind!=='truth')throw Error();chooseTruth(room,round.target,'truth');round.choiceDialogue=dialogue([{id:'b',text:'选这个？'},{id:'a',text:'对。'},{id:'b',text:'好。'}]);finishTruth(room,round.target,'我的回答。',false);round.dialogue=dialogue();validatePartyRooms([room]);const bad=JSON.parse(JSON.stringify(room));bad.rounds[0].choiceDialogue.lines.push({id:'player',text:'模型代说'});expect(()=>validatePartyRooms([bad])).toThrow();
});
it('liar modern silence completes moves and shared-response linkage without falsely setting pending',()=>{
 const {room,round}=fixture('liar');if(round.kind!=='liar')throw Error();applyLiarMove(room,'player','bid',{count:3,face:2,pure:false},'来吧。');applyLiarTurn(room,'a','bid',{count:3,face:3,pure:false},[],1);expect(round.moves[0].replyWithNext).toBe(true);expect(round.moves[1]).toMatchObject({dialogueVersion:1,pending:false,replies:[]});applyLiarTurn(room,'b','bid',{count:3,face:4,pure:false},[{id:'b',text:'四。'},{id:'a',text:'真的假的？'},{id:'b',text:'猜。'}],1);validatePartyRooms([room]);
 const copy=JSON.parse(JSON.stringify(room));delete copy.rounds[0].moves[1].dialogueVersion;expect(()=>validatePartyRooms([copy])).toThrow();copy.rounds[0].moves[1].dialogueVersion=2;expect(()=>validatePartyRooms([copy])).toThrow();
 applyLiarMove(room,'player','open',undefined);completeLiarMove(room,[],1);expect(round.moves.at(-1)?.pending).toBe(false);validatePartyRooms([room]);
});
it('direct modern moves can finish silently, and player/unknown speaker/version violations fail atomically',()=>{
 const {room,round}=fixture('liar');if(round.kind!=='liar')throw Error();const before=JSON.stringify(room);expect(()=>applyLiarMove(room,'player','bid',{count:3,face:2,pure:true},'',[{id:'player',text:'不能模型代言'}],1)).toThrow();expect(JSON.stringify(room)).toBe(before);applyLiarMove(room,'player','bid',{count:3,face:2,pure:true},'',[],1);expect(round.moves[0].pending).toBe(false);applyLiarTurn(room,'a','open',undefined,[],1);validatePartyRooms([room]);
});
function completed(hands:ElevenRound['hands'],banker='player'):ElevenRound{return {kind:'eleven',number:1,banker,hands,deck:[],stopped:Object.keys(hands),turn:'',phase:'complete',winner:banker};}
it('winner explanations reflect all-bust and tie priorities without changing settled results',()=>{
 const all=completed({player:['S-10','H-10'],a:['C-9','D-9']});const before=JSON.stringify(all);expect(elevenWinnerReason(all)).toContain('旧规则');expect(elevenWinnerReason(all)).toContain('全员爆牌');expect(elevenWinnerReason(all)).toContain('庄家优先');expect(JSON.stringify(all)).toBe(before);
 expect(elevenWinnerReason(completed({player:['S-10'],a:['H-10']}))).toContain('庄家优先');
 const suits=completed({player:['S-10','S-A','H-J'],a:['H-10','H-A','S-J']});expect(elevenWinnerReason(suits)).toContain('♠');expect(elevenWinnerReason(suits)).toContain('张数上占优');
 expect(elevenWinnerReason(completed({player:['S-10'],a:['H-9']}))).toContain('10点更大');
 const five=completed({player:['S-A','H-A','C-A','D-A','D-J'],a:['S-10','H-J']});expect(elevenWinnerReason(five)).toContain('五张不过优先');
});
