<script setup lang="ts">
import {ref} from 'vue';
import {nicknameImages,nicknameImage,saveNicknameImage} from '../app/localNicknameImages';
const name=ref(''),url=ref(''),message=ref('');
function save(){try{saveNicknameImage(name.value,url.value);message.value=url.value.trim()?'头像已保存到本机':'已移除头像绑定';}catch(e){message.value=(e as Error).message;}}
</script>
<template><details class="pt-card"><summary>昵称头像设置</summary><label>终端中显示的昵称<input v-model="name" maxlength="80" placeholder="填写角色在终端中的名字"></label><label>图片 URL（可选）<input v-model="url" type="url" placeholder="https://…，留空恢复默认头像"></label><div v-if="nicknameImage(name)" class="pt-avatar"><img :src="nicknameImage(name)" alt="头像预览" referrerpolicy="no-referrer"></div><button type="button" @click="save">保存头像</button><p role="status">{{message}}</p><small>只在本机按昵称匹配图片，不发送给模型。同名使用同一头像。</small><button v-for="(image,nickname) in nicknameImages()" :key="nickname" type="button" @click="name=String(nickname);url=image;message=''">{{nickname}} · 编辑</button></details></template>
