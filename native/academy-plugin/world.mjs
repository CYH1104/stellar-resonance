import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {nativeMessagesSession} from '../../src/native/academyMessages.ts';

// This public resource is a chat container, never the private author's card.
export const academyWorldAvatar='stellar-academy-world-v1.png';
const worldName='星穹学院';
const fail=(code,status=409)=>Object.assign(Error(code),{code,status});
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const copy=value=>structuredClone(value);

function publicWorld(card){
  const data=card?.data;
  return card?.avatar===academyWorldAvatar&&data?.extensions?.stellar_academy?.worldReference===1
    &&card.name===worldName&&data.name===worldName
    &&['description','personality','scenario','mes_example','first_mes','system_prompt','post_history_instructions','creator_notes'].every(key=>!card[key]&&!data[key])
    &&!data.character_book&&!data.extensions.world&&!data.extensions.depth_prompt?.prompt;
}

/** All character/chat/settings/file writes below use the unchanged native routers. */
export async function ensureAcademyWorld(call){
  let card;
  try{card=await call('characters','/get',{avatar_url:academyWorldAvatar});}
  catch(error){if(error.status!==404)throw error;}
  if(!card){
    const avatar=await call('characters','/create',{
      ch_name:worldName,file_name:academyWorldAvatar.slice(0,-4),description:'',first_mes:'',
      extensions:JSON.stringify({stellar_academy:{worldReference:1}}),
    });
    if(avatar!==academyWorldAvatar)throw fail('NATIVE_WORLD_CREATE_FAILED',502);
    card=await call('characters','/get',{avatar_url:academyWorldAvatar});
  }
  if(!publicWorld(card))throw fail('NATIVE_WORLD_RESOURCE_CONFLICT');
  return {avatar:academyWorldAvatar};
}

function references(scope){
  if(scope?.version!==1||!Number.isSafeInteger(scope.revision)||scope.revision<0||!Array.isArray(scope.chats))throw fail('NATIVE_WORLD_INDEX_INVALID');
  const ids=new Set(),paths=new Set();
  for(const ref of scope.chats){
    if(!ref||Object.keys(ref).some(key=>!['id','avatar','file'].includes(key))||typeof ref.id!=='string'||!ref.id||ids.has(ref.id)
      ||typeof ref.avatar!=='string'||!ref.avatar.endsWith('.png')||/[\\/\x00]/.test(ref.avatar)
      ||typeof ref.file!=='string'||!ref.file||/[\\/\x00]/.test(ref.file))throw fail('NATIVE_WORLD_INDEX_INVALID');
    const path=JSON.stringify([ref.avatar,ref.file]);if(paths.has(path))throw fail('NATIVE_WORLD_INDEX_INVALID');
    ids.add(ref.id);paths.add(path);
  }
  return copy(scope.chats);
}

/** Copy first, verify original JSONL rows, and only then switch the native index.
 * Original chats/cards remain intact, including after any failed/interrupted migration.
 */
