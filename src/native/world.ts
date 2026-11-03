import {nativeDigest} from './digest';
export const academyWorldAvatar='stellar-academy-world-v1.png';
export async function nativeChatFingerprint(rows:unknown):Promise<string>{
  const digest=await nativeDigest(new TextEncoder().encode(JSON.stringify(rows)));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
