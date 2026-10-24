export type SyncCategory='groups'|'groupMessages'|'privateMessages'|'friendRequests'|'courses';
export const syncReasons=['终端消息分类不正确','终端消息数量超限','重复群成员','重复管理员','终端群资料或身份不正确','群话题缺失','不能静默改写群资料','终端群消息发言人或文本不正确','遗漏已有群聊','自动私聊发言人或文本不正确','好友申请身份或内容不正确','课程不正确','条目结构不正确'] as const;
export interface TerminalSyncIssue {category:SyncCategory;path:string;code:string;action:'retained'|'skipped'|'truncated';count:number;messageCount?:number;reason?:string}
export interface TerminalSyncReport {version:1;issues:TerminalSyncIssue[];applied?:{groupMessages:number;privateMessages:number;duplicates:number;ignored:number}}
export function cleanSyncReport(raw:unknown):TerminalSyncReport{
 const r=raw as TerminalSyncReport;
 const count=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=100000;
 if(!r||r.version!==1||Object.keys(r).some(k=>!['version','issues','applied'].includes(k))||!Array.isArray(r.issues)||r.issues.length>200)throw Error('终端同步诊断格式不正确');
 for(const i of r.issues)if(!i||Object.keys(i).some(k=>!['category','path','code','action','count','messageCount','reason'].includes(k))||!['groups','groupMessages','privateMessages','friendRequests','courses'].includes(i.category)||!['retained','skipped','truncated'].includes(i.action)||typeof i.path!=='string'||!/^terminal(?:\.(?:groups|messages|privateMessages|friendRequests|courses|title|members|ownerId|adminIds|announcement|topic)|\[\d{1,5}\])*$/.test(i.path)||!/^STATE_TERMINAL_[A-Z_]{1,80}$/.test(i.code)||i.reason!==undefined&&!syncReasons.includes(i.reason as typeof syncReasons[number])||!count(i.count)||i.messageCount!==undefined&&!count(i.messageCount))throw Error('终端同步诊断条目不正确');
 if(r.applied&&(Object.keys(r.applied).length!==4||!['groupMessages','privateMessages','duplicates','ignored'].every(k=>count(r.applied![k as keyof typeof r.applied]))))throw Error('终端同步处理计数不正确');
 return JSON.parse(JSON.stringify(r));
}
export function terminalSyncSummary(codes:string[],report?:TerminalSyncReport){
 if(codes.includes('STATE_TERMINAL_MISSING'))return '本轮模型未返回终端通讯，旧记录保留。';
 if(!report){const reasons=codes.map(c=>({STATE_TERMINAL_GROUP_METADATA_RETAINED:'群资料保持原样',STATE_TERMINAL_GROUP_MISSING:'已有群未返回',STATE_TERMINAL_GROUP_SKIPPED:'群内容被拒绝',STATE_TERMINAL_GROUP_MESSAGE_SKIPPED:'群消息被拒绝',STATE_TERMINAL_PRIVATE_SKIPPED:'私聊被拒绝',STATE_TERMINAL_COURSES_RETAINED:'课程未更新'}[c]||c));return reasons.join('；')+'。具体处理数量未记录。';}
 const issues=report.issues,parts:string[]=[];
 if(issues.some(i=>i.count===0&&i.category!=='courses'))parts.push('部分分类缺失或格式不正确，缺失数量无法确认');
 if(issues.some(i=>i.code==='STATE_TERMINAL_GROUP_METADATA_RETAINED'))parts.push('群资料保持原样');
 const missing=issues.filter(i=>i.category==='groups'&&i.code==='STATE_TERMINAL_GROUP_MISSING').reduce((n,i)=>n+i.count,0);if(missing)parts.push(`${missing}个已有群未返回`);
 const groups=issues.filter(i=>i.category==='groups'&&i.action!=='retained').reduce((n,i)=>n+i.count,0);if(groups)parts.push(`${groups}个群未同步`);
 const gm=issues.reduce((n,i)=>n+(i.category==='groupMessages'?i.count:i.messageCount||0),0),pm=issues.filter(i=>i.category==='privateMessages').reduce((n,i)=>n+i.count,0);if(gm||pm)parts.push(`本轮${gm}条群消息、${pm}条私聊未同步`);
 if(issues.some(i=>i.category==='courses'))parts.push('课程未更新');
 if(issues.some(i=>i.category==='friendRequests'))parts.push('部分好友申请未同步');
 if(report.applied)parts.push(`实际新增${report.applied.groupMessages}条群消息、${report.applied.privateMessages}条私聊`);
 return parts.join('；')||'本轮终端处理明细已记录。';
}
