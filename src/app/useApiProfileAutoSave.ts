import {computed,onMounted,getCurrentInstance} from 'vue';
import {useAutoSave} from './useAutoSave';
import {apiFieldIssues} from '../domain/apis';
import type {Profile} from '../domain/contracts';

export function useApiProfileAutoSave(profile:()=>Profile,key:()=>string,blocked:()=>boolean,confirmed:()=>boolean,save:()=>Promise<boolean>,failure:()=>string){
 const issues=computed(()=>apiFieldIssues(profile(),key()));
 const autoSave=useAutoSave(()=>[profile(),key(),blocked()],async()=>{
  if(issues.value.length||blocked())return false;
  if(!await save())throw Error(failure()||'API 保存失败');
  return true;
 },800);
 // Restored/imported complete profiles also need confirmation without another edit.
 if(getCurrentInstance())onMounted(()=>{if(!issues.value.length&&!blocked()&&!confirmed())void autoSave.retry();});
 const status=computed(()=>{
  if(autoSave.error.value)return autoSave.status.value;
  if(issues.value.length)return '请完善：'+issues.value.join('、');
  if(blocked())return '等待当前操作完成后保存';
  if(autoSave.status.value==='待保存'||autoSave.status.value==='保存中…')return autoSave.status.value;
  if(confirmed())return autoSave.lastSaved.value?'已自动保存':'已保存';
  return autoSave.status.value==='等待填写完整'?'等待自动保存':autoSave.status.value||'等待自动保存';
 });
 return {...autoSave,status};
}
