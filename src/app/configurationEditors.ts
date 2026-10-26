import {inject,type InjectionKey} from 'vue';
export interface ConfigurationEditor {dirty:()=>boolean;save:()=>Promise<void>;discard:()=>Promise<void>}
export const configurationEditorsKey:InjectionKey<(id:string,editor:ConfigurationEditor)=>()=>void>=Symbol('configuration-editors');
export function configurationEditors(){return inject(configurationEditorsKey,undefined);}
