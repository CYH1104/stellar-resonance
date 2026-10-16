<script setup lang="ts">
import {computed} from 'vue';
import type {TheaterScene} from '../domain/contracts';
const props=defineProps<{scene?:TheaterScene&{round?:number};title:string}>();
const diary=computed(()=>props.scene?.diary),paragraphs=computed(()=>(diary.value?.content||props.scene?.content||'').split(/\n\s*\n/).filter(p=>p.trim()));
</script>
<template><article class="spirit-diary" aria-label="精神体日记">
  <div class="diary-binding" aria-hidden="true"><i v-for="i in 5" :key="i"></i></div>
  <header class="diary-heading"><p class="diary-kicker">DIARY / 精神体手记</p><h3>{{diary?.title||title}}</h3><div class="diary-meta"><time v-if="diary?.date">{{diary.date}}</time><span v-else>故事日期未记录</span><span v-if="scene?.round">第 {{scene.round}} 轮</span></div></header>
  <div v-if="diary" class="diary-signature"><span v-if="diary.spiritAnimal">{{diary.spiritAnimal}}的日记</span><span v-if="diary.ownerName">主人：{{diary.ownerName}}</span><span v-if="diary.mood">心情：{{diary.mood}}</span></div>
  <div class="diary-pages"><p v-for="(paragraph,index) in paragraphs" :key="index">{{paragraph}}</p><p v-if="!paragraphs.length" class="diary-empty">今天的这一页，等下一轮剧情完成后再写。</p></div>
  <p v-if="scene&&!diary" class="diary-legacy-note">此记录没有独立日记字段，原内容保留；下一轮会按新的日记要求生成。</p>
  <footer class="diary-footer"><span>{{diary?'以精神体的“我”落笔':'精神体日记'}}</span><span>独立番外</span></footer>
</article></template>
