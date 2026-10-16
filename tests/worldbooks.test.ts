import {describe,it,expect} from 'vitest';
import {newWorldbook,newWorldEntry,importWorldbook,exportWorldbook,resolveWorldbooks,worldEntryWarnings,cleanLoreInsertions,cleanWorldbooks,type WorldEntry} from '../src/domain/worldbooks';
import {defaults,backup,parseBackup,newSession} from '../src/domain/story';
import {mergeWorldbookBackup,sessionLore} from '../src/app/useWorldbooks';
const ctx=(...messages:string[])=>({messages,userName:'祁言',charName:'叙述者',seed:'turn-1'});
const book=(entries:Partial<WorldEntry>[])=>({...newWorldbook('book'),entries:entries.map((e,i)=>({...newWorldEntry('e'+i),title:'条目'+i,content:'内容'+i,...e}))});
describe('酒馆世界书 JSON',()=>{
  it('导入对象 entries、蓝灯绿灯、次要词逻辑、数字角色及关闭条目',()=>{
    const b=importWorldbook(JSON.stringify({entries:{2:{uid:2,key:['学院'],keysecondary:['新生'],comment:'规则',content:'规则正文',selective:true,selectiveLogic:3,position:4,role:2,depth:3,order:130,disable:false},3:{content:'不触发',constant:true,disable:true}}}),'规则.json');
    expect(b.name).toBe('规则');expect(b.entries[0]).toMatchObject({id:'2',keys:['学院'],secondaryKeys:['新生'],logic:3,position:4,role:'assistant',depth:3,order:130});expect(b.entries[1].position).toBe(0);
    expect(resolveWorldbooks([b],ctx('学院新生')).entries).toHaveLength(1);
  });
  it('兼容 character_book entries 数组，仅读世界书不导入角色卡其他字段',()=>{
    const b=importWorldbook(JSON.stringify({data:{name:'角色卡不是世界书名',description:'不要导入',character_book:{name:'嵌入书',scan_depth:6,recursive_scanning:true,entries:[{id:7,keys:['猫'],secondary_keys:['白'],content:'内容',enabled:true,insertion_order:42,position:'before_char',extensions:{position:4,depth:2,role:1,case_sensitive:true,scan_depth:8}}]}}}));
    expect(b).toMatchObject({name:'嵌入书',scanDepth:6,recursive:true});expect(b.entries[0]).toMatchObject({id:'7',position:4,role:'user',depth:2,scanDepth:8,caseSensitive:true});expect(JSON.stringify(b)).not.toContain('不要导入');
  });
  it('导出可重新导入，保留未知数据和条目开关、概率、优先级',()=>{
    const b=importWorldbook(JSON.stringify({customMetadata:{a:'保留'},entries:{0:{uid:0,key:['a'],content:'原文',constant:true,disable:true,customOption:42,position:1,probability:25,useProbability:true}}}));
    b.entries[0].content='编辑后';b.entries[0].enabled=true;b.entries[0].order=9;
    const raw=JSON.parse(exportWorldbook(b)),again=importWorldbook(JSON.stringify(raw));
    expect(raw.customMetadata).toEqual({a:'保留'});expect(raw.entries[0].customOption).toBe(42);expect(again.entries[0]).toMatchObject({content:'编辑后',enabled:true,order:9,probability:25});
  });
  it('拒绝损坏文件、危险键、重复本地 ID 和超大注入',()=>{
    expect(()=>importWorldbook('bad')).toThrow();expect(()=>importWorldbook('{"entries":{},"__proto__":{}}')).toThrow();
    const b=book([{constant:true}]);expect(()=>cleanWorldbooks([b,b])).toThrow();expect(()=>cleanLoreInsertions([{content:'x'.repeat(100001),position:1,depth:4,role:'system',order:1}])).toThrow();
  });
  it('高级选项明确提示并跳过相关条目，不执行正则／脚本／向量或定时机制',()=>{
    for(const raw of [{key:['/a+/i']},{sticky:2},{vectorized:true},{automationId:'call'},{position:7,outletName:'x'},{group:'group'},{content:'{{getvar::x}}'},{triggers:['continue']},{matchScenario:true}]){
      const b=importWorldbook(JSON.stringify({entries:{0:{content:'正文',constant:true,...raw}}}));
      expect(worldEntryWarnings(b.entries[0]).length).toBeGreaterThan(0);expect(resolveWorldbooks([b],ctx('a')).entries).toHaveLength(0);
    }
  });
});
describe('世界书触发引擎',()=>{
  it('仅发送常驻或关键词命中的启用条目；标题不当作正文',()=>{
    const b=book([{constant:true,title:'不发送的标题'},{keys:['学院']},{keys:['未提到']},{constant:true,enabled:false}]);
    const result=resolveWorldbooks([b],ctx('学院'));expect(result.entries.map(e=>e.content)).toEqual(['内容0','内容1']);expect(JSON.stringify(result.entries)).not.toContain('不发送的标题');
  });
  it.each([[0,'学院 白',true],[0,'学院',false],[3,'学院 白 黑',true],[3,'学院 白',false],[2,'学院',true],[2,'学院 白',false],[1,'学院 白',true],[1,'学院 白 黑',false]])('选择逻辑 %s / %s', (logic,input,expected)=>{
    const b=book([{keys:['学院'],secondaryKeys:['白','黑'],logic:logic as number}]);expect(resolveWorldbooks([b],ctx(input as string)).entries.length>0).toBe(expected);
  });
  it('扫描深度按消息条数算，0 不扫描历史；大小写、英文整词和中文关键词',()=>{
    const b=book([{keys:['old'],scanDepth:1},{keys:['old'],scanDepth:2},{keys:['猫'],scanDepth:0},{keys:['cat'],wholeWords:true},{keys:['CAT'],caseSensitive:true},{keys:['学院'],wholeWords:true}]);
    expect(resolveWorldbooks([b],ctx('old 猫','concatenate 学院')).activated).toEqual(['book:e1','book:e5']);
    expect(resolveWorldbooks([b],ctx('cat CAT')).activated).toContain('book:e3');
  });
  it('递归处理链条、阻断和延迟，循环不重复插入',()=>{
    const b=book([{keys:['开始'],content:'学院'},{keys:['学院'],content:'银塔'},{keys:['银塔'],content:'开始',delayUntilRecursion:2},{keys:['学院'],excludeRecursion:true}]);b.recursive=true;
    const r=resolveWorldbooks([b],ctx('开始'));expect(r.entries).toHaveLength(3);expect(r.activated).not.toContain('book:e3');
    b.entries[0].preventRecursion=true;expect(resolveWorldbooks([b],ctx('开始')).entries).toHaveLength(1);
    b.entries[0].preventRecursion=false;b.recursive=false;expect(resolveWorldbooks([b],ctx('开始')).entries).toHaveLength(1);
  });
  it('概率 0／100 和同一回合稳定，超预算选择高优先级并给出提示',()=>{
    const b=book([{constant:true,probability:0},{constant:true,probability:100},{constant:true,probability:50},{constant:true,content:'x'.repeat(100),order:999}]);b.budget=100;
    const a=resolveWorldbooks([b],ctx(''));expect(a.entries.map(e=>e.order)).toEqual([999]);expect(a.warnings.length).toBeGreaterThan(0);expect(resolveWorldbooks([b],ctx(''))).toEqual(a);
  });
  it('只展开一次 user / char 宏，persona 匹配不默认开启',()=>{
    const b=book([{keys:['{{user}}'],content:'{{user}} 与 {{char}}'},{keys:['测试人设'],extra:JSON.stringify({matchPersonaDescription:true})}]);
    expect(resolveWorldbooks([b],{...ctx('祁言'),persona:'测试人设'}).entries.map(e=>e.content)).toEqual(['祁言 与 叙述者','内容1']);
    expect(resolveWorldbooks([b],{...ctx(''),userName:'{{char}}'}).entries).toHaveLength(0);
  });
  it('大量 persona 宏展开受预算保护，不生成巨大提示词',()=>{
    const b=book([{constant:true,content:'{{persona}}'.repeat(1000)}]);
    const result=resolveWorldbooks([b],{...ctx(''),persona:'x'.repeat(10000)});
    expect(result.entries).toEqual([]);expect(result.warnings[0]).toContain('宏展开超出预算');
  });
});
describe('本地存档与世界书隔离',()=>{
  it('本地备份保留世界书及存档绑定，旧备份无需世界书字段',()=>{
    const p=defaults(),s=newSession('存档',{name:'玩家',appearance:'',background:'',personality:''},'开场');p.worldbooks=[book([{keys:['学院']}])];p.defaultWorldbookIds=['book'];s.worldbookIds=['book'];
    const saved=parseBackup(backup({version:1,preferences:p,sessions:[s]}));expect(saved.sessions[0].worldbookIds).toEqual(['book']);expect(saved.preferences.worldbooks?.[0].entries[0].keys).toEqual(['学院']);
    const old=defaults();delete old.worldbooks;delete old.defaultWorldbookIds;expect(parseBackup(backup({version:1,preferences:old,sessions:[]})).preferences.worldbooks).toEqual([]);
  });
  it('追加备份重映射世界书 ID，不覆盖现有同名书或串绑到原存档',()=>{
    const p=defaults(),incoming=defaults(),a=newSession('甲',{name:'甲',appearance:'',background:'',personality:''},''),b=newSession('乙',{name:'乙',appearance:'',background:'',personality:''},'');
    p.worldbooks=[book([{constant:true,content:'原书'}])];incoming.worldbooks=[book([{constant:true,content:'导入书'}])];a.worldbookIds=['book'];b.worldbookIds=['book'];mergeWorldbookBackup(p,incoming,[b]);
    expect(a.worldbookIds).toEqual(['book']);expect(b.worldbookIds).not.toEqual(['book']);expect(p.worldbooks?.find(x=>x.id===b.worldbookIds![0])?.entries[0].content).toBe('导入书');
  });
  it('每个存档只触发绑定的书，并且只扫描所选完整分支',()=>{
    const p=defaults(),s=newSession('甲',{name:'甲',appearance:'',background:'',personality:''},'开场');p.worldbooks=[book([{keys:['学院']},{keys:['另一个分支']}]),{...book([{constant:true,content:'不可发送'}]),id:'other'}];s.worldbookIds=['book'];
    s.turns=[{id:'t',input:'行动',selected:0,variants:[{id:'v',text:'学院',status:'complete',createdAt:''},{id:'x',text:'另一个分支',status:'complete',createdAt:''}]}];
    expect(sessionLore(p,s,1,'继续','t2','叙述者').entries.map(e=>e.content)).toEqual(['内容0']);s.worldbookIds=[];expect(sessionLore(p,s,1,'继续','t2','叙述者').entries).toEqual([]);
  });
});
