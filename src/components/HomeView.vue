<script setup lang="ts">
import { reactive, ref } from 'vue';
import type { ViewModel } from '../app/useWorkspace';
defineProps<{w:ViewModel}>();
const title=ref('初到接待站'),opening=ref(''),invite=ref('');
const persona=reactive({name:'访客',appearance:'',personality:'',background:''});
</script>
<template>
  <section class="home-layout">
    <div class="surface">
      <p class="eyebrow">NEW JOURNEY / 新建旅程</p><h1>从一句话开始。</h1>
      <p class="muted">这是一份功能骨架。当前角色与地点是虚构样例，外观将在你提供 PPT 后调整。</p>
      <form @submit.prevent="w.create(title,persona,opening)">
        <label>存档名称<input v-model="title" maxlength="80" required /></label>
        <div class="field-grid"><label>玩家姓名<input v-model="persona.name" maxlength="80" required /></label><label>外貌<input v-model="persona.appearance" maxlength="500" /></label></div>
        <label>性格<textarea v-model="persona.personality" rows="2" maxlength="1500" /></label>
        <label>背景<textarea v-model="persona.background" rows="2" maxlength="3000" /></label>
        <label>自定义开局（可留空）<textarea v-model="opening" rows="3" maxlength="6000" placeholder="留空使用虚构接待站开局。" /></label>
        <button class="primary" :disabled="w.loading||!w.authorized" type="submit">新建游戏</button>
      </form>
    </div>
    <div class="stack">
      <section class="surface"><p class="eyebrow">CONTINUE / 继续旅程</p><h2>本机存档</h2>
        <p v-if="!w.sessions.length" class="muted">还没有存档。新建一份，或从备份导入。</p>
        <ul class="save-list"><li v-for="s in w.sessions" :key="s.id"><div><strong>{{s.name}}</strong><p class="muted">{{s.persona.name}} · {{s.turns.length}} 轮 · {{new Date(s.updatedAt).toLocaleString()}}</p></div><button @click="w.open(s.id)">继续游戏</button></li></ul>
        <button @click="w.panel='saves'">备份与导入</button>
      </section>
      <section class="surface"><h2>访问方式</h2><p v-if="w.preferences.mode==='demo'" class="muted">演示模式自动允许进入，不代表已经接通真实朋友登录。</p>
        <form v-else @submit.prevent="w.authorize(invite)"><label>邀请凭据<input v-model="invite" type="password" autocomplete="off" /></label><button class="primary" type="submit">验证访问</button><p>{{w.authorized?'访问已验证':'真实服务器尚需实现访问验证接口'}}</p></form>
        <button @click="w.panel='settings'">模型设置</button>
      </section>
    </div>
  </section>
</template>
