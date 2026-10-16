import {computed,onBeforeUnmount,onMounted,ref,watch,type Ref} from 'vue';
import type {Preferences} from '../domain/contracts';
import {defaultLayout,fitColumns,resizeColumn} from '../domain/layout';
export function useWorkspaceLayout(preferences:Preferences,element:Ref<HTMLElement|undefined>,showRight:()=>boolean){
  const width=ref(1440);let observer:ResizeObserver|undefined;
  const measure=()=>{if(element.value)width.value=element.value.clientWidth;};
  onMounted(()=>{observer=new ResizeObserver(measure);if(element.value)observer.observe(element.value);measure();});
  watch(element,(el,old)=>{if(old)observer?.unobserve(old);if(el){observer?.observe(el);measure();}});
  onBeforeUnmount(()=>observer?.disconnect());
  const fitted=computed(()=>fitColumns(preferences.layout||defaultLayout(),width.value,width.value>=1100&&showRight()));
  const style=computed(()=>({'--left-width':fitted.value.left+'px','--right-width':fitted.value.right+'px'}));
  function resize(side:'left'|'right',dx:number){const layout=preferences.layout||=(defaultLayout());layout[side]=resizeColumn(layout,width.value,side,side==='right'?-dx:dx,width.value>=1100&&showRight());}
  function reset(){preferences.layout=defaultLayout();}
  return {style,resize,reset};
}
