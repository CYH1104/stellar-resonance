import {afterEach,it,expect,vi} from 'vitest';
import {resizeTextarea} from '../src/app/resizeTextarea';
afterEach(()=>vi.unstubAllGlobals());
it('grows and shrinks without ever collapsing the live editor or changing the user scroll position',()=>{
 vi.stubGlobal('getComputedStyle',()=>({borderTopWidth:'1px',borderBottomWidth:'1px'}));
 const writes:string[]=[],parent={scrollTop:1600,appendChild:vi.fn()},copy={style:{},value:'',disabled:false,tabIndex:0,scrollHeight:2200,removeAttribute:vi.fn(),setAttribute:vi.fn(),remove:vi.fn()};
 let height='2000px';const style={get height(){return height;},set height(value:string){writes.push(value);if(value==='auto'||value==='0px')parent.scrollTop=0;height=value;}};
 const field={parentElement:parent,value:'long persona',getBoundingClientRect:()=>({width:480}),cloneNode:()=>copy,style} as unknown as HTMLTextAreaElement;
 resizeTextarea(field);expect(writes).toEqual(['2202px']);expect(parent.scrollTop).toBe(1600);expect(copy.value).toBe('long persona');expect(copy.remove).toHaveBeenCalledOnce();
 copy.scrollHeight=2100;resizeTextarea(field);expect(writes).toEqual(['2202px','2102px']);expect(parent.scrollTop).toBe(1600);
 resizeTextarea(field);expect(writes).toHaveLength(2);
});
it('does not resize hidden editors and removes measurement copies if measurement fails',()=>{
 const clone=vi.fn();resizeTextarea({parentElement:{},getBoundingClientRect:()=>({width:0}),cloneNode:clone} as unknown as HTMLTextAreaElement);expect(clone).not.toHaveBeenCalled();
 const copy={style:{},removeAttribute(){},setAttribute(){},remove:vi.fn()};
 vi.stubGlobal('getComputedStyle',()=>{throw Error('measurement failed');});
 expect(()=>resizeTextarea({parentElement:{appendChild(){}},getBoundingClientRect:()=>({width:200}),cloneNode:()=>copy,value:'',style:{}} as unknown as HTMLTextAreaElement)).toThrow('measurement failed');
 expect(copy.remove).toHaveBeenCalledOnce();
});
