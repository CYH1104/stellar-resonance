<script setup lang="ts">
import {affinityEdgeStyle as edgeStyle} from '../domain/affinity';
import {encounteredCharacters} from '../domain/story';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import ActorCard from './ActorCard.vue';
import type { ViewModel } from '../app/useWorkspace';
const props=defineProps<{w:ViewModel;kind:'relations'|'map'}>();
const chosen=ref(''),place=ref(''),description=ref(''),loading=ref(false);
function closeOutside(event:MouseEvent){const target=event.target;if(chosen.value&&target instanceof Element&&!target.closest('.relation-detail,.relation-node,.relations-surface .actions'))chosen.value='';}
onMounted(()=>document.addEventListener('click',closeOutside));
onUnmounted(()=>document.removeEventListener('click',closeOutside));
const positions=ref<Record<string,{x:number;y:number}>>({});
const manuallyPlaced=new Set<string>();
const actors=computed(()=>{const state=props.w.state;if(!state)return [];const met=new Set(props.w.active?encounteredCharacters(props.w.active).map(a=>a.id):[]);return [state.player,...state.characters.filter(a=>a.present||!!a.relationship||met.has(a.id))];});
const actor=computed(()=>actors.value.find(a=>a.id===chosen.value));
watch(()=>props.w.active?.id,()=>{positions.value={};manuallyPlaced.clear();chosen.value='';place.value='';description.value='';});
watch(actors,list=>{for(const id of Object.keys(positions.value))if(!list.some(a=>a.id===id)){delete positions.value[id];manuallyPlaced.delete(id);}list.forEach((a,i)=>{if(!manuallyPlaced.has(a.id)){const angle=(i-1)*Math.PI*2/Math.max(1,list.length-1);positions.value[a.id]=i===0?{x:260,y:160}:{x:260+175*Math.cos(angle),y:160+100*Math.sin(angle)};}});},{immediate:true});
const demoPlaces=[{id:'reception',name:'接待区',area:'样例',px:25,py:30,description:'虚构样例：公共接待设施的介绍。'},{id:'archive',name:'公开资料室',area:'样例',px:70,py:30,description:'虚构样例：用于展示地图的公开说明。'},{id:'platform',name:'观景平台',area:'样例',px:50,py:75,description:'虚构样例：一处站点设施。'}];
const places=computed(()=>props.w.localService&&props.w.preferences.mode==='server'?props.w.localService.places:demoPlaces);
let dragging:string|undefined;let request=0;
function down(id:string,e:PointerEvent){dragging=id;(e.currentTarget as SVGElement).setPointerCapture(e.pointerId);}
function move(e:PointerEvent){if(!dragging)return;manuallyPlaced.add(dragging);const r=(e.currentTarget as SVGSVGElement).getBoundingClientRect();positions.value[dragging]={x:Math.max(50,Math.min(470,(e.clientX-r.left)*520/r.width)),y:Math.max(35,Math.min(275,(e.clientY-r.top)*320/r.height))};}
function up(){if(dragging)chosen.value=dragging;dragging=undefined;}
async function selectPlace(id:string){place.value=id;description.value='';const ticket=++request;if(props.w.localService&&props.w.preferences.mode==='server'){loading.value=true;const result=await props.w.loadPlace(id);if(ticket===request){description.value=result?.description||'';loading.value=false;}}else description.value=demoPlaces.find(p=>p.id===id)?.description||'';}
</script>
<template>
  <section v-if="kind==='relations'&&w.state" class="surface relations-surface" @click.self="chosen=''">
    <p class="eyebrow">RELATIONS / 人物关系</p><h1>人物关系</h1>
    <svg class="relation-graph" viewBox="0 0 520 320" role="img" aria-label="玩家与已记录人物的关系图" @pointermove="move" @pointerup="up" @pointercancel="up">
      <g v-for="a in actors.filter(a=>a.id!=='player'&&(a.affinity!==undefined||a.relationship))" :key="`line-${a.id}`" class="relation-edge"><line :style="edgeStyle(a.affinity)" :x1="positions.player?.x||260" :y1="positions.player?.y||160" :x2="positions[a.id]?.x||260" :y2="positions[a.id]?.y||160" /><text :x="((positions.player?.x||260)+(positions[a.id]?.x||260))/2" :y="((positions.player?.y||160)+(positions[a.id]?.y||160))/2-8" text-anchor="middle">{{a.affinity===undefined?'':'好感度 '+a.affinity}}{{a.relationship?(a.affinity===undefined?'':' · ')+a.relationship:''}}</text></g>
      <g v-for="a in actors" :key="a.id" class="relation-node" :class="{selected:chosen===a.id}" :transform="`translate(${positions[a.id]?.x||260},${positions[a.id]?.y||160})`" role="button" tabindex="0" :aria-label="a.name" @click="chosen=a.id" @keydown.enter.prevent="chosen=a.id" @keydown.space.prevent="chosen=a.id" @pointerdown="down(a.id,$event)"><circle class="relation-hit" r="16" /><circle class="relation-dot" r="4" /><text y="23" text-anchor="middle">{{a.name}}</text></g>
    </svg>
    <div class="actions"><button v-for="a in actors.filter(a=>a.id!=='player')" :key="a.id" :class="{selected:chosen===a.id}" @click="chosen=a.id">{{a.name}}</button></div>
    <Transition name="relation-expand"><aside v-if="actor" :key="actor.id" class="relation-detail" aria-label="角色资料"><button class="relation-close" aria-label="关闭角色资料" @click="chosen=''">×</button><div class="relation-detail-body"><ActorCard :actor="actor" :player="actor.id==='player'" /></div></aside></Transition>
  </section>
  <section v-else-if="kind==='map'" class="surface">
    <p class="eyebrow">MAP / 点击地图</p><h1>地点资料</h1>
    <svg class="static-map" viewBox="0 0 600 380" role="img" aria-label="可点击的地点资料示意图"><rect x="5" y="5" width="590" height="370" rx="4" class="map-outline" /><g v-for="p in places" :key="p.id" :transform="`translate(${p.px*6},${p.py*3.8})`" @click="selectPlace(p.id)"><rect x="-48" y="-20" width="96" height="40" rx="4" /><text y="5" text-anchor="middle">{{p.name}}</text></g></svg>
    <div class="actions"><button v-for="p in places" :key="p.id" :class="{selected:place===p.id}" @click="selectPlace(p.id)">{{p.name}}</button></div>
    <article v-if="place" class="detail"><h2>{{places.find(p=>p.id===place)?.name}}</h2><p>{{loading?'读取中…':description||'未提供'}}</p></article><p v-else class="empty">点击一个标记查看介绍。</p>
  </section>
</template>
