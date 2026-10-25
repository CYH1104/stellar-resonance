import {expect,it} from 'vitest';
import {terminalContextState} from '../src/app/usePersonalTerminal';

it('keeps custom contact identity in terminal requests with or without world state',()=>{
 const contacts=[{id:'contact-friend',name:'旧友',identity:'校外朋友',relationship:'朋友',present:false,affinity:0}];
 const without=terminalContextState(undefined,{'contact-friend':'81234567890'},contacts);
 expect(without.player).toBeUndefined();
 expect(without.variables['终端码']).toEqual({'contact-friend':'81234567890'});
 expect(without.characters).toEqual([{id:'contact-friend',name:'旧友',identity:'校外朋友',relationship:'朋友',present:false,affinity:0}]);
 const withState=terminalContextState({player:{id:'player',name:'我'}},{},contacts);
 expect(withState.player).toEqual({id:'player',name:'我'});
 expect(withState.characters[0].identity).toBe('校外朋友');
});
