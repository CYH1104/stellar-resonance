import {describe,it,expect} from 'vitest';
import {landlordSoundSnapshot,mahjongSoundEvents,TableSoundCursor,TableIdleSound} from '../src/domain/tableSoundEvents';
import type {LandlordRound,LandlordMove} from '../src/domain/landlord';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import TableSoundToggle from '../src/components/TableSoundToggle.vue';
const round=(moves:LandlordMove[]=[]):LandlordRound=>({kind:'landlord',rulesVersion:2,number:1,participants:['player','a','b'],starter:'player',initialHands:{player:['S-3'],a:[],b:[]},hands:{player:['S-3'],a:[],b:[]},bottom:[],openingScores:{player:10000,a:10000,b:10000},highestBid:0,passes:0,multiplier:1,phase:'playing',turn:'player',moves});
const play=(cards:string[],id='player'):LandlordMove=>({kind:'play',cards,id});
it('announces actual patterns, only uses beat on a high reply, and resets after two passes',()=>{
 expect(landlordSoundSnapshot(round([play(['BJ','RJ'])])).events[0].sounds).toEqual(['card-drop','rocket']);
 expect(landlordSoundSnapshot(round([play(['S-3','H-3','D-3','S-4'])])).events[0].sounds).toEqual(['card-drop','triple-single']);
 const opening=play(['S-A'],'a'),reply=play(['S-2']);
 expect(landlordSoundSnapshot(round([reply])).events[0].sounds).toEqual(['card-drop','single-15']);
 expect(landlordSoundSnapshot(round([opening,reply])).events[1].sounds).toEqual(['card-drop','beat']);
 const moves:LandlordMove[]=[opening,{kind:'pass',id:'player'},{kind:'pass',id:'b'},play(['S-2'],'a')];
 expect(landlordSoundSnapshot(round(moves)).events[3].sounds).toEqual(['card-drop','single-15']);
});
it('does not replay initial, duplicated, replaced, reopened or rolled back history',()=>{
 const cursor=new TableSoundCursor(),r=round([play(['S-3'])]);
 expect(cursor.observe(landlordSoundSnapshot(r)).events).toEqual([]);
 r.moves.push(play(['S-4'],'a'));
 expect(cursor.observe(landlordSoundSnapshot(r)).events).toHaveLength(1);
 expect(cursor.observe(landlordSoundSnapshot(structuredClone(r))).events).toEqual([]);
 r.moves[0]=play(['H-3']);
 expect(cursor.observe(landlordSoundSnapshot(r)).reset).toBe(true);
 r.moves=[];expect(cursor.observe(landlordSoundSnapshot(r)).events).toEqual([]);
 r.number++;expect(cursor.observe(landlordSoundSnapshot(r)).events).toEqual([]);
 cursor.reset();r.moves.push(play(['S-5']));expect(cursor.observe(landlordSoundSnapshot(r)).events).toEqual([]);
});
it('mahjong uses resolved engine log: discards, red-five pon, chi, kan, ron and tsumo',()=>{
 const events=mahjongSoundEvents([{qipai:{}},{dapai:{l:0,p:'s5*'}},{fulou:{l:1,m:'m505+'}},{fulou:{l:2,m:'p234-'}},{fulou:{l:3,m:'z1111+'}},{gang:{l:0,m:'s7777'}},{hule:{l:2,baojia:0}},{hule:{l:3,baojia:null}}]);
 expect(events.map(e=>e.sounds)).toEqual([['tile-drop','riichi'],['pon'],['chi'],['kan'],['kan'],['ron'],['tsumo']]);
 expect(new Set(events.map(e=>e.key)).size).toBe(events.length);
});
it('waiting starts at 25 seconds, has a 45 second cooldown, stops after two, and resets on busy/hidden/turn change',()=>{
 const idle=new TableIdleSound();
 expect(idle.update('turn',0,true,false)).toBe(false);
 expect(idle.update('turn',24999,true,false)).toBe(false);
 expect(idle.update('turn',25000,true,false)).toBe(true);
 expect(idle.update('turn',69999,true,false)).toBe(false);
 expect(idle.update('turn',70000,true,false)).toBe(true);
 expect(idle.update('turn',900000,true,false)).toBe(false);
 for(const [enabled,busy] of [[false,false],[true,true]]){
  idle.update('turn',900001,enabled,busy);
  expect(idle.update('turn',990001,true,false)).toBe(false);
 }
 expect(idle.update('new-turn',1200000,true,false)).toBe(false);
 expect(idle.update(undefined,1900000,true,false)).toBe(false);
});
it('speaker is an accessible toggle with distinct visible icon states',async()=>{
 const on=await renderToString(createSSRApp(TableSoundToggle,{enabled:true}));
 const off=await renderToString(createSSRApp(TableSoundToggle,{enabled:false}));
 expect(on).toContain('aria-label="关闭音效"');expect(on).toContain('aria-pressed="true"');
 expect(off).toContain('aria-label="打开音效"');expect(off).toContain('aria-pressed="false"');
 expect(on).not.toEqual(off);expect(on).toContain('<svg');
});
