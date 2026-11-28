<script setup lang="ts">
import {computed,onMounted,onBeforeUnmount,ref,watch} from 'vue';
import type {Component} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import type {Panel} from '../domain/contracts';
import HiddenActorCards from './HiddenActorCards.vue';
import RegexPanel from './RegexPanel.vue';
import {Activity,BookOpen,Brain,Drama,House,Map,Settings,UsersRound} from '@lucide/vue';
const props=defineProps<{w:ViewModel;embedded:boolean}>();
const emit=defineEmits<{navigate:[panel:Panel];start:[];resume:[];home:[];reset:[];personas:[]}>();
const root=ref<HTMLElement>(),group=ref(''),mobileMore=ref(false);
const primary:{id:Panel;label:string;icon:Component}[]=[{id:'story',label:'剧情',icon:BookOpen},{id:'status',label:'人物状态',icon:Activity},{id:'theaters',label:'小剧场',icon:Drama},{id:'memory',label:'记忆',icon:Brain},{id:'relations',label:'人物关系',icon:UsersRound},{id:'map',label:'地图',icon:Map}];
const config:{id:Panel;label:string}[]=[{id:'settings',label:'API 设置'},{id:'presets',label:'预设管理'},{id:'worldbooks',label:'世界书'},{id:'game-settings',label:'小剧场设置'}];
const blocked=computed(()=>props.w.workingPersona||props.w.creatingGame);
function close(){group.value='';mobileMore.value=false;}
function go(panel:Panel){close();emit('navigate',panel);}
function toggleGroup(name:string){if(root.value)root.value.style.setProperty('--navigation-bottom',Math.max(0,root.value.getBoundingClientRect().bottom)+'px');group.value=group.value===name?'':name;}
function openMobileGroup(name:string){mobileMore.value=false;toggleGroup(name);}
function outside(e:PointerEvent){if(!root.value?.contains(e.target as Node))close();}
function escape(e:KeyboardEvent){
 if(e.key!=='Escape')return;
 // Let native dialog cancellation run, without the academy's older Esc shortcut.
 if(document.querySelector('dialog[open]')){e.stopImmediatePropagation();return;}
 if(group.value||mobileMore.value){e.preventDefault();e.stopImmediatePropagation();close();}
}
watch(()=>props.w.panel,close);
onMounted(()=>{document.addEventListener('pointerdown',outside);window.addEventListener('keydown',escape,true);});
onBeforeUnmount(()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('keydown',escape,true);});
</script>
<template>
 <header ref="root" class="workspace-navigation">
  <nav id="workspace-modules" aria-label="游戏模块">
   <button v-for="tab in primary" :key="tab.id" :data-nav-id="tab.id" class="navigation-primary" :aria-label="tab.label" :title="tab.label" :disabled="blocked||((tab.id==='status'||tab.id==='theaters')&&!w.active)" :class="{selected:w.panel===tab.id}" @click="go(tab.id)"><component :is="tab.icon" :size="18" :stroke-width="1.2" aria-hidden="true" /><span class="navigation-primary-label">{{tab.label}}</span></button>
   <div v-for="name in ['创作配置','更多','存档']" :key="name" class="navigation-group">
    <button :aria-expanded="group===name" :aria-controls="`navigation-${name}`" @click="toggleGroup(name)">{{name}} ▾</button>
    <div v-show="group===name" :id="`navigation-${name}`" class="navigation-dropdown">
     <template v-if="name==='创作配置'"><button v-for="tab in config" :key="tab.id" :disabled="blocked" @click="go(tab.id)">{{tab.label}}</button><button :disabled="blocked" @click="close();emit('personas')">人设档案</button><RegexPanel v-if="w.panel==='story'&&w.active" :w="w" /></template>
     <template v-else-if="name==='更多'">
      <button :aria-pressed="w.preferences.suggestionsEnabled!==false" :disabled="w.busy" @click="w.preferences.suggestionsEnabled=w.preferences.suggestionsEnabled===false">行动建议 · {{w.preferences.suggestionsEnabled!==false?'已开启':'已关闭'}}</button>
      <button :aria-pressed="w.hideFloors" @click="w.hideFloors=!w.hideFloors">自动隐藏楼层 · {{w.hideFloors?'已开启':'已关闭'}}</button>
      <HiddenActorCards :w="w" /><button @click="go('format-errors')">运行日志</button>
      <button :disabled="!w.active" @click="emit('reset')">恢复默认布局</button>
     </template>
     <template v-else><button :disabled="blocked||w.busy||w.workingMemory" @click="close();emit('start')">新建存档</button><button :disabled="blocked||w.busy||w.workingMemory" @click="close();emit('resume')">切换存档</button><button :disabled="blocked" @click="go('saves')">导入 / 导出</button></template>
    </div>
   </div>
   <button v-if="w.terminalCapability" class="navigation-terminal navigation-secondary" :aria-pressed="w.preferences.terminalEnabled===true" :disabled="blocked||(w.busy&&w.preferences.terminalEnabled!==true)" @click="w.setTerminalEnabled(w.preferences.terminalEnabled!==true)">手机终端 · {{w.preferences.terminalEnabled===true?(w.terminalEnabled?'已开启':'配置未就绪'):'已关闭'}}</button>
   <button class="navigation-cloud navigation-secondary" :disabled="blocked" @click="go('cloud-backup')">云端备份</button>
   <button class="navigation-logs navigation-secondary" @click="go('format-errors')">运行日志</button>
   <a class="navigation-manual navigation-secondary" href="http://43.138.251.91:8809" target="_blank" rel="noopener noreferrer" @click="close">教程手册入口</a>
   <button :disabled="blocked" class="navigation-home navigation-secondary" @click="close();emit('home')">{{embedded?'返回学院':'返回开场'}}</button>
   <div class="mobile-more">
    <button type="button" class="mobile-more-trigger" :aria-expanded="mobileMore" aria-controls="navigation-mobile-more" aria-label="更多" title="更多" @click="mobileMore=!mobileMore;group=''">
     <Settings :size="18" :stroke-width="1.2" aria-hidden="true" />
    </button>
    <div v-show="mobileMore" id="navigation-mobile-more" class="navigation-dropdown mobile-more-dropdown">
     <button type="button" @click="openMobileGroup('创作配置')">创作配置</button>
     <button type="button" @click="openMobileGroup('更多')">更多设置</button>
     <button type="button" @click="openMobileGroup('存档')">存档</button>
     <button v-if="w.terminalCapability" type="button" class="mobile-menu-terminal" :aria-pressed="w.preferences.terminalEnabled===true" :disabled="blocked||(w.busy&&w.preferences.terminalEnabled!==true)" @click="mobileMore=false;w.setTerminalEnabled(w.preferences.terminalEnabled!==true)">手机终端 · {{w.preferences.terminalEnabled===true?(w.terminalEnabled?'已开启':'配置未就绪'):'已关闭'}}</button>
     <button type="button" :disabled="blocked" @click="go('cloud-backup')">云端备份</button>
     <button type="button" @click="go('format-errors')">运行日志</button>
     <a class="mobile-menu-link" href="http://43.138.251.91:8809" target="_blank" rel="noopener noreferrer" @click="close">教程手册入口</a>
     <button type="button" :disabled="blocked" @click="close();emit('home')">{{embedded?'返回学院':'返回开场'}}</button>
    </div>
   </div>
   <button type="button" class="mobile-home-trigger" :aria-label="embedded?'返回学院':'返回开场'" :title="embedded?'返回学院':'返回开场'" :disabled="blocked" @click="close();emit('home')">
    <House :size="18" :stroke-width="1.2" aria-hidden="true" />
   </button>
  </nav>
 </header>
