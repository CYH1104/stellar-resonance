<script setup lang="ts">
import {computed,ref} from 'vue';
import type {Persona} from '../domain/contracts';
import SpiritPersonaFields from './SpiritPersonaFields.vue';
import AutoTextarea from './AutoTextarea.vue';
import ChoiceChips from './ChoiceChips.vue';
import {readPersonaExtra,writePersonaExtra,personaNotes,writePersonaNotes,type ExtraLabel} from '../domain/personaExtras';
const model=defineModel<Persona>({required:true});
defineProps<{disabled?:boolean}>();
const extra=(label:ExtraLabel)=>computed({get:()=>readPersonaExtra(model.value.other,label),set:(value:string)=>{model.value.other=writePersonaExtra(model.value.other,label,value);}});
const pheromone=extra('信息素');
const spiritLevel=computed({get:()=>model.value.mentalPowerLevel||readPersonaExtra(model.value.other,'精神力等级'),set:(value:string)=>{model.value.mentalPowerLevel=value;model.value.other=writePersonaExtra(model.value.other,'精神力等级','');}});
const notes=computed({get:()=>personaNotes(model.value.other),set:(value:string)=>{model.value.other=writePersonaNotes(model.value.other,value);}});
const mode=ref(model.value.rawText?'custom':'form');
const freeFields={appearance:'外貌',personality:'性格',background:'背景',other:'其他设定',pairingPreference:'配对偏好',spiritName:'精神体姓名',spiritAppearance:'精神体外貌',spiritPersonality:'精神体性格',spiritAbility:'精神体能力'} as const;
const customText=computed({get:()=>[model.value.rawText,...Object.entries(freeFields).map(([key,label])=>model.value[key as keyof typeof freeFields]?label+'：'+model.value[key as keyof typeof freeFields]:'')].filter(Boolean).join('\n\n'),set:(text:string)=>{model.value.rawText=text;for(const key of Object.keys(freeFields) as (keyof typeof freeFields)[])model.value[key]='';}});
const departments=['领航者 · 星舰指挥与战略系','破军 · 机甲驾驶与近地作战系','织网者 · 信息工程与电子战系','基石 · 后勤与战略支援系','银铃 · 外交与星际文化系'];
</script>
<template>      <fieldset class="persona-fields" :disabled="disabled">
        <legend class="sr-only">玩家人设</legend>
        <label class="file-wide">编辑模式<select v-model="mode"><option value="form">人设表单模式</option><option value="custom">人设表单自定义模式</option></select></label>
        <label>姓名（必填）<AutoTextarea rows="1" v-model="model.name" required autocomplete="off" placeholder="请输入玩家姓名" /></label>
        <div class="file-field"><label>第一性别<AutoTextarea rows="1" v-model="model.primaryGender" list="primary-genders" placeholder="可留空，也可自行填写" /></label><ChoiceChips v-model="model.primaryGender" :options="['男','女']" label="第一性别快捷选项" /></div>
        <div class="file-field"><label>第二性别<AutoTextarea rows="1" v-model="model.secondaryGender" list="secondary-genders" placeholder="可留空，也可自行填写" /></label><ChoiceChips v-model="model.secondaryGender" :options="['Alpha','Beta','Omega']" label="第二性别快捷选项" /></div>
        <label v-if="mode==='form'">信息素<AutoTextarea rows="1" v-model="pheromone" placeholder="例如：冷杉混雪松" /></label>
        <div class="file-field"><label>精神力等级<AutoTextarea rows="1" v-model="spiritLevel" placeholder="S / A / B / C / D" /></label><ChoiceChips v-model="spiritLevel" :options="['S','A','B','C','D']" label="精神力等级快捷选项" /></div>
        <label class="file-wide">异能<AutoTextarea v-model="model.ability" rows="2" /></label>
        <div class="file-field file-wide"><label>精神体<AutoTextarea v-model="model.spiritAnimal" rows="2" placeholder="点击下方选项，或自行填写种类、外形、特征" /></label><ChoiceChips v-model="model.spiritAnimal" :options="['狼','蛇','虎','豹','狐','鹰','鲨','蛛','鸦','鹿']" label="精神体快捷选项" /></div>
        <SpiritPersonaFields v-if="mode==='form'" :persona="model" :disabled="disabled" />
        <div class="file-field file-wide"><label>院系 / 职业<AutoTextarea v-model="model.identity" rows="2" placeholder="院系／组织与年级／职位，多重身份分行填写" /></label><ChoiceChips v-model="model.identity" :options="departments" label="院系快捷选项" /></div>
        <datalist id="primary-genders"><option>男</option><option>女</option></datalist><datalist id="secondary-genders"><option>Alpha</option><option>Beta</option><option>Omega</option><option>其他</option></datalist>
        <template v-if="mode==='form'">
        <label class="file-wide">外貌<AutoTextarea rows="1" v-model="model.appearance" /></label>
        <label>性格<AutoTextarea v-model="model.personality" rows="2" /></label>
        <label class="file-wide">背景<AutoTextarea v-model="model.background" rows="3" /></label>
        <label v-if="model.rawText" class="file-wide">原文人设<AutoTextarea v-model="model.rawText" rows="8" /></label>
        <label>同人文配对偏好<select v-model="model.pairingPreference"><option value="">按明确人设判断／暂未指定</option><option value="BL-攻">BL · user 为攻</option><option value="BL-受">BL · user 为受</option><option value="BG">BG</option><option value="GB">GB</option></select></label>
        <label class="file-wide">其他<AutoTextarea v-model="notes" rows="3" placeholder="其他想补充的设定、关系或偏好，可留空" /></label>
        </template>
        <label v-else class="file-wide">自定义人设<AutoTextarea v-model="customText" rows="10" placeholder="自由填写外貌、性格、背景、关系网、精神体细节和其他设定。上方关键字段用于剧情状态栏。" /></label>
      </fieldset></template>
