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

/** Unread badge and preview both exclude left groups. Select by message time,
 * never by the persisted conversation order, and leave retained history intact. */
export function terminalUnreadPreview(conversations:TerminalConversationView[]):TerminalMessage|undefined{
 const timestamp=(at:string)=>{const clock=/^(\d{1,2}):([0-5]\d)$/.exec(at);if(clock)return (+clock[1]*60 + +clock[2])*60000;const value=Date.parse(at);return Number.isFinite(value)?value:0;};
 let latest:TerminalMessage|undefined;
 for(const c of conversations){if(c.joined===false||c.unread<=0||!c.lastMessage)continue;if(!latest||timestamp(c.lastMessage.at)>=timestamp(latest.at))latest=c.lastMessage;}
 return latest;
}
