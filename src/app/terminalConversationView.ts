import type {TerminalConversation,TerminalMessage} from '../domain/personalTerminal';
import type {terminalVisibility} from '../domain/terminalLedger';

export interface TerminalConversationView extends TerminalConversation {lastMessage?:TerminalMessage}
/** Display-only projection. The list preview and chat use the same visible
 * message array; the persisted conversations and unread marks are untouched. */
export function terminalConversationViews(conversations:TerminalConversation[],visibility?:ReturnType<typeof terminalVisibility>):TerminalConversationView[]{
 return conversations.filter(c=>(!c.anchor||!!visibility?.anchor(c.anchor))&&(!c.producedBy||!!visibility?.origin(c.producedBy))).map(c=>{
  const messages=visibility?c.messages.filter(visibility.message):c.messages;
  return {...c,messages,lastMessage:messages.at(-1)};
 });
}
