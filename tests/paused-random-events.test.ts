import {it,expect,vi} from 'vitest';
import {effectScope} from 'vue';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {useWorkspace} from '../src/app/useWorkspace';
import {IndexedDbRepository} from '../src/storage/repository';
import {HttpGateway} from '../src/gateway/http';
import {defaults,initialState,cleanPreferences,newSession} from '../src/domain/story';
import StoryView from '../src/components/StoryView.vue';
import type {ViewModel} from '../src/app/useWorkspace';

it('pauses random events even with old enabled settings or pending events; ordinary generation proceeds',async()=>{
 const scope=effectScope();
 try{
  expect(cleanPreferences({...defaults(),diceEnabled:true}).diceEnabled).toBe(false);
  vi.spyOn(IndexedDbRepository.prototype,'read').mockResolvedValue(undefined);
  vi.spyOn(IndexedDbRepository.prototype,'readApiCredentials').mockResolvedValue(undefined);
  vi.spyOn(IndexedDbRepository.prototype,'write').mockResolvedValue();
  vi.spyOn(IndexedDbRepository.prototype,'writeApiCredentials').mockResolvedValue();
  vi.spyOn(IndexedDbRepository.prototype,'writeConfiguration').mockResolvedValue();
  vi.spyOn(IndexedDbRepository.prototype,'readEditorDrafts').mockResolvedValue({});
  vi.spyOn(IndexedDbRepository.prototype,'hasInterruptedRestore').mockResolvedValue(false);
  vi.spyOn(IndexedDbRepository.prototype,'writeInputDraft').mockResolvedValue();
  vi.spyOn(HttpGateway.prototype,'bootstrap').mockResolvedValue({runtime:'local-card',dataset:'test',name:'测试',greeting:[],characters:[],places:[],counts:{characters:0,departments:0,places:0},missing:[],capabilities:{continue:true,keyRequired:true,embeddings:true}});
  vi.spyOn(HttpGateway.prototype,'configure').mockResolvedValue({origin:'https://synthetic.example'});
  vi.spyOn(HttpGateway.prototype,'newGame').mockResolvedValue({dataset:'test',opening:'开场',initial:initialState('玩家')});
  const random=vi.spyOn(HttpGateway.prototype,'randomEvent');
  const generate=vi.spyOn(HttpGateway.prototype,'generate').mockImplementation(async function*(){yield {type:'delta',text:'正常剧情'};yield {type:'done',outcome:{event:'正常推进',characters:[]}};});
  const w=scope.run(()=>useWorkspace())!;await vi.waitFor(()=>expect(w.loading.value).toBe(false));
  for(const p of w.preferences.profiles){p.apiBaseUrl='https://synthetic.example/v1';p.model='synthetic';w.credentials[p.id]='synthetic-key';}
  await w.confirmAllApis();await w.create('测试',{name:'玩家',appearance:'',personality:'',background:''},'');
  w.preferences.diceEnabled=true;w.preferences.suggestionsEnabled=false;
  w.active.value!.turns.push({id:'old',input:'旧行动',randomEvent:{status:'pending',proposal:{kind:'奇遇事件',title:'旧事件',description:'待选'}},selected:0,variants:[{id:'old-v',text:'旧正文',status:'complete',createdAt:''}]});
  expect(w.pendingRandomEvent.value).toBe(false);await w.generate('继续行动');
  expect(generate).toHaveBeenCalledTimes(1);expect(random).not.toHaveBeenCalled();
  expect(generate.mock.calls[0][0].specialEvent).toBeUndefined();expect(generate.mock.calls[0][0].dice).toBeUndefined();expect(generate.mock.calls[0][0].randomEventInstruction).toBeUndefined();
  await w.generate(undefined,0);expect(random).not.toHaveBeenCalled();expect(generate.mock.calls[1][0].specialEvent).toBeUndefined();
 }finally{scope.stop();vi.restoreAllMocks();}
});
it('hides historical random event controls and cards while keeping the prose visible',async()=>{
 const active=newSession('旧存档',{name:'玩家',appearance:'',personality:'',background:''},'');
 active.turns.push({id:'t',input:'行动',selected:0,randomEvent:{status:'accepted',proposal:{kind:'奇遇事件',title:'旧事件',description:'候选'}},variants:[{id:'v',text:'原来的正文',status:'complete',createdAt:'',outcome:{event:'原来的事件'}}]});
 const w={active,preferences:defaults(),busy:false,input:''} as ViewModel;
 const html=await renderToString(createSSRApp(StoryView,{w}));expect(html).toContain('原来的正文');expect(html).not.toContain('random-event-card');expect(html).not.toContain('跳过事件');
});
