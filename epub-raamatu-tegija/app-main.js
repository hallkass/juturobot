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
  const source=list.find(f=>/\.epub$/i.test(f.name))||list.find(f=>/\.docx$/i.test(f.name))||list.find(f=>/\.txt$/i.test(f.name));
  if(!source){showStatus(statusImport,"Vali vähemalt üks .epub, .docx või .txt fail.","err");return}
  if((state.chapters.length&&state.chapters.some(c=>c.body.trim()||c.images.length))||$("#bookTitle").value.trim()){
    if(!confirm("Import asendab praegused peatükid ja raamatu andmed. Kas jätkan?"))return;
  }
  const extras=list.filter(f=>f!==source&&f.type.startsWith("image/"));
  showStatus(statusImport,/\.epub$/i.test(source.name)?"Avan EPUB-i toimetamiseks…":"Impordin faili…");
  try{
    let result;
    if(/\.epub$/i.test(source.name))result=await importEpub(source);
    else if(/\.docx$/i.test(source.name))result=await importDocx(source,extras);
    else result=await importTxt(source,extras);

    // Eelmise raamatu kaas ei tohi uude imporditud raamatusse jääda.
    if(state.cover)setCover(null);
    applyImported(result);

    if(/\.epub$/i.test(source.name)){
      $("#fileName").dataset.manual="1";
      $("#fileName").value=source.name;
    }
    const miss=result.missing?.length?` Mõnda pilti ei õnnestunud importida: ${[...new Set(result.missing)].slice(0,5).join(", ")}${result.missing.length>5?" …":""}.`:"";
    const extra=result.importedFromEpub?" EPUB on nüüd redaktoris ja saad seda edasi muuta ning uuesti alla laadida. Keerukas algne kujundus võib importimisel lihtsustuda.":"";
    showStatus(statusImport,`Import valmis: ${result.chapters.length} peatükki.${extra}${miss}`,"ok");
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
