<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ViewModel } from '../app/useWorkspace';
const props=defineProps<{w:ViewModel;kind:'relations'|'map'}>();
const chosen=ref(''),place=ref(''),description=ref(''),loading=ref(false);
const positions=ref<Record<string,{x:number;y:number}>>({});
const actors=computed(()=>props.w.state?[props.w.state.player,...props.w.state.characters.filter(a=>a.present)]:[]);
const actor=computed(()=>props.w.state?.characters.find(a=>a.id===chosen.value));
watch(()=>props.w.active?.id,()=>{positions.value={};chosen.value='';place.value='';description.value='';});
watch(actors,list=>{list.forEach((a,i)=>{if(!positions.value[a.id]){const angle=(i-1)*Math.PI*2/Math.max(1,list.length-1);positions.value[a.id]=i===0?{x:260,y:160}:{x:260+175*Math.cos(angle),y:160+100*Math.sin(angle)};}});if(!chosen.value)chosen.value=list.find(a=>a.id!=='player')?.id||'';},{immediate:true});
const demoPlaces=[{id:'reception',name:'接待区',area:'样例',px:25,py:30,description:'虚构样例：公共接待设施的介绍。'},{id:'archive',name:'公开资料室',area:'样例',px:70,py:30,description:'虚构样例：用于展示地图的公开说明。'},{id:'platform',name:'观景平台',area:'样例',px:50,py:75,description:'虚构样例：一处站点设施。'}];
const places=computed(()=>props.w.localService&&props.w.preferences.mode==='server'?props.w.localService.places:demoPlaces);
let dragging:string|undefined;let request=0;
function down(id:string,e:PointerEvent){dragging=id;(e.currentTarget as SVGElement).setPointerCapture(e.pointerId);}
function move(e:PointerEvent){if(!dragging)return;const r=(e.currentTarget as SVGSVGElement).getBoundingClientRect();positions.value[dragging]={x:Math.max(50,Math.min(470,(e.clientX-r.left)*520/r.width)),y:Math.max(35,Math.min(275,(e.clientY-r.top)*320/r.height))};}
function up(){if(dragging&&dragging!=='player')chosen.value=dragging;dragging=undefined;}
async function selectPlace(id:string){place.value=id;description.value='';const ticket=++request;if(props.w.localService&&props.w.preferences.mode==='server'){loading.value=true;const result=await props.w.loadPlace(id);if(ticket===request){description.value=result?.description||'';loading.value=false;}}else description.value=demoPlaces.find(p=>p.id===id)?.description||'';}
</script>
<template>
  <section v-if="kind==='relations'&&w.state" class="surface">
    <p class="eyebrow">RELATIONS / 人物关系</p><h1>当前在场的人物</h1><p class="muted">可拖动图中节点。只在已有好感度数据时画出关系线；原资料没有的关系不补写。</p>
    <svg class="relation-graph" viewBox="0 0 520 320" role="img" aria-label="玩家与在场人物的关系图" @pointermove="move" @pointerup="up" @pointercancel="up">
      <line v-for="a in actors.filter(a=>a.id!=='player'&&a.affinity!==undefined)" :key="`line-${a.id}`" :x1="positions.player?.x||260" :y1="positions.player?.y||160" :x2="positions[a.id]?.x||260" :y2="positions[a.id]?.y||160" />
      <g v-for="a in actors" :key="a.id" :transform="`translate(${positions[a.id]?.x||260},${positions[a.id]?.y||160})`" @pointerdown="down(a.id,$event)"><circle r="27" /><text y="45" text-anchor="middle">{{a.name}}</text><text v-if="a.id!=='player'" y="5" text-anchor="middle">{{a.affinity??'—'}}</text></g>
    </svg>
    <div class="actions"><button v-for="a in actors.filter(a=>a.id!=='player')" :key="a.id" :class="{selected:chosen===a.id}" @click="chosen=a.id">{{a.name}}</button></div>
    <div v-if="actor" class="detail"><h2>{{actor.name}}</h2><p>对 user 的好感度：{{actor.affinity??'原资料未提供'}}</p></div><p v-else class="empty">当前没有选定在场角色。</p>
  </section>
  <section v-else-if="kind==='map'" class="surface">
    <p class="eyebrow">MAP / 点击地图</p><h1>地点资料</h1><p class="muted">{{w.localService?'原插件地点与活动的资料标记；点击后从本机后台读取对应介绍。':'当前使用演示资料。'}}只查看介绍，不移动、不探索、不触发事件。</p>
    <svg class="static-map" viewBox="0 0 600 380" role="img" aria-label="可点击的地点资料示意图"><rect x="5" y="5" width="590" height="370" rx="4" class="map-outline" /><g v-for="p in places" :key="p.id" :transform="`translate(${p.px*6},${p.py*3.8})`" @click="selectPlace(p.id)"><rect x="-48" y="-20" width="96" height="40" rx="4" /><text y="5" text-anchor="middle">{{p.name}}</text></g></svg>
    <div class="actions"><button v-for="p in places" :key="p.id" :class="{selected:place===p.id}" @click="selectPlace(p.id)">{{p.name}}</button></div>
    <article v-if="place" class="detail"><h2>{{places.find(p=>p.id===place)?.name}}</h2><p>{{loading?'读取中…':description||'未提供'}}</p></article><p v-else class="empty">点击一个标记查看介绍。</p>
  </section>
</template>
