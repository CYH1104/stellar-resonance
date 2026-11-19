import {it,expect} from 'vitest';
import {cards,cardLabel,cardCode,handRank,compareHands,createPartyRoom,partyParticipants,startPartyRound,elevenAct,chooseTruth,finishTruth,settlePartyEnd,endPartyRoom,validatePartyRooms,truthCards,type PartyRoom,type ElevenRound,type TruthRound} from '../src/domain/partyGames';
function room(kind:'eleven'|'truth'='eleven'){const r=createPartyRoom(kind,['a','b'],'聚会','轻松','room');r.invitations={a:'accepted',b:'accepted'};return r;}
function customHands(r:PartyRoom,hands:Record<string,string[]>){r.bankerOrder=['player','a','b'];r.bankerIndex=0;const round=startPartyRound(r,undefined,()=>0) as ElevenRound;round.hands=hands;round.deck=cards.filter(c=>!Object.values(hands).flat().includes(c));round.stopped=[];round.turn='a';return legacy(round);}
function legacy(r:ElevenRound){delete r.flow;delete r.waves;r.turn=Object.keys(r.hands).find(id=>id!==r.banker)||r.banker;return r;}
function standAll(r:PartyRoom){let round=r.rounds.at(-1) as ElevenRound;while(round.phase==='playing')elevenAct(r,round.turn,'stand');return round;}
it('uses exact half-points and the agreed hierarchy and eleven suit counts',()=>{
 expect(cards).toHaveLength(52);expect(new Set(cards).size).toBe(52);expect(cardLabel(cardCode('S','A'))).toBe('♠A');
 expect(handRank(['S-J','H-Q','C-K']).halfPoints).toBe(3);
 const flower=['S-J','S-Q','S-K','H-J','H-Q'],five=['S-A','H-A','C-A','D-A','D-J'],eleven=['S-10','S-A','H-J'];
 expect(compareHands(flower,five)).toBeGreaterThan(0);expect(compareHands(five,eleven)).toBeGreaterThan(0);expect(compareHands(eleven,['S-10','H-A'])).toBeGreaterThan(0);
 expect(compareHands(['S-10','S-A','H-J'],['H-10','H-A','S-J'])).toBeGreaterThan(0);
 expect(compareHands(['S-10','H-A','C-J'],['S-9','H-2','C-Q'])).toBeGreaterThan(0);
 expect(handRank(['S-10','H-2']).kind).toBe('bust');expect(()=>handRank(['S-A','S-A'])).toThrow();
});
it('locks the deal, partitions the deck and acts in seat order with banker last',()=>{
 const r=room(),anchor={key:'key',turnId:'t',variantId:'v',path:['t:v']};r.bankerOrder=['player','a','b'];r.bankerIndex=0;
 const first=legacy(startPartyRound(r,anchor,n=>n-1) as ElevenRound);expect(first.turn).toBe('a');expect(first.deck).toHaveLength(49);expect(new Set([...first.deck,...Object.values(first.hands).flat()]).size).toBe(52);
 anchor.path.push('changed');expect(first.anchor!.path).toEqual(['t:v']);const saved=JSON.stringify(r);expect(()=>startPartyRound(r)).toThrow();expect(JSON.stringify(r)).toBe(saved);
 const restored=JSON.parse(saved);validatePartyRooms([restored]);expect(restored.rounds[0]).toEqual(first);
 expect(()=>elevenAct(r,'player','hit')).toThrow();elevenAct(r,'a','stand');expect(first.turn).toBe('b');
});
it('settles one global winner, penalizes all losers once and keeps or advances banker',()=>{
 const r=room();customHands(r,{player:['S-10'],a:['H-9'],b:['C-8']});const first=standAll(r);expect(first.winner).toBe('player');expect(r.bankerIndex).toBe(0);expect(r.drunk).toEqual({player:0,a:1,b:1});
 const snapshot=JSON.stringify(r);expect(()=>elevenAct(r,'player','stand')).toThrow();expect(JSON.stringify(r)).toBe(snapshot);
 customHands(r,{player:['S-8'],a:['H-10'],b:['C-9']});standAll(r);expect(r.bankerIndex).toBe(1);expect(r.drunk).toEqual({player:1,a:1,b:2});
});
it('keeps exact maximum-card ties on banker/seat priority and gives no winner when everyone busts',()=>{
 const r=room();customHands(r,{player:['S-10'],a:['H-10'],b:['C-10']});expect(standAll(r).winner).toBe('player');
 const tied=room();customHands(tied,{player:['S-8'],a:['H-10'],b:['C-10']});expect(standAll(tied).winner).toBe('a');
 const x=room();const allBust=customHands(x,{player:['S-10','H-10'],a:['C-9','D-9'],b:['S-8','C-8']});while(allBust.phase==='playing')elevenAct(x,allBust.turn,'stand');expect(allBust.outcome).toBe('all-bust');expect(allBust.winner).toBeUndefined();expect(x.drunk).toEqual({player:1,a:1,b:1});expect(x.bankerIndex).toBe(0);expect(validatePartyRooms([x])).toEqual([x]);
 const y=room();customHands(y,{player:['S-A','H-9'],a:['C-10','D-8'],b:['S-9','H-8']});expect(standAll(y).winner).toBe('player');expect(y.drunk).toEqual({player:0,a:1,b:1});
});
it('automatically stops at eleven and at five cards and completes the banker rotation',()=>{
 const r=room();const round=customHands(r,{player:['D-2'],a:['S-10','H-A'],b:['C-2']});round.deck=round.deck.filter(c=>c!=='S-J');round.deck.push('S-J');elevenAct(r,'a','hit');expect(round.stopped).toContain('a');expect(round.turn).toBe('b');
 const fiveRoom=room();const fiveRound=customHands(fiveRoom,{player:['D-2'],a:['S-A','H-A','C-A','D-A'],b:['C-2']});fiveRound.deck=fiveRound.deck.filter(c=>c!=='S-J');fiveRound.deck.push('S-J');elevenAct(fiveRoom,'a','hit');expect(fiveRound.hands.a).toHaveLength(5);expect(fiveRound.stopped).toContain('a');expect(()=>elevenAct(fiveRoom,'a','hit')).toThrow();
 const z=room();customHands(z,{player:['S-2'],a:['H-3'],b:['C-4']});z.bankerIndex=2;z.bankerOrder=['a','b','player'];expect(standAll(z).winner).toBe('b');expect(z.endReason).toBe('bankers-complete');expect(z.endedAt).toBeTruthy();expect(()=>startPartyRound(z)).toThrow();
});
it('spins fairly over accepted participants and draws ten distinct paired cards',()=>{
 const r=room('truth');let seenMax=0;for(let i=0;i<10;i++){const round=startPartyRound(r,undefined,n=>{seenMax=Math.max(seenMax,n);return n-1;}) as TruthRound;expect(round.target).toBe('b');chooseTruth(r,'b',i%2?'dare':'truth');finishTruth(r,'b','本轮回应',false);}
 expect(truthCards.length).toBeGreaterThanOrEqual(20);expect(new Set(r.rounds.map(round=>(round as TruthRound).card.id)).size).toBe(10);expect(seenMax).toBeGreaterThanOrEqual(20);expect(r.endReason).toBe('round-limit');validatePartyRooms([r]);
});
it('locks bottle, card and selection through refresh and refused challenge counts once',()=>{
 const r=room('truth');const round=startPartyRound(r,undefined,()=>0) as TruthRound;const before=JSON.stringify(r);expect(()=>startPartyRound(r)).toThrow();expect(JSON.stringify(r)).toBe(before);
 const restored=JSON.parse(before) as PartyRoom;chooseTruth(restored,round.target,'truth');expect(()=>chooseTruth(restored,round.target,'dare')).toThrow();finishTruth(restored,round.target,'不回答，接受罚酒。',true);expect(restored.drunk[round.target]).toBe(1);expect(()=>finishTruth(restored,round.target,'重试',true)).toThrow();expect(restored.drunk[round.target]).toBe(1);
});
it('drunk end takes priority over normal ending and creates scoped afterparties without double penalties',()=>{
 const r=room('truth');for(let i=0;i<10;i++){const round=startPartyRound(r,undefined,()=>0) as TruthRound;chooseTruth(r,round.target,'truth');finishTruth(r,round.target,'拒绝',true);}expect(r.endReason).toBe('round-limit');
 settlePartyEnd(r,{player:10,a:4,b:4});expect(r.endReason).toBe('drunk');expect(r.afterparty!.scenes).toEqual([{actorId:'player',status:'pending',participants:['player','a']}]);const saved=JSON.stringify(r);settlePartyEnd(r,{player:10,a:4,b:4});expect(JSON.stringify(r)).toBe(saved);validatePartyRooms([r]);
 const x=room();x.drunk.a=1;x.drunk.b=2;settlePartyEnd(x,{player:5,a:1,b:2});expect(x.afterparty!.scenes!.map(s=>s.participants)).toEqual([['player','a'],['player','b']]);
 const manual=room();endPartyRoom(manual);settlePartyEnd(manual,{player:1,a:1,b:1});expect(manual.endReason).toBe('manual');expect(manual.afterparty).toBeUndefined();
});
it('rejects unknown versions/keys, invalid phases, actors, deck partitions, text and afterparties',()=>{
 const base=room();startPartyRound(base,undefined,()=>0);
 const cases=[(r:any)=>r.version=2,(r:any)=>r.secret=true,(r:any)=>r.members.push('a'),(r:any)=>r.invitations.stranger='accepted',(r:any)=>r.drunk.a=-1,(r:any)=>r.rounds[0].phase='done',(r:any)=>r.rounds[0].deck[0]=r.rounds[0].deck[1],(r:any)=>r.rounds[0].hands.a.push(...cards.slice(0,6)),(r:any)=>r.rounds[0].turn='stranger',(r:any)=>r.rounds[0].anchor={key:'k',turnId:'t',variantId:'v',path:[],extra:true},(r:any)=>r.endedAt='yesterday',(r:any)=>r.rounds[0].replies=[{id:'stranger',text:'hi'}]];
 for(const mutate of cases){const r=JSON.parse(JSON.stringify(base));mutate(r);expect(()=>validatePartyRooms([r])).toThrow();}
 const truth=room('truth');startPartyRound(truth,undefined,()=>0);(truth.rounds[0] as TruthRound).choice='truth';expect(()=>validatePartyRooms([truth])).toThrow();
 const x=room();x.drunk.a=1;settlePartyEnd(x,{a:1});x.afterparty!.scenes![0]={actorId:'a',participants:['player','a'],status:'ready',text:'太短'};expect(()=>validatePartyRooms([x])).toThrow();
});
it('does not invite declined or pending members into rounds or afterparties',()=>{
 const r=createPartyRoom('truth',['a','b','c'],'房间','','r');r.invitations.a=r.invitations.b='accepted';r.invitations.c='declined';expect(partyParticipants(r)).toEqual(['player','a','b']);r.drunk.c=10;settlePartyEnd(r,{c:1});expect(r.endedAt).toBeUndefined();
 expect(()=>createPartyRoom('truth',['a'],'','','r')).toThrow();expect(()=>createPartyRoom('truth',['a','a'],'','','r')).toThrow();
});
