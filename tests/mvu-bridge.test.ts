import {it,expect} from 'vitest';
import {reactive,nextTick} from 'vue';
import {installMvuBridge} from '../src/app/mvuBridge';
import type {ViewModel} from '../src/app/useWorkspace';
import {newSession,stateAt,finishVariant,parseBackup,backup,defaults} from '../src/domain/story';
import {renderMvuMacros,type MvuData} from '../src/domain/mvu';

it('helper reads copies, persists only the addressed session/message, and restores bindings',async()=>{
  const a=newSession('A',{name:'A',appearance:'',personality:'',background:''},'A'),b=newSession('B',{name:'B',appearance:'',personality:'',background:''},'B');
  a.turns.push({id:'t',input:'hello',selected:0,variants:[{id:'v',text:'reply',createdAt:'',status:'incomplete'}]});finishVariant(a,0,a.turns[0].variants[0],{event:'event'});
  let saves=0;const store=reactive({sessions:[a,b],sessionId:a.id,get active(){return this.sessions.find(s=>s.id===this.sessionId);},get state(){return this.active?stateAt(this.active):undefined;},save:async()=>{saves++;},busy:false,creatingGame:false,workingMemory:false,workingPersona:false});
  const host={} as Window,dispose=installMvuBridge(store as unknown as ViewModel,host);
  const api=(host as unknown as {Mvu:{getMvuData:(options?:unknown)=>MvuData;parseMessage:(message:string,old:MvuData)=>Promise<MvuData>;replaceMvuData:(data:MvuData,options?:unknown)=>Promise<void>}}).Mvu;
  const old=api.getMvuData(),updated=await api.parseMessage("_.set('custom.label', 'saved');",old);expect(old.stat_data.custom).toEqual({});await api.replaceMvuData(updated,{type:'message',message_id:2});expect(saves).toBe(1);expect(store.state?.variables?.label).toBe('saved');
  const restored=parseBackup(backup({version:1,sessions:store.sessions,preferences:defaults()}));expect(stateAt(restored.sessions[0]).variables?.label).toBe('saved');
  expect(api.getMvuData({type:'message',message_id:1}).stat_data.custom).toEqual({});store.sessionId=b.id;await nextTick();expect(api.getMvuData().stat_data.custom).toEqual({});expect(()=>api.getMvuData({type:'global'})).toThrow();expect(()=>api.getMvuData({type:'message',message_id:99})).toThrow();
  expect(renderMvuMacros('{{get_message_variable::stat_data.custom.label}} / {{getvar::stat_data.custom}}',updated)).toBe('saved / {"label":"saved"}');
  dispose();expect((host as unknown as Record<string,unknown>).Mvu).toBeUndefined();
});
