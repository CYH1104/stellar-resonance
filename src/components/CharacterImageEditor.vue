<script setup lang="ts">
import {computed,ref} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {majorCharacter,imageUrl,type CharacterImage} from '../domain/characterImages';
const props=defineProps<{w:ViewModel;id:string}>();
const actor=computed(()=>props.w.localService?.characters.find(a=>a.id===props.id));
const card=computed(()=>actor.value&&majorCharacter(actor.value.name));
const setting=computed(()=>props.w.preferences.characterImages?.[props.id]);
const error=ref(''),uploading=ref(false);
function update(patch:Partial<CharacterImage>){if(!card.value)return;const all=props.w.preferences.characterImages||={};all[props.id]={no:card.value.no,url:'',scale:1,x:0,y:0,...setting.value,...patch};}
function urlChange(event:Event){try{const value=(event.target as HTMLInputElement).value;update({url:value?imageUrl(value):'',scale:1,x:0,y:0});error.value='';}catch(e){error.value=(e as Error).message;}}
async function upload(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;uploading.value=true;try{if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>5*1024*1024)throw Error('请选择5MB以内的 PNG、JPEG、WebP 图片。');const bitmap=await createImageBitmap(file);try{const scale=Math.min(1,1000/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);update({url:imageUrl(canvas.toDataURL('image/webp',.85)),scale:1,x:0,y:0});error.value='';}finally{bitmap.close();}}catch(e){error.value=(e as Error).message;}finally{input.value='';uploading.value=false;}}
function reset(){if(props.w.preferences.characterImages)delete props.w.preferences.characterImages[props.id];}
</script>
<template><section v-if="card" class="pt-character-image-editor"><h3>角色卡图片与头像</h3><label>上传图片<input type="file" accept="image/png,image/jpeg,image/webp" :disabled="uploading" @change="upload"></label><label>图片 URL<input :key="id" :value="setting?.url||''" placeholder="https://…" @change="urlChange"></label><label v-for="field in (['scale','x','y'] as const)" :key="field">{{ {scale:'头像缩放',x:'水平位置',y:'垂直位置'}[field] }}<input type="range" :min="field==='scale'?1:-100" :max="field==='scale'?4:100" :step="field==='scale'?.05:1" :value="setting?.[field]??(field==='scale'?1:0)" @input="update({[field]:Number(($event.target as HTMLInputElement).value)})"></label><div class="pt-actions"><button type="button" @click="update({scale:1,x:0,y:0})">重置位置</button><button type="button" @click="reset">恢复默认图片</button><button type="button" :disabled="uploading||w.storageStatus==='saving'" @click="w.save()">立即保存</button></div><p v-if="error" role="alert">{{error}}</p><small>图片与角色卡同步，头像构图独立调整；修改后自动保存。</small></section></template>
