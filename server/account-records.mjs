import {DatabaseSync} from 'node:sqlite';
import {access} from 'node:fs/promises';

// Server-side maintenance only. Never return password hashes or session tokens.
export async function readAccountRecords(file,{email='',limit=100}={}){
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('条数应为 1 至 1000。');
  try{await access(file);}catch(e){if(e.code==='ENOENT')return {total:0,users:[]};throw e;}
  const db=new DatabaseSync(file,{readOnly:true});
  try{
    db.exec('PRAGMA busy_timeout=5000');
    const normalized=email.trim().toLowerCase();
    const where=normalized?' WHERE email=?':'';
    const args=normalized?[normalized]:[];
    const total=db.prepare('SELECT COUNT(*) AS count FROM users'+where).get(...args).count;
    const users=db.prepare('SELECT id,email,created_at FROM users'+where+' ORDER BY created_at DESC,id LIMIT ?').all(...args,limit).map(row=>({id:row.id,email:row.email,registeredAt:new Date(row.created_at).toISOString()}));
    return {total,users};
  }finally{db.close();}
}
