import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
// Usage: node scripts/vendor-mahjong.mjs /path/to/kobalab-majiang-core-1.4.1.tgz
// Requires tar. Read source directly from the authenticated archive, never a second directory.
const [input]=process.argv.slice(2);
if(!input)throw Error('Supply the pinned npm archive');
const archive=path.resolve(input),bytes=fs.readFileSync(archive);
if(crypto.createHash('sha512').update(bytes).digest('base64')!=='60jLSDCpSEy6gZK+uBoH7JRc1epzJWSzfh94LiZllLmPW8UJ+f9A8m74c8d9mMv+LVbnxKkg8TC86sKNqaD6VQ==')throw Error('Package digest mismatch');
function tar(args){const r=spawnSync('tar',args,{encoding:'utf8',maxBuffer:16*1024*1024});if(r.error)throw r.error;if(r.status!==0)throw Error('Cannot read pinned archive: '+r.stderr);return r.stdout;}
const names=tar(['-tf',archive]).split(/\r?\n/).filter(name=>/^package\/lib\/[^/]+\.js$/.test(name)).sort();
if(!names.includes('package/lib/index.js')||new Set(names).size!==names.length)throw Error('Unexpected package module inventory');
fs.mkdirSync('src/vendor/majiang',{recursive:true});
const modules=names.map(name=>JSON.stringify('./'+path.posix.basename(name,'.js'))+': function(module,exports,require){\n'+tar(['-xOf',archive,name])+'\n}');
fs.writeFileSync('src/vendor/majiang/core.js','// @kobalab/majiang-core 1.4.1 (MIT). Upstream source wrapped verbatim; see LICENSE.\nconst factories={\n'+modules.join(',\n')+'\n};\nconst cache={};\nfunction require(id){if(!Object.hasOwn(factories,id))throw Error("Unknown mahjong module");if(!cache[id]){const module={exports:{}};cache[id]=module;factories[id](module,module.exports,require);}return cache[id].exports;}\nexport default require("./index");\n');
fs.writeFileSync('src/vendor/majiang/LICENSE',tar(['-xOf',archive,'package/LICENSE']));
fs.writeFileSync('src/vendor/majiang/NOTICE.md','# 日麻规则引擎\n\n@kobalab/majiang-core 1.4.1, Satoshi Kobayashi, MIT.\nSource: https://github.com/kobalab/majiang-core\nPackage SHA-512: '+crypto.createHash('sha512').update(bytes).digest('base64')+'\n\ncore.js is the unmodified lib/index.js dependency graph wrapped verbatim in a static CommonJS module registry exported as browser ESM (no eval). The adapter lives in src/domain/mahjong.ts; no network, telemetry or executable install hooks are included.\n');
fs.writeFileSync('src/vendor/majiang/core.d.ts','declare const Majiang: any;\nexport default Majiang;\n');
console.log('Vendored '+names.length+' modules from the digest-verified archive.');
