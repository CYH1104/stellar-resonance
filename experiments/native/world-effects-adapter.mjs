import {createHash} from 'node:crypto';
/** Fixed-upstream adaptation: enable its timed-effects class in the trusted projection only.
 * No keyword, probability, group, budget, recursion or interval logic is reimplemented here.
 */
export function projectNativeWorldInfoModule(source){
 const text=source.replaceAll('\r\n','\n');
 if(createHash('sha256').update(text).digest('hex')!=='111c7f47945839e75b021e09bdbb112a54f0a9b7857d2b95435f573efc7cd9a5')throw Error('NATIVE_WORLD_MODULE_PIN_MISMATCH');
 const constructor='constructor(chat, entries, isDryRun = false) {\n        this.#chat = chat;';
 const effects='new WorldInfoTimedEffects(chat, sortedEntries, isDryRun)';
 const lookup='this.#entries.find(x => String(this.#getEntryHash(x)) === String(value.hash))';
 const active='this.#buffer[type]?.some(x => this.#getEntryHash(x) === this.#getEntryHash(entry))';
 if([constructor,effects,lookup,active].some(target=>text.split(target).length!==2))throw Error('NATIVE_WORLD_ADAPTER_TARGET_MISMATCH');
 return text.replace(constructor,'constructor(chat, entries, isDryRun = false) {\n        this.#chat = globalThis.__ACADEMY_NATIVE_WORLD_PROJECTION__ ? {length:globalThis.__ACADEMY_NATIVE_WORLD_PROJECTION__.messageCount} : chat;').replace(effects,'new WorldInfoTimedEffects(chat, sortedEntries, globalThis.__ACADEMY_NATIVE_WORLD_PROJECTION__ ? false : isDryRun)').replace(lookup,'this.#entries.find(x => (!globalThis.__ACADEMY_NATIVE_WORLD_PROJECTION__ || this.#getEntryKey(x) === key) && String(this.#getEntryHash(x)) === String(value.hash))').replace(active,'this.#buffer[type]?.some(x => (!globalThis.__ACADEMY_NATIVE_WORLD_PROJECTION__ || this.#getEntryKey(x) === this.#getEntryKey(entry)) && this.#getEntryHash(x) === this.#getEntryHash(entry))');
}
