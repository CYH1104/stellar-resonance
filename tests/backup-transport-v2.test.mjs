import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCloudBackup} from '../src/domain/cloudTransport.mjs';
import {createCloudSave,parseCloudSave} from '../src/domain/cloudBackup.ts';
import {newSession,defaults,backup,cleanPreferences} from '../src/domain/story.ts';
import {blankPersona,personaLimits} from '../src/domain/persona.ts';
import {emptyTerminal} from '../src/domain/personalTerminal.ts';

test('GitHub and Gitee upload v2 persona archives and terminal records without lossy transport conversion',async()=>{
 const persona={...blankPersona(),...Object.fromEntries(Object.keys(personaLimits).map(k=>[k,'字段-'+k]))};
 const s=newSession('兼容性',persona,'开场');s.terminal=emptyTerminal();s.terminal.conversations=[{id:'private',title:'联系人',members:['contact-a'],group:false,announcement:'',messages:[{id:'m',sender:'contact-a',text:'私聊消息\n第二段',at:'12:00'}],unread:1}];
 const archive={version:1,personas:[{id:'unbound',name:'未绑定人设',persona,updatedAt:'',memo:'备忘录',remark:'备注',portrait:'data:image/png;base64,aGVsbG8='}],draft:{id:'',name:'草稿',persona,updatedAt:''},masterPersona:{name:'未绑定人设',department:'院系',spiritLevel:'A',personaId:'unbound'},nicknameImages:{角色:'https://example.org/avatar.png'}};
 const text=createCloudSave({version:1,sessions:[s],preferences:defaults(),archive},defaults(),archive.nicknameImages),expected=parseCloudSave(text);
 assert.equal(expected.schema,'stellar-cloud-save-v2');assert.equal(expected.snapshot.archive.personas[0].portrait,undefined);
 for(const provider of ['github','gitee']){
  let uploaded;
  const transport=createCloudBackup(async(url,options)=>{
   const path=new URL(url).pathname;
   if(path.endsWith('/user'))return Response.json({login:'test-user'});
   if(path.includes('/contents/')&&options.method==='GET')return new Response('',{status:404});
   if(path.includes('/contents/')){const body=provider==='github'?JSON.parse(options.body):Object.fromEntries(new URLSearchParams(options.body));uploaded=Buffer.from(body.content,'base64').toString('utf8');return Response.json({ok:true});}
   return Response.json({private:true,default_branch:'main',permissions:{push:true}});
  });
  await transport({provider,token:'synthetic-only',repository:'test-backup',action:'upload',file:'stellar-workspace-backup.json',text});
  assert.deepEqual(parseCloudSave(uploaded),expected);
 }
});
test('new snapshot fields cannot silently disappear, and default preference keys remain serializable',()=>{
 const p=defaults(),clean=cleanPreferences(p);
 assert.deepEqual(Object.keys(p).filter(k=>!(k in clean)),[]);
 const unregistered={version:1,sessions:[],preferences:p,newFeature:{text:'must-not-disappear'}};
 assert.throws(()=>backup(unregistered),/尚未接入备份/);
 assert.throws(()=>createCloudSave(unregistered,p),/尚未接入备份/);
});
