import {expect,it} from 'vitest';
import {cards,createPartyRoom,startPartyRound,ensureElevenWaves,elevenWaveChoice,elevenWaveSpeech,advanceElevenWave,elevenAct,validatePartyRooms,type ElevenRound,type PartyRoom} from '../src/domain/partyGames';
function fixture(){const room=createPartyRoom('eleven',['a','b'],'牌局','轻松','room');room.invitations={a:'accepted',b:'accepted'};const round=startPartyRound(room,undefined,()=>0) as ElevenRound;round.rulesVersion='eleven-v2';return {room,round};}
const speeches=[{id:'a',text:'我先观察大家。'},{id:'b',text:'保持镇定。'}];
const locked=(room:PartyRoom,choice:'hit'|'stand'='stand')=>{const r=ensureElevenWaves(room);for(const id of Object.keys(r.hands).filter(id=>!r.stopped.includes(id)))elevenWaveChoice(room,id,choice);elevenWaveSpeech(room,speeches);};
function replaceHands(round:ElevenRound,hands:Record<string,string[]>){round.hands=hands;round.deck=cards.filter(c=>!Object.values(hands).flat().includes(c));}
it('starts all hands together and locks choices without dealing or settling before the speech barrier',()=>{
 const {room,round}=fixture();expect(round.flow).toBe('waves-v1');expect(round.turn).toBe('');expect(round.waves).toEqual([{number:1,choices:{},speeches:[],status:'deciding'}]);
 const before=JSON.stringify({hands:round.hands,deck:round.deck,drunk:room.drunk});for(const id of ['player','a','b'])elevenWaveChoice(room,id,'stand');
 expect(JSON.stringify({hands:round.hands,deck:round.deck,drunk:room.drunk})).toBe(before);expect(round.phase).toBe('playing');expect(()=>advanceElevenWave(room)).toThrow();expect(()=>elevenAct(room,'player','stand')).toThrow();
 expect(()=>elevenWaveChoice(room,'a','hit')).toThrow();expect(()=>elevenWaveSpeech(room,[speeches[0]])).toThrow();elevenWaveSpeech(room,speeches);expect(round.waves![0].status).toBe('ready');
});
it('deals one hit per fixed member order at once and freezes stopped hands in later waves',()=>{
 const {room,round}=fixture();replaceHands(round,{player:['S-A'],a:['H-A'],b:['C-A']});const deck=[...round.deck];
 elevenWaveChoice(room,'a','stand');elevenWaveChoice(room,'player','hit');elevenWaveChoice(room,'b','hit');elevenWaveSpeech(room,speeches);advanceElevenWave(room);
 expect(round.hands.player).toEqual(['S-A',deck.at(-1)]);expect(round.hands.a).toEqual(['H-A']);expect(round.hands.b).toEqual(['C-A',deck.at(-2)]);expect(round.stopped).toContain('a');expect(round.waves![0].status).toBe('dealt');
 expect(()=>elevenWaveChoice(room,'a','hit')).toThrow();locked(room);advanceElevenWave(room);expect(round.hands.a).toEqual(['H-A']);expect(round.phase).toBe('complete');expect(validatePartyRooms([room])).toEqual([room]);
});
it('accepts speech before the last choice and still requires every NPC including stopped NPCs',()=>{
 const {room,round}=fixture();elevenWaveSpeech(room,speeches);expect(round.waves![0].status).toBe('deciding');for(const id of ['a','b','player'])elevenWaveChoice(room,id,'stand');expect(round.waves![0].status).toBe('ready');expect(validatePartyRooms([room])).toEqual([room]);
});
it('adopts legacy unfinished hands without redrawing or copying legacy replies into public waves',()=>{
 const {room,round}=fixture();delete round.flow;delete round.waves;round.turn='a';round.stopped=['player'];replaceHands(round,{player:['S-A','S-2'],a:['H-A','H-2'],b:['C-A']});round.replies=[{id:'a',text:'旧局私有发言'}];
 const before=JSON.stringify({hands:round.hands,deck:round.deck,drunk:room.drunk});expect(ensureElevenWaves(room)).toBe(round);expect(JSON.stringify({hands:round.hands,deck:round.deck,drunk:room.drunk})).toBe(before);expect(round.waves![0].speeches).toEqual([]);expect(round.replies![0].text).toBe('旧局私有发言');expect(validatePartyRooms([room])).toEqual([room]);locked(room);advanceElevenWave(room);expect(round.phase).toBe('complete');
 delete round.flow;delete round.waves;const completed=JSON.stringify(round);ensureElevenWaves(room);expect(JSON.stringify(round)).toBe(completed);
});
it('a persisted ready wave resumes once and an all-stand final wave settles exactly once',()=>{
 const {room}=fixture();locked(room);const persisted=JSON.stringify(room),resumed=JSON.parse(persisted) as PartyRoom;validatePartyRooms([resumed]);const round=advanceElevenWave(resumed);expect(round.phase).toBe('complete');expect(Object.values(resumed.drunk).reduce((a,b)=>a+b,0)).toBe(2);const result=JSON.stringify(resumed);expect(()=>advanceElevenWave(resumed)).toThrow();expect(JSON.stringify(resumed)).toBe(result);expect(JSON.stringify(room)).toBe(persisted);
});
it('the final unified deal automatically stops five-card, eleven and bust hands and settles without another wave',()=>{
 const {room,round}=fixture();delete round.flow;delete round.waves;round.turn='a';replaceHands(round,{player:['S-2','H-2','C-2','D-2'],a:['S-10','H-J'],b:['C-10']});
 // pop order player, a, b: a reaches 11.5 and b busts; the migrated player reaches five cards.
 const next=['D-K','H-A','D-10'];round.deck=[...round.deck.filter(c=>!next.includes(c)),...next.reverse()];ensureElevenWaves(room);locked(room,'hit');advanceElevenWave(room);
 expect(round.phase).toBe('complete');expect(round.waves).toHaveLength(1);expect(round.stopped).toHaveLength(3);expect(validatePartyRooms([room])).toEqual([room]);
});
it('keeps a locked player message through a failed speech request and rejects speech that rewrites it',()=>{
 const {room,round}=fixture();round.waves![0].playerText='我先看看。';elevenWaveChoice(room,'player','stand');const restored=JSON.parse(JSON.stringify(room)) as PartyRoom;validatePartyRooms([restored]);
 expect(ensureElevenWaves(restored).waves![0].playerText).toBe('我先看看。');
 expect(()=>elevenWaveSpeech(restored,[...speeches,{id:'player',text:'改写'}])).toThrow();elevenWaveSpeech(restored,[...speeches,{id:'player',text:'我先看看。'}]);
 for(const id of ['a','b'])elevenWaveChoice(restored,id,'stand');expect(validatePartyRooms([restored])).toEqual([restored]);
 const malformed=JSON.parse(JSON.stringify(room));malformed.rounds[0].waves[0].playerText='字'.repeat(501);expect(()=>validatePartyRooms([malformed])).toThrow();
});
it('rejects unknown wave versions, keys, missing speech and malformed histories without rejecting valid legacy rounds',()=>{
 const {room,round}=fixture();expect(validatePartyRooms([room])).toEqual([room]);const bad=(mutate:(r:any)=>void)=>{const r=JSON.parse(JSON.stringify(room));mutate(r.rounds[0]);expect(()=>validatePartyRooms([r])).toThrow();};
 bad(r=>r.flow='waves-v2');bad(r=>r.turn='player');bad(r=>r.waves[0].choices.ghost='hit');bad(r=>r.waves[0].speeches=[{id:'a',text:'一句'}]);bad(r=>r.waves[0].status='ready');bad(r=>r.waves[0].extra=true);bad(r=>r.waves.push({...r.waves[0],number:2}));bad(r=>r.waves=undefined);
 delete round.flow;delete round.waves;round.turn=['player','a','b'].filter(id=>id!==round.banker)[0];const ids=['player','a','b'],i=ids.indexOf(round.banker);round.turn=[...ids.slice(i+1),...ids.slice(0,i),round.banker][0];expect(validatePartyRooms([room])).toEqual([room]);
});
