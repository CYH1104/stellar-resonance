import {it,expect} from 'vitest';
import {newSession,defaults,backup,parseBackup} from '../src/domain/story';
import {cleanSceneSnapshot} from '../src/domain/storyScene';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup';
import {snapshotRows,rowsSnapshot} from '../src/storage/recordSnapshot';
import {storyRenderStates} from '../src/app/storyRenderState';
it('preserves opening people in every variant through local, cloud and record backups',()=>{
 const session=newSession('场景',{name:'玩家',appearance:'',personality:'',background:''},'');
 const openingScene={日期:'星历578年09月01日',时间:'08:30',地点:'报到台',人物:['玩家','新同伴']};
 session.turns.push({id:'turn',input:'报到',selected:0,variants:[{id:'a',text:'正文',status:'complete',createdAt:'',outcome:{event:'报到',openingScene}},{id:'b',text:'另一稿',status:'complete',createdAt:'',outcome:{event:'报到',openingScene:{...openingScene,人物:[]}}}]});
 const snapshot={version:1 as const,sessions:[session],preferences:defaults()};
 for(const restored of [parseBackup(backup(snapshot)),parseCloudSave(createCloudSave(snapshot,snapshot.preferences)).snapshot,parseBackup(backup(rowsSnapshot(snapshotRows(snapshot))!))]){
  expect(restored.sessions[0].turns[0].variants.map(v=>v.outcome?.openingScene)).toEqual([openingScene,{...openingScene,人物:[]}]);
  expect(storyRenderStates(restored.sessions[0],[0]).get(0)?.openingPeople).toBe('玩家、新同伴');
 }
 delete session.turns[0].variants[0].outcome!.openingScene!.人物;
 expect(parseBackup(backup(snapshot)).sessions[0].turns[0].variants[0].outcome!.openingScene!.人物).toBeUndefined();
});
it('rejects malformed people and unknown fields while retaining legacy snapshots',()=>{
 const base={日期:'',时间:'',地点:''};expect(cleanSceneSnapshot(base)).toEqual(base);
 for(const 人物 of ['甲',[null],[''],['甲','甲'],Array(101).fill('甲'),['甲'.repeat(81)]])expect(()=>cleanSceneSnapshot({...base,人物})).toThrow();
 expect(()=>cleanSceneSnapshot({...base,newField:true})).toThrow();
 expect(cleanSceneSnapshot({...base,人物:[]})).toEqual({...base,人物:[]});
});
