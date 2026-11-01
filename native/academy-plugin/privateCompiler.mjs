import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const fail=code=>Object.assign(Error(code),{code,status:503});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
/** One bounded, serialized, server-only original-native compiler, not one browser per player. */
export class PrivateNativeCompiler {
  browser;socket;session;ready;tail=Promise.resolve();waiting=0;pending=new Map();sequence=0;
  constructor({origin=process.env.ACADEMY_PRIVATE_ORIGIN,executable=process.env.ACADEMY_CHROMIUM,directory=process.env.ACADEMY_PRIVATE_BROWSER_DATA}={}){
    if(origin){const url=new URL(origin);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw fail('PRIVATE_COMPILER_ORIGIN_INVALID');this.origin=url.origin;}
    this.executable=executable;this.directory=directory;
  }
  async start(){
    if(!this.origin||!this.executable||!this.directory)throw fail('PRIVATE_NATIVE_COMPILER_NOT_CONFIGURED');
    const waitStarted=Date.now();while(true){try{const probe=await fetch(this.origin+'/csrf-token',{signal:AbortSignal.timeout(5000),redirect:'error'});await probe.body?.cancel();if(probe.ok)break;}catch{}if(Date.now()-waitStarted>90000)throw fail('PRIVATE_NATIVE_SERVER_UNAVAILABLE');await delay(250);}
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const browser=spawn(this.executable,['--headless=new','--renderer-process-limit=2','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-background-networking','--disable-dev-shm-usage','--disable-gpu','--disable-extensions','--disable-sync','--no-first-run','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+this.directory,'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});this.browser=browser;
    const endpoint=await new Promise((resolve,reject)=>{let buffer='';const timer=setTimeout(()=>reject(fail('PRIVATE_BROWSER_START_TIMEOUT')),60000);browser.once('error',()=>{clearTimeout(timer);reject(fail('PRIVATE_BROWSER_START_FAILED'));});browser.once('exit',()=>{clearTimeout(timer);reject(fail('PRIVATE_BROWSER_EXITED'));});browser.stderr.on('data',bytes=>{buffer=(buffer+bytes.toString()).slice(-4096);const match=/DevTools listening on (ws:\/\/[^\s]+)/.exec(buffer);if(match){clearTimeout(timer);resolve(match[1]);}});});
    const socket=new WebSocket(endpoint);this.socket=socket;await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',()=>reject(fail('PRIVATE_BROWSER_UNREACHABLE')),{once:true});});
    socket.addEventListener('message',({data})=>{let value;try{value=JSON.parse(data);}catch{return;}const task=this.pending.get(value.id);if(!task)return;this.pending.delete(value.id);clearTimeout(task.timer);value.error?task.reject(fail('PRIVATE_NATIVE_EXECUTION_FAILED')):task.resolve(value.result);});
    socket.addEventListener('close',()=>{for(const task of this.pending.values()){clearTimeout(task.timer);task.reject(fail('PRIVATE_BROWSER_CLOSED'));}this.pending.clear();this.ready=undefined;});
    const {targetId}=await this.send('Target.createTarget',{url:this.origin});const {sessionId}=await this.send('Target.attachToTarget',{targetId,flatten:true});this.session=sessionId;await this.send('Page.enable');await this.send('Page.bringToFront');
    const started=Date.now();while(Date.now()-started<150000){
      try{const status=await this.evaluate(`(()=>{if(window.SillyTavern?.getContext){let c;try{c=SillyTavern.getContext();}catch{return false;}if(!window.__academyReadyRegistered){window.__academyReadyRegistered=true;c.eventSource.on(c.eventTypes.APP_READY,()=>window.__academyReady=true);}}const dialog=document.querySelector('dialog[open]');if(dialog&&(dialog.querySelector('.onboarding')||/what.?s your name|你的名字|您的名字/i.test(dialog.textContent||''))){const input=dialog.querySelector('textarea.popup-input');if(input){input.value='学院服务';dialog.querySelector('.popup-button-ok')?.click();}}return !!window.__academyReady;})()`);
      if(status){await this.evaluate(`(async()=>{window.__academyPrivateEngine=await import('/scripts/extensions/third-party/academy-compiler/engine.js');return true;})()`);return;}}catch(error){if(this.socket?.readyState!==WebSocket.OPEN)throw error;}
      await delay(100);
    }throw fail('PRIVATE_NATIVE_ENGINE_TIMEOUT');
  }
  send(method,params={},session=this.session){const id=++this.sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(fail('PRIVATE_NATIVE_EXECUTION_TIMEOUT'));},180000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params,...(session?{sessionId:session}:{})}));});}
  async evaluate(expression){const result=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw fail('PRIVATE_NATIVE_EXECUTION_FAILED');return result.result?.value;}
  async compile(input,signal){
    if(this.waiting>=16)throw Object.assign(Error('PRIVATE_COMPILER_BUSY'),{code:'PRIVATE_COMPILER_BUSY',status:429});
    this.waiting++;const id=randomUUID();
    const task=this.tail.catch(()=>{}).then(async()=>{
      signal.throwIfAborted();this.ready??=this.start().catch(async error=>{await this.close();throw error;});await this.ready;signal.throwIfAborted();
      const abort=()=>{void this.evaluate(`window.__academyPrivateEngine.cancel(${JSON.stringify(id)})`).catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
      try{const result=await this.evaluate(`window.__academyPrivateEngine.prepare(${JSON.stringify(input)},${JSON.stringify(id)})`);signal.throwIfAborted();if(!Array.isArray(result?.messages)||!result.messages.length)throw fail('PRIVATE_NATIVE_PROMPT_MISSING');return result;}finally{signal.removeEventListener('abort',abort);}
    }).finally(()=>{this.waiting--;});this.tail=task;return task;
  }
  async close(){this.ready=undefined;this.socket?.close();this.socket=undefined;if(this.browser){this.browser.kill();this.browser=undefined;}this.session=undefined;}
}
