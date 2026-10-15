<script setup lang="ts">
import {computed} from 'vue';
import type { ActorState } from '../domain/contracts';
const props=defineProps<{actor:ActorState; player?:boolean;characters?:ActorState[]}>();
const spiritOs=computed(()=>{
  const value=props.actor.spiritThought?.trim();
  if(value&&!/^(?:未提供|未知|待生成|待更新|暂无)[。.!！]?$/u.test(value))return value;
  if(!props.player)return '未提供';
  return props.actor.spiritAnimal?.trim()?'等待 AI 随剧情生成':'请先在人设中填写精神体';
});
</script>
<template>
  <article class="actor-card" :class="{'player-card':player}">
    <header><span class="actor-avatar" aria-hidden="true">{{ actor.name.slice(0,1) }}</span><div><small>{{ player ? 'USER / 玩家' : 'CHAR / 在场角色' }}</small><h3>{{ actor.name }}</h3></div></header>
    <dl class="actor-fields">
      <div><dt>姓名</dt><dd>{{ actor.name }}</dd></div>
      <div><dt>第一性别</dt><dd>{{ actor.primaryGender || '未提供' }}</dd></div>
      <div><dt>第二性别</dt><dd>{{ actor.secondaryGender || '未提供' }}</dd></div>
      <div v-if="player"><dt>身份（院系/职业）</dt><dd>{{actor.identity||'未提供'}}</dd></div>
      <div v-if="!player"><dt>对 user 的好感度</dt><dd>{{actor.affinity??'未提供'}}</dd></div>
      <div><dt>精神体</dt><dd>{{actor.spiritAnimal||'未提供'}}</dd></div>
    </dl>

    <div v-if="!player" class="actor-thought"><span>内心想法</span><p>{{ actor.innerThought || '未提供' }}</p></div>
    <div class="actor-thought"><span>精神体 OS</span><p>{{spiritOs}}</p></div>
    <details v-if="player" class="affinity-summary" open><summary>已遇到 char 对 user 的好感度（{{characters?.length||0}}）</summary><dl class="actor-fields"><div v-for="char in characters" :key="char.id"><dt>{{char.name}}</dt><dd>{{char.affinity??'未提供'}}</dd></div></dl><p v-if="!characters?.length" class="muted">尚未遇到角色</p></details>
  </article>
</template>
