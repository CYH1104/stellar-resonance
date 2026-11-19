import {it,expect} from 'vitest';
// @ts-ignore Node fs is supplied by Vitest; browser compilation does not include its ambient types.
import {readFileSync} from 'node:fs';
it('overrides global checkbox auto margins only inside the party friend list',()=>{const source:string=readFileSync('src/components/PartyGameRoom.vue','utf8');expect(source).toContain('#academy-workspace .pt .party-game-room .party-friend{width:100%!important;justify-content:flex-start!important;text-align:left!important');expect(source).toContain('.party-friend input[type=checkbox]{flex:0 0 auto!important;margin:0!important}');expect(source).toContain('.party-friend>span{margin-left:0!important;margin-right:0!important}');expect(source).toContain('type="checkbox"');});
