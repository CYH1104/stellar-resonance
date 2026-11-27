import type {StoryGameInvite} from '../../src/domain/storyGameInvites';
import {refreshGameRecruitment} from '../../src/domain/gameRecruitment';
/** Fixtures that start after consent has already been recorded. */
export function confirmGameInvite(i:StoryGameInvite,members:string[]){
 if(!i.recruitment)throw Error('Expected a negotiated invitation');
 i.recruitment.host={accepted:true,reply:'好，我问过他们了。',friendEstimate:members.length-1,candidates:members.slice(1).map(id=>({id,basis:'inference',reason:'可能一起玩'})),selectedIds:members.slice(1)};
 i.recruitment.guests=members.slice(1).map(id=>({id,accepted:true,reply:'愿意参加。'}));refreshGameRecruitment(i);return i;
}
