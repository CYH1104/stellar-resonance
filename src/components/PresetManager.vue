<script setup lang="ts">
import FileImportButton from './FileImportButton.vue';
import {computed,ref,watch} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import type {Preset,PresetPromptGroup} from '../domain/contracts';
import {promptFolders} from '../domain/promptGroups';
import {cleanPreset,pinnedPromptIds,importTavernPreset} from '../domain/presets';
import DialogShell from './DialogShell.vue';
import PresetPromptEditor from './PresetPromptEditor.vue';
import {compatibilityCategories,restorePresetCompatibility,type CompatibilityCategory} from '../domain/presetCompatibility';
const props=defineProps<{w:ViewModel}>();
function updateTopP(event:Event){
 const input=event.target as HTMLInputElement;
 const value=input.valueAsNumber;
 props.w.presetParameters.topP=Number.isFinite(value)?Math.min(1,Math.max(0,value)):undefined;
 input.value=props.w.presetParameters.topP===undefined?'':String(props.w.presetParameters.topP);
}
const importing=ref(false);
const importReview=ref<{text:string;filename:string;rows:{index:number;entry:Preset}[];disabled:number[]}>();
async function confirmImport(){const review=importReview.value;if(!review||props.w.busy||importing.value)return;importing.value=true;try{props.w.importPreset(review.text,review.filename,review.disabled);if(!props.w.problem){await props.w.save();importReview.value=undefined;}}finally{importing.value=false;}}

