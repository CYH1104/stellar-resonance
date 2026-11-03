(()=>{
  const $=id=>document.getElementById(id);let registering=false,busy=false;
  const destination=new URLSearchParams(location.search).get('returnTo'),returnTo=['/editor/','/editor/accounts'].includes(destination)?destination:'/';
  if(returnTo.startsWith('/editor/')){document.querySelector('h1').textContent='作者管理登录';$('registerTab').hidden=true;}
  function mode(value){if(busy)return;registering=value;$('loginTab').setAttribute('aria-selected',String(!value));$('registerTab').setAttribute('aria-selected',String(value));for(const id of ['nameLabel','inviteLabel','registrationHint'])$(id).hidden=!value;$('displayName').required=value;$('inviteCode').required=value;$('userPassword').autocomplete=value?'new-password':'current-password';$('submitButton').textContent=value?'注册账号':'登录';$('notice').textContent='';}
  $('loginTab').onclick=()=>mode(false);$('registerTab').onclick=()=>mode(true);
  const errors={NATIVE_REGISTRATION_INVALID:'账号需为 3～64 位小写英文字母、数字或连字符，请同时填写昵称。',NATIVE_PASSWORD_INVALID:'密码需为 8～128 位。',NATIVE_INVITE_INVALID:'邀请码无效或已经使用，请向管理员确认。',NATIVE_ACCOUNT_EXISTS:'该账号已存在，请换一个账号或直接登录。',NATIVE_LOGOUT_FIRST:'请先退出当前账号，再注册新账号。',NATIVE_REGISTER_RATE_LIMIT:'注册尝试过于频繁，请稍后重试。'};
  $('accountForm').onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;$('submitButton').disabled=true;$('notice').textContent=registering?'正在注册…':'正在登录…';
    try{
      const csrfResponse=await fetch('/csrf-token',{credentials:'same-origin',cache:'no-store'});if(!csrfResponse.ok)throw Error('会话尚未准备好，请刷新重试。');const csrf=await csrfResponse.json();
      const body={handle:$('userHandle').value.trim().toLowerCase(),password:$('userPassword').value,...(registering?{name:$('displayName').value.trim(),inviteCode:$('inviteCode').value.trim()}:{})};
      const response=await fetch('/api/users/'+(registering?'register':'login'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf.token},body:JSON.stringify(body)});let value;try{value=await response.json();}catch{}
      if(!response.ok)throw Error(errors[value?.error]||(response.status===403?'账号或密码不正确。':response.status===429?'操作过于频繁，请稍后重试。':'账号操作未完成（'+response.status+'），请重试。'));
      if(registering){busy=false;mode(false);$('registered').hidden=false;$('registered').textContent='注册成功，请使用刚注册的账号登录。';$('inviteCode').value='';$('userPassword').value='';$('userPassword').focus();}
      else{try{const channel=new BroadcastChannel('academy-native-account');channel.postMessage({type:'changed'});channel.close();}catch{}location.replace(returnTo);}
    }catch(error){$('notice').textContent=error.message;}finally{busy=false;$('submitButton').disabled=false;}
  };
  for(const id of ['loginTab','registerTab','submitButton'])$(id).disabled=false;
  document.documentElement.dataset.academyLoginReady='true';
})();
