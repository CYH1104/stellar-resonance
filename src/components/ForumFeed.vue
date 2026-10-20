<script setup lang="ts">
import TheaterContent from './TheaterContent.vue';
import DismissibleNotice from './DismissibleNotice.vue';
import {displayText} from '../domain/storyMarkup';
import {forumLikeCount} from '../domain/forumLikes';
import { computed,ref,watch,nextTick,onMounted,onBeforeUnmount } from 'vue';
import type { ViewModel } from '../app/useWorkspace';
const props=defineProps<{w:ViewModel;standalone?:boolean;title?:string}>();
const root=ref<HTMLElement>(),pageStart=ref(0);const posts=computed(()=>props.w.forum.slice(pageStart.value,pageStart.value+10));
let container:HTMLElement|undefined,busy=false;function scrollContainers(){const panel=root.value;return [panel?.closest<HTMLElement>('.theater-scroll-body'),panel?.closest<HTMLElement>('.resizable-panel-body'),panel].filter((e):e is HTMLElement=>!!e);}
async function page(direction:-1|1){if(busy||direction<0&&pageStart.value===0||direction>0&&pageStart.value+10>=props.w.forum.length)return;busy=true;pageStart.value=Math.max(0,Math.min(Math.max(0,props.w.forum.length-10),pageStart.value+direction*10));await nextTick();for(const e of scrollContainers())e.scrollTop=direction>0?2:Math.max(1,e.scrollHeight-e.clientHeight-2);setTimeout(()=>busy=false,160);}
function wheel(e:WheelEvent){const el=scrollContainers().find(e=>e.scrollHeight>e.clientHeight+2)||container;if(!el)return;if(e.deltaY>0&&el.scrollHeight-el.scrollTop-el.clientHeight<35)void page(1);else if(e.deltaY<0&&el.scrollTop<35)void page(-1);}
async function jump(kind:string){pageStart.value=kind==='earliest'?Math.max(0,props.w.forum.length-10):0;await nextTick();for(const e of scrollContainers())e.scrollTop=kind==='earliest'?e.scrollHeight:0;}
let touchY=0;const touchStart=(e:TouchEvent)=>{touchY=e.touches[0]?.clientY||0;};const touchEnd=(e:TouchEvent)=>wheel({deltaY:touchY-(e.changedTouches[0]?.clientY||touchY)} as WheelEvent);
onMounted(()=>{container=root.value?.closest<HTMLElement>('.theater-scroll-body')||root.value;container?.addEventListener('wheel',wheel,{passive:true});container?.addEventListener('touchstart',touchStart,{passive:true});container?.addEventListener('touchend',touchEnd,{passive:true});});onBeforeUnmount(()=>{container?.removeEventListener('wheel',wheel);container?.removeEventListener('touchstart',touchStart);container?.removeEventListener('touchend',touchEnd);});watch(()=>props.w.forum[0]?.key,()=>void jump('latest'));

const expanded = ref<Record<string,boolean>>({});
const drafts = ref<Record<string,string>>({});
async function reply(w:ViewModel,key:string) { if(await w.replyToForum(key,drafts.value[key]||'')) drafts.value[key]=''; }
</script>
<template>
  <section ref="root" class="forum-panel" @forum-page="jump(($event as CustomEvent).detail)" :class="{'standalone-forum':standalone}" aria-label="论坛动态">
    <header class="rail-heading"><div><p class="eyebrow">IN-WORLD / 论坛</p><h2>{{title||'星际论坛'}}</h2></div><span class="tag">{{ w.forum.length }} 条</span></header>
    <div class="forum-feed"><button v-if="pageStart>0" class="history-page-link" @click="page(-1)">查看更新 10 条</button>
      <article v-for="post in posts" :key="post.key" class="forum-post">
        <header class="forum-author"><span class="forum-avatar" aria-hidden="true">{{ post.authorName.slice(0,1) }}</span><div><strong>{{ post.authorName }}</strong><small v-if="post.type||post.time" class="forum-post-meta">{{[post.type,post.time].filter(Boolean).join(' · ')}}</small></div><span v-if="w.preferences.mode==='demo'" class="tag">演示</span></header>
        <span v-if="post.topic" class="topic-link">#{{ post.topic }}#</span>
        <TheaterContent class="forum-body" :text="post.content" />
        <div class="forum-actions">
          <button :class="{liked:w.active?.forumActivity?.[post.key]?.liked}" :aria-pressed="!!w.active?.forumActivity?.[post.key]?.liked" :disabled="w.busy||w.workingMemory||!!w.workingForumReply" @click="w.toggleForumLike(post.key)">{{ w.active?.forumActivity?.[post.key]?.liked ? '♥ 已赞' : '♡ 点赞' }} {{w.active?forumLikeCount(w.active,post):0}}</button>
          <button :aria-expanded="!!expanded[post.key]" @click="expanded[post.key]=!expanded[post.key]">评论 {{ (post.comments?.length||0)+(w.active?.forumActivity?.[post.key]?.replies?.length||0) }}</button>
        </div>
        <section v-if="expanded[post.key]" class="forum-comments" :aria-label="`${post.authorName}动态的评论`">
          <p v-for="comment in post.comments" :key="comment.id"><strong>{{ comment.authorName }}</strong>：{{ displayText(comment.content) }}</p>
          <p v-for="comment in w.active?.forumActivity?.[post.key]?.replies" :key="comment.id"><strong>{{comment.kind==='ai'?comment.authorName:(w.state?.player.name||'我')}}</strong><small v-if="comment.kind==='ai'"> 回复你</small>：{{displayText(comment.text)}} <button v-if="comment.kind!=='ai'&&w.preferences.forumReplyEnabled&&!w.active?.forumActivity?.[post.key]?.replies.some(r=>r.kind==='ai'&&r.replyTo===comment.id)" type="button" :disabled="w.busy||w.workingMemory||!!w.workingForumReply" @click="w.retryForumReply(post.key,comment.id)">获取 AI 回复</button></p>
          <p v-if="w.workingForumReply===post.key" role="status">角色／NPC 正在回复… <button type="button" @click="w.stopForumReply()">停止回复</button></p><DismissibleNotice v-if="w.forumReplyPost===post.key" :message="w.forumReplyError" error />
          <form @submit.prevent="reply(w,post.key)"><label>我的评论<textarea v-model="drafts[post.key]" rows="2" maxlength="1000" placeholder="作为角色回应这条动态…" :disabled="w.busy||w.workingMemory" /></label><button type="submit" :disabled="w.busy||w.workingMemory||!drafts[post.key]?.trim()">发表评论</button></form>
        </section>
      </article>
      <button v-if="pageStart+10<w.forum.length" class="history-page-link" @click="page(1)">向下滚动，查看更早 10 条</button><div v-if="!w.forum.length" class="forum-empty"><span aria-hidden="true">✦</span><h3>这里也有故事。</h3><p>{{ w.forum.length ? '此话题暂时没有动态，可以切回全部动态。' : '完成一轮剧情后，角色的动态和小剧场会出现在这里。' }}</p></div>
    </div>

  </section>
</template>
