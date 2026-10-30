import {connectNativeHost, type NativeContext, type NativeHost, type NativePanel} from './runtime';

declare global {
  interface Window {
    SillyTavern?: {getContext(): NativeContext};
    academyNativeHost?: NativeHost;
  }
}

const native = window.SillyTavern;
if (!native?.getContext) throw new Error('学院皮肤需要在原生 SillyTavern 中加载。');

native.getContext().eventSource.on(native.getContext().eventTypes.APP_READY, () => {
  if (document.getElementById('academy-native-frame')) return;
  const frame = document.createElement('iframe');
  frame.id = 'academy-native-frame';
  frame.title = '星穹学院';
  frame.src = new URL(/* @vite-ignore */ './skin.html', import.meta.url).href;
  // Native themes may leave html height at zero; percentages collapse the skin frame.
  frame.style.cssText = 'position:fixed;inset:0;width:100vw;height:100dvh;border:0;z-index:10000;background:#f7f1e8';
  const back = document.createElement('button');
  back.type = 'button'; back.textContent = '返回学院';
  back.className = 'menu_button';
  back.id = 'academy-native-return';
  back.style.cssText = 'display:none;position:fixed;right:12px;bottom:12px;z-index:10001';
  back.hidden = true;
  back.addEventListener('click', () => {frame.hidden = false; frame.style.display = ''; back.hidden = true; back.style.display = 'none';});
  const targets: Record<NativePanel, string> = {
    api: '#sys-settings-button .drawer-toggle', presets: '#ai-config-button .drawer-toggle',
    worldbooks: '#WI-SP-button .drawer-toggle', personas: '#persona-management-button .drawer-toggle',
    characters: '#rightNavHolder .drawer-toggle', extensions: '#extensions-settings-button .drawer-toggle',
  };
  const host = connectNativeHost(() => native.getContext(), document, panel => {
    frame.hidden = true; frame.style.display = 'none'; back.hidden = false; back.style.display = 'block';
    if (panel) {
      const toggle = document.querySelector<HTMLElement>(targets[panel]);
      const content = toggle?.closest('.drawer')?.querySelector('.drawer-content');
      if (!content?.classList.contains('openDrawer')) toggle?.click();
    }
  });
  window.academyNativeHost = host;
  document.body.append(frame, back);
  window.addEventListener('pagehide', event => {if (!event.persisted) host.dispose();});
});
