<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {memoryDatabase,databasePage,type MemoryTableId} from '../domain/memoryDatabase';
import MemoryRecordEditor from './MemoryRecordEditor.vue';
const props=defineProps<{w:ViewModel}>();
const tab=ref<MemoryTableId>('state'),query=ref(''),page=ref(1),editing=ref('');
const tables=computed(()=>props.w.active?memoryDatabase(props.w.active):[]);
const table=computed(()=>tables.value.find(t=>t.id===tab.value)!);
const result=computed(()=>table.value?databasePage(table.value,query.value,page.value):{rows:[],total:0,pages:1,current:1});
const editMemory=computed(()=>props.w.memories.find(m=>m.id===editing.value&&m.record));
const previewOpen=ref(false),previewQuery=ref(''),audience=ref(''),loading=ref(false),previewError=ref('');
const snapshot=ref<Awaited<ReturnType<ViewModel['previewMemoryInjection']>>>();
const actors=computed(()=>props.w.state?[props.w.state.player,...props.w.state.characters,...props.w.active?.terminal?.contacts||[]].filter((a,i,list)=>list.findIndex(b=>b.id===a.id)===i):[]);
let request=0;
watch([tab,query],()=>page.value=1);
watch(()=>props.w.active?.id,()=>{editing.value='';snapshot.value=undefined;page.value=1;request++;loading.value=false;});
watch([audience,previewQuery,()=>props.w.active?.updatedAt],()=>{snapshot.value=undefined;request++;loading.value=false;});
function jump(id:string){props.w.panel='story';setTimeout(()=>window.dispatchEvent(new CustomEvent('academy:story-turn',{detail:id})),100);}
async function preview(){const id=++request;loading.value=true;previewError.value='';try{const value=await props.w.previewMemoryInjection(previewQuery.value,audience.value?[audience.value]:[]);if(id===request)snapshot.value=value;}catch(e){if(id===request)previewError.value=e instanceof Error?e.message:String(e);}finally{if(id===request)loading.value=false;}}
</script>
<template>
 <section v-if="w.active" class="memory-database">
  <header><div><p class="eyebrow">MEMORY DATABASE</p><h2>记忆数据库</h2></div><span class="muted">沿当前剧情读取 · 保留来源与修订</span></header>
  <p class="muted">状态和人物来自已提交剧情，事件、事实和约定来自逐轮记忆。未明确的信息保留未知；切换剧情分支后，这里随之更新。</p>
  <nav aria-label="记忆分类"><button v-for="t in tables" :key="t.id" :aria-pressed="tab===t.id" @click="tab=t.id">{{t.name}} <small>{{t.rows.length}}</small></button></nav>
  <label class="search">筛选当前表<input v-model="query" placeholder="人物、事件、地点或来源轮次" /></label>
  <p class="scroll-hint">表格较宽时可左右滑动查看。</p><div class="table-scroll"><table><caption>{{table.name}} · {{result.total}}条</caption><thead><tr><th v-for="column in table.columns" :key="column">{{column}}</th><th>来源 / 操作</th></tr></thead><tbody><tr v-for="row in result.rows" :key="row.id"><td v-for="(cell,i) in row.cells" :key="i"><span class="cell">{{cell}}</span></td><td><button v-if="row.sourceTurn" @click="jump(row.sourceTurn)">查看来源</button><button v-if="row.memoryId" :disabled="w.busy||w.workingMemory" @click="editing=row.memoryId">编辑字段</button><details v-if="row.detail"><summary>完整记录</summary><pre>{{row.detail}}</pre></details><span v-if="!row.sourceTurn&&!row.memoryId">{{tab==='people'?'随剧情更新':'—'}}</span></td></tr><tr v-if="!result.rows.length"><td :colspan="table.columns.length+1">暂无匹配记录</td></tr></tbody></table></div>
  <div class="pager"><button :disabled="result.current<=1" @click="page=result.current-1">上一页</button><span>第 {{result.current}} / {{result.pages}} 页 · 每页20条</span><button :disabled="result.current>=result.pages" @click="page=result.current+1">下一页</button></div>
  <MemoryRecordEditor v-if="editMemory" :key="editMemory.id" :w="w" :memory="editMemory" @close="editing=''" />
  <button class="preview-toggle" :aria-expanded="previewOpen" @click="previewOpen=!previewOpen">{{previewOpen?'收起':'查看'}}模型记忆注入预览</button>
  <section v-if="previewOpen" class="injection-preview"><h3>下一次请求的记忆内容</h3><p>使用实际请求的记忆组装规则。这里只展示记忆部分；人物设定、最近对话和系统提示另行发送。空查询仅预览固定记忆；填写问题会执行检索，开启向量时可能请求一次向量 API。</p><label>接收对象<select v-model="audience"><option value="">正文叙事</option><option v-for="a in actors" :key="a.id" :value="a.id">{{a.name}}的终端视角</option></select></label><label>准备发送的问题<input v-model="previewQuery" placeholder="留空查看固定注入；填写后查看相关召回" /></label><button :disabled="loading||w.busy" @click="preview">{{loading?'正在生成预览…':'生成预览'}}</button><p v-if="previewError" role="alert">{{previewError}}</p><template v-if="snapshot"><p>{{snapshot.blocks.length}}段 · {{snapshot.blocks.join('').length}}字{{snapshot.trace?' · '+(snapshot.trace.mode==='keyword'?'关键词检索':'关键词 + 向量检索'): ' · 未执行检索'}}</p><p v-if="snapshot.trace?.fallback">{{snapshot.trace.fallback==='no-match'?'没有相关召回，仍保留固定记忆。':snapshot.trace.fallback}}</p><article v-for="(block,i) in snapshot.blocks" :key="i"><h4>记忆 {{i+1}}</h4><pre>{{block}}</pre></article><p v-if="!snapshot.blocks.length">当前没有可注入的记忆。知情范围未知的事实不会发给角色。</p></template></section>
 </section>
</template>
<style scoped>
.memory-database{padding:22px 0;margin:12px 0}header{display:flex;align-items:center;justify-content:space-between;gap:20px}h2{margin:4px 0 10px}nav{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}nav button{border-radius:7px;padding:10px 14px}nav button[aria-pressed=true]{background:var(--accent,#345b70);color:#fff}nav small{opacity:.75;margin-left:5px}.search{display:flex;align-items:center;gap:14px;margin:18px 0}.search input{flex:1;min-width:0}.scroll-hint{font-size:12px;opacity:.7}.table-scroll{overflow:auto;border:1px solid #8884;border-radius:10px}table{border-collapse:collapse;min-width:620px;width:100%;table-layout:fixed}caption{text-align:left;padding:12px;font-size:13px;color:var(--muted)}th,td{padding:14px;text-align:left;vertical-align:top;border-top:1px solid #8883;overflow-wrap:anywhere}th{font-weight:600;background:#8881}.cell{white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}td button{display:block;margin-bottom:8px;font-size:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto}td pre{min-width:200px}.pager{display:flex;justify-content:flex-end;gap:14px;align-items:center;margin:14px 0;font-size:13px}.injection-preview{padding:18px;border:1px solid #8884;margin-top:12px;border-radius:10px}.injection-preview label{display:block;margin:12px 0}.injection-preview input,.injection-preview select{width:100%}.injection-preview article{border-top:1px solid #8884;padding:10px 0}.preview-toggle{margin-top:12px}@media(max-width:600px){header{display:block}.search{display:block}.search input{width:100%;margin-top:6px}.pager{gap:8px;font-size:12px}nav button{padding:8px 10px}}
</style>
