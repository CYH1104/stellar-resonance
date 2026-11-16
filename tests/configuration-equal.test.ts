import {it,expect} from 'vitest';
import {sameConfigurationValue as same} from '../src/app/configurationEqual';
it('ignores record key insertion order and absent undefined fields recursively',()=>{
 expect(same({name:'甲',nested:{content:'文',enabled:true}}, {nested:{enabled:true,content:'文'},name:'甲',optional:undefined})).toBe(true);
});
it('preserves array ordering, whitespace, missing/null and actual field differences',()=>{
 expect(same([{id:'a'},{id:'b'}],[{id:'b'},{id:'a'}])).toBe(false);
 expect(same({content:'正文'},{content:'正文 '})).toBe(false);
 expect(same({},{x:null})).toBe(false);
 expect(same({enabled:true},{enabled:false})).toBe(false);
 expect(same({x:undefined},{y:1})).toBe(false);
});
