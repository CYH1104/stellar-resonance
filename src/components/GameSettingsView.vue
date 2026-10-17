<script setup lang="ts">
import SpiritPersonaFields from './SpiritPersonaFields.vue';
import {reactive,ref,watch} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {blankPersona} from '../domain/persona';
import TheaterSettings from './TheaterSettings.vue';
const props=defineProps<{w:ViewModel}>();const shortcut=ref('');
const persona=reactive(blankPersona());
watch(()=>props.w.active?.id,()=>{Object.assign(persona,blankPersona(),props.w.active?.persona||{});},{immediate:true});
function addShortcut(){if(shortcut.value.trim()){props.w.preferences.shortcuts.push(shortcut.value.trim());shortcut.value='';}}
</script>
<template><section class="surface game-settings-view">
  <header class="panel-heading"><div><p class="eyebrow">SETTINGS / 设置</p><h1>设置</h1></div></header>
  <nav class="actions" aria-label="设置分类"><button :class="{selected:w.settingsTab==='persona'}" @click="w.settingsTab='persona'">人物设置</button><button :class="{selected:w.settingsTab==='theaters'}" @click="w.settingsTab='theaters'">小剧场设置</button><button :class="{selected:w.settingsTab==='shortcuts'}" @click="w.settingsTab='shortcuts'">快捷操作</button></nav>
  <template v-if="w.settingsTab==='persona'">
  <section v-if="w.active" class="subsection"><h2>玩家人设</h2>
    <form @submit.prevent="w.savePersona(persona)">
      <div class="field-grid"><label>姓名<input v-model="persona.name" required maxlength="80" /></label><label>外貌<input v-model="persona.appearance" maxlength="500" /></label></div>
      <div class="field-grid"><label>第一性别<input v-model="persona.primaryGender" maxlength="100" /></label><label>精神力等级<input v-model="persona.mentalPowerLevel" maxlength="100" /></label><label>第二性别<input v-model="persona.secondaryGender" maxlength="100" /></label></div>
      <label>身份（院系/职业）<textarea v-model="persona.identity" maxlength="200" rows="2" placeholder="院系／组织与年级／职位，每个身份写一行" /></label>
      <label>性格<textarea v-model="persona.personality" rows="2" maxlength="1500" /></label>
      <label>背景<textarea v-model="persona.background" rows="3" maxlength="3000" /></label>
      <label>异能<textarea v-model="persona.ability" rows="2" maxlength="2000" /></label>
      <label>精神体<textarea v-model="persona.spiritAnimal" rows="2" maxlength="1500" /></label>
      <SpiritPersonaFields :persona="persona" />
      <label>同人文配对偏好<select v-model="persona.pairingPreference"><option value="">按明确人设判断／暂未指定</option><option value="BL-攻">BL · user 为攻</option><option value="BL-受">BL · user 为受</option><option value="BG">BG</option><option value="GB">GB</option></select></label>
      <label v-if="persona.rawText">原文人设<textarea v-model="persona.rawText" rows="8" maxlength="60000" /></label>
      <label>其他<textarea v-model="persona.other" rows="3" maxlength="3000" /></label>
      <button type="submit" :disabled="w.busy||!persona.name.trim()">保存玩家人设</button>
    </form>
  </section>

    <p v-if="!w.active" class="empty">请先新建或打开一份存档，再修改该存档的玩家人设。</p>
  </template>
  <TheaterSettings v-else-if="w.settingsTab==='theaters'" :w="w" embedded />
  <template v-else>
  <section class="subsection"><h2>文本快捷按钮</h2><ul class="plain-list"><li v-for="(s,i) in w.preferences.shortcuts" :key="i"><input v-model="w.preferences.shortcuts[i]" :aria-label="`快捷文字 ${i+1}`" maxlength="500" :disabled="w.busy" /><button :disabled="w.busy" @click="w.preferences.shortcuts.splice(i,1)">删除</button></li></ul><form class="search-row" @submit.prevent="addShortcut"><label>新快捷文字<input v-model="shortcut" maxlength="500" /></label><button type="submit" :disabled="w.busy">添加快捷按钮</button></form></section>

    <button class="primary" :disabled="w.busy" @click="w.save()">保存快捷操作</button>
  </template>
</section></template>
