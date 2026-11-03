import {bootHead, bootScreen} from '../../server/boot-screen.mjs';

// Original academy export controls also use Storage.length/key. Native
// AccountStorage exposes getState instead: adapt the interface, not its data.
export function nativeAcademyStorage(store) {
  const requireStore=()=>{if(!store)throw new Error('原生账号资料尚未连接，已阻止使用浏览器旧资料。');return store;};
  return {
    getItem(name){return requireStore().getItem(name)??null;},
    setItem(name,value){requireStore().setItem(name,value);},
    removeItem(name){requireStore().removeItem(name);},
    key(index){return Object.keys(requireStore().getState())[index]??null;},
    get length(){return Object.keys(requireStore().getState()).length;},
  };
}
// Same account-bound classic-script contract as the original production page.
export const nativeFrontendHead = `<script>(function(){window.__ACADEMY_BACKEND__='native';var parentHost;try{parentHost=window.parent!==window?window.parent:null;}catch(_){}var context=window.__ACADEMY_NATIVE_CONTEXT__||(parentHost&&parentHost.SillyTavern&&parentHost.SillyTavern.getContext());window.academyStorage=(${nativeAcademyStorage.toString()})(context&&context.accountStorage);if(parentHost){window.__ACADEMY_NATIVE_PORTS__=window.__ACADEMY_NATIVE_PORTS__||parentHost.academyNativeWorkspacePorts;window.__ACADEMY_ACCOUNT__=window.__ACADEMY_ACCOUNT__||parentHost.academyNativeIdentity;}})();</script>`;

/** Same academy document composition used by the existing /terminal page. */
export function renderAcademyFrontend(document, {script, styles = []}) {
  const asset = value => {
    if (typeof value !== 'string' || !/^\/[A-Za-z0-9_./-]+$/.test(value) || value.split('/').includes('..')) throw new Error('学院资源路径不正确。');
    return value;
  };
  if (!document.includes('__exp_splash__') || !document.includes('id="gate"')) throw new Error('原学院前端文档不完整。');
  const tags = [...styles.map(value => `<link rel="stylesheet" href="${asset(value)}">`), `<script type="module" src="${asset(script)}"></script>`].join('\n');
  const nativeBootScreen=bootScreen.replace('加载时间较长，请检查网络或刷新重试。','正在加载学院资源，请稍候…');
  return document.replace(/\blocalStorage\b/g, 'academyStorage').replace('<html ', '<html data-academy-boot ')
    .replace(/<head\b[^>]*>/i, head => head+nativeFrontendHead)
    .replace('</head>', bootHead+'</head>')
    .replace(/<body\b[^>]*>/i, body => body+nativeBootScreen)
    .replace('</body>', tags+'\n</body>');
}
