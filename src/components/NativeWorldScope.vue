<script setup lang="ts">
import {computed,ref} from 'vue';
const props=defineProps<{source:Record<string,any>;actors:{id:string;name:string}[];disabled?:boolean;inherit?:boolean;label:string}>();
const scope=computed(()=>props.source.extensions?.academy_scope),mode=computed(()=>scope.value?.mode||(props.inherit?'inherit':'global'));
const problem=ref(''),ids=computed<string[]>(()=>Array.isArray(scope.value?.characterIds)?scope.value.characterIds.filter((id:unknown)=>typeof id==='string'):[]);
const choices=computed(()=>[...props.actors,...ids.value.filter(id=>!props.actors.some(a=>a.id===id)).map(id=>({id,name:'未登记：'+id}))]);
function set(mode:string,selected=ids.value){if(props.source.extensions!==undefined&&(!props.source.extensions||typeof props.source.extensions!=='object'||Array.isArray(props.source.extensions))){problem.value='原文件的扩展字段格式不支持修改作用范围，请检查原文件；原数据保留。';return;}problem.value='';props.source.extensions??={};if(mode==='inherit')delete props.source.extensions.academy_scope;else props.source.extensions.academy_scope={mode,characterIds:mode==='characters'?[...selected]:[]};}
function toggle(id:string,on:boolean){set('characters',on?[...new Set([...ids.value,id])]:ids.value.filter(v=>v!==id));}
</script>
<template>
 <fieldset :disabled="disabled"><legend>{{label}}</legend><select :aria-label="label" :value="mode" @change="set(($event.target as HTMLSelectElement).value)"><option v-if="inherit" value="inherit">沿用整本设置</option><option value="global">全局</option><option value="characters">仅指定角色</option></select>
  <p v-if="problem" role="alert">{{problem}}</p><template v-if="mode==='characters'"><label v-for="a in choices" :key="a.id" class="toggle"><input type="checkbox" :aria-label="label+' '+a.name" :checked="ids.includes(a.id)" @change="toggle(a.id,($event.target as HTMLInputElement).checked)"/>{{a.name}}</label><p v-if="!choices.length">当前没有已登记的角色。请先进入存档。</p><p class="rail-note">指定角色未登记时会阻止调用；不会扩大为全局。</p></template>
 </fieldset>
</template>
<style scoped>fieldset{border:0;padding:.5rem 0;min-width:0}select{max-width:100%}</style>
