import {readFile} from 'node:fs/promises';
import {basename} from 'node:path';
import {importTavernPreset,exportTavernPreset} from '../src/domain/presets.ts';
import {defaults,backup,parseBackup} from '../src/domain/story.ts';
import {applyPromptEntries} from '../server/presets.mjs';
const file=process.argv[2];
if(!file){console.error('Usage: node scripts/check-preset.mjs <preset.json>');process.exit(1);}
try{
  const imported=importTavernPreset(await readFile(file,'utf8'),basename(file));
  const prefs=defaults();prefs.presets=imported.entries;prefs.activePreset=imported.id;
  const restored=parseBackup(backup({version:1,sessions:[],preferences:prefs}));
  const again=importTavernPreset(exportTavernPreset(imported.entries,prefs.profiles[0]));
  const entries=restored.preferences.presets;
  const result=applyPromptEntries([{role:'system',content:'test-rule'},{role:'system',content:'test-card'},{role:'system',content:'test-context'},{role:'user',content:'test-action'}],entries,{name:'测试玩家'},'测试角色','normal');
  console.log(JSON.stringify({ok:true,imported:entries.length,enabled:entries.filter(p=>p.enabled).length,totalCharacters:entries.reduce((n,p)=>n+p.content.length,0),restored:restored.preferences.presets.length,exportedAndReimported:again.entries.length,outgoingMessages:result.length,outgoingCharacters:result.reduce((n,m)=>n+m.content.length,0)}));
}catch(error){console.error(error.code||error.message);process.exit(1);}
