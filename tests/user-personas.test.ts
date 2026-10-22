import {expect,it} from 'vitest';
import {createSSRApp} from 'vue';import {renderToString} from 'vue/server-renderer';
import OpeningView from '../src/components/OpeningView.vue';import PersonaLibrary from '../src/components/PersonaLibrary.vue';
import {blankPersona} from '../src/domain/persona';import type {ViewModel} from '../src/app/useWorkspace';
it('恢复原开场入口并提供用户自己的多份user人设库，同名不同人设不被合并',async()=>{
 const opening=await renderToString(createSSRApp(OpeningView,{w:{loading:false,sessions:[]} as unknown as ViewModel}));for(const text of ['新的开始','继续游戏','设置','user 人设库'])expect(opening).toContain(text);expect(opening).not.toContain('进入学院');
 const sessions=[{id:'a',name:'学生版',persona:{...blankPersona(),name:'同名user',background:'学生'},updatedAt:''},{id:'b',name:'职业版',persona:{...blankPersona(),name:'同名user',background:'职业人'},updatedAt:''}];
 const html=await renderToString(createSSRApp(PersonaLibrary,{sessions,w:{sessions,active:undefined,newGameDraft:{persona:blankPersona()}} as unknown as ViewModel}));expect(html).toContain('USER PERSONA ARCHIVE');expect((html.match(/<strong[^>]*>同名user<\/strong>/g)||[])).toHaveLength(2);expect(html).not.toContain('服务器 char 资料不在这里管理');expect(html).toContain('学生版');expect(html).toContain('职业版');expect(html).toContain('设为主人设');
});

