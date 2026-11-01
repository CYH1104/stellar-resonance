export const nativeCredentialFields=new Set(['api_key','apikey','authorization','access_token','accesstoken','token','github_token','gitee_token','password','proxy_password','secret','secret_key','custom_include_headers']);
/** Preserve JSON extension fields without accepting executable values or credentials. */
export function cleanNativeJson(value:unknown,depth=0):any{
 function invalid():never{throw Error('原生配置格式不支持或版本过新，原数据未修改。');}
 if(depth>24)invalid();if(value===null||typeof value==='boolean')return value;
 if(typeof value==='number'){if(!Number.isFinite(value))invalid();return value;}
 if(typeof value==='string'){if(value.length>5*1024*1024)invalid();return value;}
 if(Array.isArray(value)){if(value.length>5000)invalid();return value.map(v=>cleanNativeJson(v,depth+1));}
 if(!value||typeof value!=='object'||Object.keys(value).length>100000||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();
 const result:Record<string,any>={};for(const [key,item]of Object.entries(value)){
  if(['__proto__','prototype','constructor'].includes(key))invalid();
  if((nativeCredentialFields.has(key.toLowerCase())||key.toLowerCase()==='key'&&!(Array.isArray(item)&&item.every(s=>typeof s==='string')))&&item!==''&&item!==null&&item!==false)throw Error('原生配置含接口凭据或自定义请求头，请移除后导入；密钥请保留在 API 设置中。');
  result[key]=cleanNativeJson(item,depth+1);
 }return result;
}
