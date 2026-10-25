<script setup lang="ts">
import {onBeforeUnmount,onMounted,watch} from 'vue';
import {generationCompletion} from '../app/generationCompletion';
const props=withDefaults(defineProps<{busy?:boolean}>(),{busy:false});
let unread=false,mounted=false,created:HTMLLinkElement|undefined;
let originals:{link:HTMLLinkElement;href:string|null;type:string|null;sizes:string|null}[]=[];
function restore(){for(const {link,href,type,sizes} of originals){for(const [key,value] of [['href',href],['type',type],['sizes',sizes]]){if(value===null)link.removeAttribute(key!);else link.setAttribute(key!,value!);}}}
function render(){
 if(!mounted)return;
 const icon=(props.busy||generationCompletion.pending>0)?'/favicon-generating.svg':unread?'/favicon-unread.svg':'';
 if(!icon){restore();created?.remove();created=undefined;return;}
 if(!originals.length&&!created){created=document.createElement('link');created.rel='icon';document.head.append(created);}
 for(const link of originals.length?originals.map(o=>o.link):[created!]){link.href=icon;link.type='image/svg+xml';link.setAttribute('sizes','any');}
}
function acknowledge(){if(document.visibilityState==='visible'&&document.hasFocus()){unread=false;render();}}
watch(()=>[props.busy,generationCompletion.pending],render);
watch(()=>generationCompletion.id,()=>{if(!generationCompletion.id||!mounted)return;unread=document.visibilityState==='hidden'||!document.hasFocus();render();});
onMounted(()=>{mounted=true;originals=[...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')].map(link=>({link,href:link.getAttribute('href'),type:link.getAttribute('type'),sizes:link.getAttribute('sizes')}));document.addEventListener('visibilitychange',acknowledge);window.addEventListener('focus',acknowledge);render();});
onBeforeUnmount(()=>{mounted=false;restore();created?.remove();document.removeEventListener('visibilitychange',acknowledge);window.removeEventListener('focus',acknowledge);});
</script>
<template></template>
