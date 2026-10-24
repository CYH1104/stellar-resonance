export interface CloudTransportError extends Error {code?:string;upstreamStatus?:number;cloudDetail?:string;cloudStep?:string}
export function createCloudBackup(fetchImpl?:typeof fetch,signal?:AbortSignal):(data:{provider:string;token:string;repository:string;action:string;file?:string;text?:string})=>Promise<any>;
