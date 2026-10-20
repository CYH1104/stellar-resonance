import {DatabaseSync} from 'node:sqlite';
import {access} from 'node:fs/promises';

// Persist only the origin: credentials, paths, query strings and fragments never enter the ledger.
export function relayOrigin(value){
  try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.origin:null;}catch{return null;}
}
export function installRelayRecords(db,{now=Date.now}={}){
  db.exec('CREATE TABLE IF NOT EXISTS relay_origins(user_id TEXT NOT NULL,origin TEXT NOT NULL,first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL,requests INTEGER NOT NULL,last_kind TEXT NOT NULL,PRIMARY KEY(user_id,origin));');
  return {
    recordRelay(userId,address,kind){
      const origin=relayOrigin(address);
      if(!origin||!['configured','request','probe','models'].includes(kind)||!db.prepare('SELECT 1 FROM users WHERE id=?').get(userId))return;
      const time=now();
      db.prepare('INSERT INTO relay_origins VALUES(?,?,?,?,1,?) ON CONFLICT(user_id,origin) DO UPDATE SET last_seen=excluded.last_seen,requests=requests+1,last_kind=excluded.last_kind').run(userId,origin,time,time,kind);
      // Bound history per account; recently used addresses remain available.
      db.prepare('DELETE FROM relay_origins WHERE user_id=? AND origin NOT IN (SELECT origin FROM relay_origins WHERE user_id=? ORDER BY last_seen DESC,origin LIMIT 100)').run(userId,userId);
    },
    relayRecords(options={}){return queryRelayRecords(db,options);}
  };
}
function queryRelayRecords(db,{email='',limit=200}={}){
  if(typeof email!=='string'||email.length>254||!Number.isInteger(limit)||limit<1||limit>1000)throw Error('INVALID_RELAY_QUERY');
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='relay_origins'").get())return [];
  const normalized=email.trim().toLowerCase();
  return db.prepare('SELECT u.email,r.origin,r.first_seen,r.last_seen,r.requests,r.last_kind FROM relay_origins r JOIN users u ON u.id=r.user_id'+(normalized?' WHERE u.email=?':'')+' ORDER BY r.last_seen DESC,u.email,r.origin LIMIT ?').all(...(normalized?[normalized]:[]),limit).map(row=>({email:row.email,origin:row.origin,port:new URL(row.origin).port||(row.origin.startsWith('https:')?'443':'80'),firstSeen:new Date(row.first_seen).toISOString(),lastSeen:new Date(row.last_seen).toISOString(),observations:row.requests,lastKind:row.last_kind}));
}
export async function readRelayRecords(file,options={}){
  try{await access(file);}catch(e){if(e.code==='ENOENT')return [];throw e;}
  const db=new DatabaseSync(file,{readOnly:true});
  try{db.exec('PRAGMA busy_timeout=5000');return queryRelayRecords(db,options);}finally{db.close();}
}
