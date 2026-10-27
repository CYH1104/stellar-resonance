// A second data root/port; does not restart the step-2 preview or production.
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const runtime=resolve(process.env.NATIVE_RUNTIME||resolve(root,'../stellar-native-runtime-20261028'));
const helper=resolve(process.env.NATIVE_HELPER||resolve(root,'../stellar-native-helper-20261028'));
const lock=JSON.parse(await readFile(new URL('./versions.json',import.meta.url),'utf8'));
for(const [path,commit]of [[runtime,lock.sillyTavern.commit],[helper,lock.helper.commit]]){
 const actual=execFileSync('git',['-c',`safe.directory=${path.replaceAll('\\','/')}`,'-C',path,'rev-parse','HEAD'],{encoding:'utf8'}).trim();if(actual!==commit)throw Error('PINNED_COMMIT_MISMATCH');
}
const installed=resolve(runtime,'public/scripts/extensions/third-party/stellar-pinned-helper');await mkdir(installed,{recursive:true});
for(const item of ['dist','lib','i18n','manifest.json'])await cp(resolve(helper,item),resolve(installed,item),{recursive:true});
const manifest=JSON.parse(await readFile(resolve(installed,'manifest.json'),'utf8'));manifest.auto_update=false;await writeFile(resolve(installed,'manifest.json'),JSON.stringify(manifest,null,2));
const dir=resolve(root,'.integration/native-step3');await mkdir(dir,{recursive:true});
const config=(await readFile(resolve(runtime,'default/config.yaml'),'utf8')).replace('  autoUpdate: true','  autoUpdate: false');await writeFile(resolve(dir,'config.yaml'),config);
const child=spawn(process.execPath,['server.js','--configPath',resolve(dir,'config.yaml'),'--dataRoot',resolve(dir,'data'),'--port','8840','--listen','false','--browserLaunchEnabled','false'],{cwd:runtime,windowsHide:true,stdio:'inherit'});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>child.kill());child.on('exit',code=>process.exit(code??0));child.on('error',error=>{console.error(error.message);process.exit(1);});
