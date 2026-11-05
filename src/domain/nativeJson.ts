export const nativeCredentialFields=new Set(['api_key','apikey','authorization','access_token','accesstoken','token','github_token','gitee_token','password','proxy_password','secret','secret_key','custom_include_headers']);
/** Preserve JSON extension fields without accepting executable values or credentials. */
export function cleanNativeJson(value:unknown,depth=0,resourceGuards=true):any{
 function invalid(resource=false):never{throw Object.assign(Error(resource?'配置超过当前 JSON 资源保护范围；原文件保留。这不是酒馆版本兼容错误。':'配置含非 JSON 数据或危险对象属性，原文件保留。'),{code:resource?'NATIVE_JSON_RESOURCE_LIMIT':'NATIVE_JSON_UNSAFE'});}
 if(resourceGuards&&depth>24)invalid(true);if(value===null||typeof value==='boolean')return value;
 if(typeof value==='number'){if(!Number.isFinite(value))invalid();return value;}
 if(typeof value==='string'){if(resourceGuards&&value.length>5*1024*1024)invalid(true);return value;}
 if(Array.isArray(value)){if(resourceGuards&&value.length>5000)invalid(true);return value.map(v=>cleanNativeJson(v,depth+1,resourceGuards));}
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();
 if(resourceGuards&&Object.keys(value).length>100000)invalid(true);
 const result:Record<string,any>={};for(const [key,item]of Object.entries(value)){
  if(['__proto__','prototype','constructor'].includes(key))invalid();
  if((nativeCredentialFields.has(key.toLowerCase())||key.toLowerCase()==='key'&&!(Array.isArray(item)&&item.every(s=>typeof s==='string')))&&item!==''&&item!==null&&item!==false)throw Error('原生配置含接口凭据或自定义请求头，请移除后导入；密钥请保留在 API 设置中。');
  result[key]=cleanNativeJson(item,depth+1,resourceGuards);
 }return result;
}
