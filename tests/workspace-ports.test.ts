import {afterEach, describe, expect, it, vi} from 'vitest';
import {installWorkspacePorts, workspacePort, type WorkspacePorts} from '../src/app/workspacePorts';
import {accountStorage} from '../src/storage/accountScope';
import {createPersonaLibrary} from '../src/storage/personaLibrary';

let release: (()=>void) | undefined;
afterEach(()=>{release?.();release=undefined;delete globalThis.__ACADEMY_BACKEND__;vi.unstubAllGlobals();});
function fixture() {
  const port=(methods:string[])=>Object.fromEntries(methods.map(name=>[name,vi.fn()]));
  return {
    repository: port(['read','write','hasUnsafeNativeDrafts','writeInputDraft','readEditorDrafts','writeEditorDraft','writeNativePreset','writeConfiguration','writeTerminalSession','prepareCloudRecovery','lockRestore','hasInterruptedRestore','clearInterruptedRestore','readCloudRecovery','readApiCredentials','writeApiCredentials']),
    gateway: {...port(['readNativePreset','bootstrap','terminal','terminalCode','createTheaterShare','lookupTheaterShare','configure','models','probe','newGame','assistPersona','place','authorize','generate','randomEvent','forumReply','memoryBatch','memory','utility','embed']),capabilities:{native:true,continue:true}},
    personas: port(['readDraft','readBackupState','saveDraft','list','save','clearDraft','replace','remove']),
    accountStorage: {getItem:vi.fn(()=>null),setItem:vi.fn(),removeItem:vi.fn()},
  } as unknown as WorkspacePorts;
}
describe('原学院界面后端连接',()=>{
  it('旧入口维持原有后端，不自动更换用户数据来源',()=>{
    const previous=fixture().repository,factory=vi.fn(()=>previous);
    expect(workspacePort('repository',factory)).toBe(previous);expect(factory).toHaveBeenCalledOnce();
  });
  it('原生入口缺少连接时禁止回退，不能悄悄打开旧库',()=>{
    globalThis.__ACADEMY_BACKEND__='native';const fallback=vi.fn(()=>fixture().repository);
    expect(()=>workspacePort('repository',fallback)).toThrow('已阻止');expect(fallback).not.toHaveBeenCalled();
    expect(()=>createPersonaLibrary()).toThrow('已阻止');
    expect(()=>accountStorage.getItem('academy:master-persona:v1')).toThrow('已阻止');
  });
  it('只安装一部分功能会整体失败，不能让某一页继续使用旧存储',()=>{
    const ports=fixture();delete (ports.personas as any).replace;
    expect(()=>installWorkspacePorts(ports)).toThrow('personas.replace');
    const factory=vi.fn(()=>fixture().repository);workspacePort('repository',factory);expect(factory).toHaveBeenCalledOnce();
  });
  it('所有页面共用同一个原生存档、人设库和偏好来源',()=>{
    globalThis.__ACADEMY_BACKEND__='native';const ports=fixture();release=installWorkspacePorts(ports);
    const fallback=vi.fn(()=>fixture().repository);
    expect(workspacePort('repository',fallback)).toBe(ports.repository);expect(fallback).not.toHaveBeenCalled();
    expect(createPersonaLibrary()).toBe(ports.personas);
    accountStorage.setItem('academy:master-persona:v1','主人设');expect(ports.accountStorage.setItem).toHaveBeenCalledWith('academy:master-persona:v1','主人设');
    accountStorage.getItem('academy:master-persona:v1');expect(ports.accountStorage.getItem).toHaveBeenCalledWith('academy:master-persona:v1');
    accountStorage.removeItem('academy:master-persona:v1');expect(ports.accountStorage.removeItem).toHaveBeenCalledWith('academy:master-persona:v1');
  });
  it('运行中不能重新安装第二个后端；卸载后不偷偷回退',()=>{
    globalThis.__ACADEMY_BACKEND__='native';const ports=fixture();release=installWorkspacePorts(ports);
    expect(()=>installWorkspacePorts(fixture())).toThrow('不能在页面运行中更换');
    release();release=undefined;expect(()=>createPersonaLibrary()).toThrow('已阻止');
  });
  it('不能把旧接口对象作为完整原生连接登记',()=>{
    const ports=fixture();ports.gateway.capabilities.native=false;
    expect(()=>installWorkspacePorts(ports)).toThrow('不能登记旧请求接口');
  });
});
