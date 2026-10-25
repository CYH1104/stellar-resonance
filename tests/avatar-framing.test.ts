import {it,expect} from 'vitest';
import {createSSRApp,h} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {avatarFrameStyle} from '../src/app/avatarFraming';
import GroupAvatar from '../src/components/GroupAvatar.vue';

it('clamps stored avatar offsets so cover frames never reveal the background and keeps zoom bounded',()=>{
 expect(avatarFrameStyle(undefined)).toMatchObject({objectFit:'cover',objectPosition:'50% 50%',transform:'scale(1)'});
 expect(avatarFrameStyle({x:30,y:-30,scale:2})).toMatchObject({objectFit:'cover',objectPosition:'80% 20%',transform:'scale(2)'});
 expect(avatarFrameStyle({x:999,y:-999,scale:9})).toMatchObject({objectFit:'cover',objectPosition:'100% 0%',transform:'scale(4)'});
 expect(avatarFrameStyle({x:Number.NaN,y:Number.POSITIVE_INFINITY,scale:0})).toMatchObject({objectFit:'cover',objectPosition:'50% 50%',transform:'scale(1)'});
});
it('renders group avatars with cover and saved or locally previewed percentage focus',async()=>{
 const conversation={avatar:'https://example.test/g.png',avatarPosition:{x:12,y:88}};
 let html=await renderToString(createSSRApp({render:()=>h(GroupAvatar,{conversation})}));
 expect(html).toContain('object-fit:cover');expect(html).toContain('object-position:12% 88%');
 html=await renderToString(createSSRApp({render:()=>h(GroupAvatar,{conversation,position:{x:70,y:30}})}));
 expect(html).toContain('object-position:70% 30%');
 html=await renderToString(createSSRApp({render:()=>h(GroupAvatar,{conversation:{avatar:'https://example.test/l.png'}})}));
 expect(html).toContain('object-position:50% 50%');
});
