<script setup lang="ts">
import {displayText} from '../domain/storyMarkup';
import {computed} from 'vue';
import type { ActorState } from '../domain/contracts';
import {mentalGenderLabel,identityLines} from '../domain/statusPresentation';
import {separateIdentityAbility} from '../domain/identityAbility';
const props=defineProps<{actor:ActorState; player?:boolean;characters?:ActorState[]}>();
const identityFields=computed(()=>separateIdentityAbility(props.actor));
function known(value?:string){const text=displayText(value||'').trim();return !text||/^未提供[。.]?$/.test(text)?'未知':text;}
const spiritOs=computed(()=>{
  const value=displayText(props.actor.spiritThought?.trim()||'');
  if(value&&!/^(?:未提供|未知|待生成|待更新|暂无)[。.!！]?$/u.test(value))return value;
  if(!props.player)return '对方精神体未出现';
  return props.actor.spiritAnimal?.trim()?'等待 AI 随剧情生成':'请先在人设中填写精神体';
});
</script>
<template>
  <article class="actor-card" :class="{'player-card':player}">
    <header><span class="actor-avatar" aria-hidden="true">{{ actor.name.slice(0,1) }}</span><div><small>{{ player ? 'USER / 玩家' : 'CHAR / 在场角色' }}</small><h3>{{ actor.name }}</h3></div></header>
    <dl class="actor-fields">
      <div><dt>姓名</dt><dd>{{ actor.name }}</dd></div>
      <div><dt>第一性别</dt><dd>{{ known(actor.primaryGender) }}</dd></div>
      <div><dt>精神力／第二性别</dt><dd>{{mentalGenderLabel(actor)?'【'+known(mentalGenderLabel(actor))+'】':'未知'}}</dd></div>
      <div class="actor-identities"><dt>身份</dt><dd><template v-if="identityLines(known(identityFields.identity)).length"><span v-for="line in identityLines(known(identityFields.identity))" :key="line" class="actor-identity-line">【{{line}}】</span></template><template v-else>未知</template></dd></div>
      <div v-if="identityFields.ability?.trim()"><dt>异能</dt><dd class="actor-ability">{{displayText(identityFields.ability)}}</dd></div>
      <div v-if="!player"><dt>对 user 的好感度</dt><dd>{{actor.affinity??'未知'}}</dd></div>
      <div v-if="!player && actor.relationship?.trim()"><dt>与 user 的关系</dt><dd>{{displayText(actor.relationship)}}</dd></div>
    </dl>

    <div v-if="!player" class="actor-thought"><span>内心想法</span><p>{{ known(actor.innerThought) }}</p></div>
    <dl class="actor-fields"><div><dt>精神体</dt><dd>{{known(actor.spiritAnimal)}}</dd></div></dl>
    <div class="actor-thought"><span>精神体 OS</span><p>{{spiritOs}}</p></div>
    <details v-if="player" class="affinity-summary" open><summary>已遇到 char 对 user 的好感度（{{characters?.length||0}}）</summary><dl class="actor-fields"><div v-for="char in characters" :key="char.id"><dt>{{char.name}}</dt><dd>{{char.affinity??'未知'}}</dd></div></dl><p v-if="!characters?.length" class="muted">尚未遇到角色</p></details>
  </article>
</template>
<style scoped>.actor-identity-line{display:block;overflow-wrap:anywhere}.actor-identity-line+.actor-identity-line{margin-top:.35rem}.actor-identities dd{min-width:0}.actor-ability{white-space:pre-wrap;overflow-wrap:anywhere}</style>
