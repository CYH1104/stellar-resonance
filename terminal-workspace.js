/* Mount the shared functional workspace directly inside the original academy. */
(() => {
  const root=document.getElementById('__exp_splash__');
  if(!root)return;
  const mount=document.createElement('div');mount.id='academy-workspace';mount.hidden=true;root.append(mount);
  let ready=false,pending=null;
  function open(detail){mount.hidden=false;pending=detail;if(ready){window.dispatchEvent(new CustomEvent('academy:navigate',{detail}));pending=null;}}
  window.addEventListener('academy:ready',()=>{ready=true;if(pending)open(pending);});
  window.addEventListener('academy:home',()=>{mount.hidden=true;window.ACADEMY?.home();});
  window.addEventListener('academy:open',event=>open(event.detail));
  const ids={chatEntry:{entry:'conversation'},apiSetupBtn:{panel:'settings'},presetImportBtn:{panel:'presets'},academySettings:{panel:'game-settings'},accountButton:{entry:'personas'}};
  const modules={chat:{entry:'conversation'},personas:{entry:'personas'},memory:{panel:'memory'},stu:{entry:'new'},full:{panel:'saves'},export:{panel:'saves'},settings:{panel:'settings'},presets:{panel:'presets'},theaters:{panel:'forum'},relations:{panel:'relations'},saves:{panel:'saves'}};
  const hint=document.createElement('div');hint.className='academy-campus-hint';hint.setAttribute('role','status');hint.hidden=true;root.append(hint);let hintTimer;
  function showHint(text){hint.textContent=text;hint.hidden=false;clearTimeout(hintTimer);hintTimer=setTimeout(()=>hint.hidden=true,4000);}
  window.academyDraft=(text,options={})=>{const detail={text,replace:options.replace,show:!options.stay,ok:false,reason:''};window.dispatchEvent(new CustomEvent('academy:insert',{detail}));if(!detail.ok){showHint(detail.reason||'请建立一个会话才可进入校园');return false;}if(detail.show){window.ACADEMY.home();mount.hidden=false;}return true;};
  window.academyShowConversation=()=>window.academyDraft('',{show:true});
  let openingMap=false;
  function openMap(){mount.hidden=true;window.ACADEMY.home();window.academyMapPreview=true;openingMap=true;try{root.querySelector('.spl-menu [data-sact="map"]').click();}finally{openingMap=false;}}
  window.addEventListener('academy:map',openMap);
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target.closest('button'):null;
    if(!target||mount.contains(target))return;
    if(!openingMap&&(target.dataset.sact==='map'||target.dataset.module==='map')){
      event.preventDefault();event.stopImmediatePropagation();openMap();return;
    }
    const detail=(target.matches('.ah-feature,.spl-x')?{entry:'conversation'}:null)||ids[target.id]||modules[target.dataset.module]||modules[target.dataset.sact];
    if(!detail)return;
    event.preventDefault();event.stopImmediatePropagation();
    open(detail);
  },true);
})();
