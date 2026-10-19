import type {Session} from './contracts';
export function setActorCardHidden(session:Session,id:string,hidden:boolean){
 const ids=new Set(session.hiddenActorCardIds||[]);if(hidden)ids.add(id);else ids.delete(id);session.hiddenActorCardIds=[...ids];
}
export function actorCardVisible(session:Session|undefined,id:string){return !session?.hiddenActorCardIds?.includes(id);}
