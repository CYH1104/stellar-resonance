export type Mode = 'demo' | 'server';
export type Panel = 'story' | 'memory' | 'relations' | 'chronicle' | 'map' | 'settings' | 'saves';
export interface Persona { name: string; appearance: string; personality: string; background: string }
export interface ActorState { id: string; name: string; energy: number; focus: number; affinity: number; present: boolean }
export interface WorldState { player: ActorState; characters: ActorState[] }
export interface Dice { value: number; grade: string; rulesVersion: 'd100-v1' }
export interface Outcome { player?: Partial<Pick<ActorState, 'energy' | 'focus'>>; characters?: { id: string; affinity: number }[]; event: string }
export interface Variant { id: string; text: string; status: 'complete' | 'incomplete'; createdAt: string; outcome?: Outcome }
export interface Turn { id: string; input: string; dice?: Dice; variants: Variant[]; selected: number }
export interface Vector { model: string; values: number[]; text: string }
export interface Memory { id: string; text: string; kind: 'event' | 'note' | 'chapter'; createdAt: string; sourceTurn?: string; sourceVariant?: string; vector?: Vector }
export interface Session { id: string; name: string; createdAt: string; updatedAt: string; persona: Persona; opening: string; initial: WorldState; turns: Turn[]; memories: Memory[]; suggestions: string[] }
export interface Profile { id: string; name: string; providerId: string; model: string; temperature: number; maxTokens: number }
export interface Preset { id: string; name: string; content: string; enabled: boolean }
export interface Preferences { mode: Mode; diceEnabled: boolean; vectorEnabled: boolean; profiles: Profile[]; mainProfile: string; auxiliaryProfile: string; embeddingProfile: string; presets: Preset[]; shortcuts: string[] }
export interface Snapshot { version: 1; sessions: Session[]; preferences: Preferences }
export interface GenerateRequest { sessionId: string; turnId: string; persona: Persona; opening: string; input: string; history: { role: 'user' | 'assistant'; content: string }[]; memories: string[]; state: WorldState; dice?: Dice; profile: Profile; presets: string[]; continuation?: { partial: string } }
export type GenerateEvent = { type: 'delta'; text: string } | { type: 'done'; outcome: Outcome };
/** Keys are transient arguments. They never belong to Profile, Session or Snapshot. */
export interface Gateway {
  capabilities: { continue: boolean };
  authorize(invite: string, signal?: AbortSignal): Promise<void>;
  generate(request: GenerateRequest, key: string, signal: AbortSignal): AsyncIterable<GenerateEvent>;
  utility(task: 'summary' | 'suggestions', texts: string[], profile: Profile, key: string, signal: AbortSignal): Promise<string[]>;
  embed(texts: string[], profile: Profile, key: string, signal: AbortSignal): Promise<number[][]>;
}
export interface Repository { read(): Promise<Snapshot | undefined>; write(value: Snapshot): Promise<void> }