const compatibilityRows=computed(()=>props.w.presetEntries.filter(p=>p.compatibility));
function categoryLabels(p:Preset){return p.compatibility?.categories.map(c=>compatibilityCategories[c]).join('、');}
async function restoreCompatibility(category?:CompatibilityCategory){if(props.w.busy)return;restorePresetCompatibility(props.w.presetEntries,category);await props.w.save();}
const counts=computed(()=>({total:props.w.presetEntries.length,listed:props.w.presetEntries.filter(p=>p.included!==false).length,enabled:props.w.presetEntries.filter(p=>p.included!==false&&p.enabled&&p.group?.enabled!==false&&!p.marker).length}));
const query=ref(''),library=ref(''),dragged=ref(''),drafts=ref<Record<string,Preset>>({}),originals=ref<Record<string,Preset>>({}),expanded=ref<string[]>([]),deleting=ref(false);
const rows=computed(()=>props.w.presetEntries.filter(p=>p.included!==false));
const unused=computed(()=>props.w.presetEntries.filter(p=>p.included===false));
const shown=computed(()=>rows.value.filter(p=>!query.value.trim()||(p.name+' '+p.content+' '+p.identifier).toLowerCase().includes(query.value.trim().toLowerCase())));
const folders=computed(()=>promptFolders(rows.value));
const folderOptions=computed(()=>promptFolders(props.w.presetEntries).filter(g=>g.id!=='__ungrouped').map(({entries,...g})=>g));
const shownFolders=computed(()=>folders.value.map(folder=>({...folder,shown:folder.entries.filter(p=>!query.value.trim()||(folder.name+' '+p.name+' '+p.content+' '+p.identifier).toLowerCase().includes(query.value.trim().toLowerCase()))})).filter(folder=>folder.shown.length));
const ungroupedCollapsed=ref(false),groupForm=ref<{id:string;name:string;members:string[]}>(),deletingGroup=ref<{id:string;name:string}>();
function patchGroup(id:string,patch:Partial<PresetPromptGroup>){for(const p of props.w.presetEntries)if(p.group?.id===id)p.group={...p.group,...patch};}
function groupIsOpen(folder:{id:string;collapsed:boolean}){return !!query.value.trim()||(folder.id==='__ungrouped'?!ungroupedCollapsed.value:!folder.collapsed);}
function toggleGroup(folder:{id:string;collapsed:boolean}){if(folder.id==='__ungrouped')ungroupedCollapsed.value=!ungroupedCollapsed.value;else patchGroup(folder.id,{collapsed:!folder.collapsed});}
function foldGroups(){ungroupedCollapsed.value=true;for(const folder of folders.value)if(folder.id!=='__ungrouped')patchGroup(folder.id,{collapsed:true});}
function editGroup(id?:string){const folder=folderOptions.value.find(g=>g.id===id);groupForm.value={id:folder?.id||crypto.randomUUID(),name:folder?.name||'',members:props.w.presetEntries.filter(p=>p.group?.id===id&&id!==undefined).map(p=>p.id)};}
async function saveGroup(){if(props.w.busy||!groupForm.value?.name.trim()||!groupForm.value.members.length)return;const form=groupForm.value;
 const old=folderOptions.value.find(g=>g.id===form.id);const group:PresetPromptGroup={id:form.id,name:form.name.trim(),order:old?.order??Math.min(10000,Math.max(-1,...folderOptions.value.map(g=>g.order))+1),enabled:old?.enabled??true,collapsed:old?.collapsed??false};
 for(const p of props.w.presetEntries){if(form.members.includes(p.id))p.group={...group};else if(p.group?.id===form.id)p.group=null;}
 await props.w.save();if(!props.w.problem)groupForm.value=undefined;
}
async function removeGroup(){if(props.w.busy||!deletingGroup.value)return;for(const p of props.w.presetEntries)if(p.group?.id===deletingGroup.value.id)p.group=null;await props.w.save();if(!props.w.problem)deletingGroup.value=undefined;}
const pinned=(p:Preset)=>pinnedPromptIds.includes(p.identifier||'');
watch(()=>props.w.currentPreset,()=>{drafts.value={};originals.value={};expanded.value=[];query.value='';library.value='';groupForm.value=undefined;deletingGroup.value=undefined;ungroupedCollapsed.value=false;});
function edit(p:Preset){
  if(!drafts.value[p.id]){drafts.value[p.id]={role:'system',position:'before',depth:4,order:100,...JSON.parse(JSON.stringify(p))};originals.value[p.id]=JSON.parse(JSON.stringify(drafts.value[p.id]));}
  if(!expanded.value.includes(p.id))expanded.value.push(p.id);
  if(p.group)patchGroup(p.group.id,{collapsed:false});else ungroupedCollapsed.value=false;
}
function fold(id:string){expanded.value=expanded.value.filter(value=>value!==id);}
function toggle(p:Preset){if(expanded.value.includes(p.id))fold(p.id);else edit(p);}
function cancel(id:string){fold(id);delete drafts.value[id];delete originals.value[id];}
function expandAll(){ungroupedCollapsed.value=false;for(const folder of folders.value)if(folder.id!=='__ungrouped')patchGroup(folder.id,{collapsed:false});}
function cleanedDraft(id:string){
  const target=props.w.presetEntries.find(p=>p.id===id),draft=drafts.value[id];
  if(!target||!draft)return;
  const original=originals.value[id];
  const edits=Object.fromEntries(Object.entries(draft).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(original?.[key as keyof Preset])));
  const value=cleanPreset({...target,...edits,enabled:target.enabled,included:target.included,setId:target.setId,setName:target.setName});
  if(value.group){const latest=props.w.presetEntries.find(p=>p.group?.id===value.group?.id)?.group;if(latest)value.group={...latest};}
  return {target,value};
}
async function saveDraft(id:string){if(props.w.busy)return;try{
  const change=cleanedDraft(id);if(!change)return;
  Object.assign(change.target,change.value);props.w.problem='';await props.w.save();if(!props.w.problem)cancel(id);
}catch(e){props.w.problem=e instanceof Error?e.message:'条目未保存';}}
async function saveAll(){if(props.w.busy)return;try{
  const changes=Object.keys(drafts.value).map(cleanedDraft).filter(change=>!!change);
  for(const change of changes)Object.assign(change.target,change.value);
  props.w.problem='';await props.w.save();
  if(!props.w.problem)for(const change of changes){drafts.value[change.target.id]=JSON.parse(JSON.stringify(change.target));originals.value[change.target.id]=JSON.parse(JSON.stringify(change.target));}
}catch(e){props.w.problem=e instanceof Error?e.message:'预设未保存';}}
function removePrompt(id:string){props.w.removePresetEntry(id);cancel(id);}
function rename(name:string){if(props.w.busy)return;for(const p of props.w.presetEntries){p.setId=props.w.currentPreset;p.setName=name;}}
async function readPreset(file:File){if(importing.value||props.w.busy||importReview.value)return;importing.value=true;try{
 if(file.size>5*1024*1024)throw Error('预设文件最多5MB');const text=await file.text();
 const preview=importTavernPreset(text,file.name,{preserveOutputs:props.w.preferences.preservePresetOutputs===true});
 const rows=preview.entries.flatMap((entry,index)=>entry.compatibility?[{index,entry}]:[]);
 if(rows.length){importReview.value={text,filename:file.name,rows,disabled:rows.filter(r=>r.entry.compatibility?.verdict==='disabled').map(r=>r.index)};return;}
 props.w.importPreset(text,file.name);if(!props.w.problem)await props.w.save();
 }catch(e){props.w.problem=e instanceof Error?e.message:'无法读取预设文件';}finally{importing.value=false;}}

