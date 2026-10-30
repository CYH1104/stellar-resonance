import type {Session,Turn,Variant} from '../domain/contracts';
export const academyNamespace='stellar_academy';
export type NativeChatRow=Record<string,any>;
const copy=<T>(value:T):T=>structuredClone(value);
function marker(row:NativeChatRow){return row.extra?.[academyNamespace];}
function validMarker(value:any,keys?:string[]){if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||keys&&Object.keys(value).some(key=>!keys.includes(key)))throw Error('原生聊天的学院扩展版本无法识别，原数据未覆盖。');return value;}
const rowKey=(row:NativeChatRow)=>{const m=validMarker(marker(row));if(!['opening','user','assistant'].includes(m.role))throw Error('原生消息包含未知学院记录，已停止覆盖。');const id=m.turnId||m.turn?.id;if(m.role!=='opening'&&typeof id!=='string')throw Error('原生消息缺少轮次关联。');return m.role==='opening'?'opening':`${m.role}:${id}`;};

/** View mapping only: original /api/chats saves the array and writes JSONL. */
export function sessionNativeMessages(session:Session, previous:NativeChatRow[]=[]):NativeChatRow[]{
  const oldHeader=previous[0]||{},old=new Map<string,NativeChatRow>();
  if(previous.length&&nativeMessagesSession(previous).id!==session.id)throw Error('原生聊天与目标存档不同，已停止覆盖。');
  for(const row of previous.slice(1)){const key=rowKey(row);if(old.has(key))throw Error('原生消息存在重复关联，已停止覆盖。');old.set(key,row);}
  const {turns,opening,...extension}=copy(session);
  const metadata={...oldHeader.chat_metadata,[academyNamespace]:{...oldHeader.chat_metadata?.[academyNamespace],version:1,session:extension}};
  metadata.integrity??=crypto.randomUUID();
  const rows:NativeChatRow[]=[{...oldHeader,user_name:'unused',character_name:'unused',chat_metadata:metadata}];
  if(opening){const before=old.get('opening')||{};rows.push({...before,name:'叙事',is_user:false,is_system:false,mes:opening,send_date:session.createdAt,extra:{...before.extra,[academyNamespace]:{version:1,role:'opening'}}});}
  for(const turn of turns){
    if(!Number.isInteger(turn.selected)||turn.selected<0||(turn.variants.length?turn.selected>=turn.variants.length:turn.selected!==0))throw Error('稿件选择不正确，原生聊天未写入。');
    const {input,variants,...turnMeta}=turn;
    const user=old.get('user:'+turn.id)||{};
    rows.push({...user,name:session.persona.name,is_user:true,is_system:false,mes:input,send_date:variants[0]?.createdAt||session.updatedAt,extra:{...user.extra,[academyNamespace]:{version:1,role:'user',turn:turnMeta}}});
    if(!variants.length)continue;
    const assistant=old.get('assistant:'+turn.id)||{},selected=variants[turn.selected];
    const infos=variants.map(variant=>{
      const prior=(assistant.swipe_info||[]).find((info:any)=>info.extra?.[academyNamespace]?.variant?.id===variant.id)||{};
      const {text,...rest}=variant;
      return {...prior,send_date:variant.createdAt,extra:{...prior.extra,[academyNamespace]:{version:1,variant:rest}}};
    });
    rows.push({...assistant,name:'叙事',is_user:false,is_system:false,mes:selected.text,send_date:selected.createdAt,swipe_id:turn.selected,swipes:variants.map(v=>v.text),swipe_info:infos,extra:{...assistant.extra,[academyNamespace]:{version:1,role:'assistant',turnId:turn.id}}});
  }
  return rows;
}

export function nativeMessagesSession(rows:NativeChatRow[]):Session{
  const header=rows[0]?.chat_metadata?.[academyNamespace];
  validMarker(header,['version','session']);if(!header.session||typeof header.session.id!=='string'||'turns' in header.session||'opening' in header.session)throw Error('原生聊天缺少学院存档关联或包含不支持的数据。');
  const session={...copy(header.session),opening:'',turns:[]} as Session;
  const ids=new Set<string>();let opening=false;
  for(let i=1;i<rows.length;i++){
    const row=rows[i],m=validMarker(marker(row));
    if(typeof row.mes!=='string')throw Error('原生消息正文无法识别，原数据保留。');
    if(m.role==='opening'){
      validMarker(m,['version','role']);if(row.is_user)throw Error('原生开场消息角色不正确。');
      if(opening||session.turns.length)throw Error('原生开场消息顺序不正确。');
      session.opening=row.mes;opening=true;continue;
    }
    validMarker(m,['version','role','turn']);
    if(m.role!=='user'||!row.is_user||!m.turn?.id||ids.has(m.turn.id)||'variants' in m.turn||'input' in m.turn)throw Error('原生轮次关联不完整，原数据保留。');
    ids.add(m.turn.id);
    const turn={...copy(m.turn),input:row.mes,variants:[]} as Turn;
    const reply=rows[i+1],replyMarker=reply&&marker(reply);
    if(replyMarker?.role==='assistant'){
      validMarker(replyMarker,['version','role','turnId']);if(reply.is_user||replyMarker.turnId!==turn.id)throw Error('原生回复与轮次不匹配。');
      if(typeof reply.mes!=='string')throw Error('原生回复正文不正确。');
      const swipes=reply.swipes||[reply.mes],infos=reply.swipe_info;
      if(!Array.isArray(swipes)||!Array.isArray(infos)||swipes.length!==infos.length)throw Error('原生多稿关联不完整，原数据保留。');
      const selected=reply.swipe_id??0;
      if(!Number.isInteger(selected)||selected<0||selected>=swipes.length)throw Error('原生多稿选择不正确。');
      turn.variants=swipes.map((text:any,n:number)=>{
        const extra=validMarker(infos[n]?.extra?.[academyNamespace],['version','variant']);
        if(typeof text!=='string'||!extra.variant?.id||'text' in extra.variant)throw Error('原生稿件资料不完整。');
        return {...copy(extra.variant),text:n===selected?reply.mes:text} as Variant;
      });
      if(new Set(turn.variants.map(v=>v.id)).size!==turn.variants.length)throw Error('原生稿件标识重复。');
      turn.selected=selected;i++;
    }
    else if(turn.selected!==0)throw Error('未生成轮次包含错误的稿件选择。');
    session.turns.push(turn);
  }
  return session;
}
