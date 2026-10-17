import {AsyncLocalStorage} from 'node:async_hooks';
import {promptDefinitions} from './internal-prompt-defaults.mjs';
export {promptDefinitions};
const traces=new AsyncLocalStorage();
export function traceInternalPrompts(fn){const calls=[];return traces.run(calls,()=>({result:fn(),calls}));}
const scope=new AsyncLocalStorage(),definitions=new Map(promptDefinitions.map(d=>[d.id,d]));
export const withInternalPrompts=(overrides,fn)=>scope.run(overrides||{},fn);
export const setInternalPrompts=overrides=>scope.enterWith(overrides||{});
export function internalPrompt(id,values={}){const d=definitions.get(id);if(!d)throw Error('UNKNOWN_INTERNAL_PROMPT');const template=scope.getStore()?.[id]??d.template;const rendered=template.replace(/\{\{(p\d+)\}\}/g,(full,key)=>Object.hasOwn(values,key)?String(values[key]):full);traces.getStore()?.push({id,text:rendered});return rendered;}
export function validateInternalPrompts(raw={}){if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Object.assign(Error(),{status:400,code:'INVALID_INTERNAL_PROMPTS'});const result={};for(const [id,value]of Object.entries(raw)){const d=definitions.get(id);if(!d||typeof value!=='string'||!value.trim()||value.length>150000)throw Object.assign(Error(),{status:400,code:'INVALID_INTERNAL_PROMPT'});for(const p of d.placeholders)if(!value.includes('{{'+p.key+'}}'))throw Object.assign(Error(),{status:400,code:'PROMPT_PLACEHOLDER_REQUIRED'});if(/\{\{p\d+\}\}/g.test(value.replace(/\{\{(p\d+)\}\}/g,(m,k)=>d.placeholders.some(p=>p.key===k)?'':m)))throw Object.assign(Error(),{status:400,code:'UNKNOWN_PROMPT_PLACEHOLDER'});if(value!==d.template)result[id]=value;}return result;}
