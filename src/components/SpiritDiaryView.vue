<script setup lang="ts">
import {displayText} from '../domain/storyMarkup';
import {diarySigned,theaterRequirementError} from '../domain/theaterRequirements';
import {computed} from 'vue';
import type {TheaterScene} from '../domain/contracts';
const props=defineProps<{scene?:TheaterScene&{round?:number};title:string}>();
const diary=computed(()=>props.scene?.diary),paragraphs=computed(()=>displayText(diary.value?.content||props.scene?.content||'').split(/\n\s*\n/).filter(p=>p.trim()));
</script>
<template><article class="spirit-diary" aria-label="精神体日记">
  <div class="diary-binding" aria-hidden="true"><i v-for="i in 5" :key="i"></i></div>
  <header class="diary-heading"><p class="diary-kicker">DIARY / 精神体手记</p><h3>{{diary?.title||title}}</h3><div class="diary-meta"><time v-if="diary?.date">{{diary.date}}</time></div></header>
  <div v-if="diary" class="diary-signature"><span v-if="diary.spiritAnimal">{{diary.spiritAnimal}}的日记</span><span v-if="diary.ownerName">主人：{{diary.ownerName}}</span><span v-if="diary.mood">心情：{{diary.mood}}</span></div>
  <div class="diary-pages"><p v-for="(paragraph,index) in paragraphs" :key="index">{{paragraph}}</p><p v-if="!paragraphs.length" class="diary-empty">暂无日记。</p></div>
  <footer v-if="scene&&diarySigned(scene)" class="diary-closing-signature"><span>{{diary?.signatureName}}</span><time>{{diary?.signatureDate}}</time></footer>
  <p v-if="scene&&theaterRequirementError(scene,true)" class="companion-incomplete" role="status">{{diarySigned(scene)?'日记篇幅不足，尚未确认完成。':'缺少完整署名和故事日期，尚未确认完成，可能截断。'}}</p>
</article></template>
<style scoped>
.diary-closing-signature{display:flex;flex-direction:column;align-items:flex-end;gap:5px;padding:20px 8px 8px;font:italic 19px/1.6 'Segoe Print','Bradley Hand','KaiTi','STKaiti',cursive;opacity:.8}.diary-closing-signature time{font-size:15px}
</style>
