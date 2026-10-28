export const nativePresetTasks={story:'正文',memory:'记忆',terminal:'终端',persona:'人设辅助','random-event':'随机事件',forum:'论坛',summary:'总结',suggestions:'建议'} as const;
export type NativePresetTask=keyof typeof nativePresetTasks;
export function nativeTaskForRequest(path:string,body:any):NativePresetTask|undefined{return ({generate:'story','personal-terminal':'terminal',memory:'memory',persona:'persona','random-event':'random-event','forum-reply':'forum',utility:body?.task} as Record<string,NativePresetTask>)[path];}
