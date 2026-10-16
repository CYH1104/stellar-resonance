export interface PanelSize {width?:number;height?:number}
export interface WorkspaceLayout {left?:number;right?:number;panels:Record<string,PanelSize>}
export const defaultLayout=():WorkspaceLayout=>({panels:{}});
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function cleanLayout(value:unknown):WorkspaceLayout{
  if(!value||typeof value!=='object'||Array.isArray(value))return defaultLayout();
  const v=value as WorkspaceLayout,result=defaultLayout();
  for(const key of ['left','right'] as const)if(typeof v[key]==='number'&&Number.isFinite(v[key]))result[key]=Math.round(clamp(v[key],200,800));
  if(v.panels&&typeof v.panels==='object'&&!Array.isArray(v.panels))for(const [key,size] of Object.entries(v.panels).slice(0,100)){
    if(!/^(?:player|char-[\w-]{1,100}|theater-[1-4])$/.test(key)||!size||typeof size!=='object')continue;
    const out:PanelSize={};for(const dim of ['width','height'] as const){const n=size[dim];if(typeof n==='number'&&Number.isFinite(n))out[dim]=Math.round(clamp(n,dim==='width'?180:140,dim==='width'?1600:2000));}if(Object.keys(out).length)result.panels[key]=out;
  }
  return result;
}
/** Narrow screens temporarily fit saved widths without destroying the desktop layout. */
export function fitColumns(layout:WorkspaceLayout,width:number,showRight=width>=1100){
  const available=Math.max(0,width-32-(showRight?20:10)),minimumLeft=200,minimumRight=showRight?240:0;
  let left=clamp(layout.left??width*.18,minimumLeft,Math.min(800,Math.max(minimumLeft,available-320-minimumRight)));
  let right=showRight?clamp(layout.right??width*.23,minimumRight,Math.min(800,Math.max(minimumRight,available-320-minimumLeft))):0;
  const room=Math.max(0,available-320-minimumLeft-minimumRight),extra=Math.max(0,left-minimumLeft)+Math.max(0,right-minimumRight);
  if(extra>room){const ratio=room/extra;left=minimumLeft+(left-minimumLeft)*ratio;right=minimumRight+(right-minimumRight)*ratio;}
  return {left:Math.round(left),right:Math.round(right),available};
}
export function resizeColumn(layout:WorkspaceLayout,width:number,side:'left'|'right',delta:number,showRight=width>=1100){
  const fit=fitColumns(layout,width,showRight),other=side==='left'?fit.right:fit.left,min=side==='left'?200:240;
  return Math.round(clamp(fit[side]+delta,min,Math.max(min,Math.min(800,fit.available-other-320))));
}
export function resizePanel(size:PanelSize,dx:number,dy:number,current:{width:number;height:number},parentWidth:number):PanelSize{
  const maxWidth=Math.min(1600,Math.max(0,parentWidth));
  return {...size,...(dx?{width:Math.round(clamp(current.width+dx,Math.min(180,maxWidth),maxWidth))}:{}),...(dy?{height:Math.round(clamp(current.height+dy,140,2000))}:{})};
}
