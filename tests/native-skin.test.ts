import {describe, expect, it, vi} from 'vitest';
import {connectNativeHost, type NativeContext, type NativeMessage} from '../src/native/runtime';

function fixture() {
  const handlers = new Map<string, Set<(...args: any[]) => void>>();
  const emit = (event: string, ...args: any[]) => {for (const fn of handlers.get(event) || []) fn(...args);};
  const doc = new EventTarget();
  const textarea = {value: '', dispatchEvent: (event: Event) => doc.dispatchEvent(event)};
  Object.assign(doc, {querySelector: () => textarea});
  let nextFrame = 0;
  const frames = new Map<number, () => void>();
  const flush = () => {const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn());};
  const messages: NativeMessage[] = [{name: '角色', mes: '<div style="color:red">原生HTML</div>'}];
  const format = vi.fn((text: string) => 'native:'+text);
  const types = ['APP_READY', 'GENERATION_STARTED', 'GENERATION_ENDED', 'GENERATION_STOPPED', 'CHAT_CHANGED', 'MESSAGE_UPDATED', 'STREAM_TOKEN_RECEIVED', 'SETTINGS_UPDATED', 'ONLINE_STATUS_CHANGED'];
  const context: NativeContext = {
    chat: messages, characterId: 0, chatId: '原生会话', name1: '玩家', name2: '角色', onlineStatus: 'Valid',
    eventTypes: Object.fromEntries(types.map(x => [x, x])),
    eventSource: {on(event, fn) {if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event)!.add(fn);}, removeListener(event, fn) {handlers.get(event)?.delete(fn);}},
    generate: vi.fn(async () => {}), stopGeneration: vi.fn(), messageFormatting: format,
  };
  const host = connectNativeHost(() => context, doc as Document, vi.fn(), callback => {frames.set(++nextFrame, callback); return nextFrame;}, id => {frames.delete(id);});
  return {host, context, emit, format, textarea, flush, frames, handlers};
}

describe('原生学院皮肤连接', () => {
  it('使用原版格式化，不解析或重写原始消息；角色编号0有效', () => {
    const {host, context, format} = fixture();
    Object.freeze(context.chat[0]); Object.freeze(context.chat);
    const state = host.snapshot();
    expect(state.ready).toBe(true);
    expect(state.rows[0].html).toBe('native:'+context.chat[0].mes);
    expect(format).toHaveBeenCalledWith(context.chat[0].mes, '角色', false, false, 0);
  });
  it('输入同步原生输入框，设置更新不会丢弃当前草稿', () => {
    const {host, emit, flush, textarea} = fixture();
    host.setDraft('未发送的行动'); emit('SETTINGS_UPDATED'); flush();
    expect(textarea.value).toBe('未发送的行动');
    expect(host.snapshot().draft).toBe('未发送的行动');
  });
  it('调用原生generate一次，不构造另一个请求或提示词', async () => {
    const {host, context, textarea} = fixture();
    await host.send('保持 {{user}} 和原始输入');
    expect(context.generate).toHaveBeenCalledExactlyOnceWith('normal');
    expect(textarea.value).toBe('保持 {{user}} 和原始输入');
  });
  it('原生API连接状态变化立即通知皮肤，不必生成消息才能更新按钮', () => {
    const {host, context, emit, flush} = fixture();
    context.onlineStatus = 'no_connection'; expect(host.snapshot().connected).toBe(false);
    const listener = vi.fn(); host.subscribe(listener);
    context.onlineStatus = 'Valid'; emit('ONLINE_STATUS_CHANGED'); flush();
    expect(listener).toHaveBeenCalledOnce(); expect(host.snapshot().connected).toBe(true);
  });
  it('断线和无会话不提交生成，也不覆盖输入', async () => {
    const {host, context, textarea} = fixture(); textarea.value = '已有草稿';
    context.onlineStatus = 'no_connection';
    await expect(host.send('新输入')).rejects.toThrow('连接接口');
    context.onlineStatus = 'Valid'; context.characterId = undefined;
    await expect(host.send('新输入')).rejects.toThrow('选择角色');
    expect(context.generate).not.toHaveBeenCalled(); expect(textarea.value).toBe('已有草稿');
  });
  it('生成中拒绝重复发送，停止等待原生结束事件', async () => {
    const {host, context, emit} = fixture();
    emit('GENERATION_STARTED', 'normal', {}, false);
    await expect(host.send('重复')).rejects.toThrow('仍在生成');
    host.stop(); expect(context.stopGeneration).toHaveBeenCalledOnce();
    expect(host.snapshot().busy).toBe(true);
    emit('GENERATION_ENDED'); expect(host.snapshot().busy).toBe(false);
    emit('GENERATION_STARTED', 'normal', {}, true); expect(host.snapshot().busy).toBe(false);
  });
  it('异步原生调用尚未返回时不会因提前ENDED而重复提交', async () => {
    const {host, context, emit} = fixture();
    let done!: () => void;
    context.generate = vi.fn(() => new Promise<void>(resolve => {done = resolve;}));
    const first = host.send('一次'); emit('GENERATION_ENDED');
    await expect(host.send('第二次')).rejects.toThrow('仍在生成');
    done(); await first; expect(host.snapshot().busy).toBe(false);
  });
  it('原生失败不自动重试或本地报成功；仍保留原生输入', async () => {
    const {host, context} = fixture();
    context.generate = vi.fn(async () => {throw new Error('磁盘/网络失败');});
    await expect(host.send('保留行动')).rejects.toThrow('磁盘/网络失败');
    expect(context.generate).toHaveBeenCalledOnce();
    expect(host.snapshot().draft).toBe('保留行动'); expect(host.snapshot().busy).toBe(false);
  });
  it('流式更新逐帧合并，仅重新格式化发生变化的消息', () => {
    const {host, context, emit, format, flush, frames} = fixture();
    context.chat.push({name: '角色', mes: '生成前'});
    host.snapshot(); expect(format).toHaveBeenCalledTimes(2);
    const listener = vi.fn(); host.subscribe(listener);
    for (let n = 0; n < 100; n++) {context.chat[1].mes = String(n); emit('STREAM_TOKEN_RECEIVED');}
    expect(frames.size).toBe(1); flush(); expect(listener).toHaveBeenCalledOnce();
    expect(host.snapshot().rows[1].html).toBe('native:99'); expect(format).toHaveBeenCalledTimes(3);
  });
  it('换会话无同楼层缓存污染；卸载清理监听和待执行帧', () => {
    const {host, context, emit, flush, format, handlers} = fixture();
    host.snapshot(); context.chat = [{name: '另一个角色', mes: '新的原生消息'}];
    emit('CHAT_CHANGED'); expect(host.snapshot().rows[0].html).toBe('native:新的原生消息');
    expect(format).toHaveBeenCalledTimes(2);
    const listener = vi.fn(); host.subscribe(listener); host.dispose(); flush();
    expect(listener).not.toHaveBeenCalled(); expect([...handlers.values()].every(s => s.size === 0)).toBe(true);
  });
});
