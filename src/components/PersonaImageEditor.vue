<script setup lang="ts">
import {registerBackupFlusher} from '../app/backupFlushers';
import DismissibleNotice from './DismissibleNotice.vue';
import UserAvatar from './UserAvatar.vue';
import {avatarFrame,avatarAppearanceStyle,cleanAvatarAppearance,type AvatarAppearance,type AvatarSize,type AvatarShape} from '../domain/avatarAppearance';
import {computed,ref,watch,onUnmounted} from 'vue';
const appearance=defineModel<AvatarAppearance>('appearance',{default:()=>cleanAvatarAppearance()});
const props=defineProps<{portrait?:Blob;disabled?:boolean}>();
const emit=defineEmits<{'update:portrait':[value:Blob|undefined];'update:avatar':[value:Blob|undefined];dirty:[]}>();
const size=computed({get:()=>appearance.value.size,set:(value:AvatarSize)=>{appearance.value={...appearance.value,size:value};}});
const shape=computed({get:()=>appearance.value.shape,set:(value:AvatarShape)=>{appearance.value={...appearance.value,shape:value};}});
const frame=computed(()=>avatarFrame(appearance.value));
const zoom=computed({get:()=>frame.value.zoom,set:(value:number)=>updateFrame({zoom:value})});
const editorHeight=computed(()=>appearance.value.shape==='rectangle'?280:200);
const mask=computed(()=>({borderRadius:appearance.value.shape==='circle'?'50%':'0',height:editorHeight.value+'px'}));
const canvas=ref<HTMLCanvasElement>(),input=ref<HTMLInputElement>(),problem=ref(''),notice=ref(''),hasImage=ref(false),previewUrl=ref('');
let image:HTMLImageElement|undefined,url='',generation=0,imageRequest=0,drag:{x:number;y:number;startX:number;startY:number}|undefined;
let cropTimer:ReturnType<typeof setTimeout>|undefined;
function updateFrame(patch:Partial<{zoom:number;x:number;y:number}>){appearance.value=cleanAvatarAppearance({...appearance.value,frames:{...appearance.value.frames,[size.value]:{...frame.value,...patch}}});}
function resetFrame(){const frames={...appearance.value.frames};delete frames[size.value];appearance.value={...appearance.value,frames};}
function paint(){
 const c=canvas.value,ctx=c?.getContext('2d');if(!c||!ctx||!image?.naturalWidth)return;
 const f=frame.value,scale=Math.min(c.width/image.naturalWidth,c.height/image.naturalHeight)*f.zoom,w=image.naturalWidth*scale,h=image.naturalHeight*scale;
 ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(image,(c.width-w)/2+f.x*c.width,(c.height-h)/2+f.y*c.height,w,h);
}
function scheduleCrop(){clearTimeout(cropTimer);cropTimer=setTimeout(()=>void crop(),250);}
async function crop(){
 const c=canvas.value;if(!c||!hasImage.value)return;paint();const request=++generation,original=props.portrait,settings=JSON.stringify(appearance.value);
 const out=document.createElement('canvas');out.width=512;out.height=Math.round(512*c.height/c.width);out.getContext('2d')!.drawImage(c,0,0,out.width,out.height);
 const blob=await new Promise<Blob|null>(resolve=>out.toBlob(resolve,'image/png'));
 if(blob&&request===generation&&original===props.portrait&&settings===JSON.stringify(appearance.value)){emit('update:avatar',blob);emit('dirty');notice.value='构图已更新，将随人设自动保存。';}
}
watch(()=>props.portrait,file=>{
 const request=++imageRequest;generation++;clearTimeout(cropTimer);if(url)URL.revokeObjectURL(url);image=undefined;hasImage.value=false;previewUrl.value='';notice.value='';if(!file)return;
 url=URL.createObjectURL(file);const next=new Image();next.onload=()=>{if(request!==imageRequest)return;image=next;previewUrl.value=url;hasImage.value=true;requestAnimationFrame(()=>{paint();scheduleCrop();});};next.onerror=()=>{if(request===imageRequest)problem.value='图片无法读取，请更换文件。';};next.src=url;
},{immediate:true});
watch(()=>appearance.value,()=>{generation++;paint();scheduleCrop();},{deep:true,flush:'post'});
async function select(event:Event){const el=event.target as HTMLInputElement,file=el.files?.[0];if(!file)return;problem.value='';try{if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>5*1024*1024)throw Error('请选择5MB以内的 PNG、JPEG 或 WebP 图片。');const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>24000000){bitmap.close();throw Error('图片像素过大，请使用2400万像素以内的图片。');}bitmap.close();appearance.value={size:size.value,shape:shape.value};emit('update:portrait',file);emit('update:avatar',undefined);emit('dirty');}catch(error){problem.value=(error as Error).message;}finally{el.value='';}}
function down(event:PointerEvent){if(!hasImage.value||props.disabled)return;drag={x:frame.value.x,y:frame.value.y,startX:event.clientX,startY:event.clientY};(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);}
function move(event:PointerEvent){if(!drag||props.disabled)return;const rect=(event.currentTarget as HTMLElement).getBoundingClientRect();updateFrame({x:drag.x+(event.clientX-drag.startX)/rect.width,y:drag.y+(event.clientY-drag.startY)/rect.height});}
onUnmounted(()=>{imageRequest++;generation++;clearTimeout(cropTimer);if(url)URL.revokeObjectURL(url);});
registerBackupFlusher(async()=>{clearTimeout(cropTimer);await crop();},0);
</script>
<template><section class="persona-image-editor"><h2>人设图片与头像</h2><div class="actions"><button type="button" :disabled="disabled" @click="input?.click()">选择图片</button><button v-if="portrait" type="button" :disabled="disabled" @click="emit('update:portrait',undefined);emit('update:avatar',undefined);emit('dirty')">移除图片</button><input ref="input" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="select" /><small class="muted">PNG / JPEG / WebP · 最多5MB</small><slot name="image-options" /></div>
<div class="avatar-appearance-controls"><label>头像尺寸<select v-model="size" :disabled="disabled"><option value="small">小</option><option value="medium">中</option><option value="large">大</option></select></label><label>头像形状<select v-model="shape" :disabled="disabled"><option value="square">正方形</option><option value="circle">圆形</option><option value="rectangle">长方形（竖向）</option></select></label></div>
<p class="muted">小号聚焦头像，中号扩大构图，大号默认展示完整原图。每种尺寸可独立调整位置和缩放。</p>
<div class="avatar-appearance-preview"><span>对话实际大小预览 · {{avatarAppearanceStyle(appearance).width}} × {{avatarAppearanceStyle(appearance).height}}</span><UserAvatar name="我" :src="previewUrl" :appearance="appearance" /></div>
<div v-if="portrait" class="persona-crop-layout"><div class="persona-crop-preview" :style="mask"><canvas ref="canvas" width="200" :height="editorHeight" :style="{height:editorHeight+'px'}" aria-label="拖动完整原图调整当前尺寸的头像构图" @pointerdown="down" @pointermove="move" @pointerup="drag=undefined;scheduleCrop()" @pointercancel="drag=undefined" @lostpointercapture="drag=undefined" /></div><div><p>拖动调整当前尺寸的构图，自动保存。</p><label>构图缩放<input v-model.number="zoom" type="range" min="1" max="4" step=".01" :disabled="disabled" /></label><button type="button" :disabled="disabled" @click="resetFrame">恢复当前尺寸默认构图</button><p class="muted">始终从完整原图取景，放大尺寸不会被旧的方形裁剪限制。竖向长方形的高度大于宽度；正方形和圆形保留所选轮廓。</p></div></div><DismissibleNotice :message="problem" error /><DismissibleNotice :message="notice" /></section></template>
<style scoped>.avatar-appearance-controls{display:flex;gap:18px;align-items:center;flex-wrap:wrap}.avatar-appearance-controls label{min-width:110px}.avatar-appearance-preview{display:flex;flex-direction:column;align-items:flex-start;gap:12px;font-size:12px;margin:14px 0 22px}.persona-crop-preview{flex-shrink:0}.persona-crop-preview canvas{max-width:none}</style>
