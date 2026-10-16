import {test} from 'node:test';
import assert from 'node:assert/strict';
import {identityOf,publicActor} from '../server/card.mjs';
import {buildMessages,normalizeModelState,buildPersonaMessages,parsePersonaResult} from '../server/ai.mjs';
test('现有身份资料提取院系、年级、现职和多个组织；不将亲属／前任职位当本人现职',()=>{
 assert.equal(identityOf({title:'破军系 · 破格录取天才 · 二年级'}),'破军系 二年级');
 assert.equal(identityOf({title:'织网者系首席 · 四年级'}),'织网者系 四年级首席');
 assert.equal(identityOf({title:'领航者系 四年级首席 · 学生会 会长'}),'领航者系 四年级首席\n学生会 会长');
 assert.equal(identityOf({title:'学院董事会 · 院长'}),'学院董事会 院长');
 assert.equal(identityOf({title:'破军系 · 实战战术总教官 · 前「白银之刃」指挥官'}),'破军系 实战战术总教官');
 assert.equal(identityOf({title:'基石系 · 联邦中央医院院长之子 · 三年级'}),'基石系 三年级');
 assert.equal(identityOf({identity:'自定义组织 职位\n学生会 会长',title:'不应覆盖'}),'自定义组织 职位\n学生会 会长');
 assert.equal(identityOf({title:'语言学天才'}),undefined);
});
test('精神体设定进入 AI 填表及正文上下文，OS 明确只允许符合性格的内心独白',()=>{
 const card={world:{name:'世界'},places:[],characters:[]},persona={name:'玩家',appearance:'',background:'',personality:'',identity:'破军系 一年级',ability:'言出法随',spiritAnimal:'白猫',spiritName:'糯米',spiritAppearance:'蓝眼睛',spiritPersonality:'嘴硬心软',spiritAbility:'情绪感知'};
 const {messages}=buildMessages(card,{persona,state:{player:{id:'player',name:'玩家',present:true},characters:[]},input:'打招呼',history:[],memories:[],presets:[]});
 assert(messages[0].content.includes('内心独白'));assert(messages[0].content.includes('不写甩尾'));assert(messages[0].content.includes('不能混进 identity'));assert(messages[2].content.includes('嘴硬心软'));assert(messages[2].content.includes('情绪感知'));
 const helper=buildPersonaMessages(card,'帮我补全',persona);assert(helper[0].content.includes('spiritPersonality'));assert.equal(parsePersonaResult(JSON.stringify(persona)).spiritName,'糯米');
 const result=normalizeModelState(card,{player:{id:'player',name:'玩家',present:true},characters:[]},{presentCharacterIds:[],event:'测试',player:{identity:'破军系新生，异能「言出法随」'}});assert.equal(result.player.identity,'破军系新生');assert.equal(result.player.ability,'言出法随');
});
test('char 身份进入初始资料及剧情上下文，支持 MVU 更新，超长或错误类型被拒绝',()=>{
 const card={world:{name:'世界'},places:[],characters:[{id:'c',name:'角色',title:'领航者系 · 四年级首席'}]};
 const actor=publicActor(card.characters[0]);assert.equal(actor.identity,'领航者系 四年级首席');
 const request={persona:{name:'玩家'},state:{player:{id:'player',name:'玩家',present:true},characters:[{...actor,identity:'学生会 会长'}]},input:'参加任命',history:[],memories:[],presets:[],theaterSettings:[{slot:1,kind:'forum',enabled:false,title:'论坛',instruction:''},{slot:2,kind:'group',enabled:false,title:'群聊',instruction:''},{slot:3,kind:'fanfic',enabled:false,title:'同人文',instruction:''},{slot:4,kind:'custom',enabled:false,title:'其他',instruction:''}]};
 const built=buildMessages(card,request);assert.equal(built.state.characters[0].identity,'学生会 会长');
 const out=normalizeModelState(card,built.state,{presentCharacterIds:['c'],event:'参加任命',characters:[{id:'c',identity:'领航者系 四年级首席\n学生会 会长'}]},{theaterSettings:request.theaterSettings});assert.equal(out.characters[0].identity,'领航者系 四年级首席\n学生会 会长');
 for(const identity of [42,'x'.repeat(201)])assert.throws(()=>normalizeModelState(card,built.state,{presentCharacterIds:['c'],event:'错误更新',characters:[{id:'c',identity}]},{theaterSettings:request.theaterSettings}),e=>e.code==='MODEL_STATE_CHARACTERS_INVALID');
});
