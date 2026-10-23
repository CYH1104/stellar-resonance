import {afterEach,expect,it,vi} from 'vitest';
import {createRenderer,h} from 'vue';
import {nextTerminalCourse} from '../src/domain/terminalSchedule';
import {useDeviceClock} from '../src/app/useDeviceClock';
afterEach(()=>vi.useRealTimers());
const course=(id:string,day:number,time:string)=>({id,day,time});
it('finds the next class from the full schedule, including tomorrow and Sunday rollover',()=>{
 const courses=[course('past',1,'08:00'),course('tomorrow',2,'09:00')];
 expect(nextTerminalCourse(courses,{day:1,time:'10:00'})?.id).toBe('tomorrow');
 expect(nextTerminalCourse(courses,{day:7,time:'23:00'})?.id).toBe('past');
 expect(courses.map(c=>c.id)).toEqual(['past','tomorrow']);
});
it('orders today by start time, includes the exact start, and handles unknown story time',()=>{
 const courses=[course('late',3,'14:00'),course('early',3,'08:00')];
 expect(nextTerminalCourse(courses,{day:3,time:'08:00'})?.id).toBe('early');
 expect(nextTerminalCourse(courses,{day:3,time:'09:00'})?.id).toBe('late');
 expect(nextTerminalCourse(courses,{day:3,time:'— : —'})?.id).toBe('early');
 expect(nextTerminalCourse([],{day:0,time:''})).toBeUndefined();
});
it('updates the device clock across midnight and releases its timer when unmounted',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(2026,9,24,23,59,59));
 const renderer=createRenderer<any,any>({createElement:()=>({}),insert:()=>{},remove:()=>{},setElementText:()=>{},createText:()=>({}),setText:()=>{},createComment:()=>({}),parentNode:()=>null,nextSibling:()=>null,patchProp:()=>{}});
 let clock!:ReturnType<typeof useDeviceClock>;
 const app=renderer.createApp({setup(){clock=useDeviceClock();return()=>h('div');}});app.mount({});
 expect(clock.value.time).toBe('23:59');vi.advanceTimersByTime(1000);expect(clock.value.time).toBe('00:00');expect(clock.value.label).toContain('25');
 app.unmount();expect(vi.getTimerCount()).toBe(0);
});

import {reactive,createSSRApp} from 'vue';import {renderToString} from 'vue/server-renderer';import {usePersonalTerminal} from '../src/app/usePersonalTerminal';import {newSession,defaults} from '../src/domain/story';import type {ViewModel} from '../src/app/useWorkspace';
it('terminal desktop and header share story time, independent of real clock and reactive to save changes',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(2026,9,24,2,34));
 const s=newSession('剧情时间',{name:'我',appearance:'',personality:'',background:''},'');s.initial.variables={时间地点:{日期:'星历327年9月1日',时间:'08:35',地点:'破军系新生报到处'}};
 const w=reactive({active:s,state:s.initial,preferences:defaults(),credentials:{},loading:true,busy:false,theaters:[],terminalBusy:false,storageStatus:'saved',save:async()=>{}}) as unknown as ViewModel;
 let u!:ReturnType<typeof usePersonalTerminal>;await renderToString(createSSRApp({setup(){u=usePersonalTerminal(w);return()=>null;}}));
 expect(u.clock.value).toEqual(u.storyClock.value);expect(u.clock.value.time).toBe('08:35');expect(u.clock.value.label).toBe('星历327年9月1日');
 vi.advanceTimersByTime(3600000);expect(u.clock.value.time).toBe('08:35');
 w.state!.variables={时间地点:{日期:'星历327年9月2日',时间:'14:00',地点:'训练场'}};expect(u.clock.value.time).toBe('14:00');expect(u.clock.value.label).toContain('9月2日');
 const other=newSession('另一存档',{name:'我',appearance:'',personality:'',background:''},'');w.active=other;w.state=other.initial;expect(u.clock.value.time).toBe('— : —');expect(u.clock.value.label).toBe('剧情日期待明确');
});

