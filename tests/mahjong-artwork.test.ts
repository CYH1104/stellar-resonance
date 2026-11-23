import {expect,it} from 'vitest';
import {createSSRApp,h} from 'vue';
import {renderToString} from 'vue/server-renderer';
import {mahjongArtworkName} from '../src/domain/mahjongArtwork';
import MahjongTile from '../src/components/MahjongTile.vue';
const assets=import.meta.glob('../src/assets/mahjong/*.svg',{eager:true,query:'?raw',import:'default'}) as Record<string,string>;
it('every playable tile including red fives has a local vector image and correct honor identity',()=>{
 const tiles=[...['m','p','s'].flatMap(s=>Array.from({length:10},(_,i)=>s+i)),...Array.from({length:7},(_,i)=>'z'+(i+1)),'back'];
 for(const tile of tiles){const svg=assets['../src/assets/mahjong/'+mahjongArtworkName(tile)+'.svg'];expect(svg,tile).toBeTypeOf('string');expect(svg).toContain('viewBox="0 0 300 400"');expect(svg).not.toMatch(/<script|<foreignObject|<image|<text|\son[a-z]+=/i);expect(svg).not.toMatch(/(?:href|url)\s*(?:=|\()\s*["']?https?:/i);}
 expect(['z1','z2','z3','z4','z5','z6','z7'].map(mahjongArtworkName)).toEqual(['Ton','Nan','Shaa','Pei','Haku','Hatsu','Chun']);
 expect(mahjongArtworkName('m0*')).toBe('Man5-Dora');expect(mahjongArtworkName('p0_')).toBe('Pin5-Dora');expect(mahjongArtworkName('s0+')).toBe('Sou5-Dora');
 expect(()=>mahjongArtworkName('z0')).toThrow();expect(()=>mahjongArtworkName('x1')).toThrow();
});
it('renders artwork with accessible tile names, including the intentionally blank white dragon',async()=>{
 for(const [tile,label]of [['m0','赤5万'],['p9','9筒'],['s1','1索'],['z5','白'],['back','暗牌']]){
 const html=await renderToString(createSSRApp({render:()=>h(MahjongTile,{tile})}));
 expect(html).toContain('<img');expect(html).toContain('alt="'+label+'"');expect(html).not.toMatch(/src="https?:/);expect(html).not.toContain('>'+label+'<');
 }
});
