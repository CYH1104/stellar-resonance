import type {Profile} from './contracts';
/** Zero penalties are neutral. Some compatible gateways reject the fields
 * themselves; omit only neutral values, retaining every effective setting. */
export function completionProfile(profile:Profile):Profile{
 const next={...profile};
 if(next.frequencyPenalty===0)delete next.frequencyPenalty;
 if(next.presencePenalty===0)delete next.presencePenalty;
 return next;
}
