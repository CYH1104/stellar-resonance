/** HTTP deployments may not expose the async clipboard API. */
export async function copyText(text:string){
 try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return;}}catch{}
 const active=document.activeElement,field=document.createElement('textarea');field.value=text;field.setAttribute('readonly','');field.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';document.body.append(field);
 try{field.select();if(!document.execCommand('copy'))throw Error('复制失败，请展开日志后手动复制。');}
 finally{field.remove();if(active instanceof HTMLElement)active.focus({preventScroll:true});}
}
