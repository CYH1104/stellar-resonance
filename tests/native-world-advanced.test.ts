import {it,expect} from 'vitest';
import {cleanNativeWorldbook,assertNativeWorldbookOptions,projectNativeWorldScopes,nativeWorldbooksForRequest,assertNativeWorldStateMerge} from '../src/domain/nativeWorldbooks';
import {emptyNativeEffects} from '../src/domain/nativeWorldState';
import {backup,parseBackup,defaults} from '../src/domain/story';
const book=()=>({id:'book',name:'book',worldbook:{future:{keep:true},entries:{0:{uid:0,key:['probe'],content:'native lore',constant:false,disable:false,future:{keep:1}}}}});
it('projects legacy character restrictions only into the execution copy and requires all IDs to be registered',()=>{
 const b:any=book();b.worldbook.extensions={other:'keep',academy_scope:{mode:'characters',characterIds:['npc']}};const before=JSON.stringify(b);const [projected]=projectNativeWorldScopes([b],[{id:'npc',name:'指定角色'},{id:'other',name:'其他角色'}]);expect(projected.worldbook.entries[0].content).toContain('only to these NPCs');expect(projected.worldbook.entries[0].content).toContain('指定角色');expect(projected.worldbook.entries[0].content).not.toContain('其他角色');expect(JSON.stringify(b)).toBe(before);expect(()=>projectNativeWorldScopes([b],[])).toThrow('未登记');
 b.worldbook.entries[0].content='@@activate\nnative lore';expect(projectNativeWorldScopes([b],[{id:'npc',name:'指定角色'}])[0].worldbook.entries[0].content).toMatch(/^@@activate\nScope:/);
 b.worldbook.entries[0].content='native lore';b.worldbook.entries[0].extensions={academy_scope:{mode:'global',characterIds:[]}};expect(projectNativeWorldScopes([b],[])[0].worldbook.entries[0].content).toBe('native lore');
});
it('rejects malformed advanced fields and unknown role scope contracts before saving',()=>{
 for(const patch of [{sticky:-1},{cooldown:1.5},{delay:NaN},{role:3},{position:8},{probability:101},{groupWeight:-1},{selectiveLogic:4},{scanDepth:'2'},{caseSensitive:'yes'},{extensions:{academy_scope:{mode:'future',characterIds:[]}}}])expect(()=>assertNativeWorldbookOptions({...book().worldbook,entries:{0:{...book().worldbook.entries[0],...patch}}})).toThrow();
});
it('accepts native fractional group weights for saving and execution without rounding',()=>{
 for(const weight of [1,1.5,2.125,10000]){
  const b:any=book();b.worldbook.entries[0].groupWeight=weight;
  expect(()=>assertNativeWorldbookOptions(b.worldbook)).not.toThrow();
  const selected=nativeWorldbooksForRequest({version:1,books:[b],defaultIds:['book']},'generate',{});
  expect(selected[0].worldbook.entries[0].groupWeight).toBe(weight);
 }
 for(const weight of [undefined,null]){
  const b:any=book();if(weight===undefined)delete b.worldbook.entries[0].groupWeight;else b.worldbook.entries[0].groupWeight=weight;
  expect(()=>assertNativeWorldbookOptions(b.worldbook)).not.toThrow();
 }
});
it('rejects invalid native weights while keeping fractional message counters invalid',()=>{
 for(const patch of [{groupWeight:0},{groupWeight:-1},{groupWeight:.5},{groupWeight:10000.1},{groupWeight:NaN},{groupWeight:Infinity},{groupWeight:'1.5'},{scanDepth:1.5},{depth:1.5},{sticky:1.5},{cooldown:1.5},{delay:1.5}]){
  const b:any=book();Object.assign(b.worldbook.entries[0],patch);
  expect(()=>assertNativeWorldbookOptions(b.worldbook)).toThrow();
  expect(()=>nativeWorldbooksForRequest({version:1,books:[b],defaultIds:['book']},'generate',{})).toThrow();
 }
});
it('retains advanced fields and extensions and allows timed effects only with the explicit story projection',()=>{
 const b:any=book();Object.assign(b.worldbook.entries[0],{sticky:4,cooldown:6,delay:2,selective:true,selectiveLogic:3,group:'one, two',groupWeight:20,groupOverride:true,useGroupScoring:null,caseSensitive:false,matchWholeWords:null,scanDepth:2,delayUntilRecursion:1,role:2,position:4,ignoreBudget:true,matchPersonaDescription:true,triggers:['normal','regenerate']});expect(cleanNativeWorldbook(b.worldbook)).toEqual(b.worldbook);const lib={version:1 as const,books:[b],defaultIds:['book']};expect(()=>nativeWorldbooksForRequest(lib,'memory',{})).toThrow('目前仅正文');expect(nativeWorldbooksForRequest(lib,'generate',{nativeWorldState:{version:1,messageCount:2,effects:emptyNativeEffects()}})).toEqual([b]);
});
it('stops a conflicting book-ID merge before imported native hashes could be rebound incorrectly',()=>{
 const a={version:1 as const,books:[book()],defaultIds:['book']},b=structuredClone(a);b.books[0].worldbook.entries[0].content='different';const sessions=[{turns:[{variants:[{nativeWorldInfo:{}}]}]}];expect(()=>assertNativeWorldStateMerge(a,b,sessions)).toThrow('ID');expect(()=>assertNativeWorldStateMerge(a,a,sessions)).not.toThrow();expect(()=>assertNativeWorldStateMerge(a,b,[])).not.toThrow();
});
it('keeps previously accepted legacy option data readable and transferable while blocking invalid execution',()=>{
 const b:any=book();Object.assign(b.worldbook.entries[0],{sticky:-1,caseSensitive:'legacy',extensions:{academy_scope:{mode:'future',characterIds:'legacy'}}});expect(cleanNativeWorldbook(b.worldbook)).toEqual(b.worldbook);const archive={version:1 as const,nativePreset:{version:1 as const,preset:{prompts:[],prompt_order:[]},worldbooks:{version:1 as const,books:[b],defaultIds:['book']}}};expect(parseBackup(backup({version:1,sessions:[],preferences:defaults(),archive})).archive).toEqual(archive);expect(()=>nativeWorldbooksForRequest(archive.nativePreset.worldbooks,'generate',{})).toThrow('高级设置');
 const global:any=book();global.worldbook.extensions={academy_scope:{mode:'global'}};expect(projectNativeWorldScopes([global],[])[0].worldbook).toEqual(global.worldbook);
});
