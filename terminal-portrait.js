(() => {
  const root=document.getElementById('__exp_splash__'),home=root?.querySelector('.academy-home');if(!home)return;
  const image=root.querySelector('#portraitImg');
  const layer=document.createElement('div');layer.className='portrait-backdrop';layer.setAttribute('aria-label','首页底图');
  const frame=document.createElement('div');frame.className='portrait-frame';frame.tabIndex=0;frame.setAttribute('aria-label','拖动底图移动；拖动四角缩放');
  image.draggable=false;frame.append(image);layer.append(frame);home.append(layer);
  for(const corner of ['nw','ne','sw','se']){const handle=document.createElement('button');handle.type='button';handle.className='portrait-corner '+corner;handle.dataset.corner=corner;handle.setAttribute('aria-label','缩放底图 '+corner);frame.append(handle);}
  const bar=document.createElement('div');bar.className='portrait-editor-bar';bar.hidden=true;
  bar.innerHTML='<span>拖动图片移动 · 拖动四角等比缩放</span><button type="button" data-edit="import">更换底图</button><button type="button" data-edit="reset">重置</button><button type="button" data-edit="cancel">取消</button><button type="button" data-edit="save">保存位置</button><small role="status"></small>';
  home.append(bar);const status=bar.querySelector('small');
  const cardControls=document.createElement('div');cardControls.className='card-appearance-controls';
  cardControls.innerHTML='<label>卡片底色透明度 <input type="range" data-card-control="alpha" min="0" max="100" value="100" aria-label="卡片底色不透明度"><output data-card-value="alpha">100%</output></label><label>卡片倾斜度 <input type="range" data-card-control="tilt" min="-25" max="25" value="-14" aria-label="卡片倾斜度"><output data-card-value="tilt">-14°</output></label>';
  bar.querySelector('span').after(cardControls);
  let cards={alpha:100,tilt:-14},originalCards={...cards},hadCardSettings=false;
  try{const stored=JSON.parse(localStorage.getItem('academy:card-appearance'));if(stored&&Number.isFinite(stored.alpha)&&Number.isFinite(stored.tilt)){cards={alpha:Math.max(0,Math.min(100,stored.alpha)),tilt:Math.max(-25,Math.min(25,stored.tilt))};hadCardSettings=true;}}catch{}
  function renderCards(custom=true){home.toggleAttribute('data-card-custom',custom);home.style.setProperty('--card-alpha',String(cards.alpha/100));home.style.setProperty('--card-tilt',cards.tilt+'deg');for(const key of ['alpha','tilt']){cardControls.querySelector('[data-card-control='+key+']').value=String(cards[key]);cardControls.querySelector('[data-card-value='+key+']').textContent=cards[key]+(key==='alpha'?'%':'°');}}
  renderCards(hadCardSettings);
  cardControls.addEventListener('input',event=>{const key=event.target.dataset.cardControl;if(key==='alpha'||key==='tilt'){cards[key]=Number(event.target.value);renderCards();}});
  const defaults={version:1,x:.1,y:0,width:.65};let layout={...defaults},original,editing=false,gesture;
  try{const saved=JSON.parse(localStorage.getItem('academy:portrait-layout'));if(saved?.version===1&&['x','y','width'].every(k=>Number.isFinite(saved[k]))&&saved.width>=.08&&saved.width<=3)layout=saved;}catch{}
  function render(){frame.style.left=layout.x*100+'%';frame.style.top=layout.y*100+'%';frame.style.width=layout.width*100+'%';}
  function stopEdit(){editing=false;gesture=null;home.classList.remove('portrait-editing');bar.hidden=true;}
  function beginEdit(){window.dispatchEvent(new Event('academy:home'));root.querySelector('.academy-hub').hidden=true;original={...layout};originalCards={...cards};hadCardSettings=home.hasAttribute('data-card-custom');editing=true;home.classList.add('portrait-editing');bar.hidden=false;status.textContent=image.hidden?'可调整右侧卡片；导入底图后也可拖动位置。':'';frame.focus();}
  bar.addEventListener('click',event=>{const action=event.target.closest('[data-edit]')?.dataset.edit;if(action==='import')root.querySelector('#portraitFile').click();if(action==='reset'){layout={...defaults};cards={alpha:100,tilt:-14};renderCards(false);render();}if(action==='cancel'){layout={...original};cards={...originalCards};renderCards(hadCardSettings);render();stopEdit();}if(action==='save'){try{localStorage.setItem('academy:portrait-layout',JSON.stringify(layout));localStorage.setItem('academy:card-appearance',JSON.stringify(cards));stopEdit();}catch{status.textContent='设置保存失败，请重试。';}}});
  image.addEventListener('load',()=>{render();status.textContent='';});
  frame.addEventListener('pointerdown',event=>{if(!editing||image.hidden||event.button!==0)return;event.preventDefault();const r=home.getBoundingClientRect(),box=frame.getBoundingClientRect();gesture={id:event.pointerId,startX:event.clientX,startY:event.clientY,x:box.left-r.left,y:box.top-r.top,width:box.width,height:box.height,screenW:r.width,screenH:r.height,corner:event.target.closest('[data-corner]')?.dataset.corner};frame.setPointerCapture(event.pointerId);});
  frame.addEventListener('pointermove',event=>{if(!gesture||event.pointerId!==gesture.id)return;const g=gesture,dx=event.clientX-g.startX,dy=event.clientY-g.startY;let x=g.x,y=g.y,width=g.width;
    if(g.corner){const sx=g.corner.includes('e')?1:-1,sy=g.corner.includes('s')?1:-1,ratio=g.width/g.height;const delta=(sx*dx+sy*dy/ratio)/(1+1/(ratio*ratio));width=Math.max(g.screenW*.08,Math.min(g.screenW*3,g.width+delta));if(sx<0)x+=g.width-width;if(sy<0)y+=(g.width-width)/ratio;}
    else{x+=dx;y+=dy;}
    layout={version:1,x:Math.max(-width+24,Math.min(g.screenW-24,x))/g.screenW,y:Math.max(-(width*g.height/g.width)+24,Math.min(g.screenH-24,y))/g.screenH,width:width/g.screenW};render();
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])frame.addEventListener(name,()=>{gesture=null;});
  document.addEventListener('keydown',event=>{if(!editing)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();layout={...original};cards={...originalCards};renderCards(hadCardSettings);render();stopEdit();}else if(event.target===frame&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const amount=event.shiftKey?.02:.005;layout.x+=event.key==='ArrowLeft'?-amount:event.key==='ArrowRight'?amount:0;layout.y+=event.key==='ArrowUp'?-amount:event.key==='ArrowDown'?amount:0;render();}},true);
  const button=document.createElement('button');button.dataset.module='portrait';button.innerHTML='<small>10</small><span>ILLUSTRATION</span><b>调整立绘大小</b><p>拖动底图移动，拖动四角等比缩放</p>';button.onclick=beginEdit;root.querySelector('.hub-grid').append(button);
  root.querySelector('.ah-tools [data-module=portrait]').onclick=beginEdit;
  render();
})();
