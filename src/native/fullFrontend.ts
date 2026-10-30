import {installWorkspacePorts, type WorkspacePorts} from '../app/workspacePorts';

declare global {
  interface Window {__ACADEMY_NATIVE_PORTS__?: Promise<WorkspacePorts>}
  var __ACADEMY_BACKEND__: 'native' | undefined;
}
globalThis.__ACADEMY_BACKEND__ = 'native';

async function start() {
  if (!window.__ACADEMY_NATIVE_PORTS__) throw new Error('完整学院前端尚未连接原生后端。');
  // Install before importing App: existing modules read UI preferences during import.
  const ports = await window.__ACADEMY_NATIVE_PORTS__;
  installWorkspacePorts(ports);
  await import('../main');
}
void start().catch(error => {
  document.documentElement.setAttribute('data-academy-error', '');
  const status = document.querySelector('.academy-loading-error');
  if (status) status.textContent = error instanceof Error ? error.message : '连接未完成，请重试。';
});
