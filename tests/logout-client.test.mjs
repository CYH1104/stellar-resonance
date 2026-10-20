import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const script=await readFile(new URL('../server/auth-ui/account.js',import.meta.url),'utf8');
function browser(fetchImpl){
  const listeners={},elements=[],storage=new Map([['account:user:save','preserved']]),destinations=[];
  function element(){const e={dataset:{},style:{},children:[],handlers:{},setAttribute(){},addEventListener(name,fn){this.handlers[name]=fn;},append(...items){this.children.push(...items);}};elements.push(e);return e;}
  const body=element(),tools=element(),grid=element(),root={querySelector:s=>s==='.ah-tools'?tools:grid};
  const context={__ACADEMY_ACCOUNT__:{id:'user',email:'synthetic@qq.com'},document:{hidden:false,body,createElement:element,getElementById:id=>id==='__exp_splash__'?root:elements.find(e=>e.id===id)},location:{origin:'http://localhost',href:'http://localhost/terminal',pathname:'/terminal',replace:url=>destinations.push(url),assign(){}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:{randomUUID:()=> 'event-id'},fetch:fetchImpl,AbortController,URL,Request,setTimeout,clearTimeout,setInterval(){},addEventListener(name,fn){(listeners[name]||=[]).push(fn);}};
  context.window=context;runInNewContext(script,context);
  const fire=(name,event={})=>{for(const fn of listeners[name]||[])fn(event);};fire('DOMContentLoaded');
  return {fire,elements,storage,destinations,body,buttons:elements.filter(e=>e.dataset.accountLogout)};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('all logout entries use server revocation, redirect and retain local saves',async()=>{
  const calls=[],page=browser(async(url,options)=>{calls.push({url,options});return new Response('{}');});
  assert.equal(page.buttons.length,3);page.buttons[1].handlers.click({stopPropagation(){}});await tick();
  assert.equal(calls[0].url,'/api/auth/logout');assert.equal(calls[0].options.method,'POST');assert.deepEqual(page.destinations,['/login']);assert.equal(page.storage.get('account:user:save'),'preserved');assert.equal(page.storage.get('academy:account-logout:user'),'event-id');
});
test('logout failure retains the page and allows retry',async()=>{
 const page=browser(async()=>new Response('{}',{status:500}));page.buttons[0].handlers.click({stopPropagation(){}});await tick();
 assert.equal(page.destinations.length,0);assert.ok(page.buttons.every(b=>!b.disabled));assert.match(page.elements.find(e=>e.id==='account-logout-message').textContent,/退出失败/);
});
test('other tabs and expired back-forward cached pages must log in again',async()=>{
 const page=browser(async()=>Response.json({user:null}));page.fire('storage',{key:'academy:account-logout:someone-else'});assert.equal(page.destinations.length,0);page.fire('storage',{key:'academy:account-logout:user'});assert.deepEqual(page.destinations,['/login']);
 const restored=browser(async()=>Response.json({user:null}));restored.fire('pageshow',{persisted:true});assert.equal(restored.body.style.visibility,'hidden');await tick();assert.deepEqual(restored.destinations,['/login']);
});
test('valid restored session reveals page, unavailable verification does not reveal cached data',async()=>{
 const page=browser(async()=>Response.json({user:{id:'user'}}));page.fire('pageshow',{persisted:true});await tick();assert.equal(page.body.style.visibility,'');assert.equal(page.destinations.length,0);
 const offline=browser(async()=>{throw Error('offline');});offline.fire('pageshow',{persisted:true});await tick();assert.deepEqual(offline.destinations,['/login']);assert.equal(offline.body.style.visibility,'hidden');
});
