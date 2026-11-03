import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const safe=value=>JSON.stringify(value).replace(/</g,'\\u003c');
const policy="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: http:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
export function createNativeEditor({root,session,forward}){
  const json=(response,status,value)=>{response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});response.end(JSON.stringify(value));};
  return async(request,response,path)=>{
    response.setHeader('Cache-Control','no-store');response.setHeader('X-Frame-Options','DENY');response.setHeader('Content-Security-Policy',policy);
    const native=session(request,response),me=await native.call('/api/users/me');
    if(!me.ok){if(![302,401,403].includes(me.status))throw Error('Native admin session unavailable');if(request.method==='GET'&&!path.includes('/api/')){response.writeHead(302,{Location:'/login?returnTo=%2Feditor%2F'});response.end();}else json(response,401,{code:'NATIVE_LOGIN_REQUIRED'});return;}
    const account=await me.json();
    if(!account.admin){
      if(request.method==='GET'&&!path.includes('/api/')){response.writeHead(403,{'Content-Type':'text/html; charset=utf-8'});response.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>作者后台</title><p>此入口需要新版管理员账号。</p><a href="/login?returnTo=%2Feditor%2F">切换账号</a> · <a href="/">返回学院</a></html>');}
      else json(response,403,{code:'NATIVE_ADMIN_REQUIRED'});return;
    }
    if(path==='/editor'){response.writeHead(302,{Location:'/editor/'});response.end();return;}
    if(path==='/editor/logout'&&request.method==='POST'){forward(request,response,'/api/users/logout');return;}
    if(path==='/editor/api/editor'){
      if(request.method==='POST'){forward(request,response,'/api/plugins/academy-compat/author/save');return;}
      if(request.method!=='GET'){json(response,405,{code:'GET_OR_POST_REQUIRED'});return;}
      const csrf=await(await native.call('/csrf-token')).json();
      const result=await native.call('/api/plugins/academy-compat/author/read',{method:'POST',body:{},csrf:csrf.token});
      const value=await result.json();json(response,result.status,result.ok?{...value,token:csrf.token}:value);return;
    }
    const files={
      '/editor/':['server/editor-ui/editor.html','text/html'],
      '/editor/editor.js':['server/editor-ui/editor.js','text/javascript'],
      '/editor/editor.css':['server/editor-ui/editor.css','text/css'],
      '/editor/worldbook.js':['server/editor-ui/worldbook.js','text/javascript'],
      '/editor/accounts':['native/academy-frontend/editor-accounts.html','text/html'],
      '/editor/accounts.js':['native/academy-frontend/editor-accounts.js','text/javascript'],
      '/editor/accounts.css':['server/auth-ui/login.css','text/css'],
    };
    if(request.method!=='GET'||!files[path]){json(response,404,{code:'NOT_FOUND'});return;}
    const [file,type]=files[path];let body=await readFile(resolve(root,file),'utf8');
    if(type==='text/html')body=body.replace(/<head\b[^>]*>/i,head=>head+`<script id="academy-editor-account" type="application/json">${safe({id:account.handle,email:account.name||account.handle})}</script><link rel="stylesheet" href="/auth/native-account.css"><script src="/auth/native-account.js"></script>`).replace('<h1>学院档案编辑</h1>','<h1>学院档案编辑 · 新版</h1>');
    if(path==='/editor/editor.js')body=body.replace('消息实际组装顺序','原生预设发送顺序').replace('普通用户预设／世界书会按各自插入位置、深度和排序加入以上消息；具体内容和启用状态由各用户控制，此处的提示词不在此处可编辑。','用户预设与世界书按原生设置参与编排；此页只编辑学院功能规则。');
    response.writeHead(200,{'Content-Type':type+'; charset=utf-8'});response.end(body);
  };
}
