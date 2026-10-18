<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
const visible = ref(true);
let timer: ReturnType<typeof setTimeout>;
function dismiss() { visible.value = false; }
onMounted(() => { timer = setTimeout(dismiss, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 500 : 4200); });
onUnmounted(() => clearTimeout(timer));
</script>
<template>
  <Transition name="opening-fade">
    <div v-if="visible" class="opening-sequence" aria-label="群星共振开场动画">
      <p class="opening-imprint">S T E L L A R &nbsp; R E S O N A N C E</p>
      <div class="migration" aria-hidden="true">
        <span class="migration-dots">·  ·  ·</span>
        <svg v-for="n in 5" :key="n" :style="{'--i':n}" class="migrating-bird" viewBox="0 0 120 100">
          <g fill="currentColor">
            <path class="bird-far-wing" d="M53 57C48 44 35 34 23 28L9 21L15 30L7 27L17 37L12 36L24 45L20 46C30 52 37 57 49 61Z" />
            <path class="bird-near-wing" d="M52 61C43 50 40 34 43 20L49 4L51 17L55 7L55 24L59 16L58 34L62 28C63 41 63 51 58 61Z" />
            <path d="M30 59C41 54 49 55 59 58L76 54C80 47 86 46 90 50L100 53L89 56C84 63 76 65 66 66L50 66L30 72L35 65L23 63Z" />
          </g>
        </svg>
        <span class="migration-dots">·  ·  ·</span>
      </div>
      <div class="opening-poem"><span>✦</span><p>循着群星，向故事深处飞去。</p><small>EVERY JOURNEY BEGINS WITH A WHISPER</small><i></i><em>Let the story unfold.</em></div>
      <button class="skip-opening" @click="dismiss">跳过开场 </button>
    </div>
  </Transition>
</template>
