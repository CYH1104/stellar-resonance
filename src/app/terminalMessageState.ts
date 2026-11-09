import type {Session} from '../domain/contracts';
import type {TerminalConversation} from '../domain/personalTerminal';
import {terminalAnchorActive,terminalMessageVisible,terminalOriginActive} from '../domain/terminalLedger';
/** Local counts only: no text, identity, endpoint, credentials or persisted data. */
export function terminalMessageState(session:Session,conversation:TerminalConversation){
 const messages=conversation.messages;
 return {stored:messages.length,visible:messages.filter(m=>terminalMessageVisible(session,m)).length,archived:messages.filter(m=>m.archived).length,anchorChanged:messages.filter(m=>m.anchor&&!terminalAnchorActive(session,m.anchor)).length,sourceChanged:messages.filter(m=>!terminalOriginActive(session,m.origin)).length};
}
