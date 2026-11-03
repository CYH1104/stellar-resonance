import {it,expect,vi} from 'vitest';
import {nativeDigestFallback} from '../src/native/digest';
import {nativeChatFingerprint} from '../src/native/world';

it('hashes the same full Unicode chat in HTTP browsers without crypto.subtle',async()=>{
  const rows=[{chat_metadata:{integrity:'保持原样'}},{mes:'正文\n另一行',swipes:['第一稿','第二稿']}];
  const expected='4452839661553c845dbe9e9bf3139b85f0add000fc2455b0e2550f4fd3e10d57';
  expect(await nativeChatFingerprint(rows)).toBe(expected);
  nativeDigestFallback(bytes=>{
    expect(new TextDecoder().decode(bytes)).toBe(JSON.stringify(rows));
    return Uint8Array.from(expected.match(/../g)!.map(byte=>parseInt(byte,16))).buffer;
  });
  vi.stubGlobal('crypto',{});
  try{expect(await nativeChatFingerprint(rows)).toBe(expected);}finally{vi.unstubAllGlobals();}
});
