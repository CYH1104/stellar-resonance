import {it,expect} from 'vitest';
// @ts-ignore Node fs is supplied by Vitest.
import {readFileSync} from 'node:fs';
it('keeps in-room friend checkboxes aligned beside their names',()=>{const source:string=readFileSync('src/components/GameRoomLobby.vue','utf8');expect(source).toContain('type="checkbox"');expect(source).toContain('.game-lobby .friend input[type=checkbox]{width:auto;flex:0 0 auto!important;margin:0!important}');expect(source).toContain('class="friend"');});
