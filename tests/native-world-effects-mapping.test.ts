import {it,expect} from 'vitest';
import {archiveWorldEffects,runtimeWorldEffects} from '../src/native/worldEffects';
import {cleanNativeEffects} from '../src/domain/nativeWorldState';
it('round trips actual native filenames through the existing backup-safe book identity',()=>{
  const books=[{id:'book-id',name:'学院.世界书'}],effect={hash:123,start:2,end:7,protected:false};
  const native={sticky:{'学院.世界书.0':effect},cooldown:{'学院.世界书.0':effect}};
  const stored=archiveWorldEffects(native,books);expect(Object.keys(stored.sticky)).toEqual(['PlayerRuntime-book-id.0']);expect(cleanNativeEffects(stored)).toEqual(stored);
  expect(runtimeWorldEffects(stored,books)).toEqual(native);
});
it('does not export or silently lose effects for a different/unrecognized book',()=>{
  const effect={hash:1,start:2,end:7,protected:false};
  expect(()=>archiveWorldEffects({sticky:{'private.0':effect},cooldown:{}},[])).toThrow('关联');
  expect(()=>runtimeWorldEffects({sticky:{'PlayerRuntime-missing.0':effect},cooldown:{}},[])).toThrow('关联');
  expect(()=>archiveWorldEffects({sticky:{'学院.0':{...effect,end:-1}},cooldown:{}},[{id:'book',name:'学院'}])).toThrow();
});
