import type {Outcome} from './contracts';

export function stateUpdateLabel(outcome:Outcome|undefined,needsRepair=false):string {
  const update=outcome?.stateUpdate;
  const prose=update?.storyComplete===false?'正文尚未完整':'正文已输出';
  if(update?.status==='retained')return `${prose}，部分变量未通过校验，沿用旧值`;
  if(needsRepair)return `${prose}，部分状态或小剧场待补全`;
  if(update?.status==='updated')return `${prose}，变量校验通过`;
  if(update?.status==='unchanged')return `${prose}，本轮变量无变化`;
  if(update?.status==='disabled')return `${prose}，本轮未启用状态更新`;
  return '本轮已完整输出';
}
