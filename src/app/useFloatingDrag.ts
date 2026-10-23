import {computed,onScopeDispose,ref,type Ref} from 'vue';

export function useFloatingDrag(element:Ref<HTMLElement|undefined>){
 const x=ref(0),y=ref(0),dragging=ref(false);
 let start:{id:number;x:number;y:number;left:number;top:number;width:number;height:number;dx:number;dy:number}|undefined;
 let moved=false;
 const style=computed(()=>({transform:`translate(${x.value}px,${y.value}px)`}));
 function down(e:PointerEvent){
  if(e.button!==0||!e.isPrimary||!element.value)return;
  const target=e.target as HTMLElement;
  if(target.closest?.('input,textarea,select,a,[data-no-drag]')||target.closest?.('button')&&target.closest('button')!==element.value)return;
  const r=element.value.getBoundingClientRect();
  start={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top,width:r.width,height:r.height,dx:x.value,dy:y.value};
  moved=false;dragging.value=true;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
 }
 function move(e:PointerEvent){
  if(!start||e.pointerId!==start.id)return;
  let dx=e.clientX-start.x,dy=e.clientY-start.y;
  if(Math.hypot(dx,dy)>4)moved=true;
  if(!moved)return;
  dx=Math.max(-start.left,Math.min(window.innerWidth-start.left-start.width,dx));
  dy=Math.max(-start.top,Math.min(window.innerHeight-start.top-start.height,dy));
  x.value=start.dx+dx;y.value=start.dy+dy;e.preventDefault();
 }
 function end(){start=undefined;dragging.value=false;}
 function click(e:MouseEvent){if(moved){e.preventDefault();e.stopImmediatePropagation();moved=false;}}
 function reset(){end();x.value=y.value=0;}
 if(typeof window!=='undefined'){window.addEventListener('resize',reset);onScopeDispose(()=>window.removeEventListener('resize',reset));}
 return {style,dragging,down,move,end,click};
}
