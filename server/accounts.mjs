import {installRelayRecords} from './relay-records.mjs';
import {DatabaseSync} from 'node:sqlite';
import {mkdir,chmod} from 'node:fs/promises';
import {resolve} from 'node:path';
import {scrypt,randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt),hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(code,status=400)=>Object.assign(Error(code),{code,status});
const passwordHash=(password,salt)=>derive(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
export async function createAccounts({directory,now=Date.now,requireInvite=false}){
  await mkdir(directory,{recursive:true,mode:0o700});
  const db=new DatabaseSync(resolve(directory,'accounts.sqlite'));
  await chmod(resolve(directory,'accounts.sqlite'),0o600);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);');
  if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='data_version'))db.exec('ALTER TABLE users ADD COLUMN data_version INTEGER NOT NULL DEFAULT 0');
  db.exec('CREATE TABLE IF NOT EXISTS invites(code_hash TEXT PRIMARY KEY,created_at INTEGER NOT NULL,batch TEXT NOT NULL,note TEXT,used_by TEXT,used_at INTEGER);CREATE INDEX IF NOT EXISTS invites_batch ON invites(batch);CREATE TABLE IF NOT EXISTS resets(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,created_at INTEGER NOT NULL,expires INTEGER NOT NULL,used_at INTEGER);');
  const relayRecords=installRelayRecords(db,{now});
  const normalizeCode=v=>typeof v==='string'?v.trim().toUpperCase().replaceAll('-',''):'';
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
  const publicUser=row=>row?{id:row.id,email:row.email,...(row.data_version?{dataVersion:row.data_version}:{})}:null;
  const limits=new Map();let active=0;
  function limit(ip){const time=now();for(const [k,v] of limits)if(v.until<=time)limits.delete(k);const item=limits.get(ip)||{count:0,until:time+15*60*1000};if(item.count>=12||!limits.has(ip)&&limits.size>=10000)throw fail('AUTH_RATE_LIMIT',429);item.count++;limits.set(ip,item);}
  function credentials(data){const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';const password=data.password;if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))throw fail('INVALID_EMAIL');if(typeof password!=='string'||password.length<8||password.length>128)throw fail('INVALID_PASSWORD');return {email,password};}
  function user(token){if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token))return null;return publicUser(db.prepare('SELECT u.id,u.email,u.data_version FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?').get(hash(token),now()));}
  async function enter(kind,data,ip){
    limit(ip);if(data.remember!==undefined&&typeof data.remember!=='boolean')throw fail('INVALID_REMEMBER');const {email,password}=credentials(data);if(active>=4)throw fail('AUTH_BUSY',503);active++;
    try{
      let account;
      if(kind==='register'){
        if(!/^[a-z0-9][a-z0-9._-]*@qq\.com$/.test(email))throw fail('QQ_EMAIL_REQUIRED');
        if(db.prepare('SELECT id FROM users WHERE email=?').get(email))throw fail('EMAIL_REGISTERED',409);
        const invite=normalizeCode(data.inviteCode);if(requireInvite&&!invite)throw fail('INVITE_REQUIRED');
        if(requireInvite&&!db.prepare('SELECT code_hash FROM invites WHERE code_hash=? AND used_by IS NULL').get(hash(invite)))throw fail('INVITE_INVALID');
        const salt=randomBytes(24).toString('hex'),digest=await passwordHash(password,salt);account={id:randomUUID(),email};
        try{transaction(()=>{if(requireInvite&&db.prepare('UPDATE invites SET used_by=?,used_at=? WHERE code_hash=? AND used_by IS NULL').run(account.id,now(),hash(invite)).changes!==1)throw fail('INVITE_INVALID');db.prepare('INSERT INTO users(id,email,salt,password_hash,created_at) VALUES(?,?,?,?,?)').run(account.id,email,salt,digest.toString('hex'),now());});}catch(e){if(e.code==='ERR_SQLITE_ERROR'&&db.prepare('SELECT id FROM users WHERE email=?').get(email))throw fail('EMAIL_REGISTERED',409);throw e;}
      }else{
        const row=db.prepare('SELECT * FROM users WHERE email=?').get(email);
        const digest=await passwordHash(password,row?.salt||'unregistered-account-dummy-salt');
        if(!row||!timingSafeEqual(digest,Buffer.from(row.password_hash,'hex'))||db.prepare('SELECT password_hash FROM users WHERE id=?').get(row.id)?.password_hash!==row.password_hash)throw fail('INVALID_CREDENTIALS',401);
        account=publicUser(row);
      }
      db.prepare('DELETE FROM sessions WHERE expires<=?').run(now());
      // Keep a bounded set of remembered devices per account.
      db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY expires DESC LIMIT 9)').run(account.id,account.id);
      const maxAge=data.remember===true?30*86400:7*86400;
      const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),account.id,now()+maxAge*1000);
      return {user:account,token,maxAge:data.remember===false?null:maxAge};
    }finally{active--;}
  }
  function generateInvites({count=1,batch='manual',note=''}={}){
    if(!Number.isInteger(count)||count<1||count>1000||typeof batch!=='string'||!batch.trim()||batch.length>100||typeof note!=='string'||note.length>500)throw fail('INVALID_INVITE_OPTIONS');
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',codes=[];
    transaction(()=>{for(let i=0;i<count;i++){let code;do{code=[...randomBytes(8)].map(n=>alphabet[n%alphabet.length]).join('');}while(db.prepare('SELECT 1 FROM invites WHERE code_hash=?').get(hash(code)));db.prepare('INSERT INTO invites(code_hash,created_at,batch,note) VALUES(?,?,?,?)').run(hash(code),now(),batch,note);codes.push(code.slice(0,4)+'-'+code.slice(4));}});return codes;
  }
  function inviteStats(batch=''){if(typeof batch!=='string'||batch.length>100)throw fail('INVALID_INVITE_OPTIONS');return db.prepare('SELECT batch,COUNT(*) AS total,SUM(CASE WHEN used_by IS NOT NULL THEN 1 ELSE 0 END) AS used FROM invites'+(batch?' WHERE batch=?':'')+' GROUP BY batch ORDER BY batch').all(...(batch?[batch]:[]));}
  function find(email){if(typeof email!=='string'||email.length>254)return null;const row=db.prepare('SELECT id,email,created_at,data_version FROM users WHERE email=?').get(String(email).trim().toLowerCase());return row?{...publicUser(row),registeredAt:new Date(row.created_at).toISOString()}:null;}
  function issueReset(email){const row=find(email);if(!row)return null;const token=randomBytes(32).toString('hex'),expires=now()+86400000;transaction(()=>{db.prepare('DELETE FROM resets WHERE user_id=? OR expires<=?').run(row.id,now());db.prepare('INSERT INTO resets(token_hash,user_id,created_at,expires) VALUES(?,?,?,?)').run(hash(token),row.id,now(),expires);});return {token,expires:new Date(expires).toISOString()};}
  function checkReset(token){return typeof token==='string'&&/^[a-f0-9]{64}$/.test(token)&&!!db.prepare('SELECT 1 FROM resets r JOIN users u ON u.id=r.user_id WHERE token_hash=? AND used_at IS NULL AND expires>?').get(hash(token),now());}
  async function applyReset({token,password},ip){limit(ip);if(!checkReset(token))throw fail('RESET_INVALID');if(typeof password!=='string'||password.length<8||password.length>128)throw fail('INVALID_PASSWORD');if(active>=4)throw fail('AUTH_BUSY',503);active++;try{const salt=randomBytes(24).toString('hex'),digest=await passwordHash(password,salt);transaction(()=>{const row=db.prepare('SELECT user_id FROM resets WHERE token_hash=? AND used_at IS NULL AND expires>?').get(hash(token),now());if(!row||db.prepare('UPDATE resets SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires>?').run(now(),hash(token),now()).changes!==1)throw fail('RESET_INVALID');db.prepare('UPDATE users SET salt=?,password_hash=? WHERE id=?').run(salt,digest.toString('hex'),row.user_id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id);});}finally{active--;}}
  async function maintain(token,{password,confirmation},kind,ip){limit(ip);const account=user(token);if(!account)throw fail('ACCOUNT_REQUIRED',401);if(confirmation!==(kind==='delete'?'删除账号':'重置数据'))throw fail('CONFIRMATION_REQUIRED');if(typeof password!=='string'||password.length<8||password.length>128)throw fail('INVALID_PASSWORD');if(active>=4)throw fail('AUTH_BUSY',503);active++;try{const row=db.prepare('SELECT * FROM users WHERE id=?').get(account.id),digest=await passwordHash(password,row.salt);if(!timingSafeEqual(digest,Buffer.from(row.password_hash,'hex')))throw fail('INVALID_CREDENTIALS',401);transaction(()=>{if(!user(token))throw fail('ACCOUNT_REQUIRED',401);db.prepare('DELETE FROM sessions WHERE user_id=?').run(account.id);db.prepare('DELETE FROM resets WHERE user_id=?').run(account.id);if(kind==='delete'){db.prepare('DELETE FROM relay_origins WHERE user_id=?').run(account.id);db.prepare('DELETE FROM users WHERE id=?').run(account.id);}else db.prepare('UPDATE users SET data_version=data_version+1 WHERE id=?').run(account.id);});}finally{active--;}}
  return {...relayRecords,enter,user,find,generateInvites,inviteStats,issueReset,checkReset,applyReset,maintain,registrationPolicy:()=>({inviteRequired:requireInvite}),revokeInvite(code){return db.prepare('DELETE FROM invites WHERE code_hash=? AND used_by IS NULL').run(hash(normalizeCode(code))).changes===1;},logout(token){if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));},close(){db.close();}};
}
