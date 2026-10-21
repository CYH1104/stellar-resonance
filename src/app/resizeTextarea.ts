/** Measure a detached-from-layout copy so a long editor never collapses mid-input. */
export function resizeTextarea(element:HTMLTextAreaElement){
 const parent=element.parentElement,width=element.getBoundingClientRect().width;
 if(!parent||!width)return;
 const measure=element.cloneNode(false) as HTMLTextAreaElement;
 measure.removeAttribute('id');measure.removeAttribute('name');measure.disabled=true;measure.tabIndex=-1;measure.setAttribute('aria-hidden','true');
 measure.value=element.value;
 Object.assign(measure.style,{position:'fixed',left:'-100000px',top:'0',visibility:'hidden',pointerEvents:'none',boxSizing:'border-box',width:width+'px',height:'0px',minHeight:'0px',maxHeight:'none',overflow:'hidden'});
 try{
  parent.appendChild(measure);
  const style=getComputedStyle(element);
  const height=Math.ceil(measure.scrollHeight+(parseFloat(style.borderTopWidth)||0)+(parseFloat(style.borderBottomWidth)||0))+'px';
  if(element.style.height!==height)element.style.height=height;
 }finally{measure.remove();}
}
