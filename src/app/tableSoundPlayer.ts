const files=import.meta.glob('../assets/table-audio/*.{mp3,wav}',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
export const tableSoundUrls=Object.fromEntries(Object.entries(files).map(([path,url])=>[path.split('/').pop()!.replace(/\.(mp3|wav)$/,''),url]));
type QueuedSound={sounds:string[];at:number;ambient:boolean};
/** One voice at a time; a short impact may play under its corresponding voice. */
export class TableSoundPlayer {
 private context?:AudioContext;
 private buffers=new Map<string,Promise<AudioBuffer>>();
 private sources=new Set<AudioBufferSourceNode>();
 private queue:QueuedSound[]=[];private generation=0;private playing=false;private ambient=false;private closed=false;
 get ready(){return this.context?.state==='running'&&!this.closed;}
 unlock(){
  if(this.closed)return;
  try {
   const Audio=window.AudioContext||(window as any).webkitAudioContext;
   if(!Audio)return;
   this.context??=new Audio();
   // Create/resume in the actual pointer/key handler, including iOS Safari.
   if(this.context!.state==='suspended')void this.context!.resume().catch(()=>{});
  } catch { /* Audio failure must never prevent a legal game action. */ }
 }
 play(sounds:string[],ambient=false){
  if(!this.ready||!sounds.length)return;
  if(ambient&&(this.playing||this.queue.length))return;
  if(!ambient&&this.ambient)this.stop();
  this.queue.push({sounds,at:Date.now(),ambient});
  if(this.queue.length>2)this.queue.splice(0,this.queue.length-2);
  void this.drain();
 }
 private buffer(id:string){
  const old=this.buffers.get(id);if(old)return old;
  const url=tableSoundUrls[id];if(!url)return Promise.reject(Error('Unknown table sound'));
  const pending=fetch(url).then(r=>{if(!r.ok)throw Error('Table sound unavailable');return r.arrayBuffer();}).then(b=>this.context!.decodeAudioData(b));
  this.buffers.set(id,pending);void pending.catch(()=>this.buffers.delete(id));return pending;
 }
 private async drain(){
  if(this.playing||!this.ready)return;
  const item=this.queue.shift();if(!item)return;
  if(Date.now()-item.at>3000){void this.drain();return;}
  this.playing=true;this.ambient=item.ambient;const generation=this.generation;
  try {
   const buffers=await Promise.all(item.sounds.map(id=>this.buffer(id)));
   if(generation!==this.generation||!this.ready||Date.now()-item.at>3000)return;
   await Promise.all(buffers.map((buffer,index)=>new Promise<void>(resolve=>{
    const context=this.context!,source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;
    gain.gain.value=['tile-drop','card-drop'].includes(item.sounds[index])?0.55:0.85;
    source.connect(gain);gain.connect(context.destination);this.sources.add(source);
    source.onended=()=>{this.sources.delete(source);source.disconnect();gain.disconnect();resolve();};
    source.start(context.currentTime+(index?0.07:0));
   })));
  }catch { /* Local media decoding/network failure is non-fatal. */ }
  finally {if(generation===this.generation){this.playing=false;this.ambient=false;void this.drain();}}
 }
 stop(){
  this.generation++;this.queue=[];this.playing=false;this.ambient=false;
  for(const source of this.sources){try{source.stop();}catch{}}
  this.sources.clear();
 }
 dispose(){this.stop();this.closed=true;this.buffers.clear();void this.context?.close().catch(()=>{});}
}
