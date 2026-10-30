import type {IndexedDbRepository} from '../storage/repository';
import type {PersonaLibrary} from '../storage/personaLibrary';
import type {HttpGateway} from '../gateway/http';

/** Backend bindings for the existing UI, not another workspace implementation. */
export interface WorkspacePorts {
  repository: Pick<IndexedDbRepository, keyof IndexedDbRepository>;
  gateway: Pick<HttpGateway, keyof HttpGateway>;
  personas: Pick<PersonaLibrary, keyof PersonaLibrary>;
  accountStorage: {
    getItem(name: string): string | null;
    setItem(name: string, value: string): void;
    removeItem(name: string): void;
  };
}
type PortGlobal = typeof globalThis & {__ACADEMY_BACKEND__?: 'native'};
let installed: WorkspacePorts | undefined;

const required = {
  repository: ['read', 'write', 'hasUnsafeNativeDrafts', 'writeInputDraft', 'readEditorDrafts', 'writeEditorDraft', 'writeNativePreset', 'writeConfiguration', 'writeTerminalSession', 'prepareCloudRecovery', 'lockRestore', 'hasInterruptedRestore', 'clearInterruptedRestore', 'readCloudRecovery', 'readApiCredentials', 'writeApiCredentials'],
  gateway: ['readNativePreset', 'bootstrap', 'terminal', 'terminalCode', 'createTheaterShare', 'lookupTheaterShare', 'configure', 'models', 'probe', 'newGame', 'assistPersona', 'place', 'authorize', 'generate', 'randomEvent', 'forumReply', 'memoryBatch', 'memory', 'utility', 'embed'],
  personas: ['readDraft', 'readBackupState', 'saveDraft', 'list', 'save', 'clearDraft', 'replace', 'remove'],
  accountStorage: ['getItem', 'setItem', 'removeItem'],
} as const;

/** Install every binding together, before mounting the unmodified academy App. */
export function installWorkspacePorts(value: WorkspacePorts): () => void {
  if (installed) throw new Error('学院后端已连接，不能在页面运行中更换数据来源。');
  for (const [name, methods] of Object.entries(required)) {
    const port = value[name as keyof WorkspacePorts];
    for (const method of methods) if (typeof (port as unknown as Record<string, unknown>)?.[method] !== 'function') throw new Error(`原生后端连接不完整：${name}.${method}`);
  }
  if (value.gateway.capabilities?.native !== true) throw new Error('完整学院前端必须连接原生后端，不能登记旧请求接口。');
  installed = value;
  return () => {if (installed === value) installed = undefined;};
}

export function workspacePort<K extends keyof WorkspacePorts>(name: K, legacy: () => WorkspacePorts[K]): WorkspacePorts[K] {
  if (installed) return installed[name];
  if ((globalThis as PortGlobal).__ACADEMY_BACKEND__ === 'native') throw new Error('原生后端尚未连接；已阻止切回本地存档或旧接口。');
  return legacy();
}
