const old=['身份验证通过。欢迎您，星穹联合军事学院第578期新生。','正在为您接入校园迎新网络...','连接成功。'];
export function defaultGreeting(lines){return Array.isArray(lines)&&lines.length===old.length&&lines.every((line,i)=>line===old[i])?old.map(line=>'**“'+line+'”**'):lines;}
