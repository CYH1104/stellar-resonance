import {afterEach,expect,it,vi} from 'vitest';
import {effectScope,shallowRef} from 'vue';
import {useFloatingDrag} from '../src/app/useFloatingDrag';
import {saveOnLeave} from '../src/app/saveOnLeave';
afterEach(()=>vi.unstubAllGlobals());
it('drags with pointer capture, clamps inside the viewport and suppresses click after dragging',()=>{
 const win=Object.assign(new EventTarget(),{innerWidth:1000,innerHeight:800});vi.stubGlobal('window',win);
 const scope=effectScope(),el={getBoundingClientRect:()=>({left:300,top:100,width:400,height:600}),setPointerCapture:vi.fn()};
 const drag=scope.run(()=>useFloatingDrag(shallowRef(el as unknown as HTMLElement)))!;
 const event={button:0,isPrimary:true,pointerId:1,clientX:300,clientY:100,target:{closest:()=>null},currentTarget:el,preventDefault:vi.fn()} as unknown as PointerEvent;
 drag.down(event);expect(el.setPointerCapture).toHaveBeenCalledWith(1);
 drag.move({...event,clientX:1000,clientY:800});expect(drag.style.value.transform).toBe('translate(300px,100px)');
 drag.end();const click={preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()};drag.click(click as unknown as MouseEvent);expect(click.preventDefault).toHaveBeenCalledOnce();
 win.dispatchEvent(new Event('resize'));expect(drag.style.value.transform).toBe('translate(0px,0px)');scope.stop();
});
it('does not start dragging from header buttons',()=>{
 const scope=effectScope(),el={setPointerCapture:vi.fn()};
 const drag=scope.run(()=>useFloatingDrag(shallowRef(el as unknown as HTMLElement)))!;
 drag.down({button:0,isPrimary:true,target:{closest:()=>({})}} as unknown as PointerEvent);
 expect(el.setPointerCapture).not.toHaveBeenCalled();expect(drag.dragging.value).toBe(false);scope.stop();
});
it('flushes pending changes on page hide, backgrounding and disposal, and removes listeners',()=>{
 const win=new EventTarget(),doc=Object.assign(new EventTarget(),{visibilityState:'visible'});vi.stubGlobal('window',win);vi.stubGlobal('document',doc);
 const scope=effectScope(),flush=vi.fn();scope.run(()=>saveOnLeave(flush));
 doc.dispatchEvent(new Event('visibilitychange'));expect(flush).not.toHaveBeenCalled();
 doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'));win.dispatchEvent(new Event('pagehide'));expect(flush).toHaveBeenCalledTimes(2);
 scope.stop();expect(flush).toHaveBeenCalledTimes(3);win.dispatchEvent(new Event('pagehide'));expect(flush).toHaveBeenCalledTimes(3);
});
