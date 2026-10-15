(() => {
  const root=document.getElementById('__exp_splash__');if(!root)return;
  const q=s=>root.querySelector(s);
  let linkedImageUrl='';
  window.addEventListener('academy:persona-image',event=>{if(linkedImageUrl)URL.revokeObjectURL(linkedImageUrl);const image=q('#portraitImg');if(event.detail?.image instanceof Blob){linkedImageUrl=URL.createObjectURL(event.detail.image);image.src=linkedImageUrl;image.hidden=false;q('#portraitUpload').textContent='更换主页图片';}else{let original='';try{original=JSON.parse(localStorage.getItem('interstellarPRO:academy:portrait'))||'';}catch{}image.src=original;image.hidden=!original;}});
  q('#portraitFile').addEventListener('change',event=>{if(event.target.files?.length)try{localStorage.removeItem('academy:master-image-file');}catch{}});
  const orbit=document.createElement('span');orbit.className='academy-orbit';orbit.setAttribute('aria-hidden','true');q('.spl-top').append(orbit);
  const caption=q('.portrait-caption');
  function showMaster(detail={}){caption.querySelector('span').textContent='01 / USER';caption.querySelector('h2').textContent=typeof detail.name==='string'?detail.name:'';const fields=[typeof detail.department==='string'?detail.department:'',typeof detail.spiritLevel==='string'&&detail.spiritLevel?'精神力 '+detail.spiritLevel:''].filter(Boolean);caption.querySelector('span:last-child').textContent=fields.join(' · ');}
  window.addEventListener('academy:master-persona',event=>showMaster(event.detail));
  window.addEventListener('storage',event=>{if(event.key==='academy:master-persona:v1'){try{showMaster(JSON.parse(event.newValue)||{});}catch{showMaster();}}});
  try{showMaster(JSON.parse(localStorage.getItem('academy:master-persona:v1'))||{});}catch{showMaster();}
  const feature=q('.ah-feature');
  feature.dataset.action='conversation';
  feature.querySelector('small').textContent='STORY LINK / 进入对话';
  feature.querySelector('p').textContent='继续上一次的故事，或开启新的会话。';
  const account=q('#accountButton');account.hidden=true;
  const clock=document.createElement('div');clock.className='academy-clock';clock.innerHTML='<time aria-label="当前时间，24小时制"></time><span class="academy-date"></span><small>LOCAL TIME / 本地时间</small>';account.before(clock);
  function tick(){const now=new Date();clock.querySelector('time').dateTime=now.toISOString();clock.querySelector('time').textContent=new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZone:'Asia/Shanghai'}).format(now);clock.querySelector('.academy-date').textContent=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Shanghai'}).format(now).replaceAll('/','.');}tick();setInterval(tick,1000);
  const nav=q('.ah-tools');nav.replaceChildren();
  const items=[['chars','人物公开介绍'],['personas','人设档案'],['chat','进入对话'],['rev','编辑随机事件'],['memory','剧情记忆'],['saves','存档与导出'],['portrait','调整立绘大小'],['hub','全部功能']];
  items.forEach(([action,label],index)=>{const button=document.createElement('button');button.className='ah-tool';button.dataset.module=action;button.innerHTML=`<i>${String(index+1).padStart(2,'0')}</i><span>${label}</span>`;if(action==='hub')button.onclick=()=>window.ACADEMY.openHub();if(action==='chars'||action==='rev')button.onclick=()=>{root.querySelector('.spl-menu [data-sact="'+action+'"]').click();};nav.append(button);});
  root.querySelectorAll('button').forEach(button=>{if(button.textContent.includes('草稿'))button.textContent='插入剧情输入框';});
  const top=q('.spl-top-r'),close=q('.spl-x');
  const settings=document.createElement('button');settings.id='academySettings';settings.textContent='设置';settings.title='API 与模型设置';top.insertBefore(settings,close);
  for(const id of ['apiSetupBtn','presetImportBtn']){const button=q('#'+id);button.classList.add('top-setting-link');button.textContent=id==='apiSetupBtn'?'API':'预设';top.insertBefore(button,close);}
  const quick=q('.ah-quick');quick?.remove();
  const logotype=q('.ah-logotype');logotype.innerHTML='<span>星穹联合军事学院</span><small>INTERSTELLAR ACADEMY</small>';
  feature.querySelector('small').textContent='STORY LINK';feature.querySelector('h2').textContent='进入对话';feature.querySelector('h2').after(feature.querySelector('small'));
  q('.ah-office').innerHTML='全部功能<small>ALL MODULES ↗</small>';
  const entryLabels=[['学院星图','STAR MAP'],['填写人设','YOUR FILE'],['进入剧情','STORY LINK'],['学院编年史','CHRONICLE']];
  q('.ah-entries').querySelectorAll('button').forEach((button,index)=>{if(entryLabels[index]){button.querySelector('span').textContent=entryLabels[index][0];button.querySelector('small').textContent=entryLabels[index][1]+' →';}});
  const explore=document.getElementById('enterRegistration');explore.textContent='探索学院 / EXPLORE';
  const gateEntries=document.createElement('div');gateEntries.className='gate-entry-links';
  for(const [entry,label] of [['new','直接开始对话 / START A CONVERSATION'],['continue','继续之前的存档 / CONTINUE']]){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{window.ACADEMY.directEnter();window.dispatchEvent(new CustomEvent('academy:open',{detail:{entry}}));};gateEntries.append(button);}explore.after(gateEntries);
  document.querySelectorAll('.gate-tools .palette,#gateTheme').forEach(el=>el.hidden=true);
  q('.spl-theme')?.setAttribute('hidden','');
  const hub=q('.academy-hub'),grid=hub.querySelector('.hub-grid');grid.replaceChildren();
  hub.querySelector(':scope>p').textContent='学院资料与已经接通的剧情功能';
  q('.chr-head p').textContent='星穹联合军事学院编年史 · 影像可自行导入并保存在本机，按原始比例展示。';
  const modules=[['chat','STORY LINK','进入对话','继续最近的对话，或创建新的旅程'],['stu','PERSONA','人物档案','填写人物资料与 AI 辅助人设'],['chars','CHARACTERS','角色档案','查看学院角色与公开介绍'],['map','STAR MAP','学院星图','浏览地图与地点资料'],['memory','MEMORY','剧情记忆','事件、手记、摘要与检索'],['theaters','THEATERS','小剧场设置','论坛、群聊和独立番外'],['saves','ARCHIVES','存档与导出','继续、导入和导出游戏存档'],['settings','SETTINGS','\u6a21\u578b\u8bbe\u7f6e','API'],['presets','PRESETS','\u9884\u8bbe\u7ba1\u7406','\u5bfc\u5165\u4e0e\u7f16\u8f91\u9884\u8bbe'],['chronicle','CHRONICLE','学院编年史','浏览历史与导入自己的影像']];
  modules.forEach(([action,en,label,description],index)=>{const button=document.createElement('button');button.dataset.module=action;const no=document.createElement('small');no.textContent=String(index+1).padStart(2,'0');const title=document.createElement('span');title.textContent=en;const name=document.createElement('b');name.textContent=label;const note=document.createElement('p');note.textContent=description;button.append(no,title,name,note);if(action==='chars'||action==='map')button.onclick=()=>{hub.hidden=true;root.querySelector('.spl-menu [data-sact="'+action+'"]').click();};if(action==='chronicle')button.onclick=()=>{hub.hidden=true;q('#chronicleEntry').click();};grid.append(button);});
  const randomButton=document.createElement('button');randomButton.dataset.module='rev';randomButton.innerHTML='<small>11</small><span>RANDOM EVENTS</span><b>编辑随机事件</b><p>编辑事件库、触发概率与开关</p>';randomButton.onclick=()=>{hub.hidden=true;root.querySelector('.spl-menu [data-sact="rev"]').click();};grid.append(randomButton);
  const personaButton=grid.querySelector('[data-module=stu]');personaButton.dataset.module='personas';personaButton.querySelector('b').textContent='人设档案';

  // Store chronicle images separately from game saves; no image is sent to AI.
  const mediaDB=new Promise((resolve,reject)=>{const request=indexedDB.open('academy-media',1);request.onupgradeneeded=()=>request.result.createObjectStore('chronicle');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});mediaDB.catch(()=>{});
  async function mediaGet(key){const db=await mediaDB;return new Promise((resolve,reject)=>{const r=db.transaction('chronicle').objectStore('chronicle').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function mediaSave(key,file){const db=await mediaDB;return new Promise((resolve,reject)=>{const t=db.transaction('chronicle','readwrite');const store=t.objectStore('chronicle');if(file)store.put(file,key);else store.delete(key);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}
  q('.chr-timeline').querySelectorAll('.chr-item').forEach((item,index)=>{
    const box=item.querySelector('.chr-img');box.replaceChildren();
    const image=document.createElement('img');image.alt=item.querySelector('.chr-card b').textContent+' · 自选影像';image.hidden=true;
    const tools=document.createElement('div');tools.className='chronicle-image-tools';
    const upload=document.createElement('button');upload.textContent='＋ 导入影像（≤5MB）';upload.type='button';
    const remove=document.createElement('button');remove.textContent='移除';remove.type='button';remove.hidden=true;
    const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp,image/gif';input.hidden=true;
    const status=document.createElement('span');status.setAttribute('role','status');tools.append(upload,remove,input,status);box.append(image,tools);
    let url='';function show(file){if(url)URL.revokeObjectURL(url);if(file){url=URL.createObjectURL(file);image.src=url;image.hidden=false;remove.hidden=false;}else{image.removeAttribute('src');image.hidden=true;remove.hidden=true;}}
    upload.onclick=()=>input.click();remove.onclick=async()=>{try{await mediaSave(index,null);show(null);status.textContent='';}catch{status.textContent='保存失败，请重试。';}};
    input.onchange=async()=>{const file=input.files[0];if(!file)return;try{if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)||file.size>5*1024*1024)throw Error('请选择 5MB 以内的 PNG、JPEG、WebP 或 GIF。');const bitmap=await createImageBitmap(file);bitmap.close();await mediaSave(index,file);show(file);status.textContent='已保存在本机';}catch(error){status.textContent=error.message||'影像未保存，请重试。';}finally{input.value='';}};
    mediaGet(index).then(file=>{if(file)show(file);}).catch(()=>{status.textContent='本机影像存储暂不可用';});
  });

})();
