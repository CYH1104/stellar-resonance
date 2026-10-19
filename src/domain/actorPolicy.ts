/** Author facts may be edited explicitly, never by a generated runtime update. */
export const fixedActorFields = ['identity','mentalPowerLevel'] as const;
export function restoreActorFacts(before:Record<string,unknown>,after:Record<string,unknown>){
  for(const field of fixedActorFields){if(Object.hasOwn(before,field))after[field]=before[field];else delete after[field];}
}
export function runtimeActorPatch<T extends object>(patch:T):T{
  const result={...patch} as Record<string,unknown>;
  for(const field of fixedActorFields)delete result[field];
  return result as T;
}
