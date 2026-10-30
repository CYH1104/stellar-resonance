import {workspacePort} from '../app/workspacePorts';
type AccountGlobal=typeof globalThis&{__ACADEMY_ACCOUNT__?:{id:string;email:string;dataVersion?:number}};
export function accountDatabase(name:string){const account=(globalThis as AccountGlobal).__ACADEMY_ACCOUNT__;return account?`${name}:account:${account.id}${account.dataVersion?':v'+account.dataVersion:''}`:name;}
function key(name:string){const account=(globalThis as AccountGlobal).__ACADEMY_ACCOUNT__;return account?`account:${account.id}:${account.dataVersion?'v'+account.dataVersion+':':''}${name}`:name;}
const browserStorage={getItem:(name:string)=>localStorage.getItem(key(name)),setItem:(name:string,value:string)=>localStorage.setItem(key(name),value),removeItem:(name:string)=>localStorage.removeItem(key(name))};
export const accountStorage={getItem:(name:string)=>workspacePort('accountStorage',()=>browserStorage).getItem(name),setItem:(name:string,value:string)=>workspacePort('accountStorage',()=>browserStorage).setItem(name,value),removeItem:(name:string)=>workspacePort('accountStorage',()=>browserStorage).removeItem(name)};
