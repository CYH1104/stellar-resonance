import {afterEach,expect,it,vi} from 'vitest';
import {computed,effectScope,reactive} from 'vue';
import {importWorldbook,exportWorldbook,resolveWorldbooks,worldEntryWarnings,worldbookImportReview} from '../src/domain/worldbooks';
import {defaults,newSession,backup,parseBackup} from '../src/domain/story';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
import {useWorldbooks,sessionLore} from '../src/app/useWorldbooks';
import {runWorldbooks} from '../src/domain/worldbookRunner';
const ctx={messages:['普通聊天'],userName:'玩家',charName:'甲',seed:'test'};
const book=(options:Record<string,unknown>={})=>importWorldbook(JSON.stringify({entries:{0:{key:['命中词'],content:'应当发送的设定',matchCharacterDescription:true,...options}}}),'扫描.json','scan');
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});

it('extra scanning adds sources instead of making them mandatory or disabling matching normal keywords',()=>{
 const b=book();expect(worldEntryWarnings(b.entries[0])).toEqual([]);expect(worldbookImportReview(b)).toEqual([]);
 expect(resolveWorldbooks([b],{...ctx,messages:['命中词']} ).entries).toHaveLength(1);
 expect(resolveWorldbooks([b],ctx).entries).toHaveLength(0);
 expect(resolveWorldbooks([b],{...ctx,characterDescription:'命中词'}).entries).toHaveLength(1);
 b.entries[0].constant=true;expect(resolveWorldbooks([b],ctx).entries).toHaveLength(1);
 b.entries[0].enabled=false;expect(resolveWorldbooks([b],{...ctx,messages:['命中词']} ).entries).toHaveLength(0);
});

it.each([
 ['matchPersonaDescription','match_persona_description','persona'],
 ['matchCharacterDescription','match_character_description','characterDescription'],
 ['matchCharacterPersonality','match_character_personality','characterPersonality'],
 ['matchCharacterDepthPrompt','match_character_depth_prompt','characterDepthPrompt'],
 ['matchScenario','match_scenario','scenario'],
 ['matchCreatorNotes','match_creator_notes','creatorNotes']
])('supports %s plus its embedded-card alias only when enabled', (flag,alias,field)=>{
 for(const options of [{[flag]:true},{extensions:{[alias]:true}}]){
  const b=book({matchCharacterDescription:false,...options});
  expect(resolveWorldbooks([b],{...ctx,[field]:'命中词'}).entries).toHaveLength(1);
  expect(resolveWorldbooks([b],ctx).entries).toHaveLength(0);
  b.entries[0].scanDepth=0;expect(resolveWorldbooks([b],{...ctx,[field]:'命中词'}).entries).toHaveLength(0);
 }
 const disabled=book({matchCharacterDescription:false,[flag]:false});expect(resolveWorldbooks([disabled],{...ctx,[field]:'命中词'}).entries).toHaveLength(0);
});

it('regex overrides case and whole-word settings while secondary rules and generation-type filters still apply',()=>{
 const b=book({key:['/LIBRARY/i'],keysecondary:['新生'],selective:true,selectiveLogic:0,caseSensitive:true,matchWholeWords:true,triggers:['continue']});
 expect(resolveWorldbooks([b],{...ctx,messages:['library 新生'],generationType:'normal'}).entries).toHaveLength(0);
 expect(resolveWorldbooks([b],{...ctx,messages:['library 新生'],generationType:'continue'}).entries).toHaveLength(1);
 expect(resolveWorldbooks([b],{...ctx,messages:['library'],generationType:'continue'}).entries).toHaveLength(0);
});

