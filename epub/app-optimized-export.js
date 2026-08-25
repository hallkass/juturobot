const EPUB_IMAGE_OPTIMIZE={chapterMax:1800,coverMax:2560,jpegQuality:.80};
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
    /* Brauseri uuesti kodeeritud fail võib mõne juba hästi pakitud JPEG-i või PNG puhul
       tulla originaalist suurem. Optimeeritud EPUB ei tohi seetõttu kunagi kasvada:
       kasutame uut pilti ainult siis, kui selle baitide arv on päriselt väiksem. */
    if(candidate.size>=originalBytes)return unchanged();
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
    const imageInfo=info&&info.totalImages?` Pildid: ${mb(info.originalBytes)} MB → ${mb(info.finalBytes)} MB; muudetud ${info.changedImages}/${info.totalImages}; sääst ${mb(Math.max(0,info.originalBytes-info.finalBytes))} MB.`:"";
    showStatus(statusExport,`Valmis: ${name} (${mb(bytes.length)} MB).${imageInfo} Brauseris olevad originaalpildid jäid puutumata.`,"ok");
  }catch(err){console.error(err);showStatus(statusExport,"Optimeeritud EPUB-i loomine ebaõnnestus: "+err.message,"err")}
  finally{if(btn)btn.disabled=false;if(originalBtn)originalBtn.disabled=false}
}
function installOptimizedExportUi(){
  const originalBtn=$("#exportEpub");if(!originalBtn||$("#exportEpubOptimized"))return;
  const amazonBtn=document.querySelector('a[href*="kdp.amazon.com"]');
  const amazonHint=amazonBtn?.nextElementSibling?.classList?.contains("hint")?amazonBtn.nextElementSibling:null;
  const btn=document.createElement("button");btn.className="btn full";btn.style.marginTop="9px";btn.id="exportEpubOptimized";btn.type="button";btn.textContent="Loo optimeeritud EPUB";
  if(amazonHint)amazonHint.insertAdjacentElement("afterend",btn);else originalBtn.insertAdjacentElement("afterend",btn);
  const note=document.createElement("div");note.className="hint optimized-export-note";
  note.innerHTML=`Vähendab ainult salvestatavas EPUB-is suuri pilte (sisupildid kuni ${EPUB_IMAGE_OPTIMIZE.chapterMax} px, JPEG ${Math.round(EPUB_IMAGE_OPTIMIZE.jpegQuality*100)}%). Originaalid jäävad brauserisse. Kasuta eelkõige valmis raamatu puhul; hiljem uuesti avades on optimeeritud EPUB-i pildid juba vähendatud.`;
  btn.insertAdjacentElement("afterend",note);
  btn.addEventListener("click",exportOptimizedEpub);
}
installOptimizedExportUi();
