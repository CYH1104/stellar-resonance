import {resolve} from 'node:path';
import {createAccounts} from '../server/accounts.mjs';
const args=process.argv.slice(2),options={count:5,batch:'manual',note:''};let mode='generate',code='';
try{
 for(let i=0;i<args.length;i++){const a=args[i];if(['--count','--batch','--note','--revoke'].includes(a)){const v=args[++i];if(!v)throw Error('缺少参数值');if(a==='--count')options.count=Number(v);else if(a==='--batch')options.batch=v;else if(a==='--note')options.note=v;else{mode='revoke';code=v;}}else if(a==='--stats'||a==='--list')mode='stats';else if(a==='--help'){console.log('pnpm invites --count 5 --batch 2026-W43 [--note 备注]\npnpm invites --stats\npnpm invites --list --batch 2026-W43\npnpm invites --revoke XK7M-2Q9P');process.exit(0);}else throw Error('未知参数');}
 const accounts=await createAccounts({directory:resolve(import.meta.dirname,'../server/private/accounts')});
 try{if(mode==='generate'){console.log('明文仅本次显示，请立即复制保存：');for(const item of accounts.generateInvites(options))console.log(item);}else if(mode==='stats')console.table(accounts.inviteStats(options.batch==='manual'?'':options.batch));else console.log(accounts.revokeInvite(code)?'已撤销未使用的邀请码':'未撤销：不存在或已使用');}finally{accounts.close();}
}catch{console.error('邀请码操作失败，请检查参数，或使用 pnpm invites --help。');process.exitCode=1;}
