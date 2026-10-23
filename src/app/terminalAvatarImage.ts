/** Decode locally; fallback for browsers without a working createImageBitmap. */
async function imageSource(file:File):Promise<{image:CanvasImageSource;width:number;height:number;close:()=>void}>{
 if(typeof createImageBitmap==='function')try{const b=await createImageBitmap(file);return {image:b,width:b.width,height:b.height,close:()=>b.close()};}catch{/* Browser image decoder may support formats the bitmap API rejects. */}
 const url=URL.createObjectURL(file),image=new Image();
 try{await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('无法读取这张图片，请转换为 PNG、JPEG 或 WebP 后重试。'));image.src=url;});return {image,width:image.naturalWidth,height:image.naturalHeight,close:()=>URL.revokeObjectURL(url)};}catch(e){URL.revokeObjectURL(url);throw e;}
}
export async function terminalAvatarImage(file:File){
 if(!file.size||file.size>5*1024*1024||!(file.type.startsWith('image/')||!file.type&&/\.(?:png|jpe?g|webp|gif|avif|heic|heif)$/i.test(file.name)))throw Error('请选择5MB以内的图片文件。');
 const source=await imageSource(file);
 try{if(!source.width||!source.height||source.width*source.height>24000000)throw Error('图片尺寸不正确或超过2400万像素，请缩小后重试。');const canvas=document.createElement('canvas'),scale=Math.min(1,400/Math.max(source.width,source.height));canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(source.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw Error('当前浏览器无法处理头像，请换用系统浏览器重试。');ctx.drawImage(source.image,0,0,canvas.width,canvas.height);const result=canvas.toDataURL('image/webp',.85);if(!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(result)||result.length>1500000)throw Error('头像处理失败，请换一张图片重试。');return result;}finally{source.close();}
}
