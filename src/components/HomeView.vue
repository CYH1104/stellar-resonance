<script setup lang="ts">
import type {ViewModel} from '../app/useWorkspace';
import {computed} from 'vue';
import SaveList from './SaveList.vue';
import ChoiceChips from './ChoiceChips.vue';
import {readPersonaExtra,writePersonaExtra,personaNotes,writePersonaNotes,type ExtraLabel} from '../domain/personaExtras';
const props=defineProps<{w:ViewModel;mode:'new'|'continue'}>();
const extra=(label:ExtraLabel)=>computed({get:()=>readPersonaExtra(props.w.newGameDraft.persona.other,label),set:(value:string)=>{props.w.newGameDraft.persona.other=writePersonaExtra(props.w.newGameDraft.persona.other,label,value);}});
const pheromone=extra('信息素'),spiritLevel=extra('精神力等级');
const notes=computed({get:()=>personaNotes(props.w.newGameDraft.persona.other),set:(value:string)=>{props.w.newGameDraft.persona.other=writePersonaNotes(props.w.newGameDraft.persona.other,value);}});
const departments=['领航者 · 星舰指挥与战略系','破军 · 机甲驾驶与近地作战系','织网者 · 信息工程与电子战系','基石 · 后勤与战略支援系','银铃 · 外交与星际文化系'];
</script>
<template>
  <section v-if="mode==='continue'" class="surface journey-setup">
    <p class="eyebrow">CONTINUE / 继续游戏</p><h1>接着上一次的故事。</h1>
    <p v-if="!w.sessions.length" class="muted">还没有存档，可以返回开场页选择“新的开始”，或导入备份。</p>
    <SaveList :w="w" />
    <button @click="w.panel='saves'">备份与导入</button>
  </section>
  <section v-else class="surface journey-setup student-file-card">
    <header class="student-file-heading"><h1>PERSONA FILE <small>人物档案</small></h1><span class="student-file-status"><i aria-hidden="true"></i>ONLINE</span></header>
    <div class="student-file-scroll">
    <div class="student-file-welcome"><span>正在为您接入校园迎新网络…</span><span>填写你扮演的角色，建立本次旅程的个人档案。</span><em>[ 请填写 ]</em></div>
    <form id="new-persona-form" @submit.prevent="w.create(w.newGameDraft.title,w.newGameDraft.persona,w.newGameDraft.opening)">
      <fieldset class="persona-fields" :disabled="w.workingPersona||w.creatingGame">
        <legend class="sr-only">玩家人设</legend>
        <label class="file-wide">存档名称<input v-model="w.newGameDraft.title" maxlength="80" required /></label>
        <label>姓名（必填）<input v-model="w.newGameDraft.persona.name" maxlength="80" required autocomplete="off" placeholder="请输入玩家姓名" /></label>
        <div class="file-field"><label>第一性别<input v-model="w.newGameDraft.persona.primaryGender" maxlength="100" list="primary-genders" placeholder="可留空，也可自行填写" /></label><ChoiceChips v-model="w.newGameDraft.persona.primaryGender" :options="['男','女']" label="第一性别快捷选项" /></div>
        <div class="file-field"><label>第二性别<input v-model="w.newGameDraft.persona.secondaryGender" maxlength="100" list="secondary-genders" placeholder="可留空，也可自行填写" /></label><ChoiceChips v-model="w.newGameDraft.persona.secondaryGender" :options="['aboe','Alpha','Beta','Omega','其他']" label="第二性别快捷选项" /></div>
        <label>信息素<input v-model="pheromone" maxlength="100" placeholder="例如：冷杉混雪松" /></label>
        <div class="file-field"><label>精神力等级<input v-model="spiritLevel" maxlength="100" placeholder="S / A / B / C / D" /></label><ChoiceChips v-model="spiritLevel" :options="['S','A','B','C','D']" label="精神力等级快捷选项" /></div>
        <div class="file-field file-wide"><label>精神体<textarea v-model="w.newGameDraft.persona.spiritAnimal" rows="2" maxlength="1500" placeholder="点击下方选项，或自行填写种类、外形、特征" /></label><ChoiceChips v-model="w.newGameDraft.persona.spiritAnimal" :options="['狼','蛇','虎','豹','狐','鹰','鲨','蛛','鸦','鹿']" label="精神体快捷选项" /></div>
        <div class="file-field file-wide"><label>院系 / 职业<input v-model="w.newGameDraft.persona.identity" maxlength="200" placeholder="点击下方院系，或自行填写" /></label><ChoiceChips v-model="w.newGameDraft.persona.identity" :options="departments" label="院系快捷选项" /></div>
        <datalist id="primary-genders"><option>男</option><option>女</option></datalist><datalist id="secondary-genders"><option>Alpha</option><option>Beta</option><option>Omega</option><option>其他</option></datalist>
        <label class="file-wide">外貌<input v-model="w.newGameDraft.persona.appearance" maxlength="500" /></label>
        <label>性格<textarea v-model="w.newGameDraft.persona.personality" rows="2" maxlength="1500" /></label>
        <label class="file-wide">背景<textarea v-model="w.newGameDraft.persona.background" rows="3" maxlength="3000" /></label>
        <label v-if="w.newGameDraft.persona.rawText" class="file-wide">原文人设<textarea v-model="w.newGameDraft.persona.rawText" rows="8" maxlength="60000" /></label>
        <label>同人文配对偏好<select v-model="w.newGameDraft.persona.pairingPreference"><option value="">按明确人设判断／暂未指定</option><option value="BL-攻">BL · user 为攻</option><option value="BL-受">BL · user 为受</option><option value="BG">BG</option><option value="GB">GB</option></select></label>
        <label class="file-wide">其他<textarea v-model="notes" rows="3" maxlength="2700" placeholder="其他想补充的设定、关系或偏好，可留空" /></label>
        <label class="file-wide">自定义开局（可留空）<textarea v-model="w.newGameDraft.opening" rows="3" maxlength="6000" placeholder="留空使用服务器原有迎新文案。" /></label>
      </fieldset>
      <p v-if="!w.newGameDraft.persona.name.trim()" class="hint">姓名填好后才能开始；也可以使用下方的 AI 帮我写。</p>
    </form>
    <details class="subsection persona-assistant" :open="w.workingPersona||!!w.personaNotice">
      <summary>AI 帮我写人设 <span>展开 / 收起</span></summary><p class="muted">用几句话描述你想玩的人设，AI 会结合世界观补全上面的空白栏位。已填写内容会保留，生成后可以继续修改。</p>
      <form @submit.prevent="w.assistPersona()">
        <label>我想玩的人设<textarea v-model="w.newGameDraft.wish" rows="4" maxlength="3000" :disabled="w.workingPersona||w.creatingGame" placeholder="例如：我想扮演一位刚入学的新生，性格慢热，精神体想用一只小型猫科动物，其他细节请结合世界观帮我完善。" /></label>
        <div class="actions"><button :disabled="!w.newGameDraft.wish.trim()||w.loading||w.workingPersona||w.creatingGame" type="submit">{{w.workingPersona?'AI 正在填写…':'AI 帮我写'}}</button><button v-if="w.workingPersona" type="button" @click="w.stopPersona()">取消生成</button><button v-else type="button" @click="w.panel='settings'">模型设置</button></div>
        <p v-if="w.personaNotice" class="hint" role="status">{{w.personaNotice}}</p>
        <small class="muted">使用“AI 帮我写人设”下拉列表选中的接口，会产生一次模型请求；填写后不会自动开始游戏。切换到设置不会丢失当前草稿。</small>
      </form>
    </details>
    </div>
    <footer class="student-file-actions"><button class="primary" form="new-persona-form" :disabled="w.loading||!w.authorized||!w.newGameDraft.persona.name.trim()||!w.newGameDraft.title.trim()||w.workingPersona||w.creatingGame" type="submit"><span>{{w.creatingGame?'正在创建…':'ENTER THE STORY · 开始游戏'}}</span><span aria-hidden="true">→</span></button><small>资料会随新建旅程保存 · 其他角色由 AI 根据剧情登场</small></footer>
  </section>
</template>
