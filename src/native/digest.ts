let fallback:((bytes:Uint8Array)=>ArrayBuffer)|undefined;
export function nativeDigestFallback(value:(bytes:Uint8Array)=>ArrayBuffer){fallback=value;}
export async function nativeDigest(input:BufferSource){
 if(globalThis.crypto?.subtle)return crypto.subtle.digest('SHA-256',input);
 if(!fallback)throw Error('原生文件校验尚未准备好，请重新载入。');
 const bytes=ArrayBuffer.isView(input)?new Uint8Array(input.buffer,input.byteOffset,input.byteLength):new Uint8Array(input);
 return fallback(bytes);
}
