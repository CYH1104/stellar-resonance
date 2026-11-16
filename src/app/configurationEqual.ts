/** Configuration objects are unordered records; array order remains meaningful.
 * Match JSON persistence semantics for undefined optional object properties.
 */
export function sameConfigurationValue(a:unknown,b:unknown):boolean{
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>sameConfigurationValue(value,b[index]));
 const left=a as Record<string,unknown>,right=b as Record<string,unknown>;
 const keys=Object.keys(left).filter(key=>left[key]!==undefined),other=Object.keys(right).filter(key=>right[key]!==undefined);
 return keys.length===other.length&&keys.every(key=>Object.hasOwn(right,key)&&sameConfigurationValue(left[key],right[key]));
}