export async function migrateAcademyWorld(call,body,readRecovery,signal){
  signal?.throwIfAborted();
  const catalog=await call('settings','/get',{}),document=JSON.parse(catalog.settings),scope=document.extension_settings?.stellar_academy;
  if(typeof body?.expected!=='string'||body.expected!==JSON.stringify(scope))throw fail('NATIVE_DATA_CONFLICT');
  const checkRestore=()=>{
    const held=scope.restoreLock?.expires>Date.now();
    if(held&&scope.restoreLock.owner!==body.restoreOwner||scope.restorePending&&(!held||scope.restoreLock.owner!==body.restoreOwner))throw fail('NATIVE_WORLD_RESTORE_BUSY');
  };
  checkRestore();
  const before=references(scope);
  if(!Array.isArray(body.chats)||body.chats.length!==before.length)throw fail('NATIVE_WORLD_BASELINE_INVALID',400);
  const hashes=new Map();
  for(const row of body.chats){if(!row||typeof row.id!=='string'||hashes.has(row.id)||typeof row.hash!=='string'||!/^[a-f0-9]{64}$/.test(row.hash))throw fail('NATIVE_WORLD_BASELINE_INVALID',400);hashes.set(row.id,row.hash);}
  const sources=[];
  const load=async ref=>{
    const rows=await call('chats','/get',{avatar_url:ref.avatar,file_name:ref.file});
    let session;try{session=nativeMessagesSession(rows);}catch{throw fail('NATIVE_WORLD_CHAT_INVALID');}
    if(session.id!==ref.id||fingerprint(rows)!==hashes.get(ref.id))throw fail('NATIVE_DATA_CONFLICT');
    return rows;
  };
  for(const reference of before)sources.push({reference,rows:await load(reference)});
  const world=await ensureAcademyWorld(call);
  signal?.throwIfAborted();
  if(before.every(ref=>ref.avatar===world.avatar))return {migrated:false,chats:before,revision:scope.revision};

  // An account-private native file keeps the entire previous settings and raw rows.
  // Resources/presets/worlds are not changed, and old source files are not deleted.
  const recovery={version:1,kind:'academy-world-reference',createdAt:new Date().toISOString(),settings:document,sources};
  const recoveryName='academy-world-recovery-'+randomUUID()+'.json';
  const uploaded=await call('files','/upload',{name:recoveryName,data:Buffer.from(JSON.stringify(recovery)).toString('base64')});
  const recoveryPath='user/files/'+recoveryName;
  if(uploaded?.path!==recoveryPath&&uploaded?.path!=='/'+recoveryPath)throw fail('NATIVE_WORLD_RECOVERY_FAILED',502);
  if(typeof readRecovery!=='function'||await readRecovery(recoveryName)!==JSON.stringify(recovery))throw fail('NATIVE_WORLD_RECOVERY_FAILED',502);

  const next=[];
  for(const {reference,rows}of sources){
    signal?.throwIfAborted();
    if(reference.avatar===world.avatar){next.push(reference);continue;}
    const target={id:reference.id,avatar:world.avatar,file:'academy-'+randomUUID()};
    const existing=await call('chats','/get',{avatar_url:target.avatar,file_name:target.file});
    if(!Array.isArray(existing)||existing.length)throw fail('NATIVE_WORLD_TARGET_CONFLICT');
    const saved=await call('chats','/save',{avatar_url:target.avatar,file_name:target.file,ch_name:worldName,chat:rows});
    if(saved?.ok!==true)throw fail('NATIVE_WORLD_COPY_FAILED',502);
    const checked=await call('chats','/get',{avatar_url:target.avatar,file_name:target.file});
    if(!equal(checked,rows))throw fail('NATIVE_WORLD_COPY_FAILED',502);
    next.push(target);
  }
  // Re-read sources and settings before committing. A stale client never switches the index.
  for(const {reference}of sources)await load(reference);
  const latest=await call('settings','/get',{});
  if(!equal(JSON.parse(latest.settings),document))throw fail('NATIVE_DATA_CONFLICT');
  signal?.throwIfAborted();
  checkRestore();
  const nextDocument=copy(document),nextScope=nextDocument.extension_settings.stellar_academy;
  nextScope.chats=next;nextScope.revision++;
  nextScope.recovery={...nextScope.recovery,'native-world-migration':recoveryPath};
  const saved=await call('settings','/save',nextDocument);
  if(saved?.result!=='ok')throw fail('NATIVE_WORLD_INDEX_SAVE_FAILED',502);
  const checked=await call('settings','/get',{});
  if(!equal(JSON.parse(checked.settings),nextDocument))throw fail('NATIVE_DATA_CONFLICT');
  return {migrated:true,chats:next,recovery:recoveryPath,revision:nextScope.revision};
}

export function nativeWorldRoutes(router,route,serial,invoke){
  const transport=request=>async(family,path,body)=>{
    const {router:native}=await import('../SillyTavern/src/endpoints/'+family+'.js');
    return invoke(native,path,request,body);
  };
  router.post('/world/ensure',route((owner,body,request)=>serial(owner,()=>ensureAcademyWorld(transport(request)))));
  router.post('/world/migrate',route((owner,body,request,response)=>{
    const controller=new AbortController();response.once('close',()=>controller.abort());
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(120000)]);
    return serial(owner,()=>migrateAcademyWorld(transport(request),body,name=>readFile(resolve(request.user.directories.files,name),'utf8'),signal));
  }));
}
