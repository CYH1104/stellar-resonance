type AccountGlobal=typeof globalThis&{__ACADEMY_ACCOUNT__?:{id:string;email:string}};
export function accountDatabase(name:string){const id=(globalThis as AccountGlobal).__ACADEMY_ACCOUNT__?.id;return id?`${name}:account:${id}`:name;}
function key(name:string){const id=(globalThis as AccountGlobal).__ACADEMY_ACCOUNT__?.id;return id?`account:${id}:${name}`:name;}
export const accountStorage={getItem:(name:string)=>localStorage.getItem(key(name)),setItem:(name:string,value:string)=>localStorage.setItem(key(name),value),removeItem:(name:string)=>localStorage.removeItem(key(name))};
