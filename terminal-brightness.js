(() => {
  const root=document.getElementById('__exp_splash__'),nav=root?.querySelector('.ah-tools');
  if(!root||!nav)return;
  const button=document.createElement('button');button.className='ah-tool';button.dataset.module='brightness';button.innerHTML='<i>09</i><span>调整亮度</span>';button.setAttribute('aria-expanded','false');
  const panel=document.createElement('div');panel.className='academy-brightness-controls';panel.hidden=true;panel.innerHTML='<label>页面亮度<input type="range" min="0" max="100" step="1" aria-label="页面亮度"><output>100%</output></label><small>背景渐暗，文字柔和提亮</small><button type="button" class="brightness-save">保存亮度</button>';
  nav.append(button);root.append(panel);
  function show(anchor=button){const opening=panel.hidden;panel.hidden=!opening;button.setAttribute('aria-expanded',String(opening));if(opening){const r=anchor.getBoundingClientRect();panel.style.left=Math.max(12,Math.min(innerWidth-300,r.left))+'px';panel.style.top=Math.max(12,Math.min(innerHeight-170,r.bottom+8))+'px';}}
  button.onclick=()=>show();
  const hubButton=document.createElement('button');hubButton.dataset.module='brightness';hubButton.innerHTML='<small>14</small><span>BRIGHTNESS</span><b>调整亮度</b><p>背景渐暗，文字柔和提亮</p>';hubButton.onclick=()=>show(hubButton);root.querySelector('.hub-grid').append(hubButton);
  document.addEventListener('click',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!e.target.closest('[data-module="brightness"]')){panel.hidden=true;button.setAttribute('aria-expanded','false');}},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){panel.hidden=true;button.setAttribute('aria-expanded','false');}});
  const slider=panel.querySelector('input'),output=panel.querySelector('output');
  const mix=(a,b,t)=>'#'+[0,2,4].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
  function apply(value){const t=(100-value)/100,colors={bg:mix('f7f1e8','20232a',t),panel:mix('fffaf3','282b32',t),soft:mix('ede9e2','30343c',t),text:mix('20242a','c9cbd1',t),muted:mix('797e85','a3aab5',t),line:mix('d4d1ca','484e58',t),acc:mix('7895b9','9aafc8',t)};
    if(t>0){const level=parseInt(colors.bg.slice(1,3),16)*.2126+parseInt(colors.bg.slice(3,5),16)*.7152+parseInt(colors.bg.slice(5,7),16)*.0722;colors.text=level<128?mix('d8dde5','c9cbd1',t):'#20242a';colors.muted=level<128?'#afb8c5':mix('797e85','454d58',t);}
    for(const [key,color] of Object.entries(colors)){root.style.setProperty('--s-'+key,color,'important');if(key!=='panel')document.body.style.setProperty('--a-'+key,color,'important');}
    for(const host of [root.querySelector('#academy-workspace'),document.documentElement].filter(Boolean)){for(const [key,color] of Object.entries({'background':colors.bg,'surface':colors.panel,'surface-soft':colors.soft,'text':colors.text,'muted':colors.muted,'border':colors.line,'accent':colors.acc}))host.style.setProperty('--color-'+key,color);host.style.backgroundColor=colors.bg;host.style.color=colors.text;}
    root.style.setProperty('--s-panel2',colors.soft,'important');document.body.dataset.brightness=String(value);
    root.style.setProperty('--reading-image-brightness',String(1-t*.2));root.dataset.brightness=String(value);output.textContent=value+'%';
  }
  let initial=100;try{const saved=localStorage.getItem('academy:brightness');if(saved!==null&&Number.isFinite(Number(saved)))initial=Math.max(0,Math.min(100,Number(saved)));}catch{}
  slider.value=String(initial);if(initial!==100)apply(initial);
  panel.querySelector('.brightness-save').onclick=()=>{apply(Number(slider.value));try{localStorage.setItem('academy:brightness',slider.value);}catch{}panel.hidden=true;button.setAttribute('aria-expanded','false');};
  slider.oninput=()=>{const value=Number(slider.value);apply(value);try{localStorage.setItem('academy:brightness',String(value));}catch{}};
  window.addEventListener('academy-theme',()=>apply(Number(slider.value)));
})();
