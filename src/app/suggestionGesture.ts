interface Pointer {pointerId:number;clientX:number;clientY:number;button:number;isPrimary:boolean}
/** Long press never sends; the browser's subsequent click is consumed once. */
export function suggestionGesture(actions:{enabled:()=>boolean;send:()=>void;edit:()=>void},delay=550){
  let pointer:Pointer|undefined,timer:ReturnType<typeof setTimeout>|undefined,blockClick=false;
  const clear=()=>{if(timer!==undefined)clearTimeout(timer);timer=undefined;};
  function cancel(){if(!pointer)return;clear();pointer=undefined;blockClick=true;}
  function down(e:Pointer){
    if(!e.isPrimary){cancel();return;}
    if(e.button!==0||!actions.enabled())return;
    clear();blockClick=false;pointer={...e};
    timer=setTimeout(()=>{timer=undefined;if(pointer&&actions.enabled()){blockClick=true;actions.edit();}},delay);
  }
  function move(e:Pick<Pointer,'pointerId'|'clientX'|'clientY'>){if(pointer?.pointerId===e.pointerId&&Math.hypot(e.clientX-pointer.clientX,e.clientY-pointer.clientY)>10)cancel();}
  function up(e:Pick<Pointer,'pointerId'>){if(pointer?.pointerId===e.pointerId){clear();pointer=undefined;}}
  function click(){clear();pointer=undefined;if(blockClick){blockClick=false;return;}if(actions.enabled())actions.send();}
  function edit(){cancel();if(actions.enabled())actions.edit();}
  function dispose(){clear();pointer=undefined;blockClick=true;}
  return {down,move,up,click,cancel,edit,dispose};
}
