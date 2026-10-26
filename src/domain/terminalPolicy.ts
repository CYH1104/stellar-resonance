import type {Session} from './contracts';

export const terminalGroupMessages={min:4,max:6};
export const terminalPrivateMessagesMax=3;
export const terminalRejectionCooldown=1;
export function completedStoryRounds(s:Session,before=s.turns.length){return s.turns.slice(0,before).filter(t=>t.variants[t.selected]?.status==='complete').length;}
export function terminalCooldownBlocked(declinedRound:number|undefined,completedRound:number){return declinedRound===undefined||completedRound-declinedRound<terminalRejectionCooldown;}
