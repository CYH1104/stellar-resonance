<script setup lang="ts">
import type {Persona} from '../domain/contracts';
defineProps<{persona:Persona;disabled?:boolean}>();
const emit=defineEmits<{change:[]}>();
</script>
<template><fieldset class="spirit-persona-fields" :disabled="disabled"><legend>精神体设定</legend><div class="field-grid"><label>精神体姓名<input v-model="persona.spiritName" maxlength="100" @input="emit('change')" /></label><label>精神体外貌<textarea v-model="persona.spiritAppearance" rows="2" maxlength="1500" @input="emit('change')" /></label></div><label>精神体性格<textarea v-model="persona.spiritPersonality" rows="2" maxlength="1500" @input="emit('change')" /></label><label>精神体能力<textarea v-model="persona.spiritAbility" rows="2" maxlength="2000" @input="emit('change')" /></label></fieldset></template>
<style scoped>.spirit-persona-fields{border:1px solid var(--color-border);border-radius:8px;padding:1rem;margin:1rem 0;min-width:0}.spirit-persona-fields legend{padding:0 .4rem}.spirit-persona-fields label{margin:.6rem 0}</style>
