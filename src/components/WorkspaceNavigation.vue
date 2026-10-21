<script setup lang="ts">
import {computed,onMounted,onBeforeUnmount,ref,watch} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import type {Panel} from '../domain/contracts';
import RandomEventControl from './RandomEventControl.vue';
import HiddenActorCards from './HiddenActorCards.vue';
import RegexPanel from './RegexPanel.vue';
const props=defineProps<{w:ViewModel;embedded:boolean}>();
const emit=defineEmits<{navigate:[panel:Panel];start:[];resume:[];home:[];reset:[];personas:[]}>();
const root=ref<HTMLElement>(),mobile=ref(false),group=ref('');
const primary:{id:Panel;label:string}[]=[{id:'story',label:'剧情'},{id:'memory',label:'记忆'},{id:'relations',label:'人物关系'},{id:'map',label:'地图'}];
const config:{id:Panel;label:string}[]=[{id:'settings',label:'API 设置'},{id:'presets',label:'预设管理'},{id:'worldbooks',label:'世界书'},{id:'game-settings',label:'小剧场设置'}];
const blocked=computed(()=>props.w.workingPersona||props.w.creatingGame);
const current=computed(()=>[...primary,...config,{id:'saves',label:'存档'},{id:'status',label:'人物状态'},{id:'theaters',label:'小剧场'},{id:'format-errors',label:'运行日志'}].find(t=>t.id===props.w.panel)?.label||'游戏');
function close(){group.value='';mobile.value=false;}
function go(panel:Panel){close();emit('navigate',panel);}
function outside(e:PointerEvent){if(!root.value?.contains(e.target as Node))close();}
function escape(e:KeyboardEvent){
 if(e.key!=='Escape')return;
 // Let native dialog cancellation run, without the academy's older Esc shortcut.
 if(document.querySelector('dialog[open]')){e.stopImmediatePropagation();return;}
 if(group.value||mobile.value){e.preventDefault();e.stopImmediatePropagation();close();}
}
watch(()=>props.w.panel,close);
onMounted(()=>{document.addEventListener('pointerdown',outside);window.addEventListener('keydown',escape,true);});
onBeforeUnmount(()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('keydown',escape,true);});
</script>
<template>
 <header ref="root" class="workspace-navigation">
  <div class="mobile-navigation-heading"><strong>{{current}}</strong><button :aria-expanded="mobile" aria-controls="workspace-modules" @click="mobile=!mobile">菜单 {{mobile?'▴':'▾'}}</button></div>
  <nav id="workspace-modules" aria-label="游戏模块" :class="{expanded:mobile}">
   <button v-for="tab in primary" :key="tab.id" :disabled="blocked" :class="{selected:w.panel===tab.id}" @click="go(tab.id)">{{tab.label}}</button>
   <div v-for="name in ['创作配置','更多','存档']" :key="name" class="navigation-group">
    <button :aria-expanded="group===name" :aria-controls="`navigation-${name}`" @click="group=group===name?'':name">{{name}} ▾</button>
    <div v-show="group===name" :id="`navigation-${name}`" class="navigation-dropdown">
     <template v-if="name==='创作配置'"><button v-for="tab in config" :key="tab.id" :disabled="blocked" @click="go(tab.id)">{{tab.label}}</button><button :disabled="blocked" @click="close();emit('personas')">人设档案</button><RegexPanel v-if="w.panel==='story'&&w.active" :w="w" /></template>
     <template v-else-if="name==='更多'">
      <RandomEventControl :preferences="w.preferences" :disabled="w.busy" />
      <button :aria-pressed="w.preferences.suggestionsEnabled!==false" :disabled="w.busy" @click="w.preferences.suggestionsEnabled=w.preferences.suggestionsEnabled===false">行动建议 · {{w.preferences.suggestionsEnabled!==false?'已开启':'已关闭'}}</button>
      <button :aria-pressed="w.hideFloors" @click="w.hideFloors=!w.hideFloors">自动隐藏楼层 · {{w.hideFloors?'已开启':'已关闭'}}</button>
      <HiddenActorCards :w="w" /><button @click="go('format-errors')">运行日志</button>
      <button :disabled="!w.active||blocked" @click="go('status')">人物状态</button><button :disabled="!w.active||blocked" @click="go('theaters')">查看小剧场</button>
      <button :disabled="!w.active" @click="emit('reset')">恢复默认布局</button>
     </template>
     <template v-else><button :disabled="blocked||w.busy||w.workingMemory" @click="close();emit('start')">新建存档</button><button :disabled="blocked||w.busy||w.workingMemory" @click="close();emit('resume')">切换存档</button><button :disabled="blocked" @click="go('saves')">导入 / 导出</button></template>
    </div>
   </div>
   <button :disabled="blocked" class="navigation-home" @click="close();emit('home')">{{embedded?'返回学院':'返回开场'}}</button>
  </nav>
 </header>
</template>
<style scoped>
.workspace-navigation{position:sticky;top:0;z-index:30;background:var(--color-background);border-bottom:1px solid var(--color-border);padding:8px 16px}
nav{display:flex;align-items:center;gap:6px;flex-wrap:wrap}nav button{white-space:nowrap}.navigation-group{position:relative}.navigation-home{margin-left:auto}.navigation-dropdown{position:absolute;top:100%;left:0;min-width:210px;max-height:70vh;overflow:auto;display:flex;flex-direction:column;gap:4px;padding:10px;background:var(--color-surface);border:1px solid var(--color-border);box-shadow:0 8px 24px #0003}.navigation-dropdown :deep(button){text-align:left}.mobile-navigation-heading{display:none}
@media(max-width:800px){.mobile-navigation-heading{display:flex;align-items:center;justify-content:space-between}nav{display:none;max-height:75vh;overflow:auto;align-items:stretch;flex-direction:column}nav.expanded{display:flex;padding-top:10px}.navigation-group>button{width:100%;text-align:left}.navigation-dropdown{position:static;max-height:none;box-shadow:none;margin:4px 0 8px}.navigation-home{margin-left:0}}
</style>
<style>
body:has(#academy-workspace:not([hidden])) :is(#apiSetupBtn,#presetImportBtn,#academySettings){display:none!important}
</style>
