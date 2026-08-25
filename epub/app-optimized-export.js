const EPUB_IMAGE_OPTIMIZE={chapterMax:2000,coverMax:2560,jpegQuality:.85};
const buildEpubOriginalImages=buildEpub;

function normalizedEpubImageType(asset){
  const type=String(asset?.type||asset?.blob?.type||"").toLowerCase();
  if(type==="image/jpg")return "image/jpeg";
  if(type.startsWith("image/"))return type;
  return mimeFromName(asset?.name||"");
}
function canvasToBlob(canvas,type,quality){
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Pildi pakkimine ebaõnnestus.")),type,quality));
}
async function decodeEpubImage(blob){
  if(typeof createImageBitmap==="function"){
    try{return await createImageBitmap(blob,{imageOrientation:"from-image"})}catch(e){try{return await createImageBitmap(blob)}catch(e2){}}
  }
  return await new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(blob),img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Pildi avamine ebaõnnestus."))};
    img.src=url;
  });
}
async function optimizeEpubImageBlob(asset,maxLong){
  const originalBlob=asset?.blob,type=normalizedEpubImageType(asset),originalBytes=originalBlob?.size||0;
  const unchanged=()=>({blob:originalBlob,changed:false,originalBytes,finalBytes:originalBytes});
  if(!originalBlob||!(["image/jpeg","image/png"].includes(type)))return unchanged();
  let source;
  try{
    source=await decodeEpubImage(originalBlob);
    const width=source.width||source.naturalWidth,height=source.height||source.naturalHeight;
    if(!width||!height)return unchanged();
    const scale=Math.min(1,maxLong/Math.max(width,height));
    const targetWidth=Math.max(1,Math.round(width*scale)),targetHeight=Math.max(1,Math.round(height*scale));
    const mustResize=targetWidth!==width||targetHeight!==height;
    if(type==="image/png"&&!mustResize)return unchanged();
    const canvas=document.createElement("canvas");canvas.width=targetWidth;canvas.height=targetHeight;
    const ctx=canvas.getContext("2d");if(!ctx)return unchanged();
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
    ctx.drawImage(source,0,0,targetWidth,targetHeight);
    const candidate=await canvasToBlob(canvas,type,type==="image/jpeg"?EPUB_IMAGE_OPTIMIZE.jpegQuality:undefined);
    if(!mustResize&&candidate.size>=originalBytes)return unchanged();
    return {blob:candidate,changed:true,originalBytes,finalBytes:candidate.size};
  }catch(err){
    console.warn("Pildi optimeerimine jäeti vahele:",asset?.name||"pilt",err);
    return unchanged();
  }finally{
    try{source?.close?.()}catch(e){}
  }
}
async function buildOptimizedBlobMap(onProgress){
  const jobs=new Map();
  if(state.cover?.blob)jobs.set(state.cover.blob,{asset:state.cover,maxLong:EPUB_IMAGE_OPTIMIZE.coverMax});
  for(const ch of state.chapters)for(const img of ch.images||[]){
    if(!img?.blob)continue;
    const existing=jobs.get(img.blob);
    if(!existing)jobs.set(img.blob,{asset:img,maxLong:EPUB_IMAGE_OPTIMIZE.chapterMax});
  }
  const replacements=new Map();let originalBytes=0,finalBytes=0,changedImages=0,index=0;
  for(const [originalBlob,job] of jobs){
    index++;onProgress?.(index,jobs.size);
    const result=await optimizeEpubImageBlob(job.asset,job.maxLong);
    originalBytes+=result.originalBytes;finalBytes+=result.finalBytes;
    if(result.changed){replacements.set(originalBlob,result.blob);changedImages++}
  }
  return {replacements,originalBytes,finalBytes,changedImages,totalImages:jobs.size};
}
buildEpub=async function(options={}){
  if(options?.optimizeImages!==true)return await buildEpubOriginalImages();
  const prepared=await buildOptimizedBlobMap(options.onProgress);
  const originalBlobBytes=blobBytes;
  blobBytes=async function(blob){return await originalBlobBytes(prepared.replacements.get(blob)||blob)};
  try{
    const bytes=await buildEpubOriginalImages();
    window.lastOptimizedEpubInfo={...prepared,epubBytes:bytes.length};
    return bytes;
  }finally{blobBytes=originalBlobBytes}
};

function optimizedEpubName(){
  let name=$("#fileName").value.trim()||safeFileBase($("#bookTitle").value)+".epub";
  if(!/\.epub$/i.test(name))name+=".epub";
  return name.replace(/\.epub$/i,"-optimeeritud.epub");
}
function mb(bytes){return (bytes/1024/1024).toFixed(2)}
async function exportOptimizedEpub(){
  const btn=$("#exportEpubOptimized"),originalBtn=$("#exportEpub");
  clearStatus(statusExport);showStatus(statusExport,"Valmistan pildid optimeerimiseks…");
  if(btn)btn.disabled=true;if(originalBtn)originalBtn.disabled=true;
  try{
    const bytes=await buildEpub({optimizeImages:true,onProgress:(n,total)=>showStatus(statusExport,`Optimeerin pilte ${n}/${total} ja koostan EPUB-faili…`)});
    const name=optimizedEpubName(),blob=new Blob([bytes],{type:"application/epub+zip"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    const info=window.lastOptimizedEpubInfo;
    const imageInfo=info&&info.totalImages?` Pildid: ${mb(info.originalBytes)} MB → ${mb(info.finalBytes)} MB; muudetud ${info.changedImages}/${info.totalImages}.`:"";
    showStatus(statusExport,`Valmis: ${name} (${mb(bytes.length)} MB).${imageInfo} Brauseris olevad originaalpildid jäid puutumata.`,"ok");
  }catch(err){console.error(err);showStatus(statusExport,"Optimeeritud EPUB-i loomine ebaõnnestus: "+err.message,"err")}
  finally{if(btn)btn.disabled=false;if(originalBtn)originalBtn.disabled=false}
}
function installOptimizedExportUi(){
  const originalBtn=$("#exportEpub");if(!originalBtn||$("#exportEpubOptimized"))return;
  const btn=document.createElement("button");btn.className="btn full";btn.style.marginTop="9px";btn.id="exportEpubOptimized";btn.type="button";btn.textContent="Loo optimeeritud EPUB";
  originalBtn.insertAdjacentElement("afterend",btn);
  const note=document.createElement("div");note.className="note optimized-export-note";
  note.innerHTML=`<strong>Optimeeritud EPUB:</strong> vähendab pilte ainult salvestamise ajal. Sisupildi pikem külg piiratakse kuni ${EPUB_IMAGE_OPTIMIZE.chapterMax} px-ni, kaanepilt kuni ${EPUB_IMAGE_OPTIMIZE.coverMax} px-ni ning JPEG-fotod salvestatakse kvaliteediga ${Math.round(EPUB_IMAGE_OPTIMIZE.jpegQuality*100)}%. Brauseris olevad originaalfotod jäävad alles kuni lehe sulgemiseni. „Automaatne”, „Väike” ja „Suur” kuvamisvalikud ei muutu.<br><br>Kasuta seda eelkõige siis, kui raamat on valmis: kui avad optimeeritud EPUB-faili hiljem uuesti redaktoris, on selles olevad pildid juba optimeeritud.`;
  btn.insertAdjacentElement("afterend",note);
  btn.addEventListener("click",exportOptimizedEpub);
}
installOptimizedExportUi();