it('unimplemented options are informational and preserve base activation, filters, budget and original export data',()=>{
 const b=book({sticky:3,automationId:'do-not-execute',key:['命中词'],characterFilter:{names:['甲'],isExclude:false},ignoreBudget:true,extraMetadata:{value:42},content:'设定'.repeat(100)});b.budget=100;
 const r=resolveWorldbooks([b],{...ctx,messages:['命中词']});expect(r.entries).toHaveLength(1);expect(r.warnings.join()).toContain('尚未完整接入');
 expect(resolveWorldbooks([b],{...ctx,messages:['命中词'],charName:'乙'}).entries).toHaveLength(0);
 expect(resolveWorldbooks([b],ctx).entries).toHaveLength(0);
 expect(worldbookImportReview(b)[0].recommended).toBe(false);
 const raw=JSON.parse(exportWorldbook(b)).entries[0];expect(raw.sticky).toBe(3);expect(raw.extraMetadata).toEqual({value:42});expect(raw.ignoreBudget).toBe(true);
 const p=defaults(),s=newSession('往返',{name:'玩家',appearance:'',background:'',personality:''},'开场');p.worldbooks=[b];s.worldbookIds=[b.id];const snapshot={version:1 as const,sessions:[s],preferences:p};
 expect(parseBackup(backup(snapshot)).preferences.worldbooks).toEqual([b]);expect(parseCloudSave(createCloudSave(snapshot,p)).snapshot.preferences.worldbooks).toEqual([b]);
});

it('the real import flow does not preselect enabled entries for closure',()=>{
 const p=reactive(defaults()),s=newSession('导入',{name:'玩家',appearance:'',background:'',personality:''},'开场'),scope=effectScope();
 const u=scope.run(()=>useWorldbooks(p,computed(()=>s),()=>[s],()=>false,async()=>{},()=>{},()=>{},()=>{}))!;
 u.importUserWorldbook(JSON.stringify({entries:{0:{key:['命中词'],content:'普通规则',matchScenario:true},1:{constant:true,content:'旧扩展规则',sticky:2},2:{constant:true,content:'原来关闭',disable:true}}}),'混合.json');
 expect(u.worldbookImportPending.value!.disabled).toEqual(['2']);u.confirmWorldbookImport();
 expect(u.worldbooks.value[0].entries.map(e=>e.enabled)).toEqual([true,true,false]);expect(s.worldbookIds).toEqual([u.worldbooks.value[0].id]);scope.stop();
});

it('actual session matching uses available role and scenario data but not hidden thoughts or another branch',()=>{
 const s=newSession('角色扫描',{name:'玩家',appearance:'',background:'',personality:''},'大厅开场'),p=defaults();
 s.initial.characters=[{id:'a',name:'甲',present:true,identity:'图书管理员',innerThought:'未公开想法'}];
 const b=book({key:['图书管理员']});p.worldbooks=[b];s.worldbookIds=[b.id];
 expect(sessionLore(p,s,0,'继续','t','叙述者').entries).toHaveLength(1);
 b.entries[0].keys=['未公开想法'];expect(sessionLore(p,s,0,'继续','t','叙述者').entries).toHaveLength(0);
 b.entries[0].keys=['大厅开场'];b.entries[0].extra=JSON.stringify({matchScenario:true});b.entries[0].scanDepth=1;
 expect(sessionLore(p,s,0,'继续','t','叙述者').entries).toHaveLength(1);
});

it('a stalled regex worker times out or cancels without falling back to the UI thread',async()=>{
 vi.useFakeTimers();const workers:any[]=[];
 class StalledWorker {onmessage:any;onerror:any;terminate=vi.fn();postMessage=vi.fn();constructor(){workers.push(this);Promise.resolve().then(()=>this.onmessage?.({data:{type:'ready'}}));}}
 vi.stubGlobal('Worker',StalledWorker);
 const b=book({key:['/(a+)+$/']});const timed=runWorldbooks([b],ctx);const failed=expect(timed).rejects.toThrow('超时');await Promise.resolve();await vi.advanceTimersByTimeAsync(3001);await failed;expect(workers[0].terminate).toHaveBeenCalledOnce();
 const c=new AbortController(),cancelled=runWorldbooks([b],ctx,c.signal);const stopped=expect(cancelled).rejects.toMatchObject({name:'AbortError'});c.abort();await stopped;expect(workers[1].terminate).toHaveBeenCalledOnce();
});
