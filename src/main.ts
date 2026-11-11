import { createApp } from 'vue';

import App from './App.vue';
import {ensureWorkspaceStyles,installWorkspaceStyleRecovery} from './app/workspaceStyles';

import './styles/tokens.css';

import './styles/layout.css';

import './styles/palette.css';

import './styles/terminal-workspace.css';

import './styles/student-file.css';

import './styles/persona-library.css';

import './styles/refinements.css';

const root=document.getElementById('academy-workspace')||document.getElementById('app')!;
let mounted=false,starting=false;
async function startWorkspace(retry=false){
 if(mounted||starting)return;starting=true;
 const loading=document.getElementById('academy-loading'),host=loading||root;
 let status=document.getElementById('academy-style-status');
 if(!status){status=document.createElement('section');status.id='academy-style-status';status.style.cssText='padding:18px;line-height:1.8;color:#33465e;font:14px/1.8 system-ui';host.append(status);}
 status.replaceChildren();const caption=document.createElement('p');caption.textContent='正在加载界面样式…';status.append(caption);
 try{await ensureWorkspaceStyles(retry);}
 catch{caption.textContent='界面样式加载失败，已保存的数据保留。请重试加载。';status.setAttribute('role','alert');const button=document.createElement('button');button.type='button';button.textContent='重试加载样式';button.onclick=()=>void startWorkspace(true);status.append(button);return;}
 finally{starting=false;}
 status.remove();mounted=true;createApp(App).mount(root);installWorkspaceStyleRecovery();
}
void startWorkspace();
