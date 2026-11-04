import {it,expect} from 'vitest';
import {NativePresets} from '../src/native/presets';
import type {NativeSettings} from '../src/native/settings';
it('loads independent worldbooks with bounded concurrency, preserves order, shares only in-flight reads and refreshes subsequent reads',async()=>{
 let active=0,peak=0,settingsReads=0,bookReads=0,version=1;
 const names=Array.from({length:9},(_,i)=>'Book-'+i);
 const settings={ensure:async()=>{},current:()=>({version:1,revision:0}),api:{post:async(path:string,body:any)=>{
  if(path==='/api/settings/get'){settingsReads++;return {settings:JSON.stringify({oai_settings:{preset_settings_openai:'Default'}}),openai_setting_names:['Default'],openai_settings:[JSON.stringify({temperature:.7})],world_names:names};}
  expect(path).toBe('/api/worldinfo/get');bookReads++;active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,1));active--;return {entries:{0:{uid:0,key:[],content:body.name+' v'+version,constant:true}}};
 }}} as unknown as NativeSettings;
 const presets=new NativePresets(settings),[first,second]=await Promise.all([presets.read(),presets.read()]);
 expect(peak).toBeGreaterThan(1);expect(peak).toBeLessThanOrEqual(4);expect(settingsReads).toBe(1);expect(bookReads).toBe(9);expect(first.worldbooks!.books.map(b=>b.name)).toEqual(names);
 first.worldbooks!.books[0].name='edited';expect(second.worldbooks!.books[0].name).toBe('Book-0');
 version=2;const fresh=await presets.read();expect(fresh.worldbooks!.books[0].worldbook.entries[0].content).toBe('Book-0 v2');expect(settingsReads).toBe(2);expect(bookReads).toBe(18);
});
