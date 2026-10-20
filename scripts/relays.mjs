import {resolve} from 'node:path';
import {readRelayRecords} from '../server/relay-records.mjs';

const args=process.argv.slice(2);
if(args.length>2){console.error('用法：node scripts/relays.mjs [邮箱] [账号目录]');process.exitCode=1;}
else{
  const file=resolve(args[1]||resolve(import.meta.dirname,'../server/private/accounts'),'accounts.sqlite');
  try{const rows=await readRelayRecords(file,{email:args[0]||''});console.table(rows);console.log('仅显示已记录的接口域名及端口，不包含密钥；最多显示最近 200 条地址记录。');}catch{console.error('无法读取接口记录，请检查账号目录及数据库权限。');process.exitCode=1;}
}
