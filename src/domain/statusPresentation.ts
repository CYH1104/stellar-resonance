import {displayText} from './storyMarkup';
import type {ActorState} from './contracts';
/** Formatting only: the saved MVU fields remain separate and unchanged. */
export function mentalGenderLabel(actor:Pick<ActorState,'mentalPowerLevel'|'secondaryGender'>):string {
  const raw=actor.mentalPowerLevel?.trim()||'';
  const level=/^[A-Za-z]+[+＋-]?$/.test(raw)?raw+'级':raw;
  return [level,actor.secondaryGender?.trim()].filter(Boolean).join(' ');
}
export function identityLines(value?:string):string[]{
  return [...new Set(displayText(value||'').split(/\r?\n|[；;]/).map(line=>line.trim().replace(/^[【\[]|[】\]]$/g,'').trim()).filter(Boolean))];
}
