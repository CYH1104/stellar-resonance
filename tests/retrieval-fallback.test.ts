import {expect,it,vi} from 'vitest';import {retrieve} from '../src/memory/retrieval';
it('worker不可用时仍能在本地按关键词检索，未完成或旧截取事件不混入',async()=>{
 const items=[{id:'old',kind:'event' as const,text:'图书馆旧截取',createdAt:''},{id:'pending',kind:'event' as const,status:'pending' as const,text:'图书馆待补记',createdAt:''},{id:'food',kind:'note' as const,text:'食堂菜单',createdAt:''},{id:'book',kind:'note' as const,text:'图书馆借书约定',createdAt:''}];
 const result=await retrieve(items,'图书馆');expect(result[0].id).toBe('book');expect(result.some(m=>['old','pending'].includes(m.id))).toBe(false);
});
it('其他向量模型或已编辑文字的旧向量不用于本轮相似度计算',async()=>{
 const items=[{id:'stale',kind:'note' as const,text:'早餐',createdAt:'',vector:{model:'other',text:'早餐',values:[1,0]}},{id:'valid',kind:'note' as const,text:'图书馆资料',createdAt:'',vector:{model:'current',text:'图书馆资料',values:[1,0]}},{id:'edited',kind:'note' as const,text:'晚餐',createdAt:'',vector:{model:'current',text:'旧文',values:[1,0]}}];
 expect((await retrieve(items,'借书','current',[1,0]))[0].id).toBe('valid');
});
