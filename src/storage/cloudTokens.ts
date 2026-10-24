import {accountStorage} from './accountScope';
type Provider='github'|'gitee';
export function readCloudToken(provider:Provider){
 try{const value=JSON.parse(accountStorage.getItem('cloud-token:'+provider)||'null');return typeof value?.token==='string'?value.token:'';}catch{return '';}
}
export function writeCloudToken(provider:Provider,token:string){
 if(token.trim())accountStorage.setItem('cloud-token:'+provider,JSON.stringify({token}));
 else accountStorage.removeItem('cloud-token:'+provider);
}
