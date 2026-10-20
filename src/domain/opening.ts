const original=['身份验证通过。欢迎您，星穹联合军事学院第578期新生。','正在为您接入校园迎新网络...','连接成功。'];
const demo=['欢迎您，星港体验站第1位访客。','你带着登记资料来到接待大厅。值班人员正在整理桌面，窗外是安静的星港。你可以先观察环境，或走到服务台询问。','这是用于测试网页功能的虚构世界，不包含作者正式人设与世界观。'];
export const defaultOpening=original.map(line=>'**“'+line+'”**').join('\n');
export function normalizeDefaultOpening(text:string){const value=text.trim();return [original.join('\n'),demo.join('\n')].includes(value)?defaultOpening:text;}
