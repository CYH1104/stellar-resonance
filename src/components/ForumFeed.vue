<script setup lang="ts">
import { ref } from 'vue';
import type { ViewModel } from '../app/useWorkspace';
defineProps<{w:ViewModel;standalone?:boolean;title?:string}>();
const expanded = ref<Record<string,boolean>>({});
const drafts = ref<Record<string,string>>({});
function source(w:ViewModel,id:string) { w.panel='story'; setTimeout(() => document.getElementById(`turn-${id}`)?.scrollIntoView({block:'center'}),100); }
async function reply(w:ViewModel,key:string) { if(await w.replyToForum(key,drafts.value[key]||'')) drafts.value[key]=''; }
</script>
<template>
  <section class="forum-panel" :class="{'standalone-forum':standalone}" aria-label="论坛动态">
    <header class="rail-heading"><div><p class="eyebrow">IN-WORLD / 论坛</p><h2>{{title||'星际论坛'}}</h2></div><span class="tag">{{ w.forum.length }} 条</span></header>
    <div class="forum-feed">
      <article v-for="post in [...w.forum].reverse()" :key="post.key" class="forum-post">
        <header class="forum-author"><span class="forum-avatar" aria-hidden="true">{{ post.authorName.slice(0,1) }}</span><div><strong>{{ post.authorName }}</strong></div><span v-if="w.preferences.mode==='demo'" class="tag">演示</span></header>
        <span v-if="post.topic" class="topic-link">#{{ post.topic }}#</span>
        <p class="forum-body">{{ post.content }}</p>
        <div class="forum-actions">
          <button :class="{liked:w.active?.forumActivity?.[post.key]?.liked}" :aria-pressed="!!w.active?.forumActivity?.[post.key]?.liked" :disabled="w.busy||w.workingMemory||!!w.workingForumReply" @click="w.toggleForumLike(post.key)">{{ w.active?.forumActivity?.[post.key]?.liked ? '♥ 已赞' : '♡ 点赞' }}</button>
          <button :aria-expanded="!!expanded[post.key]" @click="expanded[post.key]=!expanded[post.key]">评论 {{ (post.comments?.length||0)+(w.active?.forumActivity?.[post.key]?.replies?.length||0) }}</button>
          <button @click="source(w,post.turnId)">来源剧情</button>
        </div>
        <section v-if="expanded[post.key]" class="forum-comments" :aria-label="`${post.authorName}动态的评论`">
          <p v-for="comment in post.comments" :key="comment.id"><strong>{{ comment.authorName }}</strong>：{{ comment.content }}</p>
          <p v-for="comment in w.active?.forumActivity?.[post.key]?.replies" :key="comment.id"><strong>{{comment.kind==='ai'?comment.authorName:(w.state?.player.name||'我')}}</strong><small v-if="comment.kind==='ai'"> 回复你</small>：{{comment.text}} <button v-if="comment.kind!=='ai'&&w.preferences.forumReplyEnabled&&!w.active?.forumActivity?.[post.key]?.replies.some(r=>r.kind==='ai'&&r.replyTo===comment.id)" type="button" :disabled="w.busy||w.workingMemory||!!w.workingForumReply" @click="w.retryForumReply(post.key,comment.id)">获取 AI 回复</button></p>
          <p v-if="w.workingForumReply===post.key" role="status">角色／NPC 正在回复… <button type="button" @click="w.stopForumReply()">停止回复</button></p><p v-if="w.forumReplyPost===post.key&&w.forumReplyError" class="model-list-error" role="alert">{{w.forumReplyError}}</p>
          <form @submit.prevent="reply(w,post.key)"><label>我的评论<textarea v-model="drafts[post.key]" rows="2" maxlength="1000" placeholder="作为角色回应这条动态…" :disabled="w.busy||w.workingMemory" /></label><button type="submit" :disabled="w.busy||w.workingMemory||!drafts[post.key]?.trim()">发表评论</button></form>
        </section>
      </article>
      <div v-if="!w.forum.length" class="forum-empty"><span aria-hidden="true">✦</span><h3>这里也有故事。</h3><p>{{ w.forum.length ? '此话题暂时没有动态，可以切回全部动态。' : '完成一轮剧情后，角色的动态和小剧场会出现在这里。' }}</p></div>
    </div>

  </section>
</template>
