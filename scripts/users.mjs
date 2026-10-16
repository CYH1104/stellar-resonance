import {resolve} from 'node:path';
import {readAccountRecords} from '../server/account-records.mjs';

async function main(){
  const args=process.argv.slice(2);let email='',limit=100,json=false;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--json')json=true;
    else if(args[i]==='--email'&&args[i+1])email=args[++i];
    else if(args[i]==='--limit'&&args[i+1])limit=Number(args[++i]);
    else if(args[i]==='--help'){console.log('用法：pnpm users [--email 用户@qq.com] [--limit 100] [--json]\n默认显示最近 100 名注册用户，仅在服务器本机读取账号库。');return;}
    else throw Error('参数不正确，使用 pnpm users --help 查看用法。');
  }
  const file=resolve(import.meta.dirname,'../server/private/accounts/accounts.sqlite');
  const result=await readAccountRecords(file,{email,limit});
  if(json){console.log(JSON.stringify(result,null,2));return;}
  console.log(`注册用户：${result.total} 人，本次显示 ${result.users.length} 人。`);
  if(!result.users.length){console.log('暂无匹配记录。请确认注册已成功，且命令在实际运行服务的项目中执行。');return;}
  const time=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  console.table(result.users.map(user=>({'邮箱':user.email,'注册时间（北京时间）':time.format(new Date(user.registeredAt)),'用户 ID':user.id})));
}
main().catch(()=>{console.error('无法读取注册用户。请检查参数、当前服务器账号的文件权限，以及 server/private/accounts/accounts.sqlite 是否完整。');process.exitCode=1;});
