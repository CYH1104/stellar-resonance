<script setup lang="ts">
import {computed,onBeforeUnmount,reactive,ref,watch} from 'vue';
import type {ViewModel} from '../app/useWorkspace';
import {parseCloudSave,type CloudSave} from '../domain/cloudBackup';
import {accountStorage} from '../storage/accountScope';
import {readCloudToken,writeCloudToken} from '../storage/cloudTokens';
import type {CloudTransportError} from '../domain/cloudTransport.mjs';
import {requestCloudBackup,type BackupTransport} from '../gateway/cloudBackup';
import DialogShell from './DialogShell.vue';
const props=defineProps<{w:ViewModel}>();
type Provider='github'|'gitee';
type Repo={provider:Provider;owner:string;repository:string;url:string;branch:string;created:boolean};
type File={name:string;sha:string;size:number};
function savedRepository(provider:Provider){try{return accountStorage.getItem('cloud-repository:'+provider)||'stellar-academy-backups';}catch{return 'stellar-academy-backups';}}
const configs=reactive({github:{repository:savedRepository('github'),token:readCloudToken('github')},gitee:{repository:savedRepository('gitee'),token:readCloudToken('gitee')}});
const provider=ref<Provider>('gitee'),connection=ref<Repo>(),files=ref<File[]>([]),selected=ref(''),working=ref(false),message=ref(''),error=ref('');
const helpOpen=ref(false);
const transport=ref<BackupTransport>('direct');
const preview=ref<{cloud:CloudSave;text:string;file:string}>(),uploadConfirm=ref(false),undoConfirm=ref(false);
const config=computed(()=>configs[provider.value]);

