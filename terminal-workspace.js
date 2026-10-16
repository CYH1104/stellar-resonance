/* Mount the shared functional workspace directly inside the original academy. */
(() => {
  const root=document.getElementById('__exp_splash__');
  if(!root)return;
  const mount=document.createElement('div');mount.id='academy-workspace';mount.hidden=true;root.append(mount);
  let ready=false,pending=null;
  function transitionPage(element){if(!element||matchMedia('(prefers-reduced-motion: reduce)').matches)return;element.getAnimations().filter(a=>a.id==='academy-page').forEach(a=>a.cancel());const animation=element.animate([{opacity:.15,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}],{duration:340,easing:'cubic-bezier(.22,1,.36,1)'});animation.id='academy-page';}
  window.addEventListener('academy:page-transition',()=>transitionPage(mount.querySelector('.center-content')));
  new MutationObserver(records=>{for(const {target} of records)if(target.matches('#academy-workspace,.academy-hub,.academy-home,.academy-brightness-controls')&&!target.hidden&&target.getClientRects().length)transitionPage(target);}).observe(root,{subtree:true,attributes:true,attributeFilter:['hidden']});
  function open(detail){const wasHidden=mount.hidden;const hub=root.querySelector('.academy-hub');if(hub)hub.hidden=true;mount.hidden=false;pending=detail;if(ready){window.dispatchEvent(new CustomEvent('academy:navigate',{detail}));pending=null;if(detail.accepted===false){mount.hidden=wasHidden;window.PRO?.toast?.('\u8bf7\u5148\u505c\u6b62\u5f53\u524d\u751f\u6210\uff0c\u518d\u6253\u5f00\u65b0\u9875\u9762');return;}}}
  window.addEventListener('academy:ready',()=>{ready=true;if(pending)open(pending);});
  window.addEventListener('academy:home',()=>{mount.hidden=true;window.ACADEMY?.home();});
  window.addEventListener('academy:open',event=>open(event.detail));
  window.addEventListener('academy:encounter-new',event=>{const detail=event.detail;if(!detail)return;const access={ok:false};window.dispatchEvent(new CustomEvent('academy:campus-access',{detail:access}));if(!access.ok&&access.reason&&!access.reason.includes('建立')){showHint(access.reason);return;}open(detail);if(detail.accepted!==false)window.ACADEMY?.home();});
  const ids={chatEntry:{entry:'conversation'},apiSetupBtn:{panel:'settings'},presetImportBtn:{panel:'presets'},academySettings:{panel:'game-settings'},accountButton:{entry:'personas'}};
  const modules={new:{entry:'new'},continue:{entry:'continue'},chat:{entry:'conversation'},personas:{entry:'personas'},memory:{panel:'memory'},stu:{entry:'new'},full:{panel:'saves'},export:{panel:'saves'},settings:{panel:'settings'},presets:{panel:'presets'},theaters:{panel:'forum'},relations:{panel:'relations'},saves:{panel:'saves'}};
  const hint=document.createElement('div');hint.className='academy-campus-hint';hint.setAttribute('role','status');hint.hidden=true;root.append(hint);let hintTimer;
  function showHint(text){hint.textContent=text;hint.hidden=false;clearTimeout(hintTimer);hintTimer=setTimeout(()=>hint.hidden=true,4000);}
  window.academyDraft=(text,options={})=>{const detail={text,replace:options.replace,show:!options.stay,ok:false,reason:''};window.dispatchEvent(new CustomEvent('academy:insert',{detail}));if(!detail.ok){showHint(detail.reason||'请建立一个会话才可进入校园');return false;}if(detail.show){window.ACADEMY.home();mount.hidden=false;}return true;};
  window.academyShowConversation=()=>window.academyDraft('',{show:true});
  let openingMap=false,mapOrigin={workspace:false,hub:false};
  function openMap(){mapOrigin={workspace:!mount.hidden,hub:!root.querySelector('.academy-hub').hidden};mount.hidden=true;window.ACADEMY.home();window.academyMapPreview=true;openingMap=true;try{root.querySelector('.spl-menu [data-sact="map"]').click();}finally{openingMap=false;}}
  window.addEventListener('academy:map',openMap);
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target.closest('button'):null;
    if(!target||mount.contains(target))return;
    if(target.dataset.sact==='map-back'){event.preventDefault();event.stopImmediatePropagation();window.ACADEMY.home();if(mapOrigin.workspace)mount.hidden=false;else if(mapOrigin.hub)window.ACADEMY.openHub();return;}
    if(!openingMap&&(target.dataset.sact==='map'||target.dataset.module==='map')){
      event.preventDefault();event.stopImmediatePropagation();openMap();return;
    }
    const detail=(target.matches('.ah-feature,.spl-x')?{entry:'conversation'}:null)||ids[target.id]||modules[target.dataset.module]||modules[target.dataset.sact];
    if(!detail)return;
    event.preventDefault();event.stopImmediatePropagation();
    open(detail);
  },true);
})();
