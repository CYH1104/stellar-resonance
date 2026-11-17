import type {TerminalMessage} from '../domain/personalTerminal';

/** Display projection only: keep stored replies, pagination and API history intact. */
export function terminalMessageBubbles(messages:readonly TerminalMessage[],privateChat:boolean){
 return messages.flatMap(message=>{
  const parts=privateChat&&message.sender!=='player'
   ?message.text.split(/\r?\n[\t ]*\r?\n(?:[\t ]*\r?\n)*/).filter(part=>part.trim())
   :[message.text];
  return (parts.length?parts:[message.text]).map((text,index)=>({...message,text,bubbleKey:JSON.stringify([message.id,index])}));
 });
}
