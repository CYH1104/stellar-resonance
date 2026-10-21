import {it,expect} from 'vitest';
import {avatarSizes,avatarAppearanceStyle,avatarFrame,avatarImageStyle,cleanAvatarAppearance} from '../src/domain/avatarAppearance';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import UserAvatar from '../src/components/UserAvatar.vue';
it('large portraits have a substantially larger display area than small headshots',()=>{
 expect(avatarSizes.small).toBeGreaterThanOrEqual(40);
 expect(avatarSizes.large).toBeGreaterThanOrEqual(avatarSizes.small*3);
});
it('larger sizes reveal more of the full original rather than rescaling the same crop',async()=>{
 const small=avatarFrame({size:'small'}),medium=avatarFrame({size:'medium'}),large=avatarFrame({size:'large'});
 expect(small.zoom).toBeGreaterThan(medium.zoom);expect(medium.zoom).toBeGreaterThan(large.zoom);expect(large).toEqual({zoom:1,x:0,y:0});
 const html=await renderToString(createSSRApp(UserAvatar,{name:'玩家',src:'/original.png',appearance:{size:'large',shape:'rectangle'}}));expect(html).toContain('object-fit:contain');expect(html).toContain('scale(1)');expect(html).toContain('height:224px');
});
it('framing is saved separately for each size and corrupt coordinates cannot poison layout',()=>{
 const saved=cleanAvatarAppearance({size:'small',shape:'circle',frames:{small:{zoom:2.5,x:.1,y:.2},large:{zoom:1.1,x:0,y:0}}});
 expect(avatarFrame(saved).zoom).toBe(2.5);expect(avatarFrame({...saved,size:'large'}).zoom).toBe(1.1);expect(avatarFrame({...saved,size:'medium'}).zoom).toBe(1.35);
 expect(avatarImageStyle(saved,false).transform).toContain('scale(1)');
 expect(cleanAvatarAppearance({frames:{small:{zoom:Infinity,x:0,y:0}}}).frames).toBeUndefined();
});
it('rectangles are upright, not landscape, at every size',()=>{
 for(const size of ['small','medium','large'] as const){const style=avatarAppearanceStyle({size,shape:'rectangle'});expect(parseInt(style.height)).toBeGreaterThan(parseInt(style.width));}
});
