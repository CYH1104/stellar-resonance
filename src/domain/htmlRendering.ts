/** Explicit HTML fences and HTML markup, including messages without matching regex rules. */
export function hasRenderableHtml(text:string,embedded=false){
 const markup=/<(?:!doctype\s+html|html|body|div|span|style|script|section|article|table|details|p|img|svg|button|h[1-6])\b/i;
 return /```\s*html\b/i.test(text)||(embedded?markup.test(text):new RegExp('^\\s*'+markup.source,'i').test(text));
}
const escapeText=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function htmlMessageContent(text:string){
 const fence=/```[ \t]*html[^\n]*\r?\n([\s\S]*?)(?:```|$)/gi;
 if(!fence.test(text))return text;fence.lastIndex=0;
 let last=0,result='';
 for(const match of text.matchAll(fence)){
  const before=text.slice(last,match.index);if(before.trim())result+='<div class="academy-plain-prose">'+escapeText(before)+'</div>';
  result+=match[1];last=match.index!+match[0].length;
 }
 const after=text.slice(last);if(after.trim())result+='<div class="academy-plain-prose">'+escapeText(after)+'</div>';
 return result;
}
export interface HtmlRenderContext {variables?:unknown;messageId?:number;user?:string;char?:string}
export interface HtmlRenderTheme {color:string;background:string;scheme:'light'|'dark'}
export function readHtmlTheme(element:HTMLElement):HtmlRenderTheme{
 const color=getComputedStyle(element).color;let background='rgb(255, 250, 243)';
 for(let node:HTMLElement|null=element;node;node=node.parentElement){const value=getComputedStyle(node).backgroundColor;const parts=value.match(/[\d.]+/g)?.map(Number);if(parts&&parts.length>=3&&(parts.length<4||parts[3]>.95)){background=value;break;}}
 const rgb=background.match(/[\d.]+/g)!.map(Number);return {color,background,scheme:rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722<128?'dark':'light'};
}
const scriptData=(value:unknown)=>JSON.stringify(value??{}).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
/** Runs only inside an opaque-origin sandbox. No parent storage, credentials or mutation bridge. */
export function htmlRenderDocument(source:string,channel:string,context:HtmlRenderContext={},highlight=false,origin='',theme:HtmlRenderTheme={color:'#20242a',background:'#fffaf3',scheme:'light'},preserveLineBreaks=false){
 const vendor=origin.replace(/\/$/,'')+'/assets/';
 const runtime=`(()=>{const channel=${scriptData(channel)};let context=${scriptData(context)};const send=(kind,data)=>parent.postMessage({channel,kind,...data},'*');const clone=x=>JSON.parse(JSON.stringify(x??{}));const events=new Map();window.getVariables=()=>clone(context.variables);window.getAllVariables=window.getVariables;window.getCurrentMessageId=()=>context.messageId??0;window.getLastMessageId=window.getCurrentMessageId;window.getIframeName=()=>channel;window.eventOn=(name,fn)=>{if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);return{stop:()=>events.get(name)?.delete(fn)}};window.eventOnce=(name,fn)=>{const h=eventOn(name,(...args)=>{h.stop();fn(...args)});return h};window.tavern_events={MESSAGE_RECEIVED:'message_received',CHARACTER_MESSAGE_RENDERED:'character_message_rendered'};window.Mvu={events:{VARIABLE_INITIALIZED:'mag_variable_initialized',VARIABLE_UPDATE_ENDED:'mag_variable_update_ended'},getMvuData:window.getVariables,getCurrentMvuData:window.getVariables,getMvuVariable:(data,path,options={})=>{const v=String(path).replace(/^stat_data\\./,'').split('.').reduce((o,k)=>o?.[k],data?.stat_data);return v===undefined?options.default_value:Array.isArray(v)&&v.length===2&&typeof v[1]==='string'?v[0]:v}};window.TavernHelper={getVariables,getAllVariables,getCurrentMessageId,getLastMessageId};window.waitGlobalInitialized=async name=>{if(window[name])return;throw Error('Unsupported Tavern global: '+name)};window.errorCatched=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(e=>send('error',{message:String(e.message||e).slice(0,300)}));let queued=false;function measure(){queued=false;const height=Math.ceil(Math.max(document.body?.scrollHeight||0,document.body?.getBoundingClientRect().height||0));if(height>0)send('height',{height})}function schedule(){if(!queued){queued=true;requestAnimationFrame(measure)}}window.addEventListener('message',e=>{if(e.source!==parent||e.data?.channel!==channel||e.data.kind!=='context')return;const old=context;context=e.data.context||{};for(const fn of events.get('mag_variable_update_ended')||[])try{fn(clone(context.variables),clone(old.variables))}catch(err){send('error',{message:String(err.message||err).slice(0,300)})}schedule()});window.addEventListener('error',e=>send('error',{message:String(e.message||'External resource failed').slice(0,300)}));window.addEventListener('unhandledrejection',e=>send('error',{message:String(e.reason?.message||e.reason).slice(0,300)}));window.addEventListener('load',schedule);window.addEventListener('resize',schedule);document.addEventListener('DOMContentLoaded',()=>{new ResizeObserver(schedule).observe(document.body);new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true});document.fonts?.ready.then(schedule);schedule();setTimeout(()=>{for(const name of ['mag_variable_initialized','character_message_rendered'])for(const fn of events.get(name)||[])try{fn(clone(context.variables),context.messageId??0)}catch(e){send('error',{message:String(e.message||e).slice(0,300)})}},0)});})();`;
 const policy=`default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https: ${vendor}; style-src 'unsafe-inline' https:; img-src https: http: data: blob:; font-src https: data:; media-src https: data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
 const head='<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+policy+'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{color-scheme:normal}html,body{margin:0;min-height:0;max-width:100%}body{padding:8px;box-sizing:border-box;font:15px/1.7 system-ui;overflow-wrap:anywhere}img,video,svg{max-width:100%}img{height:auto}.academy-plain-prose{white-space:pre-wrap;margin:10px 0}'+(highlight?'body{text-decoration:underline;text-decoration-color:#9fc4e9;text-underline-offset:5px}':'')+'</style><script>'+runtime+'</script><script src="'+vendor+'academy-render-jquery.js"></script><script src="'+vendor+'academy-render-lodash.js"></script>';
 const themeStyle='<style>html{color-scheme:only '+theme.scheme+';background:'+theme.background+';color:'+theme.color+'}body{background:transparent;color:inherit}</style>';
 const lineBreakStyle=preserveLineBreaks?'<style>body{white-space:pre-line}</style>':'';
 const themedHead=head.replace('html{color-scheme:light dark}','html{color-scheme:normal}')+themeStyle+lineBreakStyle;
 const content=htmlMessageContent(source);
 // Inject before user scripts, including complete documents; do not nest a full HTML page in a body.
 if(/^\s*(?:<!doctype[^>]*>\s*)?<html\b/i.test(content)){
  if(/<head\b[^>]*>/i.test(content))return content.replace(/<head\b[^>]*>/i,match=>match+themedHead);
  return content.replace(/<html\b[^>]*>/i,match=>match+'<head>'+themedHead+'</head>');
 }
 // Mixed prose + complete HTML blocks must still put the policy/runtime in a real head.
 const fragment=content.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<!doctype[^>]*>|<\/?(?:html|head|body)\b[^>]*>/gi,(tag,raw)=>raw?tag:'');
 return '<!doctype html><html><head>'+themedHead+'</head><body>'+fragment+'</body></html>';
}
