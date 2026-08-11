function previewBook(){
  const title=$("#bookTitle").value.trim()||"Pealkirjata raamat";
  const author=$("#author").value.trim();
  let x=`<h1>${esc(title)}</h1>${author?`<div class="author">${esc(author)}</div>`:""}`;
  if(state.cover)x+=`<div class="cover"><img src="${state.cover.url}" alt=""></div>`;
  for(const ch of state.chapters)x+=`<h2>${esc(ch.title||"Peatükk")}</h2>${renderChapterBody(ch,new Map(),true)}`;
  $("#bookPreview").innerHTML=x;$("#previewModal").classList.add("show");
}

$("#bookTitle").addEventListener("input",autoFileName);
$("#fileName").addEventListener("input",()=>$("#fileName").dataset.manual="1");
$("#coverInput").addEventListener("change",e=>{const f=e.target.files?.[0];if(f)setCover(makeAsset(f,f.name,""))});
$("#removeCover").addEventListener("click",()=>setCover(null));
$("#addChapter").addEventListener("click",()=>{state.chapters.push(newChapter("Peatükk "+(state.chapters.length+1),""));renderChapters();setTimeout(()=>window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"}),0)});
$("#previewBook").addEventListener("click",previewBook);
$("#closePreview").addEventListener("click",()=>$("#previewModal").classList.remove("show"));
$("#previewModal").addEventListener("click",e=>{if(e.target.id==="previewModal")e.currentTarget.classList.remove("show")});

async function handleImport(files){
  clearStatus(statusImport);const list=[...files];
  const source=list.find(f=>/\.docx$/i.test(f.name))||list.find(f=>/\.txt$/i.test(f.name));
  if(!source){showStatus(statusImport,"Vali vähemalt üks .txt või .docx fail.","err");return}
  if((state.chapters.length&&state.chapters.some(c=>c.body.trim()||c.images.length))||$("#bookTitle").value.trim()){
    if(!confirm("Import asendab praegused peatükid ja võib asendada raamatu andmed. Kas jätkan?"))return;
  }
  const extras=list.filter(f=>f!==source&&f.type.startsWith("image/"));showStatus(statusImport,"Impordin faili…");
  try{
    const result=/\.docx$/i.test(source.name)?await importDocx(source,extras):await importTxt(source,extras);
    applyImported(result);
    const miss=result.missing?.length?` Puudu jäid pildid: ${[...new Set(result.missing)].join(", ")}.`:"";
    showStatus(statusImport,`Import valmis: ${result.chapters.length} peatükki.${miss}`,"ok");
  }catch(err){console.error(err);showStatus(statusImport,"Import ebaõnnestus: "+err.message,"err")}
}
$("#importFiles").addEventListener("change",e=>{if(e.target.files?.length)handleImport(e.target.files)});
const dz=$("#dropZone");
["dragenter","dragover"].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.add("drag")}));
["dragleave","drop"].forEach(n=>dz.addEventListener(n,e=>{e.preventDefault();dz.classList.remove("drag")}));
dz.addEventListener("drop",e=>{if(e.dataTransfer.files?.length)handleImport(e.dataTransfer.files)});

$("#exportEpub").addEventListener("click",async()=>{
  clearStatus(statusExport);showStatus(statusExport,"Koostan EPUB-faili…");
  try{
    const bytes=await buildEpub();let name=$("#fileName").value.trim()||safeFileBase($("#bookTitle").value)+".epub";
    if(!/\.epub$/i.test(name))name+=".epub";
    const blob=new Blob([bytes],{type:"application/epub+zip"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    showStatus(statusExport,`Valmis: ${name} (${(bytes.length/1024/1024).toFixed(2)} MB).`,"ok");
  }catch(err){console.error(err);showStatus(statusExport,"EPUB-i loomine ebaõnnestus: "+err.message,"err")}
});

state.chapters.push(newChapter("Esimene peatükk",""));renderChapters();renderCover();autoFileName();
