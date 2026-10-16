<script setup lang="ts">
import type {ViewModel} from '../app/useWorkspace';
import SaveList from './SaveList.vue';
defineProps<{w:ViewModel;mode:'new'|'continue'}>();
</script>
<template>
  <section v-if="mode==='continue'" class="surface journey-setup">
    <p class="eyebrow">CONTINUE / 继续游戏</p><h1>接着上一次的故事。</h1>
    
    <SaveList :w="w" />
    <button @click="w.panel='saves'">备份与导入</button>
  </section>
  <section v-else class="surface journey-setup">
    <p class="eyebrow">NEW JOURNEY / 新的开始</p><h1>你将以谁的身份，进入故事？</h1>
    
    <form @submit.prevent="w.create(w.newGameDraft.title,w.newGameDraft.persona,w.newGameDraft.opening)">
      <fieldset class="persona-fields" :disabled="w.workingPersona||w.creatingGame">
        <legend class="sr-only">玩家人设</legend>
        <label>存档名称<input v-model="w.newGameDraft.title" maxlength="80" required /></label>
        <div class="field-grid"><label>姓名（必填）<input v-model="w.newGameDraft.persona.name" maxlength="80" required autocomplete="off" placeholder="请输入玩家姓名" /></label><label>外貌<input v-model="w.newGameDraft.persona.appearance" maxlength="500" /></label></div>
        <div class="field-grid"><label>第一性别<input v-model="w.newGameDraft.persona.primaryGender" maxlength="100" list="primary-genders" placeholder="可留空" /></label><label>精神力等级<input v-model="w.newGameDraft.persona.mentalPowerLevel" maxlength="100" /></label><label>第二性别<input v-model="w.newGameDraft.persona.secondaryGender" maxlength="100" list="secondary-genders" placeholder="可留空" /></label></div>
        <datalist id="primary-genders"><option>男</option><option>女</option></datalist><datalist id="secondary-genders"><option>Alpha</option><option>Beta</option><option>Omega</option><option>其他</option></datalist>
        <label>身份（院系/职业）<input v-model="w.newGameDraft.persona.identity" maxlength="200" placeholder="填写所属院系或职业；可留空" /></label>
        <label>性格<textarea v-model="w.newGameDraft.persona.personality" rows="2" maxlength="1500" /></label>
        <label>背景<textarea v-model="w.newGameDraft.persona.background" rows="3" maxlength="3000" /></label>
        <label>精神体<textarea v-model="w.newGameDraft.persona.spiritAnimal" rows="2" maxlength="1500" placeholder="种类、外形、特征等，可留空" /></label>
        <label>同人文配对偏好<select v-model="w.newGameDraft.persona.pairingPreference"><option value="">按明确人设判断／暂未指定</option><option value="BL-攻">BL · user 为攻</option><option value="BL-受">BL · user 为受</option><option value="BG">BG</option><option value="GB">GB</option></select></label>
        <label v-if="w.newGameDraft.persona.rawText">user 人设原文<textarea v-model="w.newGameDraft.persona.rawText" rows="8" maxlength="60000" /></label>
      <label>其他<textarea v-model="w.newGameDraft.persona.other" rows="3" maxlength="3000" placeholder="其他想补充的设定、关系或偏好，可留空" /></label>
        <label>自定义开局（可留空）<textarea v-model="w.newGameDraft.opening" rows="3" maxlength="6000" placeholder="留空使用服务器原有迎新文案。" /></label>
      </fieldset>
      
      <button class="primary" :disabled="w.loading||!w.authorized||!w.newGameDraft.persona.name.trim()||!w.newGameDraft.title.trim()||w.workingPersona||w.creatingGame" type="submit">{{w.creatingGame?'正在创建…':'开始游戏'}}</button>
    </form>
    <section class="subsection persona-assistant" aria-label="AI 帮我写人设">
      <h2>AI 帮我写</h2>
      <form @submit.prevent="w.assistPersona()">
        <label>我想玩的人设<textarea v-model="w.newGameDraft.wish" rows="4" maxlength="3000" :disabled="w.workingPersona||w.creatingGame" placeholder="例如：我想扮演一位刚入学的新生，性格慢热，精神体想用一只小型猫科动物，其他细节请结合世界观帮我完善。" /></label>
        <div class="actions"><button :disabled="!w.newGameDraft.wish.trim()||w.loading||w.workingPersona||w.creatingGame" type="submit">{{w.workingPersona?'AI 正在填写…':'AI 帮我写'}}</button><button v-if="w.workingPersona" type="button" @click="w.stopPersona()">取消生成</button><button v-else type="button" @click="w.panel='settings'">API 设置</button></div>
        <p v-if="w.personaNotice" class="hint" role="status">{{w.personaNotice}}</p>
        
      </form>
    </section>
  </section>
</template>
