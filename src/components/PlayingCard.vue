<script setup lang="ts">
import { computed } from 'vue';
import { playingCardArtworkName } from '../domain/playingCardArtwork';
import { landlordCardLabel } from '../domain/landlordCards';
const props = withDefaults(defineProps<{ card: string; decorative?: boolean; indexed?: boolean }>(), { decorative: false });
const artwork = import.meta.glob('../assets/playing-cards/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const src = computed(() => artwork['../assets/playing-cards/' + playingCardArtworkName(props.card) + '.webp']);
const label = computed(() => props.card === 'back' ? '扑克牌背' : landlordCardLabel(props.card));
</script>
<template>
  <span v-if="indexed && card !== 'back'" class="playing-card-indexed"><img class="playing-card-art" :src="src" :alt="decorative ? '' : label" :aria-hidden="decorative || undefined" draggable="false" /><span class="playing-card-index" :class="{ joker: card === 'BJ' || card === 'RJ' }" :style="{ backgroundImage: 'url(' + src + ')' }" aria-hidden="true"></span></span>
  <img v-else class="playing-card-art" :src="src" :alt="decorative ? '' : label" :aria-hidden="decorative || undefined" draggable="false" />
</template>
<style scoped>
.playing-card-art{display:block;width:100%;height:100%;object-fit:fill;user-select:none;pointer-events:none;border-radius:inherit}
.playing-card-indexed{position:relative;display:block;width:100%;height:100%;border-radius:inherit;pointer-events:none}
.playing-card-index{position:absolute;left:1px;top:1px;width:14px;height:27px;background-color:#fff;background-repeat:no-repeat;background-size:90px 126px;background-position:-1px -1px;pointer-events:none}
.playing-card-index.joker{height:42px;width:9px}
</style>
