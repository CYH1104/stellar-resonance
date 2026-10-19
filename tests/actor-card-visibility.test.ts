import {it,expect} from 'vitest';
import {newSession,backup,parseBackup,defaults,stateAt} from '../src/domain/story';
import {setActorCardHidden,actorCardVisible} from '../src/domain/actorCardVisibility';
it('card hiding survives backup without altering NPC presence or affinity and remains session scoped',()=>{
 const s=newSession('测试',{name:'玩家',appearance:'',personality:'',background:''},''),other=newSession('其他',{name:'玩家',appearance:'',personality:'',background:''},'');
 const actor=s.initial.characters[0]!;setActorCardHidden(s,actor.id,true);setActorCardHidden(s,actor.id,true);
 expect(s.hiddenActorCardIds).toEqual([actor.id]);expect(actorCardVisible(s,actor.id)).toBe(false);expect(actorCardVisible(other,actor.id)).toBe(true);
 const restored=parseBackup(backup({version:1,sessions:[s],preferences:defaults()})).sessions[0]!;
 expect(actorCardVisible(restored,actor.id)).toBe(false);expect(stateAt(restored).characters[0]).toEqual(actor);
 setActorCardHidden(restored,actor.id,false);expect(actorCardVisible(restored,actor.id)).toBe(true);
});
