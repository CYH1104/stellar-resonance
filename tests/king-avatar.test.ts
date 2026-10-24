import {expect,it} from 'vitest';
import {createSSRApp,h} from 'vue';
import {renderToString} from 'vue/server-renderer';
import TerminalActorAvatar from '../src/components/TerminalActorAvatar.vue';
import type {ViewModel} from '../src/app/useWorkspace';
it('renders positioned player images and a default icon without an image',async()=>{
 const w={active:{terminal:{avatar:'https://example.org/one.png',avatarView:{x:5,y:-4,scale:1.5}}}} as unknown as ViewModel;
 const render=()=>renderToString(createSSRApp({render:()=>h(TerminalActorAvatar,{w,id:'player'})}));
 expect(await render()).toContain('translate(5%,-4%) scale(1.5)');expect(await render()).toContain('one.png');w.active!.terminal!.avatar='';const fallback=await render();expect(fallback).not.toContain('<img');expect(fallback).toContain('<svg');
});