const taskBlocked=computed(()=>!!(props.w.backupWorking||props.w.loading||props.w.busy||props.w.terminalBusy||props.w.workingMemory||props.w.workingPersona||props.w.creatingGame||props.w.workingForumReply||props.w.configuringApis));
let controller:AbortController|undefined,disposed=false;
const errors:Record<string,string>={CLOUD_INVALID_FILE_METADATA:'平台返回的文件信息不完整，已停止上传，避免误用更新接口。',CLOUD_REQUEST_REJECTED:'平台拒绝了请求参数（400），不一定是令牌权限问题。',CLOUD_VALIDATION_FAILED:'平台校验未通过（422）：可能是仓库初始化、分支、文件参数或平台文件限制。请保留此提示以便定位。',CLOUD_RATE_LIMITED:'平台请求过于频繁（429），请稍后重试。',CLOUD_FILE_TOO_LARGE:'备份超过平台允许的文件大小，请使用本地备份。',CLOUD_INVALID_CONFIGURATION:'请填写正确的仓库名称和访问令牌。',CLOUD_TOKEN_INVALID:'令牌无效或已过期，请重新填写。',CLOUD_PERMISSION_DENIED:'令牌权限不足、访问受限或调用次数达到限制。请检查仓库读写权限。',CLOUD_PRIVATE_REPOSITORY_REQUIRED:'同名仓库不是私有仓库。请更换仓库名，或先在平台将仓库设为私有。',CLOUD_REPOSITORY_NOT_FOUND:'仓库不存在，请先连接仓库。',CLOUD_CONNECTION_FAILED:'无法连接备份平台，请检查网络后重试。',CLOUD_CONFLICT:'仓库已被其他设备更新，请刷新列表后重试。',CLOUD_UPSTREAM_FAILED:'平台未能完成请求，请检查令牌权限、仓库限制后重试。',CLOUD_BACKUP_NOT_FOUND:'备份不存在或超过大小限制，请刷新列表。',CLOUD_INVALID_BACKUP:'存档格式不兼容，原数据未被覆盖。',LOCAL_SESSION_REQUIRED:'本地服务会话已过期，请刷新页面后重试。'};
async function api(action:string,extra:object={}){
 controller=new AbortController();const signal=controller.signal;
 try{const data=await requestCloudBackup({provider:provider.value,repository:config.value.repository.trim(),token:config.value.token.trim(),action,...extra},transport.value,signal);if(disposed)throw Error('页面已关闭。');return data;}
 catch(e){const detail=e as CloudTransportError;const text=detail.code==='CLOUD_CONNECTION_FAILED'?'浏览器直连请求失败；可选择“服务器中转”后重新上传。':detail.code==='CLOUD_REQUEST_TIMEOUT'?'备份传输超时，本地数据保留；上传是否已提交需刷新列表确认。':detail.code==='CLOUD_RELAY_UNREACHABLE'?'无法连接本站备份传输服务，请稍后重试。':detail.code==='CLOUD_RELAY_SESSION_REQUIRED'?'本站登录会话已失效，请保留当前页面并重新登录。':detail.code==='CLOUD_RELAY_TOO_LARGE'?'备份超过本站中转请求大小，请使用浏览器直连或下载完整备份。':detail.code==='CLOUD_RELAY_FAILED'?'本站未能完成备份传输，请保留本地备份后重试。':errors[detail.code||'']||detail.message||'备份操作失败。';throw Error(text+'（步骤：'+({connect:'连接仓库',list:'读取列表',upload:'上传备份',download:'拉取备份'}[action]||action)+(detail.cloudStep?' / '+detail.cloudStep:'')+(detail.upstreamStatus?'；平台状态：'+detail.upstreamStatus:'')+'）'+(detail.cloudDetail?' 平台原因：'+detail.cloudDetail:''));}
}
async function run(action:()=>Promise<void>){if(working.value)return;working.value=true;error.value=message.value='';try{await action();}catch(e){if(!disposed)error.value=e instanceof Error?e.message:'操作失败，本地存档已保留。';}finally{working.value=false;controller=undefined;}}
async function refresh(){const r=await api('list');files.value=r.files;selected.value=files.value.some(f=>f.name===selected.value)?selected.value:files.value[0]?.name||'';}
function connect(){void run(async()=>{connection.value=undefined;files.value=[];const r=await api('connect');connection.value=r;try{accountStorage.setItem('cloud-repository:'+provider.value,config.value.repository.trim());}catch{}await refresh();message.value=r.created?'私有备份仓库已创建并连接。':'已连接已有私有仓库。';});}
function prepareUpload(){if(!connection.value||taskBlocked.value)return;uploadConfirm.value=true;}
async function upload(){uploadConfirm.value=false;void run(async()=>{if(!connection.value||taskBlocked.value)throw Error('请先连接仓库并等待当前任务结束。');const text=await props.w.createCloudWorkspaceBackup();await api('upload',{file:'stellar-workspace-backup.json',text});await refresh();message.value='完整备份已上传，包含人设档案和终端记录。本地图片、运行日志和密钥未上传。';});}
function download(){void run(async()=>{if(!selected.value)throw Error('请先选择仓库备份。');const r=await api('download',{file:selected.value});preview.value={cloud:parseCloudSave(r.text),text:r.text,file:selected.value};});}
async function restore(){const p=preview.value;if(!p)return;void run(async()=>{if(taskBlocked.value)throw Error('请先等待或停止当前任务，再恢复备份。');await props.w.restoreCloudSave(p.text);preview.value=undefined;message.value='全部存档、人设档案和终端记录已恢复，覆盖前的完整副本已保留。';});}
function undo(){undoConfirm.value=false;void run(async()=>{if(taskBlocked.value)throw Error('请先等待任务结束。');await props.w.undoCloudRestore();message.value='已恢复上次覆盖前的本地存档。';});}
watch(()=>[provider.value,config.value.repository,config.value.token],()=>{connection.value=undefined;files.value=[];selected.value='';preview.value=undefined;error.value=message.value='';});
const tokenWatchStops=(['github','gitee'] as const).map(name=>watch(()=>configs[name].token,token=>{try{writeCloudToken(name,token);}catch{error.value='令牌未能保存到本机，请检查浏览器存储权限。';}},{flush:'sync'}));
onBeforeUnmount(()=>{for(const stop of tokenWatchStops)stop();disposed=true;controller?.abort();configs.github.token=configs.gitee.token='';});
</script>
<template>
<section class="cloud-backup-view">
 <header class="panel-heading"><div><p class="eyebrow">CLOUD BACKUP</p><h1>云端备份 <button class="backup-help" aria-label="查看备份说明" @click="helpOpen=true">?</button></h1></div></header>
 <p v-if="w.restoreInterrupted" role="alert" class="cloud-error">上次恢复中断，请使用下方“恢复上次覆盖前的全部数据”，或重新拉取完整备份。</p><p class="backup-count">当前共有 {{w.sessions.length}} 个存档</p>
 <div class="backup-controls">
 <div class="actions" aria-label="备份操作"><button :disabled="working||taskBlocked" @click="run(async()=>{await w.saveCurrentCloudBackup();message='全部数据备份文件已下载。';})">下载所有数据</button><button :disabled="working||taskBlocked||!connection" @click="prepareUpload">上传备份</button><button :disabled="working||taskBlocked||!connection||!selected" @click="download">拉取备份</button></div>
 <div class="actions provider-switch" aria-label="备份平台"><button :disabled="working" :aria-pressed="provider==='gitee'" @click="provider='gitee'">国内 · Gitee</button><button :disabled="working" :aria-pressed="provider==='github'" @click="provider='github'">GitHub</button></div>
 </div>
 <label>备份传输方式<select v-model="transport" :disabled="working"><option value="direct">浏览器直连（默认）</option><option value="server">服务器中转（直连失败时使用）</option></select></label>
 <p v-if="transport==='server'" class="token-help" role="status">本次备份内容和仓库令牌会临时经过本站服务器，再发送到所选平台；不会保存令牌或自动改用其他平台。此选择仅在当前页面有效。</p>
 <Transition name="cloud-switch" mode="out-in"><div :key="provider" :data-provider="provider" class="provider-content">
 <label>仓库名称<input v-model="config.repository" :disabled="working" maxlength="100" autocomplete="off"></label>
 <label>访问令牌<input v-model="config.token" :disabled="working" type="password" autocomplete="off" placeholder="填写你自己账号的访问令牌"></label>
 <small class="token-help">令牌自动保存在本机，清空输入框即可删除。</small>
 <p v-if="provider==='gitee'" class="token-help">Gitee 令牌需要 user_info 和 projects 权限。<a href="https://gitee.com/profile/personal_access_tokens" target="_blank" rel="noopener noreferrer">获取 Gitee 令牌</a></p>
 <ol v-else class="token-help github-token-guide">
 <li>打开 <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">github.com/settings/tokens</a>，选择 Tokens (classic)。</li>
 <li>右上角 Generate new token (classic)。</li>
 <li>Note 填 stellar-academy-backups，Expiration 选最后一个。</li>
 <li>勾选最上面那个 repo 大复选框。</li>
 <li>拉到底部 → Generate token。</li>
 <li>复制并保存那串 ghp_ 开头的字符串，然后填到访问令牌处。</li>
 <li>点击连接并准备仓库即可。</li>
 </ol>
 <button :disabled="working||!config.token.trim()||!config.repository.trim()" @click="connect">连接并准备仓库</button>
 <p v-if="connection" role="status">已连接：<a :href="connection.url" target="_blank" rel="noopener noreferrer">{{connection.owner}}/{{connection.repository}}</a></p>
 <hr><label>仓库中的备份<select v-model="selected" :disabled="working||!files.length"><option v-if="!files.length" value="">暂无备份，请先连接仓库或上传</option><option v-for="f in files" :key="f.name" :value="f.name">{{f.name}} · {{Math.ceil(f.size/1024)}} KB</option></select></label>
 <button :disabled="working||!connection" @click="run(refresh)">刷新备份列表</button>
 </div></Transition>
 <hr><h2>本地恢复</h2>
 <button :disabled="working||taskBlocked" @click="undoConfirm=true">恢复上次覆盖前的全部数据</button>
 <p v-if="working" role="status">正在处理，请稍候…</p><p v-if="message" role="status">{{message}}</p><p v-if="error" role="alert" class="cloud-error">{{error}}</p>
 <DialogShell v-if="helpOpen" title="备份说明" @close="helpOpen=false">
 <p>下载所有数据：下载全部存档、人设档案、备注、草稿、主人设选择、终端记录与设置的 JSON 文件。旧备份仍可导入。</p>
 <p>上传备份：以当前本地数据覆盖仓库中的固定备份文件，保留其他文件。拉取备份：读取仓库数据，确认后覆盖本地；覆盖前自动保留恢复副本。</p>
 <p>备份包含剧情、独立人设档案、主人设、备注与草稿、记忆、变量、终端记录、预设、世界书及界面设置。运行日志和模型原始输出不备份。云端不上传本地图片、立绘或 API 配置与密钥；图片只保留 URL。</p>
 <p>浏览器直接连接平台，令牌与备份不经过本站服务器。令牌自动保存在当前设备、当前账号的浏览器中，重新打开时自动读取；清空访问令牌输入框即可删除，不写入备份或提示词。连接时创建私有仓库，已有同名私有仓库则复用。</p>
 <p>上传大小按所选平台及账号的实际限制执行，不再设置应用自身的 20 MB 上限。GitHub 文件接口支持单文件最多 100 MB；Gitee 以平台对当前账号和接口返回的限制为准。</p>
 <ol v-if="provider==='github'" class="token-help github-token-guide">
 <li>打开 <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">github.com/settings/tokens</a>，选择 Tokens (classic)。</li>
 <li>右上角 Generate new token (classic)。</li>
 <li>Note 填 stellar-academy-backups，Expiration 选最后一个。</li>
 <li>勾选最上面那个 repo 大复选框。</li>
 <li>拉到底部 → Generate token。</li>
 <li>复制并保存那串 ghp_ 开头的字符串，然后填到访问令牌处。</li>
 <li>点击连接并准备仓库即可。</li>
 </ol>
 <p v-else>Gitee 令牌需要 user_info 和 projects 权限。<a href="https://gitee.com/profile/personal_access_tokens" target="_blank" rel="noopener noreferrer">获取 Gitee 令牌</a></p>
 </DialogShell>
 <DialogShell v-if="uploadConfirm" title="上传全部数据" @close="uploadConfirm=false"><p>将当前 {{w.sessions.length}} 个存档、全部人设档案、备注与草稿、预设、世界书和设置上传到私有仓库，更新同名备份。本地图片和 API 配置、密钥不上传。</p><div class="actions"><button @click="uploadConfirm=false">取消</button><button @click="upload">确认上传</button></div></DialogShell>
 <DialogShell v-if="preview" title="拉取全部数据" @close="!working&&(preview=undefined)"><p>文件：{{preview.file}}</p><p>备份时间：{{new Date(preview.cloud.savedAt).toLocaleString()}} · {{preview.cloud.snapshot.sessions.length}} 个存档</p><p v-if="preview.cloud.snapshot.archive?.personas!==undefined">包含 {{preview.cloud.snapshot.archive.personas.length}} 份独立人设档案，以及备份中的主人设、备注和草稿。</p><p v-else>此旧备份没有独立人设库，本机已有的人设档案和草稿将保留。</p><p>确认后将以仓库备份覆盖当前全部存档、人设档案、预设、世界书和设置，覆盖前自动保存本地恢复副本。当前 API 配置、密钥和本地图片保留。</p><div class="actions"><button :disabled="working" @click="preview=undefined">取消</button><button :disabled="working||taskBlocked" @click="restore">确认覆盖全部数据</button></div></DialogShell>
 <DialogShell v-if="undoConfirm" title="恢复本地副本" @close="undoConfirm=false"><p>恢复上次覆盖前的全部存档、人设档案与设置，当前状态也会保留为新的恢复副本。</p><div class="actions"><button @click="undoConfirm=false">取消</button><button @click="undo">确认恢复</button></div></DialogShell>
