import {afterEach, describe, expect, it, vi} from 'vitest';
import {installWorkspacePorts, workspacePort,nativeWorkspaceActive, type WorkspacePorts} from '../src/app/workspacePorts';
import {accountStorage} from '../src/storage/accountScope';
import {createPersonaLibrary} from '../src/storage/personaLibrary';
import {effectScope} from 'vue';
import {IDBFactory} from 'fake-indexeddb';
import {useWorkspace} from '../src/app/useWorkspace';

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
    expect(nativeWorkspaceActive()).toBe(true);
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
    expect(nativeWorkspaceActive()).toBe(true);
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
  it('原生资料连接失败不能自动授权演示模式或创建假世界存档',async()=>{
    vi.stubGlobal('indexedDB',new IDBFactory());globalThis.__ACADEMY_BACKEND__='native';
    const ports=fixture();
    ports.repository.read=vi.fn(async()=>undefined);
    ports.repository.hasUnsafeNativeDrafts=()=>false;
    ports.repository.hasInterruptedRestore=async()=>false;
    ports.repository.readEditorDrafts=async()=>({});
    ports.repository.readApiCredentials=async()=>undefined;
    ports.gateway.bootstrap=async()=>{throw Error('原生连接中断');};
    release=installWorkspacePorts(ports);
    const scope=effectScope();
    try{
      const workspace=scope.run(()=>useWorkspace())!;
      await vi.waitFor(()=>expect(workspace.loading.value).toBe(false));
      expect(workspace.authorized.value).toBe(false);
      await workspace.create('不会创建',{name:'玩家',appearance:'',personality:'',background:''},'');
      expect(workspace.sessions.value).toHaveLength(0);
      expect(workspace.problem.value).toContain('原生后端尚未连接');
      expect(ports.repository.write).not.toHaveBeenCalled();
    }finally{scope.stop();}
  });
});
