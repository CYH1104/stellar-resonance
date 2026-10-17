export function validateMapAssets(raw={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.places!==undefined&&(!raw.places||typeof raw.places!=='object'||Array.isArray(raw.places)))throw Object.assign(Error(),{status:400,code:'INVALID_MAP_ASSETS'});
  const url=value=>{if(value===''||value===undefined)return '';if(typeof value!=='string'||value.length>2000)throw Error();const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||/["'<>]/.test(value))throw Error();return value;};
  try{const places={};if(Object.keys(raw.places||{}).length>200)throw Error();for(const [name,value]of Object.entries(raw.places||{})){if(!name.trim()||name.length>100||['__proto__','constructor','prototype'].includes(name))throw Error();places[name]=url(value);}return {main:url(raw.main),secondary:url(raw.secondary),places};}catch{throw Object.assign(Error(),{status:400,code:'INVALID_MAP_ASSETS'});}
}
