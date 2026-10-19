import type {Memory,Session} from './contracts';

/** Queue state belongs to the selected reply, not to an unrelated historical task. */
export function memoryProgress(memory:Memory,session:Session|undefined,needsRepair:boolean,working=false){
  if(!needsRepair)return '已整理，可用于当前剧情检索。';
  const task=session?.memoryTasks?.slice().reverse().find(t=>t.source.sourceTurnId===memory.sourceTurn&&t.source.sourceVariantId===memory.sourceVariant);
  if(task?.status==='failed'||memory.status==='failed')return '整理失败，正文已保存；请点击补记重试。';
  if(task?.status==='running')return working?'正在后台整理，仍可继续剧情。':'上次整理被中断，正文已保存；请点击补记继续。';
  if(memory.record)return memory.source?'剧情或状态已变化，旧摘要已保留，需重新整理。':'旧记忆缺少来源确认，补记可恢复可校验的来源。';
  return '正文已保存，等待后台逐轮整理；也可以点击补记重试。';
}
