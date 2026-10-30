import {cleanBackupPersona} from '../domain/backupArchive';
import {blankPersona} from '../domain/persona';
import {personaLibraryStamp,type PersonaFile} from '../storage/personaLibrary';
import {uploadNativeBlob} from './api';
import {NativeSettings} from './settings';

interface Media {path:string;type:string;hash:string}
interface RecordFile {version:1;file:Omit<PersonaFile,'portrait'|'avatar'>;nativeAvatar?:string;description?:string;media:Partial<Record<'portrait'|'avatar',Media>>}
const clone=<T>(value:T):T=>structuredClone(value);
const signature=(document:Record<string,any>)=>JSON.stringify([document.power_user?.personas||{},document.power_user?.persona_descriptions||{}]);
async function digest(bytes:BufferSource){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
async function stableId(avatar:string){return 'native-persona-'+(await digest(new TextEncoder().encode(avatar))).slice(0,32);}
function textFile(file:PersonaFile,draft=false){const {avatar,portrait,...text}=file;return cleanBackupPersona(text,draft) as Omit<PersonaFile,'avatar'|'portrait'>;}
function description(file:PersonaFile){return file.persona.rawText||Object.entries(file.persona).filter(([,v])=>v).map(([k,v])=>`${k}: ${v}`).join('\n');}
function record(value:unknown,draft=false):RecordFile{
  const raw=value as RecordFile;
  if(!raw||raw.version!==1||Object.keys(raw).some(k=>!['version','file','nativeAvatar','description','media'].includes(k))||!raw.media||typeof raw.media!=='object'||Array.isArray(raw.media)||raw.nativeAvatar!==undefined&&(typeof raw.nativeAvatar!=='string'||!raw.nativeAvatar||/[\\/]/.test(raw.nativeAvatar))||raw.description!==undefined&&typeof raw.description!=='string')throw Error('原生人物档案扩展无法识别，原资料未覆盖。');
  for(const [key,media]of Object.entries(raw.media))if(!['avatar','portrait'].includes(key)||!media||Object.keys(media).some(k=>!['path','type','hash'].includes(k))||typeof media.path!=='string'||!/^\/?user\/files\/[^/]+$/.test(media.path)||typeof media.type!=='string'||!/^image\//.test(media.type)||!/^[a-f0-9]{64}$/.test(media.hash))throw Error('原生人物图片关联无法识别。');
  if(!raw.file||'avatar' in raw.file||'portrait' in raw.file)throw Error('原生人物图片不能直接写入普通设置。');
  return {...clone(raw),file:textFile(raw.file,draft)};
}

/** Original native Personas plus academy-only form fields in extension metadata. */
export class NativePersonaLibrary {
  private tail:Promise<unknown>=Promise.resolve();
  private failedMedia=new Map<string,Set<'avatar'|'portrait'>>();
  constructor(private settings:NativeSettings){}
  private queue<T>(action:()=>Promise<T>){const task=this.tail.then(action);this.tail=task;return task;}
  private async state(){
    await this.settings.ensure();await this.settings.assertCurrent();
    const scope=this.settings.current(),document=await this.settings.nativeDocument();
    const records=(scope.personas||[]).map(v=>record(v));
    if(new Set(records.map(r=>r.file.id)).size!==records.length||new Set(records.map(r=>r.nativeAvatar).filter(Boolean)).size!==records.filter(r=>r.nativeAvatar).length)throw Error('人物档案关联重复，已停止覆盖。');
    const draft=scope.personaDraft?record(scope.personaDraft,true):undefined;
    return {records,draft,document,revision:scope.personaRevision||'',stamp:signature(document)};
  }
  private async hydrate(row:RecordFile,document:Record<string,any>,strict=true):Promise<PersonaFile>{
    const file=clone(row.file) as PersonaFile;
    for(const kind of ['portrait','avatar'] as const){
      const media=row.media[kind];if(!media)continue;
      try{
        const source=await this.settings.api.blob(media.path),bytes=await source.arrayBuffer();
        if(await digest(bytes)!==media.hash)throw Error('人物图片内容已改变，已停止导出或覆盖，请检查原生文件。');
        file[kind]=new Blob([bytes],{type:media.type});this.failedMedia.get(file.id)?.delete(kind);
      }catch(error){const failed=this.failedMedia.get(file.id)||new Set();failed.add(kind);this.failedMedia.set(file.id,failed);if(strict)throw error;}
    }
    const nativeName=row.nativeAvatar&&document.power_user?.personas?.[row.nativeAvatar];
    if(typeof nativeName==='string'){
      file.persona.name=nativeName;
      const nativeDescription=document.power_user?.persona_descriptions?.[row.nativeAvatar!]?.description;
      if(typeof nativeDescription==='string'&&nativeDescription!==row.description)file.persona.rawText=nativeDescription;
    }
    return file;
  }
  private async files(state:Awaited<ReturnType<NativePersonaLibrary['state']>>,strict=true){
    const files:PersonaFile[]=[];
    for(const row of state.records)files.push(await this.hydrate(row,state.document,strict));
    const native=state.document.power_user?.personas||{};
    for(const [avatar,name]of Object.entries(native)){
      if(state.records.some(row=>row.nativeAvatar===avatar))continue;
      if(typeof name!=='string'||!avatar||/[\\/]/.test(avatar))throw Error('原生人设目录无法识别。');
      const id=await stableId(avatar);let image:Blob|undefined;
      try{image=await this.settings.api.blob('/User%20Avatars/'+encodeURIComponent(avatar));this.failedMedia.get(id)?.delete('avatar');}catch(error){const failed=this.failedMedia.get(id)||new Set();failed.add('avatar');this.failedMedia.set(id,failed);if(strict)throw error;}
      files.push({id,name,persona:{...blankPersona(),name,rawText:state.document.power_user?.persona_descriptions?.[avatar]?.description||''},updatedAt:'1970-01-01T00:00:00.000Z',...(image?{avatar:image}:{})});
    }
    return files.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  }
  async readBackupState(){const state=await this.state();return {files:await this.files(state),draft:state.draft?await this.hydrate(state.draft,state.document):undefined,revision:state.revision};}
  async list(){return this.files(await this.state(),false);}
  async readDraft(){const state=await this.state();return state.draft?this.hydrate(state.draft,state.document,false):undefined;}
  private async serialize(file:PersonaFile,previous:RecordFile|undefined,draft=false):Promise<RecordFile>{
    const text=textFile(file,draft),media:RecordFile['media']={};
    if(previous?.file.id===file.id)for(const kind of this.failedMedia.get(file.id)||[])if(!file[kind])throw Error('此档案的原图尚未读到，已停止保存，避免清除原图片；请恢复文件或重新选择图片。');
    for(const kind of ['portrait','avatar']as const){
      const image=file[kind];if(!image)continue;
      if(!(image instanceof Blob)||!/^image\//.test(image.type))throw Error('人设图片格式不正确，原资料保留。');
      const hash=await digest(await image.arrayBuffer()),prior=previous?.media[kind];
      media[kind]=prior?.hash===hash&&prior.type===image.type?clone(prior):{hash,type:image.type,path:await uploadNativeBlob(this.settings.api,image,'academy-persona-'+crypto.randomUUID()+'.image')};
    }
    return {version:1,file:text,media,...(previous?.nativeAvatar?{nativeAvatar:previous.nativeAvatar}:{}),...(previous?.description!==undefined?{description:previous.description}:{})};
  }
  private async avatar(row:RecordFile,file:PersonaFile,old?:RecordFile){
    const changed=!row.nativeAvatar||row.media.avatar?.hash!==old?.media.avatar?.hash;
    if(changed){
      const image=file.avatar||await this.settings.api.blob('/img/user-default.png'),form=new FormData();
      // New filename: a failed settings save must not overwrite an existing avatar.
      const filename='academy-persona-'+crypto.randomUUID()+'.png';
      form.set('avatar',image,filename);form.set('overwrite_name',filename);
      const response=await this.settings.api.form('/api/avatars/upload',form);
      if(typeof response?.path!=='string'||response.path!==filename)throw Error('原生人物头像未确认保存。');
      row.nativeAvatar=filename;
    }
    row.description=description(file);
  }
  private async commit(state:Awaited<ReturnType<NativePersonaLibrary['state']>>,records:RecordFile[],draft:RecordFile|undefined,remove:string[]=[]){
    const revision=crypto.randomUUID();
    const priorAvatars=new Map(state.records.map(row=>[row.file.id,row.nativeAvatar]));
    for(const avatar of Object.keys(state.document.power_user?.personas||{}))priorAvatars.set(await stableId(avatar),avatar);
    await this.settings.update(scope=>{if((scope.personaRevision||'')!==state.revision)throw Error('人设已被其他页面修改，已停止覆盖。');scope.personas=records as unknown as Record<string,unknown>[];scope.personaDraft=draft as unknown as Record<string,unknown>||null;scope.personaRevision=revision;},document=>{
      if(signature(document)!==state.stamp)throw Error('原生人设已被其他操作修改，请重新载入。');
      const power=document.power_user??={},priorDescriptions={...power.persona_descriptions};power.personas={...power.personas};power.persona_descriptions={...power.persona_descriptions};
      for(const avatar of remove){delete power.personas[avatar];delete power.persona_descriptions[avatar];if(power.default_persona===avatar)power.default_persona=null;if(document.user_avatar===avatar)document.user_avatar='default.png';}
      for(const row of records){
        const previous=state.records.find(r=>r.file.id===row.file.id);
        if(JSON.stringify(previous)===JSON.stringify(row))continue;
        if(!row.nativeAvatar)throw Error('人设缺少原生身份关联。');
        const priorAvatar=priorAvatars.get(row.file.id);
        power.personas[row.nativeAvatar]=row.file.persona.name;
        power.persona_descriptions[row.nativeAvatar]={position:0,depth:2,role:0,lorebook:'',connections:[],title:'',...priorDescriptions[priorAvatar||row.nativeAvatar],description:row.description};
      }
    });
    if(typeof window!=='undefined')window.dispatchEvent(new Event('academy:persona-avatar-updated'));
    return revision;
  }
  async save(file:PersonaFile){return this.queue(async()=>{
    const state=await this.state(),existing=state.records.find(r=>r.file.id===file.id);
    // A native-only persona receives its original identity when first edited.
    let previous=existing;
    if(!previous)for(const avatar of Object.keys(state.document.power_user?.personas||{}))if(await stableId(avatar)===file.id)previous={version:1,file:textFile(file),media:{},nativeAvatar:avatar};
    const row=await this.serialize(file,previous);await this.avatar(row,file,previous);
    const records=state.records.filter(r=>r.file.id!==file.id);records.push(row);
    await this.commit(state,records,state.draft,previous?.nativeAvatar&&row.nativeAvatar!==previous.nativeAvatar?[previous.nativeAvatar]:[]);
  });}
  async saveDraft(file:PersonaFile){return this.queue(async()=>{const state=await this.state(),draft=await this.serialize(file,state.draft,true);await this.commit(state,state.records,draft);});}
  async clearDraft(){return this.queue(async()=>{const state=await this.state();if(state.draft)await this.commit(state,state.records,undefined);});}
  async remove(id:string){return this.queue(async()=>{
    const state=await this.state(),row=state.records.find(r=>r.file.id===id);let avatar=row?.nativeAvatar;
    if(!avatar)for(const key of Object.keys(state.document.power_user?.personas||{}))if(await stableId(key)===id)avatar=key;
    await this.commit(state,state.records.filter(r=>r.file.id!==id),state.draft?.file.id===id?undefined:state.draft,avatar?[avatar]:[]);
  });}
  async replace(files:PersonaFile[],draft:PersonaFile|undefined,expected:string,expectedRevision?:string){return this.queue(async()=>{
    const state=await this.state(),before=await this.files(state),beforeDraft=state.draft?await this.hydrate(state.draft,state.document):undefined;
    if(personaLibraryStamp(before,beforeDraft)!==expected||expectedRevision!==undefined&&expectedRevision!==state.revision)throw Error('人设已被其他页面修改，已停止恢复。');
    if(new Set(files.map(f=>f.id)).size!==files.length)throw Error('恢复的人设存在重复标识。');
    if(personaLibraryStamp(files,draft)===expected)return state.revision;
    const rows:RecordFile[]=[];
    for(const file of files){let previous=state.records.find(r=>r.file.id===file.id);if(!previous)for(const avatar of Object.keys(state.document.power_user?.personas||{}))if(await stableId(avatar)===file.id)previous={version:1,file:textFile(file),media:{},nativeAvatar:avatar};const row=await this.serialize(file,previous);await this.avatar(row,file,previous);rows.push(row);}
    const nextDraft=draft?await this.serialize(draft,state.draft,true):undefined;
    const remove=Object.keys(state.document.power_user?.personas||{}).filter(avatar=>!rows.some(r=>r.nativeAvatar===avatar));
    return this.commit(state,rows,nextDraft,remove);
  });}
}
