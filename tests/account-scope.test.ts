import 'fake-indexeddb/auto';
import {it,expect,vi} from 'vitest';
import {accountDatabase,accountStorage} from '../src/storage/accountScope';
import {IndexedDbRepository} from '../src/storage/repository';
import {defaults,newSession} from '../src/domain/story';
it('separates browser saves and credentials by signed-in account while preserving legacy storage',async()=>{
  const g=globalThis as typeof globalThis&{__ACADEMY_ACCOUNT__?:{id:string;email:string}};
  const first=crypto.randomUUID(),second=crypto.randomUUID();
  const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)});
  try{
    expect(accountDatabase('legacy')).toBe('legacy');
    g.__ACADEMY_ACCOUNT__={id:first,email:'one@example.com'};
    accountStorage.setItem('academy:main-session:v1','one');
    const a=new IndexedDbRepository();await a.write({version:1,sessions:[newSession('First',{name:'One',appearance:'',personality:'',background:''},'')],preferences:defaults()});
    g.__ACADEMY_ACCOUNT__={id:second,email:'two@example.com'};
    expect(accountStorage.getItem('academy:main-session:v1')).toBeNull();expect(await new IndexedDbRepository().read()).toBeUndefined();
    accountStorage.setItem('academy:main-session:v1','two');
    g.__ACADEMY_ACCOUNT__={id:first,email:'one@example.com'};
    expect(accountStorage.getItem('academy:main-session:v1')).toBe('one');expect((await new IndexedDbRepository().read())?.sessions[0].name).toBe('First');
  }finally{delete g.__ACADEMY_ACCOUNT__;vi.unstubAllGlobals();}
});
