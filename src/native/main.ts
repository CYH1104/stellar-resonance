import {createApp} from 'vue';
import NativeAcademy from './NativeAcademy.vue';
import '../styles/tokens.css';
import '../styles/layout.css';
import '../styles/palette.css';
import '../styles/terminal-workspace.css';
import '../styles/refinements.css';
import './skin.css';

const host = window.parent.academyNativeHost;
if (!host || window.parent === window) throw new Error('请从原生酒馆打开学院皮肤。');
createApp(NativeAcademy, {host}).mount('#academy-workspace');
