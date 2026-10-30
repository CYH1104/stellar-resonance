/** Thin UI connection to SillyTavern.getContext(). No storage or prompt engine. */
export interface NativeMessage {
  name: string;
  mes: string;
  is_user?: boolean;
  is_system?: boolean;
  [key: string]: unknown;
}
export interface NativeContext {
  chat: NativeMessage[];
  characterId?: number;
  groupId?: string | number;
  chatId?: string;
  name1: string;
  name2: string;
  onlineStatus: string;
  eventTypes: Record<string, string>;
  eventSource: {on(event: string, handler: (...args: any[]) => void): void; removeListener(event: string, handler: (...args: any[]) => void): void};
  generate(type: string): Promise<unknown>;
  stopGeneration(): unknown;
  messageFormatting(text: string, name: string, system: boolean, user: boolean, index: number): string;
}
export interface NativeRow {index: number; name: string; user: boolean; html: string}
export interface NativeSnapshot {chatId: string; name: string; ready: boolean; connected: boolean; busy: boolean; draft: string; rows: NativeRow[]}
export type NativePanel = 'api' | 'presets' | 'worldbooks' | 'personas' | 'characters' | 'extensions';
export interface NativeHost {
  snapshot(): NativeSnapshot;
  subscribe(listener: () => void): () => void;
  setDraft(text: string): void;
  send(text: string): Promise<void>;
  stop(): void;
  open(panel?: NativePanel): void;
}

export function connectNativeHost(
  getContext: () => NativeContext,
  doc: Document,
  open: NativeHost['open'],
  schedule: (callback: () => void) => number = requestAnimationFrame,
  cancel: (id: number) => void = cancelAnimationFrame,
): NativeHost & {dispose(): void} {
  const listeners = new Set<() => void>();
  const subscriptions: [string, (...args: any[]) => void][] = [];
  const context = getContext();
  let busy = false, sending = false, frame: number | undefined;
  let previousChat = context.chat;
  const cache = new Map<number, {message: NativeMessage; text: string; name: string; user: boolean; system: boolean; row: NativeRow}>();
  const input = () => doc.querySelector<HTMLTextAreaElement>('#send_textarea');
  function changed() {
    if (frame !== undefined) return;
    frame = schedule(() => {frame = undefined; for (const listener of listeners) listener();});
  }
  function on(key: string, callback: (...args: any[]) => void) {
    const event = context.eventTypes[key];
    if (!event) return;
    context.eventSource.on(event, callback);
    subscriptions.push([event, callback]);
  }
  on('GENERATION_STARTED', (_type, _options, dryRun) => {if (!dryRun) {busy = true; changed();}});
  on('GENERATION_ENDED', () => {busy = false; changed();});
  // Stopping a stream is asynchronous. Keep the controls locked until ENDED.
  for (const key of ['CHAT_CHANGED', 'CHAT_LOADED', 'MESSAGE_RECEIVED', 'MESSAGE_SENT', 'MESSAGE_UPDATED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'MORE_MESSAGES_LOADED', 'STREAM_TOKEN_RECEIVED', 'SETTINGS_UPDATED', 'PERSONA_CHANGED', 'PERSONA_UPDATED', 'ONLINE_STATUS_CHANGED', 'CONNECTION_PROFILE_LOADED']) on(key, () => {if (key !== 'STREAM_TOKEN_RECEIVED') cache.clear(); changed();});
  doc.addEventListener('input', changed);
  function setDraft(text: string) {
    const textarea = input();
    if (!textarea) throw new Error('原生输入框尚未准备好，请返回酒馆检查。');
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', {bubbles: true}));
  }
  return {
    snapshot() {
      const current = getContext();
      if (previousChat !== current.chat) {cache.clear(); previousChat = current.chat;}
      const rows = current.chat.map((message, index) => {
        const text = message.mes, name = message.name, user = !!message.is_user, system = !!message.is_system;
        const old = cache.get(index);
        if (old?.message === message && old.text === text && old.name === name && old.user === user && old.system === system) return old.row;
        // Use the original formatter (including its regex/sanitizer), never the old academy renderer.
        const row = {index, name, user, html: current.messageFormatting(text, name, system, user, index)};
        cache.set(index, {message, text, name, user, system, row});
        return row;
      });
      for (const key of cache.keys()) if (key >= rows.length) cache.delete(key);
      return {chatId: current.chatId || '', name: current.name2, ready: current.characterId !== undefined || !!current.groupId, connected: current.onlineStatus !== 'no_connection', busy: busy || sending, draft: input()?.value || '', rows};
    },
    subscribe(listener) {listeners.add(listener); return () => {listeners.delete(listener);};},
    setDraft,
    async send(text) {
      const current = getContext();
      if (sending || busy) throw new Error('当前仍在生成，请等待完成或停止。');
      if (current.characterId === undefined && !current.groupId) throw new Error('请先选择角色或会话。');
      if (current.onlineStatus === 'no_connection') throw new Error('请先在 API 设置中连接接口。');
      const textarea = input();
      if (!textarea) throw new Error('原生输入框尚未准备好，请返回酒馆检查。');
      if (!text.trim()) return;
      sending = true;
      try {
        setDraft(text);
        changed();
        // Original Generate handles macros, world info, presets, extensions, streaming and saving.
        await getContext().generate('normal');
      } finally {sending = false; busy = false; changed();}
    },
    stop() {getContext().stopGeneration();},
    open,
    dispose() {
      if (frame !== undefined) cancel(frame);
      for (const [event, handler] of subscriptions) context.eventSource.removeListener(event, handler);
      doc.removeEventListener('input', changed);
      listeners.clear(); cache.clear();
    },
  };
}
