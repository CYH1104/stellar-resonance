(() => {
  const root=document.getElementById('__exp_splash__');if(!root)return;
  const q=s=>root.querySelector(s);
  let linkedImageUrl='';
  window.addEventListener('academy:persona-image',event=>{if(linkedImageUrl)URL.revokeObjectURL(linkedImageUrl);const image=q('#portraitImg');if(event.detail?.image instanceof Blob){linkedImageUrl=URL.createObjectURL(event.detail.image);image.src=linkedImageUrl;image.hidden=false;q('#portraitUpload').textContent='更换主页图片';}else{let original='';try{original=JSON.parse(localStorage.getItem('interstellarPRO:academy:portrait'))||'';}catch{}image.src=original;image.hidden=!original;}});
  q('#portraitFile').addEventListener('change',event=>{if(event.target.files?.length)try{localStorage.removeItem('academy:master-image-file');}catch{}});
  const orbit=document.createElement('span');orbit.className='academy-orbit';orbit.setAttribute('aria-hidden','true');orbit.classList.add('clock-orbit');
  const caption=q('.portrait-caption');
  function showMaster(detail={}){caption.querySelector('span').textContent='01 / USER';caption.querySelector('h2').textContent=typeof detail.name==='string'?detail.name:'';const fields=[typeof detail.department==='string'?detail.department:'',typeof detail.spiritLevel==='string'&&detail.spiritLevel?'精神力 '+detail.spiritLevel:''].filter(Boolean);caption.querySelector('span:last-child').textContent=fields.join(' · ');}
  window.addEventListener('academy:master-persona',event=>showMaster(event.detail));
  window.addEventListener('storage',event=>{if(event.key==='academy:master-persona:v1'){try{showMaster(JSON.parse(event.newValue)||{});}catch{showMaster();}}});
  try{showMaster(JSON.parse(localStorage.getItem('academy:master-persona:v1'))||{});}catch{showMaster();}
  q('[data-sact=map-back]').textContent='\u2190 \u8fd4\u56de\u4e0a\u4e00\u9875';
  const feature=q('.ah-feature');
  feature.dataset.action='conversation';
  feature.querySelector('small').textContent='STORY LINK / 进入对话';
  feature.querySelector('p').textContent='进入当前正在进行的对话，没有会话时先建立会话。';
  const account=q('#accountButton');account.hidden=true;
  const clock=document.createElement('div');clock.className='academy-clock';clock.innerHTML='<time aria-label="当前时间，24小时制"></time><span class="academy-date"></span><small>LOCAL TIME / 本地时间</small>';account.before(clock);clock.append(orbit);
  function tick(){const now=new Date();clock.querySelector('time').dateTime=now.toISOString();clock.querySelector('time').textContent=new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZone:'Asia/Shanghai'}).format(now);clock.querySelector('.academy-date').textContent=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Shanghai'}).format(now).replaceAll('/','.');}tick();setInterval(tick,1000);
  const nav=q('.ah-tools');nav.replaceChildren();
  window.addEventListener('focus',()=>void refreshMapAssets());
  let refreshingMap=false;async function refreshMapAssets(){if(refreshingMap)return;refreshingMap=true;try{const r=await fetch('/api/map-assets',{cache:'no-store'});if(r.ok){const data=await r.json();root.__mapApi?.setAssets(data.map);}}catch{}finally{refreshingMap=false;}}
  document.addEventListener('click',event=>{if(event.target.closest('[data-sact=map],[data-module=map]'))void refreshMapAssets();},true);
  setInterval(()=>{if(!document.hidden&&root.classList.contains('spl-map'))void refreshMapAssets();},2000);
  const mapStage=q('.mp .stage');
  if(mapStage){let zoomFrame=0;function refreshMap(){root.__mapApi?.refreshLayout?.();}function followZoom(){cancelAnimationFrame(zoomFrame);if(matchMedia('(prefers-reduced-motion: reduce)').matches){refreshMap();return;}const start=performance.now();function tick(now){if(!root.classList.contains('spl-map'))return;refreshMap();if(now-start<460)zoomFrame=requestAnimationFrame(tick);}zoomFrame=requestAnimationFrame(tick);}const zoom=document.createElement('button');zoom.type='button';zoom.className='map-zoom';zoom.textContent='+';zoom.title='放大地图';zoom.setAttribute('aria-label','放大地图');zoom.setAttribute('aria-pressed','false');zoom.onclick=event=>{event.stopPropagation();const expanded=mapStage.classList.toggle('map-expanded');zoom.textContent=expanded?'−':'+';zoom.title=expanded?'缩小地图':'放大地图';zoom.setAttribute('aria-label',zoom.title);zoom.setAttribute('aria-pressed',String(expanded));followZoom();};mapStage.addEventListener('transitionend',event=>{if(event.target===mapStage)refreshMap();});mapStage.append(zoom);}
  const items=[['chars','人物公开介绍'],['personas','user 人设档案'],['rev','编辑随机事件'],['memory','剧情记忆'],['saves','存档与导出'],['portrait','调整立绘大小']];
  items.forEach(([action,label],index)=>{const button=document.createElement('button');button.className='ah-tool';button.dataset.module=action;button.innerHTML=`<i>${String(index+1).padStart(2,'0')}</i><span>${label}</span>`;if(action==='hub')button.onclick=()=>window.ACADEMY.openHub();if(action==='chars'||action==='rev')button.onclick=()=>{root.querySelector('.spl-menu [data-sact="'+action+'"]').click();};nav.append(button);});
  root.querySelectorAll('button').forEach(button=>{if(button.textContent.includes('草稿'))button.textContent='插入剧情输入框';});
  const top=q('.spl-top-r'),close=q('.spl-x');close.textContent='\u8fd4\u56de';close.setAttribute('aria-label','\u8fd4\u56de');
  const settings=document.createElement('button');settings.id='academySettings';settings.textContent='设置';settings.title='API 与模型设置';top.insertBefore(settings,close);
  for(const id of ['apiSetupBtn','presetImportBtn']){const button=q('#'+id);button.classList.add('top-setting-link');button.textContent=id==='apiSetupBtn'?'API':'预设';top.insertBefore(button,close);}
  const quick=q('.ah-quick');quick?.remove();
  const logotype=q('.ah-logotype');logotype.innerHTML='<span>星穹联合军事学院</span><small>INTERSTELLAR ACADEMY</small>';
  feature.querySelector('small').textContent='STORY LINK';feature.querySelector('h2').textContent='进入对话';feature.querySelector('h2').after(feature.querySelector('small'));
  q('.ah-office').innerHTML='全部功能<small>ALL MODULES </small>';
  const entryLabels=[['学院星图','STAR MAP'],['新建存档','NEW JOURNEY'],['进入剧情','STORY LINK'],['学院编年史','CHRONICLE']];
  q('.ah-entries').querySelectorAll('button').forEach((button,index)=>{if(entryLabels[index]){button.querySelector('span').textContent=entryLabels[index][0];button.querySelector('small').textContent=entryLabels[index][1]+' →';}});
  [feature,q('.ah-office'),...q('.ah-entries').querySelectorAll('button')].forEach((button,index)=>{const no=document.createElement('i');no.className='academy-home-number';no.textContent=String(items.length+index+1).padStart(2,'0');no.setAttribute('aria-hidden','true');button.prepend(no);});
  const explore=document.getElementById('enterRegistration');explore.innerHTML='<span>探索学院</span> / <small>EXPLORE</small>';
  const gateEntries=document.createElement('div');gateEntries.className='gate-entry-links';
  for(const [entry,label] of [['conversation','进入当前对话 / CONTINUE CONVERSATION'],['continue','过往存档 / ARCHIVES']]){const button=document.createElement('button');button.type='button';button.innerHTML='<span>'+label.split(' / ')[0]+'</span> / <small>'+label.split(' / ')[1]+'</small>';button.onclick=()=>{window.ACADEMY.directEnter();window.dispatchEvent(new CustomEvent('academy:open',{detail:{entry}}));};gateEntries.append(button);}explore.after(gateEntries);
  document.querySelectorAll('.gate-tools .palette,#gateTheme').forEach(el=>el.hidden=true);
  q('.spl-theme')?.setAttribute('hidden','');
  const hub=q('.academy-hub'),grid=hub.querySelector('.hub-grid');grid.replaceChildren();
  hub.querySelector(':scope>p').textContent='学院资料与已经接通的剧情功能';
  q('.chr-head p').textContent='星穹联合军事学院编年史';
  const modules=[['chat','STORY LINK','进入对话','继续最近的对话，或创建新的旅程'],['stu','PERSONA','人物档案','填写人物资料与 AI 辅助人设'],['chars','CHARACTERS','角色档案','查看学院角色与公开介绍'],['map','STAR MAP','学院星图','浏览地图与地点资料'],['relations','RELATIONS','人物关系','点击人物圆点展开资料'],['new','NEW JOURNEY','新建存档','选择人设，建立新的剧情存档'],['continue','ARCHIVES','过往存档','继续或重命名已有存档'],['memory','MEMORY','剧情记忆','事件、手记、摘要与检索'],['theaters','THEATERS','小剧场设置','论坛、群聊和独立番外'],['saves','ARCHIVES','存档与导出','继续、导入和导出游戏存档'],['settings','SETTINGS','\u6a21\u578b\u8bbe\u7f6e','API'],['presets','PRESETS','\u9884\u8bbe\u7ba1\u7406','\u5bfc\u5165\u4e0e\u7f16\u8f91\u9884\u8bbe'],['worldbooks','WORLDBOOK','世界书','导入、编辑并绑定剧情世界书'],['chronicle','CHRONICLE','学院编年史','浏览历史与导入自己的影像']];
  modules.forEach(([action,en,label,description],index)=>{const button=document.createElement('button');button.dataset.module=action;const no=document.createElement('small');no.textContent=String(index+1).padStart(2,'0');const title=document.createElement('span');title.textContent=en;const name=document.createElement('b');name.textContent=label;const note=document.createElement('p');note.textContent=description;button.append(no,title,name,note);if(action==='chars'||action==='map')button.onclick=()=>{hub.hidden=true;root.querySelector('.spl-menu [data-sact="'+action+'"]').click();};if(action==='chronicle')button.onclick=()=>{hub.hidden=true;q('#chronicleEntry').click();};grid.append(button);});
  const randomButton=document.createElement('button');randomButton.dataset.module='rev';randomButton.innerHTML='<small>11</small><span>RANDOM EVENTS</span><b>编辑随机事件</b><p>编辑事件库、触发概率与开关</p>';randomButton.onclick=()=>{hub.hidden=true;root.querySelector('.spl-menu [data-sact="rev"]').click();};grid.append(randomButton);
  q('.spl-revpage').querySelectorAll('button').forEach(button=>{if(button.textContent.includes('\u751f\u6210\u4e8b\u4ef6'))button.remove();});
  const personaButton=grid.querySelector('[data-module=stu]');personaButton.dataset.module='personas';personaButton.querySelector('b').textContent='user 人设档案';

  q('.chr-timeline').querySelectorAll('.chr-img').forEach(box=>{box.replaceChildren();box.classList.add('chronicle-placeholder');});


  const editCards=document.createElement('button');editCards.textContent='\u7f16\u8f91\u89d2\u8272';editCards.onclick=()=>window.open('/editor/','_blank','noopener');q('.academy-card-tools').append(editCards);
  let cardRevision=window.__ACADEMY_CARD_REVISION__,refreshingCards=false;
  async function refreshCards(){if(refreshingCards||document.hidden)return;refreshingCards=true;try{const response=await fetch('/api/character-cards',{cache:'no-store'});if(!response.ok)return;const data=await response.json();if(data.revision!==cardRevision&&Array.isArray(data.characters)&&root.__updateCharacterCards){root.__updateCharacterCards(data.characters);cardRevision=data.revision;}}catch{}finally{refreshingCards=false;}}
  document.addEventListener('click',event=>{if(event.target.closest('[data-sact="chars"],[data-module="chars"]'))void refreshCards();},true);
  window.addEventListener('focus',()=>void refreshCards());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshCards();});
  setInterval(()=>{if(root.classList.contains('spl-chars'))void refreshCards();},1500);
  sessionStorage.removeItem('academy:reopen-characters');

})();
