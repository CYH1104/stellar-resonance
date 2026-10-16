import {DatabaseSync} from 'node:sqlite';
import {mkdir,chmod} from 'node:fs/promises';
import {resolve} from 'node:path';
import {scrypt,randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt),hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(code,status=400)=>Object.assign(Error(code),{code,status});
const passwordHash=(password,salt)=>derive(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
export async function createAccounts({directory,now=Date.now}){
  await mkdir(directory,{recursive:true,mode:0o700});
  const db=new DatabaseSync(resolve(directory,'accounts.sqlite'));
  await chmod(resolve(directory,'accounts.sqlite'),0o600);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);');
  const limits=new Map();let active=0;
  function limit(ip){const time=now();for(const [k,v] of limits)if(v.until<=time)limits.delete(k);const item=limits.get(ip)||{count:0,until:time+15*60*1000};if(item.count>=12||!limits.has(ip)&&limits.size>=10000)throw fail('AUTH_RATE_LIMIT',429);item.count++;limits.set(ip,item);}
  function credentials(data){const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';const password=data.password;if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))throw fail('INVALID_EMAIL');if(typeof password!=='string'||password.length<8||password.length>128)throw fail('INVALID_PASSWORD');return {email,password};}
  function user(token){if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token))return null;const row=db.prepare('SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?').get(hash(token),now());return row?{id:row.id,email:row.email}:null;}
  async function enter(kind,data,ip){
    limit(ip);const {email,password}=credentials(data);if(active>=4)throw fail('AUTH_BUSY',503);active++;
    try{
      let account;
      if(kind==='register'){
        if(db.prepare('SELECT id FROM users WHERE email=?').get(email))throw fail('EMAIL_REGISTERED',409);
        const salt=randomBytes(24).toString('hex'),digest=await passwordHash(password,salt);account={id:randomUUID(),email};
        try{db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(account.id,email,salt,digest.toString('hex'),now());}catch(e){if(e.code==='ERR_SQLITE_ERROR'&&db.prepare('SELECT id FROM users WHERE email=?').get(email))throw fail('EMAIL_REGISTERED',409);throw e;}
      }else{
        const row=db.prepare('SELECT * FROM users WHERE email=?').get(email);
        const digest=await passwordHash(password,row?.salt||'unregistered-account-dummy-salt');
        if(!row||!timingSafeEqual(digest,Buffer.from(row.password_hash,'hex')))throw fail('INVALID_CREDENTIALS',401);
        account={id:row.id,email:row.email};
      }
      db.prepare('DELETE FROM sessions WHERE expires<=?').run(now());
      // Keep a bounded set of remembered devices per account.
      db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY expires DESC LIMIT 9)').run(account.id,account.id);
      const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),account.id,now()+7*86400000);
      return {user:account,token};
    }finally{active--;}
  }
  return {enter,user,logout(token){if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));},close(){db.close();}};
}
