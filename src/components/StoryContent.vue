<script setup lang="ts">
import {computed} from 'vue';
import {storyBlocks} from '../domain/storyMarkup';
const props=defineProps<{text:string;streaming?:boolean;placeholder?:string}>();
const blocks=computed(()=>storyBlocks(props.text,props.streaming));
</script>
<template><div class="story-content">
  <template v-for="(block,index) in blocks" :key="index">
    <p v-if="block.kind==='text'" class="narrative">{{block.text}}</p>
    <section v-else-if="block.kind==='slate'" class="scene-slate" aria-label="场景信息">
      <div v-if="block.scene.sceneNo" class="scene-number">SCENE <span>{{block.scene.sceneNo}}</span></div>
      <h2 v-if="block.scene.title" class="scene-title">{{block.scene.title}}</h2>
      <p v-if="block.scene.englishTitle" class="scene-english-title">{{block.scene.englishTitle}}</p>
      <blockquote v-if="block.scene.quote" class="scene-quote">{{block.scene.quote}}</blockquote>
      <dl v-if="block.scene.location||block.scene.time" class="scene-meta"><div v-if="block.scene.location"><dt>地点</dt><dd>{{block.scene.location}}</dd></div><div v-if="block.scene.time"><dt>时间</dt><dd>{{block.scene.time}}</dd></div></dl>
    </section>
    <p v-else class="scene-pending" role="status">正在整理场景信息…</p>
  </template>
  <p v-if="!blocks.length&&placeholder" class="narrative">{{placeholder}}</p>
</div></template>
