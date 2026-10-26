import {ref,watch,type WatchSource} from 'vue';
const blobs=new WeakMap<Blob,Promise<Blob>>();
/** Display derivative only. The original blob/data URL remains the saved/exported image. */
export function previewBlob(original:Blob,size=256):Promise<Blob>{
 if(size===256&&blobs.has(original))return blobs.get(original)!;
 const job=(async()=>{if(typeof createImageBitmap!=='function'||!['image/jpeg','image/png','image/webp'].includes(original.type))return original;
 let bitmap:ImageBitmap|undefined;try{bitmap=await createImageBitmap(original);const scale=Math.min(1,size/Math.max(bitmap.width,bitmap.height));if(scale===1)return original;const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');if(!ctx)return original;ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);return await new Promise<Blob>(resolve=>canvas.toBlob(value=>resolve(value||original),'image/webp',.86));}catch{return original;}finally{bitmap?.close();}})();if(size===256)blobs.set(original,job);return job;
}
export function useImagePreview(source:WatchSource<string|undefined>){const display=ref('');watch(source,async(value,_,cleanup)=>{let active=true,url='';cleanup(()=>{active=false;if(url)URL.revokeObjectURL(url);});display.value=value||'';if(!value?.startsWith('data:image/')||typeof createImageBitmap!=='function')return;try{const original=await (await fetch(value)).blob(),preview=await previewBlob(original);if(active&&preview!==original){url=URL.createObjectURL(preview);display.value=url;}}catch{/* keep original */}},{immediate:true});return display;}
