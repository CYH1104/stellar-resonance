<script setup lang="ts">
import { reactive,ref,watch } from 'vue';import type { ViewModel } from '../app/useWorkspace';import PresetManager from './PresetManager.vue';
import {blankPersona} from '../domain/persona';
import ApiSettings from './ApiSettings.vue';
const props=defineProps<{w:ViewModel}>();const shortcut=ref('');
const persona=reactive(blankPersona());
watch(()=>props.w.active?.id,()=>{Object.assign(persona,blankPersona(),props.w.active?.persona||{});},{immediate:true});
function addShortcut(){if(shortcut.value.trim()){props.w.preferences.shortcuts.push(shortcut.value.trim());shortcut.value='';}}
</script>
<template><section class="surface settings-view"><header class="panel-heading"><div><p class="eyebrow">SETTINGS / 模型与预设</p><h1>功能配置</h1></div><div class="actions"><button v-if="!w.active" @click="w.enterStory()">返回</button><button @click="w.save()">保存配置</button></div></header>
  <ApiSettings :w="w" />
  <PresetManager :w="w" />
  <section class="subsection"><h2>文本快捷按钮</h2><ul class="plain-list"><li v-for="(s,i) in w.preferences.shortcuts" :key="i"><input v-model="w.preferences.shortcuts[i]" :aria-label="`快捷文字 ${i+1}`" maxlength="500" :disabled="w.busy" /><button :disabled="w.busy" @click="w.preferences.shortcuts.splice(i,1)">删除</button></li></ul><form class="search-row" @submit.prevent="addShortcut"><label>新快捷文字<input v-model="shortcut" maxlength="500" /></label><button type="submit" :disabled="w.busy">添加快捷按钮</button></form></section>
  <section v-if="w.active" class="subsection"><h2>当前玩家人设</h2>
    <form @submit.prevent="w.savePersona(persona)">
      <div class="field-grid"><label>姓名<input v-model="persona.name" required maxlength="80" /></label><label>外貌<input v-model="persona.appearance" maxlength="500" /></label></div>
      <div class="field-grid"><label>第一性别<input v-model="persona.primaryGender" maxlength="100" /></label><label>第二性别<input v-model="persona.secondaryGender" maxlength="100" /></label></div>
      <label>身份（院系/职业）<input v-model="persona.identity" maxlength="200" /></label>
      <label>性格<textarea v-model="persona.personality" rows="2" maxlength="1500" /></label>
      <label>背景<textarea v-model="persona.background" rows="3" maxlength="3000" /></label>
      <label>精神体<textarea v-model="persona.spiritAnimal" rows="2" maxlength="1500" /></label>
      <label>同人文配对偏好<select v-model="persona.pairingPreference"><option value="">按明确人设判断／暂未指定</option><option value="BL-攻">BL · user 为攻</option><option value="BL-受">BL · user 为受</option><option value="BG">BG</option><option value="GB">GB</option></select></label>
      <label>其他<textarea v-model="persona.other" rows="3" maxlength="3000" /></label>
      <button type="submit" :disabled="w.busy||!persona.name.trim()">保存玩家人设</button>
    </form>
  </section>
</section></template>

