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
