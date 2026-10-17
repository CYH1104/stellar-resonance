<script setup lang="ts">
import {computed} from 'vue';
import type {Persona} from '../domain/contracts';
import SpiritPersonaFields from './SpiritPersonaFields.vue';
import ChoiceChips from './ChoiceChips.vue';
import {readPersonaExtra,writePersonaExtra,personaNotes,writePersonaNotes,type ExtraLabel} from '../domain/personaExtras';
const model=defineModel<Persona>({required:true});
defineProps<{disabled?:boolean}>();
const extra=(label:ExtraLabel)=>computed({get:()=>readPersonaExtra(model.value.other,label),set:(value:string)=>{model.value.other=writePersonaExtra(model.value.other,label,value);}});
const pheromone=extra('信息素');
const spiritLevel=computed({get:()=>model.value.mentalPowerLevel||readPersonaExtra(model.value.other,'精神力等级'),set:(value:string)=>{model.value.mentalPowerLevel=value;model.value.other=writePersonaExtra(model.value.other,'精神力等级','');}});
const notes=computed({get:()=>personaNotes(model.value.other),set:(value:string)=>{model.value.other=writePersonaNotes(model.value.other,value);}});
const departments=['领航者 · 星舰指挥与战略系','破军 · 机甲驾驶与近地作战系','织网者 · 信息工程与电子战系','基石 · 后勤与战略支援系','银铃 · 外交与星际文化系'];
</script>
<template>      <fieldset class="persona-fields" :disabled="disabled">
        <legend class="sr-only">玩家人设</legend>
        <label>姓名（必填）<input v-model="model.name" maxlength="80" required autocomplete="off" placeholder="请输入玩家姓名" /></label>
        <div class="file-field"><label>第一性别<input v-model="model.primaryGender" maxlength="100" list="primary-genders" placeholder="可留空，也可自行填写" /></label><ChoiceChips v-model="model.primaryGender" :options="['男','女']" label="第一性别快捷选项" /></div>
        <div class="file-field"><label>第二性别<input v-model="model.secondaryGender" maxlength="100" list="secondary-genders" placeholder="可留空，也可自行填写" /></label><ChoiceChips v-model="model.secondaryGender" :options="['Alpha','Beta','Omega']" label="第二性别快捷选项" /></div>
        <label>信息素<input v-model="pheromone" maxlength="100" placeholder="例如：冷杉混雪松" /></label>
        <div class="file-field"><label>精神力等级<input v-model="spiritLevel" maxlength="100" placeholder="S / A / B / C / D" /></label><ChoiceChips v-model="spiritLevel" :options="['S','A','B','C','D']" label="精神力等级快捷选项" /></div>
        <label class="file-wide">异能<textarea v-model="model.ability" rows="2" maxlength="2000" /></label>
        <div class="file-field file-wide"><label>精神体<textarea v-model="model.spiritAnimal" rows="2" maxlength="1500" placeholder="点击下方选项，或自行填写种类、外形、特征" /></label><ChoiceChips v-model="model.spiritAnimal" :options="['狼','蛇','虎','豹','狐','鹰','鲨','蛛','鸦','鹿']" label="精神体快捷选项" /></div>
        <SpiritPersonaFields :persona="model" :disabled="disabled" />
        <div class="file-field file-wide"><label>院系 / 职业<textarea v-model="model.identity" rows="2" maxlength="200" placeholder="院系／组织与年级／职位，多重身份分行填写" /></label><ChoiceChips v-model="model.identity" :options="departments" label="院系快捷选项" /></div>
        <datalist id="primary-genders"><option>男</option><option>女</option></datalist><datalist id="secondary-genders"><option>Alpha</option><option>Beta</option><option>Omega</option><option>其他</option></datalist>
        <label class="file-wide">外貌<input v-model="model.appearance" maxlength="500" /></label>
        <label>性格<textarea v-model="model.personality" rows="2" maxlength="1500" /></label>
        <label class="file-wide">背景<textarea v-model="model.background" rows="3" maxlength="3000" /></label>
        <label v-if="model.rawText" class="file-wide">原文人设<textarea v-model="model.rawText" rows="8" maxlength="60000" /></label>
        <label>同人文配对偏好<select v-model="model.pairingPreference"><option value="">按明确人设判断／暂未指定</option><option value="BL-攻">BL · user 为攻</option><option value="BL-受">BL · user 为受</option><option value="BG">BG</option><option value="GB">GB</option></select></label>
        <label class="file-wide">其他<textarea v-model="notes" rows="3" maxlength="2700" placeholder="其他想补充的设定、关系或偏好，可留空" /></label>
      </fieldset></template>
