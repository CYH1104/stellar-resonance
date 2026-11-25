import {afterEach,expect,it,vi} from 'vitest';
import {TableSoundPlayer} from '../src/app/tableSoundPlayer';
let resolveDecode:(buffer:any)=>void;
function setup(deferred=false){
 const sources:any[]=[];
 const context={state:'running',currentTime:1,destination:{},resume:vi.fn().mockResolvedValue(undefined),close:vi.fn().mockResolvedValue(undefined),decodeAudioData:vi.fn(()=>deferred?new Promise(r=>resolveDecode=r):Promise.resolve({duration:1})),createGain:()=>({gain:{value:1},connect:vi.fn(),disconnect:vi.fn()}),createBufferSource:()=>{
  const source={buffer:null,onended:()=>{},connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(()=>source.onended())};sources.push(source);return source;
 }};
 vi.stubGlobal('window',{AudioContext:class{constructor(){return context;}}});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}));
 const player=new TableSoundPlayer();player.unlock();return {player,context,sources};
}
const flush=async()=>{for(let i=0;i<14;i++)await Promise.resolve();};
afterEach(()=>vi.unstubAllGlobals());
it('mute/leave stops active audio and clears queued speech',async()=>{
 const {player,sources}=setup();player.play(['rocket']);await flush();expect(sources[0].start).toHaveBeenCalledTimes(1);
 player.play(['waiting']);player.stop();await flush();expect(sources[0].stop).toHaveBeenCalledTimes(1);expect(sources).toHaveLength(1);
 player.play(['bomb']);await flush();expect(sources).toHaveLength(2);player.dispose();
});
it('late download/decode completion cannot start audio after mute',async()=>{
 const {player,sources}=setup(true);player.play(['rocket']);await flush();player.stop();resolveDecode({duration:1});await flush();expect(sources).toHaveLength(0);player.dispose();
});
it('real moves interrupt waiting voice, and idle voice never interrupts a move',async()=>{
 const {player,sources}=setup();player.play(['waiting'],true);await flush();player.play(['card-drop','rocket']);await flush();expect(sources[0].stop).toHaveBeenCalled();expect(sources).toHaveLength(3);
 player.play(['waiting'],true);sources[1].onended();sources[2].onended();await flush();expect(sources).toHaveLength(3);player.dispose();
});
it('expired voice backlog is discarded instead of announced on the wrong turn',async()=>{
 const {player,sources}=setup();let now=0;const clock=vi.spyOn(Date,'now').mockImplementation(()=>now);
 player.play(['rocket']);await flush();player.play(['pass']);now=4000;sources[0].onended();await flush();expect(sources).toHaveLength(1);player.dispose();clock.mockRestore();
});