async function importFile(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];try{if(file)await readPreset(file);}finally{input.value='';}}
function dropPreset(event:DragEvent){const file=event.dataTransfer?.files[0];if(file)void readPreset(file);}

function drop(id:string){if(props.w.busy||!dragged.value)return;const entries=props.w.presetEntries;props.w.movePresetTo(entries.findIndex(p=>p.id===dragged.value),entries.findIndex(p=>p.id===id));dragged.value='';}
function moveVisible(p:Preset,offset:number){const siblings=rows.value.filter(row=>row.group?.id===p.group?.id);const to=siblings[siblings.indexOf(p)+offset];if(to)props.w.movePresetTo(props.w.presetEntries.indexOf(p),props.w.presetEntries.indexOf(to));}
function insert(){const p=props.w.presetEntries.find(p=>p.id===library.value);if(!p||props.w.busy)return;p.included=true;p.enabled=true;props.w.movePresetTo(props.w.presetEntries.indexOf(p),props.w.presetEntries.length-1);library.value='';}
function newPrompt(){props.w.addPresetEntry();const p=props.w.presetEntries.at(-1);if(p){const i=props.w.presetEntries.length-1;props.w.movePresetTo(i,i);edit(p);}}
function copyPrompt(p:Preset){if(props.w.busy||p.marker)return;const id=crypto.randomUUID(),q={...JSON.parse(JSON.stringify(p)),id,identifier:id,name:p.name+'（副本）',included:true};props.w.preferences.presets.push(q);edit(q);}
function toggleAll(enabled:boolean){if(props.w.busy)return;for(const p of rows.value)p.enabled=enabled;}
function removeSet(){props.w.removePresetSet();deleting.value=false;}
</script>
<template>
  <section class="surface preset-manager" @dragover.prevent @drop.prevent="dropPreset">
    <header class="panel-heading"><div><p class="eyebrow">PRESETS / 提示词管理</p><h1>预设</h1></div><div class="actions preset-primary-actions"><FileImportButton label="导入酒馆预设" accept=".json,application/json" :disabled="w.busy||importing" @change="importFile" /><button class="primary" :disabled="w.busy" @click="saveAll">保存预设</button></div></header>
    <p class="preset-import-hint" role="status">{{importing?'正在导入并保存…':'选择或拖入酒馆 JSON 预设，导入后自动选中并保存在当前浏览器。'}}</p>
    <p class="preset-counts">共 {{counts.total}} 条 · 列表 {{counts.listed}} 条 · 开启 {{counts.enabled}} 条提示词</p>
    <p class="rail-note">如果正文显示异常，请检查预设中是否仍开启了美化、小剧场等条目；可尝试关闭后重试。</p>
    <label class="toggle"><input v-model="w.preferences.preservePresetOutputs" type="checkbox" :disabled="w.busy" />后续导入保留预设自带的状态栏、选项和小剧场（可能重复输出；不恢复外部 HTML 美化）</label>
    <details v-if="compatibilityRows.length" class="import-report" open><summary>预设兼容检测 · {{compatibilityRows.length}} 条</summary><p class="rail-note">只调整导入时的开关，不删除原文；恢复操作保留原本关闭的条目。</p><div class="actions"><button :disabled="w.busy" @click="restoreCompatibility()">恢复全部自动调整</button><button :disabled="w.busy" @click="restoreCompatibility('choices')">只恢复选项类</button></div><ul><li v-for="p in compatibilityRows" :key="p.id"><strong>{{p.name}}</strong> · {{categoryLabels(p)}} · {{p.compatibility!.verdict==='review'?'待核查（未自动关闭）':p.compatibility!.restored?'已恢复原开关':p.enabled?'用户已开启':p.compatibility!.originalEnabled?'已自动关闭':'原本关闭'}}：{{p.compatibility!.reason}}</li></ul></details>
    
    <div class="field-grid"><label>当前预设<select v-model="w.preferences.activePreset" :disabled="w.busy"><option v-for="s in w.presetSets" :key="s.id" :value="s.id">{{s.name}}</option></select></label><label>预设名称<input :value="w.presetSets.find(s=>s.id===w.currentPreset)?.name" maxlength="180" :disabled="w.busy" @input="rename(($event.target as HTMLInputElement).value)" /></label></div>
    <div class="actions"><button :disabled="w.busy" @click="w.addPresetSet()">新建预设</button><button :disabled="w.busy" @click="w.duplicatePresetSet()">另存为副本</button><button :disabled="w.busy" @click="w.exportPreset()">导出预设</button><button class="danger" :disabled="w.busy" @click="deleting=true">删除预设</button></div>
    <details class="import-report" open><summary>采样参数 · 随当前预设保存</summary><div class="field-grid"><label>Temperature<input v-model.number="w.presetParameters.temperature" type="number" min="0" max="2" step="0.05" :disabled="w.busy" /></label><label>最大输出 Token<input v-model.number="w.presetParameters.maxTokens" type="number" min="1" max="32000" step="1" list="preset-token-options" :disabled="w.busy" /><datalist id="preset-token-options"><option v-for="n in [1600,2048,4096,8192,16384,32000]" :key="n" :value="n" /></datalist><span class="rail-note">手动输入 1–32000，或选择常用值</span><span class="token-shortcuts"><button v-for="n in [1600,2048,4096,8192,16384,32000]" :key="n" type="button" :disabled="w.busy" @click="w.presetParameters.maxTokens=n">{{n}}</button></span></label><label>Top P<input  :value="w.presetParameters.topP" @input="updateTopP" type="number" min="0" max="1" step="0.05" placeholder="默认1" :disabled="w.busy" /></label><label>Frequency penalty<input v-model.number="w.presetParameters.frequencyPenalty" type="number" min="-2" max="2" step="0.1" placeholder="默认0" :disabled="w.busy" /></label><label>Presence penalty<input v-model.number="w.presetParameters.presencePenalty" type="number" min="-2" max="2" step="0.1" placeholder="默认0" :disabled="w.busy" /></label></div></details>
    <details v-if="w.presetWarnings.length" class="import-report"><summary>导入结果与兼容说明</summary><ul><li v-for="(note,i) in w.presetWarnings" :key="i">{{note}}</li></ul></details>
    <details class="subsection prompt-group" open><summary>提示词管理器</summary>
      <div class="actions"><button :disabled="w.busy" @click="editGroup()">新建分组</button><button :disabled="w.busy" @click="newPrompt">新建提示词</button><button :disabled="w.busy" @click="toggleAll(true)">全部开启</button><button :disabled="w.busy" @click="toggleAll(false)">全部关闭</button><button type="button" @click="expandAll">全部展开</button><button type="button" @click="foldGroups">全部收起</button></div>
      <div class="field-grid"><label>搜索条目<input v-model="query" placeholder="名称、内容或标识" /></label><label>提示词库<select v-model="library" :disabled="w.busy"><option value="">选择未插入的提示词</option><option v-for="p in unused" :key="p.id" :value="p.id">{{p.name}}</option></select></label></div><button :disabled="!library||w.busy" @click="insert">插入提示词</button>
      <div class="prompt-folders">
        <section v-for="folder in shownFolders" :key="folder.id" class="prompt-folder" :class="{'prompt-folder-muted':!folder.enabled}">
          <header class="prompt-folder-heading">
            <button type="button" class="prompt-folder-title" :aria-expanded="groupIsOpen(folder)" :aria-controls="'folder-'+folder.id" @click="toggleGroup(folder)"><span aria-hidden="true">{{groupIsOpen(folder)?'▾':'▸'}}</span> {{folder.name}} <small>({{folder.entries.filter(p=>p.enabled).length}}/{{folder.entries.length}})</small></button>
            <template v-if="folder.id!=='__ungrouped'"><label class="toggle"><input type="checkbox" :checked="folder.enabled" :aria-label="'启用分组 '+folder.name" :disabled="w.busy" @change="patchGroup(folder.id,{enabled:($event.target as HTMLInputElement).checked})" /></label><button type="button" :disabled="w.busy" :aria-label="'编辑分组 '+folder.name" @click="editGroup(folder.id)">编辑分组</button><button type="button" :disabled="w.busy" :aria-label="'删除分组 '+folder.name" @click="deletingGroup={id:folder.id,name:folder.name}">删除分组</button></template>
          </header>
          <div v-if="groupIsOpen(folder)" :id="'folder-'+folder.id" class="prompt-list prompt-folder-children">
            <article v-for="p in folder.shown" :key="p.id" class="prompt-item" :class="{'prompt-dragged':dragged===p.id,'prompt-child-disabled':!p.enabled}" @dragover.prevent @drop.prevent="drop(p.id)">
              <header class="prompt-row"><button type="button" class="prompt-grip" :draggable="!w.busy&&!query.trim()" :disabled="w.busy||!!query.trim()" @dragstart="dragged=p.id" @dragend="dragged=''" :aria-label="'拖动排序 '+p.name" title="拖动调整条目顺序">⠿</button><label class="toggle"><input v-model="p.enabled" type="checkbox" :aria-label="'开启 '+p.name" :disabled="w.busy" /></label><span class="prompt-title">{{p.name||'未命名条目'}}</span><span class="tag">{{p.marker?'服务器占位':p.position==='in-chat'?'深度 '+(p.depth??4):p.role||'system'}}</span><span v-if="pinned(p)" class="tag">固定</span><button :disabled="w.busy||folder.entries.indexOf(p)===0" @click="moveVisible(p,-1)" aria-label="上移条目">↑</button><button :disabled="w.busy||folder.entries.indexOf(p)===folder.entries.length-1" @click="moveVisible(p,1)" aria-label="下移条目">↓</button><button type="button" :aria-expanded="expanded.includes(p.id)" :aria-controls="'prompt-editor-'+p.id" @click="toggle(p)">{{expanded.includes(p.id)?'收起编辑':'编辑条目'}}</button><button v-if="!pinned(p)" :disabled="w.busy" @click="p.included=false;p.enabled=false">移出列表</button></header>
              <PresetPromptEditor v-if="expanded.includes(p.id)&&drafts[p.id]" :id="'prompt-editor-'+p.id" :w="w" :draft="drafts[p.id]" :groups="folderOptions" :pinned="pinned(p)" @save="saveDraft(p.id)" @cancel="cancel(p.id)" @copy="copyPrompt(drafts[p.id])" @remove="removePrompt(p.id)" />
            </article>
          </div>
        </section>
      </div>
      <p v-if="!shown.length" class="empty">没有匹配条目。</p>
    </details>
    <DialogShell v-if="importReview" title="导入前确认条目开关" @close="!importing&&(importReview=undefined)">
      <p>以下条目可能与内置功能冲突，不一定需要关闭。勾选表示导入时关闭；取消勾选保留文件原开关，不删除任何内容。确认前不会导入。</p>
      <div class="actions"><button :disabled="importing" @click="importReview.disabled=importReview.rows.map(r=>r.index)">一键全选关闭</button><button :disabled="importing" @click="importReview.disabled=[]">全部取消勾选</button></div>
      <div style="max-height:50vh;overflow:auto"><article v-for="row in importReview.rows" :key="row.index" class="import-report"><label class="toggle"><input v-model="importReview.disabled" type="checkbox" :value="row.index" :disabled="importing" />关闭：{{row.entry.name}}</label><p>{{categoryLabels(row.entry)}} · {{row.entry.compatibility!.verdict==='disabled'?'建议关闭':'可能有影响，请自行判断'}} · {{row.entry.compatibility!.originalEnabled?'原本开启':'原本关闭'}}</p><p>{{row.entry.compatibility!.reason}}</p><details><summary>查看条目原文</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">{{row.entry.content}}</pre></details></article></div>
      <div class="actions"><button :disabled="importing" @click="importReview=undefined">取消导入</button><button class="primary" :disabled="importing||w.busy" @click="confirmImport">确认并导入（关闭 {{importReview.disabled.length}} 条）</button></div>
    </DialogShell>
    <DialogShell v-if="groupForm" :title="'管理分组 · '+(groupForm.name||'新分组')" @close="groupForm=undefined"><label>分组名称<input v-model="groupForm.name" maxlength="200" :disabled="w.busy" /></label><div class="prompt-group-members"><label v-for="p in w.presetEntries" :key="p.id" class="toggle"><input v-model="groupForm.members" type="checkbox" :value="p.id" :disabled="w.busy" />{{p.name||'未命名条目'}}</label></div><div class="actions"><button :disabled="w.busy||!groupForm.name.trim()||!groupForm.members.length" @click="saveGroup">保存分组</button><button @click="groupForm=undefined">取消</button></div></DialogShell>
    <DialogShell v-if="deletingGroup" title="删除这个分组？" @close="deletingGroup=undefined"><p>删除“{{deletingGroup.name}}”后，其中的小条目会放回“未分组”，提示词内容和各自开关保留。</p><div class="actions"><button @click="deletingGroup=undefined">取消</button><button class="danger" :disabled="w.busy" @click="removeGroup">确认删除分组</button></div></DialogShell>
    <DialogShell v-if="deleting" title="删除当前预设？" @close="deleting=false"><p>将删除《{{w.presetSets.find(s=>s.id===w.currentPreset)?.name}}》的条目及采样参数。已导出的文件会保留。</p><div class="actions"><button @click="deleting=false">取消</button><button class="danger" :disabled="w.busy" @click="removeSet">确认删除</button></div></DialogShell>
  </section>
</template>
