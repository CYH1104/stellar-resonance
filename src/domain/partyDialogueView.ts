import {filterElevenDialogue} from './elevenSpeech.ts';
import type {PartyRound,ElevenRound,TruthRound,PartyReply} from './partyGames';
export interface DialogueLine {id:string;text:string}
const valid=(line:PartyReply|undefined):line is DialogueLine=>!!line&&typeof line.id==='string'&&typeof line.text==='string'&&!!line.text.trim();
const copy=(lines:readonly PartyReply[]|undefined)=>Array.isArray(lines)?lines.filter(valid).map(line=>({id:line.id,text:line.text})):[];
/** Flatten only persisted public utterances. Preserve source order, duplicate speakers and exact text. */
export function partyDialogueLines(round:PartyRound):DialogueLine[]{
 if(round.kind==='eleven')return elevenDialogueLines(round);
 if(round.kind==='truth')return truthDialogueLines(round);
 return liarDialogueLines(round);
}
export function elevenDialogueLines(round:ElevenRound):DialogueLine[]{
 const lines=(round.waves||[]).flatMap(wave=>copy(wave.speeches));
 if(round.batch?.finalReplies)lines.push(...copy(round.batch.finalReplies));
 if(round.dialogueVersion===1)lines.push(...copy(round.replies));
 // Old completed records may hold public replies outside their wave history. Hide old unfinished replies.
 else if(round.phase==='complete')lines.push(...copy(round.replies));
 return filterElevenDialogue(lines);
}
export function truthDialogueLines(round:TruthRound):DialogueLine[]{
 const choice=round.choiceDialogue?.version===1?copy(round.choiceDialogue.lines):[];
 const modern=round.dialogue?.version===1?copy(round.dialogue.lines):[];
 const main=round.text&&round.target?{id:round.target,text:round.text}:undefined;
 const mainInDialogue=!!main&&modern.some(line=>line.id===main.id&&line.text===main.text);
 const primary=modern.length? [...(main&&!mainInDialogue?[main]:[]),...modern] : main?[main]:[];
 return [...choice,...primary,...copy(round.replies)];
}
export function liarDialogueLines(round:Extract<PartyRound,{kind:'liar'}>):DialogueLine[]{
 const lines:DialogueLine[]=[];
 for(const move of round.moves){
  if(move.id==='player'&&move.text?.trim())lines.push({id:'player',text:move.text});
  if(!(move.id==='player'&&move.replyWithNext))lines.push(...copy(move.replies));
 }
 if(round.phase==='complete'&&round.dialogueVersion!==1)lines.push(...copy(round.replies));
 return lines;
}
export function flattenPartyDialogue(rounds:readonly PartyRound[]):DialogueLine[]{return rounds.flatMap(partyDialogueLines);}