</section>
</template>
<style scoped>
.github-token-guide{padding-left:22px;margin:10px 0 14px}.github-token-guide li{margin:5px 0;line-height:1.6}
.cloud-backup-view{width:100%;max-width:none;min-height:100%;margin:0;padding:16px 20px;box-sizing:border-box;overflow-wrap:anywhere}
#academy-workspace .cloud-backup-view{border:0!important;border-radius:0!important;box-shadow:none!important;background:transparent!important}
.cloud-backup-view label{display:block;margin:14px 0}.cloud-backup-view input,.cloud-backup-view select{display:block;width:100%;max-width:100%;box-sizing:border-box;margin-top:6px;padding:8px 10px}
.cloud-backup-view .actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.cloud-backup-view .provider-switch{margin:16px 0 10px;gap:8px}
#academy-workspace .cloud-backup-view button{white-space:normal;cursor:pointer;transition:background-color .18s,color .18s,border-color .18s}
#academy-workspace .cloud-backup-view .actions button{padding:4px 12px!important;min-height:30px;line-height:1.5;border:1px solid var(--color-border,#cfc9be)!important;border-radius:5px!important;background:var(--color-surface,#fffbf4)!important}
#academy-workspace .cloud-backup-view .provider-switch button[aria-pressed=true]{background:#eee6d9!important;color:#62513e;border-color:#ac9c85!important}
#academy-workspace .cloud-backup-view button:disabled{opacity:.45;cursor:default}#academy-workspace .cloud-backup-view button:focus-visible{outline:2px solid #ac9c85;outline-offset:2px}
.cloud-backup-view a{color:#4e738b}.cloud-error{color:#a34646}hr{margin:18px 0;opacity:.3}.provider-content{min-width:0}
.cloud-switch-enter-active,.cloud-switch-leave-active{transition:opacity .14s ease,transform .14s ease}.cloud-switch-enter-from{opacity:0;transform:translateY(5px)}.cloud-switch-leave-to{opacity:0;transform:translateY(-3px)}
@media(max-width:480px){.cloud-backup-view{padding:12px}.cloud-backup-view .actions{gap:6px}}
@media(prefers-reduced-motion:reduce){.cloud-switch-enter-active,.cloud-switch-leave-active,#academy-workspace .cloud-backup-view button{transition:none}}
#academy-workspace .cloud-backup-view .backup-controls{display:flex;flex-direction:column;gap:14px;margin:12px 0 16px}
#academy-workspace .cloud-backup-view .backup-controls .actions{margin:0!important;row-gap:10px}
#academy-workspace .cloud-backup-view .backup-help{display:inline-grid;place-items:center;width:20px;height:20px;min-height:0;padding:0!important;margin-left:6px;vertical-align:middle;border:1px solid #b9aa95!important;border-radius:50%!important;background:transparent!important;color:#78664f;font:13px/1 system-ui}
#academy-workspace .cloud-backup-view .actions button{background:#faf6ee!important;border-color:#c9bcaa!important;color:#77634e}
.backup-count{margin:10px 0}.token-help{margin:8px 0 14px;font-size:13px;line-height:1.6}
</style>
