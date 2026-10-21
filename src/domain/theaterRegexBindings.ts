import type {TheaterSetting} from './contracts';
export function theaterRuleEnabled(settings:Pick<TheaterSetting,'slot'|'regexIds'>[],slot:number|undefined,id:string){const own=settings.find(s=>s.slot===slot)?.regexIds;if(own!==undefined)return own.includes(id);return !settings.some(s=>s.regexIds?.includes(id));}