</template>
<style scoped>
.workspace-navigation{position:sticky;top:0;z-index:30;background:var(--color-background);border-bottom:1px solid var(--color-border);padding:8px 16px}
nav{display:flex;align-items:center;gap:6px;flex-wrap:wrap}nav button{white-space:nowrap}.navigation-manual{font:inherit;color:inherit;padding:7px 8px;white-space:nowrap;text-decoration:none}.navigation-manual:hover{text-decoration:underline}.navigation-group{position:relative}.navigation-home{margin-left:auto}.navigation-dropdown{position:absolute;top:100%;left:0;min-width:210px;max-height:70vh;overflow:auto;display:flex;flex-direction:column;gap:4px;padding:10px;background:var(--color-surface);border:1px solid var(--color-border);box-shadow:0 8px 24px #0003}.navigation-dropdown :deep(button){text-align:left}.mobile-more{display:none}
@media(max-width:800px){
 .workspace-navigation{padding:6px 8px}
 nav{display:flex;flex-direction:row;align-items:center;gap:2px 6px;flex-wrap:wrap}
 nav>button,.navigation-group>button{padding:7px 8px}
 .navigation-primary{display:inline-flex;align-items:center;justify-content:center;gap:5px}
 .navigation-primary-label{display:inline}
 .navigation-dropdown{position:fixed;top:var(--navigation-bottom,100px);left:8px;right:8px;min-width:0;max-height:calc(100dvh - var(--navigation-bottom,100px) - 12px);box-sizing:border-box;overscroll-behavior:contain}
 .navigation-home{margin-left:auto}
 nav>.navigation-secondary,
 nav>.navigation-group>button{display:none}
 .mobile-more{display:block}
 .mobile-more-trigger{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0!important;color:inherit}
 .mobile-more-trigger svg{display:block}
 .mobile-home-trigger{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0!important;color:inherit}
 .mobile-home-trigger svg{display:block}
 .mobile-more-dropdown{display:flex;flex-direction:column;gap:4px}
 #workspace-modules .navigation-primary-label{display:none!important}
 #workspace-modules .navigation-primary{display:inline-flex!important;width:36px;height:36px;padding:0!important;gap:0}
 #workspace-modules .navigation-primary svg{display:block!important;flex:none}
 .mobile-more-dropdown button,.mobile-menu-link{width:100%;box-sizing:border-box;text-align:left;padding:9px 10px;color:inherit;background:transparent;border:0;font:inherit;text-decoration:none}
 .mobile-more-dropdown button:hover,.mobile-menu-link:hover{background:var(--color-background)}
}
</style>
<style>
body:has(#academy-workspace:not([hidden])) :is(#apiSetupBtn,#presetImportBtn,#academySettings){display:none!important}
</style>
