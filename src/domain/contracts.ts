import type {MvuOperation,Json} from './mvu';
import type {WorkspaceLayout} from './layout';
import type {SpecialEvent,RandomEventGate} from './randomEvents';
export type Mode = 'demo' | 'server';
export type Panel = 'story' | 'memory' | 'relations' | 'map' | 'forum' | 'game-settings' | 'theaters' | 'status' | 'settings' | 'presets' | 'saves' | 'worldbooks';
export interface Persona {ability?:string;spiritName?:string;spiritAppearance?:string;spiritPersonality?:string;spiritAbility?:string;mentalPowerLevel?:string; rawText?:string; name: string; appearance: string; personality: string; background: string; identity?:string;primaryGender?: string; secondaryGender?: string; spiritAnimal?:string; other?:string; pairingPreference?:string }
export interface ActorState {ability?:string;mentalPowerLevel?:string;
  id: string; name: string; present: boolean; affinity?: number;
  identity?:string;primaryGender?: string; secondaryGender?: string; innerThought?: string; spiritAnimal?:string; spiritThought?:string;
  /** Legacy v0.1 fields, retained only for old local saves. */
  energy?: number; focus?: number;
}
export interface ActorPatch { ability?:string;mentalPowerLevel?:string;
  name?: string;identity?:string; primaryGender?: string; secondaryGender?: string; innerThought?: string; spiritAnimal?:string; spiritThought?:string;
  affinity?: number; present?: boolean;
  energy?: number; focus?: number;
}
export interface ForumComment { id: string; authorName: string; content: string }
export interface ForumPost { id: string; authorName: string; content: string; topic?: string; comments?: ForumComment[] }
export interface ForumReaction { liked: boolean; replies: { id: string; text: string; createdAt: string;authorName?:string;authorId?:string;replyTo?:string;kind?:'ai' }[] }
export interface ForumEntry extends ForumPost { key: string; turnId: string; variantId: string; round: number; createdAt: string }
export interface WorldState { variables?:Record<string,Json>; player: ActorState; characters: ActorState[] }
export interface Dice { value: number; grade: string; rulesVersion: 'd100-v1' }
export type TheaterKind='forum'|'group'|'fanfic'|'custom';
export type TheaterTemplateId='fanfic'|'interview'|'spirit'|'off-duty'|'custom';
export interface TheaterSetting {slot:number;enabled:boolean;kind:TheaterKind;title:string;instruction:string;charId?:string;templateId?:TheaterTemplateId}
export interface Pairing {charId:string;category:'BL'|'BG'|'GB'|'待补充';userRole:'攻'|'受'|'待补充';reason:string}
export interface SpiritDiary {ownerId:string;title:string;content:string;date?:string;mood?:string;ownerName?:string;spiritAnimal?:string}
export interface TheaterScene {complete?:boolean;slot:number;kind:TheaterKind;title:string;content:string;messages?:{speaker:string;content:string}[];participantIds?:string[];pairing?:Pairing;diary?:SpiritDiary}
export interface DiceEvent {direction:'negative'|'neutral'|'positive';description:string}
export interface Outcome { mvu?:MvuOperation[]; player?: ActorPatch; characters?: (ActorPatch & { id: string })[]; event: string;diceEvent?:DiceEvent; forum?: ForumPost[];theaters?:TheaterScene[];suggestions?:string[] }
export interface Variant { mvuOverride?:MvuOperation[]; suggestions?:string[]; id: string; text: string; status: 'complete' | 'incomplete'; createdAt: string; outcome?: Outcome }
export interface Turn { randomEvent?:RandomEventGate; id: string; input: string; dice?: Dice; variants: Variant[]; selected: number }
export interface Vector { model: string; values: number[]; text: string }
export interface Memory {record?:import('./memories').RoundMemory;status?:'pending'|'ready'|'failed';sourceFingerprint?:string;error?:string;indexError?:string;annotation?:string; id: string; text: string; kind: 'event' | 'note' | 'chapter'; createdAt: string; sourceTurn?: string; sourceVariant?: string; vector?: Vector }
export interface Session { worldbookIds?:string[]; id: string; name: string; createdAt: string; updatedAt: string; persona: Persona; opening: string; initial: WorldState; turns: Turn[]; memories: Memory[]; suggestions: string[]; forumActivity?: Record<string, ForumReaction>; sourceDataset?: string }
export interface PublicPlace { id:string; name:string; area:string; px:number; py:number }
export interface LocalService { narratorName?:string; characterFacts?:import('./characterFacts').CharacterFact[]; runtime:'local-card'; dataset:string; name:string; greeting:string[]; capabilities:{continue:boolean;keyRequired:boolean;embeddings:boolean}; characters:ActorState[]; places:PublicPlace[]; counts:{characters:number;departments:number;places:number};missing:string[] }
export interface Profile { id: string; name: string; providerId: string; model: string; temperature: number; maxTokens: number; apiBaseUrl?:string;topP?:number;frequencyPenalty?:number;presencePenalty?:number }
export interface PresetPromptGroup {id:string;name:string;order:number;collapsed:boolean;enabled:boolean}
export interface Preset {group?:PresetPromptGroup|null; id: string; name: string; content: string; enabled: boolean;setId?:string;setName?:string;identifier?:string;role?:'system'|'user'|'assistant';position?:'before'|'after'|'in-chat';depth?:number;order?:number;marker?:boolean;included?:boolean;triggers?:string[] }
export interface Preferences {stateProfile?:string;worldbooks?:import("./worldbooks").Worldbook[];defaultWorldbookIds?:string[]; suggestionsEnabled?:boolean; layout?:WorkspaceLayout; randomEventProfile?:string; forumReplyEnabled?:boolean;forumReplyProfile?:string; mode: Mode; diceEnabled: boolean; vectorEnabled: boolean; profiles: Profile[]; mainProfile: string; auxiliaryProfile: string; embeddingProfile: string;auxiliaryProfiles?:string[];storyProfile?:string;summaryProfile?:string;suggestionsProfile?:string;personaProfile?:string; presets: Preset[]; presetParameters?:Record<string,Partial<Profile>>; shortcuts: string[];activePreset?:string;theaters?:TheaterSetting[] }
export interface Snapshot { version: 1; sessions: Session[]; preferences: Preferences }
export interface GenerateRequest {worldInfo?:import("./worldbooks").LoreInsertion[]; suggestionsEnabled?:boolean; specialEvent?:SpecialEvent; sessionId: string; turnId: string; persona: Persona; opening: string; input: string; history: { role: 'user' | 'assistant'; content: string }[]; historyStart?:number; memories: string[]; state: WorldState; dice?: Dice; profile: Profile; presets: string[];promptEntries?:Preset[];generationType?:'normal'|'regenerate'|'continue';theaterSettings?:TheaterSetting[]; continuation?: { partial: string;mode?:'state' }; forumContext?: { authorName: string; content: string; replies: string[] }[] }
export type GenerateEvent = {type:'diagnostic';diagnostic:import('./diagnostics').GenerationDiagnostic} | {type:'progress';phase:'waiting'|'hidden'|'receiving'} | { type: 'delta'; text: string } | { type: 'continuation'; attempt:number;maxAttempts:number } | {type:'repair';attempt:number;maxAttempts:number;reason:string} | { type: 'done'; outcome: Outcome };
/** Keys are transient arguments. They never belong to Profile, Session or Snapshot. */
export interface Gateway {
  capabilities: { continue: boolean; keyRequired?: boolean; embeddings?:boolean };
  authorize(invite: string, signal?: AbortSignal): Promise<void>;
  generate(request: GenerateRequest, key: string, signal: AbortSignal, stateApi?:{profile:Profile;key:string}): AsyncIterable<GenerateEvent>;
  memory(input:import('./memories').MemoryRequest,profile:Profile,key:string,signal:AbortSignal):Promise<import('./memories').RoundMemory>;
  utility(task: 'summary' | 'suggestions', texts: string[], profile: Profile, key: string, signal: AbortSignal): Promise<string[]>;
  embed(texts: string[], profile: Profile, key: string, signal: AbortSignal): Promise<number[][]>;
}
export interface Repository { read(): Promise<Snapshot | undefined>; write(value: Snapshot): Promise<void> }
