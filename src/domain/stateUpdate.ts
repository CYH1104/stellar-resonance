import type {Outcome} from './contracts';

const explanations:Record<string,string>={
  STATE_REQUEST_MISMATCH:'状态协议版本或请求标识不匹配，未应用这份变量更新',
  STATE_PROTOCOL_CONFLICT:'出现重复状态或并行变量协议，未重复结算变量',
  STATE_CUSTOM_REJECTED:'自定义变量事务未通过路径、类型或权限校验，整笔保留原值',
  STATE_DUPLICATE_CHARACTER:'同一角色重复返回，未应用冲突的角色更新',
  STATE_AFFINITY_LARGE_INCREASE:'本轮请求的好感增量超过 +3，已记录幅度警告及原始依据',
  STATE_MVU_REJECTED:'变量补丁不合法，本轮变量更新未应用',
  STATE_ATTITUDE_INVALID:'本轮好感判断格式无效，原数值已保留，可手动补全本轮状态',
  STATE_ATTITUDE_REVIEW_MISSING:'部分在场角色漏返回本轮好感判断，已保留原数值，可手动补全',
  STATE_ATTITUDE_ITEM_SKIPPED:'部分角色的好感判断无效或重复，已保留其他有效结果',
  STATE_MVU_OUTPUT_MISSING:'本轮未收到好感判断或兼容变量补丁，原数值已保留；可手动补全本轮状态',
  STATE_MVU_PATH_REJECTED:'补丁目标路径不存在或不允许该操作；新角色须先 insert，数值须先初始化再 delta',
  STATE_MVU_VALUE_REJECTED:'变量结构、角色资料或数值未通过校验，已保留原值',
  STATE_FORMAT_INVALID:'模型返回的状态结构不合法',
  MODEL_STATE_JSON_INVALID:'状态 JSON 不完整或格式错误',
  STATE_FIELD_SKIPPED:'部分状态字段的类型或数值范围不合法，已跳过',
  STATE_FIELD_CONFLICT:'同一变量的标准字段与别名值冲突，已保留该字段原值，其他有效字段继续应用',
  STATE_EMPTY_FIELD_RETAINED:'模型返回空字段，已保留旧值',
  STATE_UNKNOWN_CHARACTER_SKIPPED:'角色 ID 或姓名无法唯一匹配，未应用该角色更新',
  STATE_ROSTER_RETAINED:'模型未返回在场名单，沿用已有名单或明确的在场更新',
  STATE_AFFINITY_RETAINED:'本轮未收到有效的好感度更新，保留原值',
  STATE_SPIRIT_THOUGHT_RETAINED:'在场角色的精神体 OS 缺失，保留原值',
  STATE_SPIRIT_THOUGHT_STALE:'在场角色的精神体 OS 重复上一轮，已保留旧值，可定向补全',
  STATE_PLAYER_THOUGHT_STALE:'玩家精神体 OS 重复上一轮，已保留旧值，可定向补全',
  STATE_PLAYER_THOUGHT_RETAINED:'玩家精神体 OS 缺失，保留原值',
  STATE_AUX_RETAINED:'独立状态接口未完成，主正文已保留',
  STATE_SIDE_SCENE_RETAINED:'本轮部分小剧场缺失或未通过完成校验',
  STATE_THEATER_SKIPPED:'小剧场结构不合法，未替换已有内容',
  MODEL_FANFIC_TOO_SHORT:'同人文正文不足 800 字',
  MODEL_FANFIC_UNFINISHED:'同人文缺少结尾 END 或 complete:true',
  MODEL_DIARY_TOO_SHORT:'精神体日记正文不足 200 字',
  MODEL_DIARY_UNFINISHED:'精神体日记缺少结尾署名或故事日期',
};
export function stateUpdateDetails(outcome:Outcome|undefined){return [...new Set(outcome?.stateUpdate?.codes||[])].filter(code=>explanations[code]||/(?:INVALID|REJECTED|RETAINED|MISSING|SKIPPED|UNFINISHED|TOO_SHORT)$/.test(code)).map(code=>({code,text:explanations[code]||'该部分输出未通过校验，已有有效内容保留'}));}

export function stateUpdateLabel(outcome:Outcome|undefined,needsRepair=false):string {
  const update=outcome?.stateUpdate;
  const prose=update?.storyComplete===false?'正文尚未完整':'正文已输出';
  if(update?.status==='partial')return `${prose}，有效字段已保存，部分字段沿用旧值`;
  if(update?.status==='retained')return `${prose}，部分变量未通过校验，沿用旧值`;
  if(needsRepair)return `${prose}，部分状态或小剧场待补全`;
  if(update?.codes.some(code=>/^(?:STATE_.*(?:RETAINED|MISSING|SKIPPED|INVALID|REJECTED|INCOMPLETE)|MODEL_(?:FANFIC|DIARY)_)/.test(code)))return `${prose}，有效内容已保存，部分状态或小剧场待补全`;
  if(update?.status==='updated')return `${prose}，有效变量已更新`;
  if(update?.status==='unchanged')return `${prose}，本轮变量无变化`;
  if(update?.status==='disabled')return `${prose}，本轮未启用状态更新`;
  return '本轮已完整输出';
}
