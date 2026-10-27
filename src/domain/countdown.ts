/** Local countdown driver for the daily sign.
 *
 * The remaining time is always derived from an absolute deadline, so a throttled or
 * suspended tab cannot drift. The ticker only runs while the caller says it is visible,
 * never writes a save, never checks the date and never calls a model. Reaching zero
 * triggers one calibration callback; it does not loop.
 */
export interface CountdownTick {remaining:number;text:string}
export const countdownText=(remaining:number)=>[Math.floor(remaining/3600),Math.floor(remaining%3600/60),remaining%60].map(n=>String(Math.max(0,n)).padStart(2,'0')).join(':');
export function createCountdown(options:{
 deadline:()=>number;
 running:()=>boolean;
 now?:()=>number;
 onTick:(value:CountdownTick)=>void;
 onExpire:()=>void;
 setInterval?:(handler:()=>void,ms:number)=>unknown;
 clearInterval?:(id:unknown)=>void;
}){
 const now=options.now??(()=>Date.now());
 const set=options.setInterval??((handler,ms)=>setInterval(handler,ms));
 const clear=options.clearInterval??((id)=>clearInterval(id as ReturnType<typeof setInterval>));
 let timer:unknown;let fired=false;
 const stop=()=>{if(timer!==undefined){clear(timer);timer=undefined;}};
 const tick=()=>{
  const remaining=Math.max(0,Math.ceil((options.deadline()-now())/1000));
  options.onTick({remaining,text:countdownText(remaining)});
  if(remaining===0&&!fired){fired=true;options.onExpire();}
 };
 const start=()=>{stop();if(!options.running())return;tick();timer=set(tick,1000);};
 return {start,stop,restart(){fired=false;start();}};
}
