import {onMounted,onBeforeUnmount,ref} from 'vue';
/** Match the viewport breakpoints in layout.css. Hidden rails must not mount
 * their history consumers; standalone status/theater pages remain available. */
export function useRailVisibility(){
 const leftQuery=typeof window==='undefined'||!window.matchMedia?undefined:window.matchMedia('(min-width: 760px)');
 const rightQuery=typeof window==='undefined'||!window.matchMedia?undefined:window.matchMedia('(min-width: 1100px)');
 const left=ref(leftQuery?.matches??false),right=ref(rightQuery?.matches??false);
 const update=()=>{left.value=leftQuery?.matches??false;right.value=rightQuery?.matches??false;};
 onMounted(()=>{leftQuery?.addEventListener('change',update);rightQuery?.addEventListener('change',update);update();});
 onBeforeUnmount(()=>{leftQuery?.removeEventListener('change',update);rightQuery?.removeEventListener('change',update);});
 return {left,right};
}
