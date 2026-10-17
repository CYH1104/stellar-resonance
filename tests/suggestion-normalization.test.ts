import {expect,it} from 'vitest';
import {cleanSuggestions} from '../src/domain/suggestions';
it('accepts object buttons and serialized arrays without exposing escaped newlines',()=>{
 expect(cleanSuggestions('[{"text":"观察"},{"label":"询问"},{"content":"观察"}]')).toEqual(['观察','询问']);
 expect(cleanSuggestions('观察\n询问')).toEqual(['观察','询问']);
});
