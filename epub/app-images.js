/* =========================================================
   Piltide lohistamine / kleepimine otse peatüki teksti sisse
   ========================================================= */

function insertImageAssetsAt(ch,assets,start,end){
  if(!assets.length)return {count:0,caret:start};

  // Pilt hoitakse omaette real. Pärast viimast pilti jääb vähemalt üks
  // reavahetus, et järgmise pildi saaks kohe samasse kohta järjest lohistada.
  const before=ch.body.slice(0,start);
  const after=ch.body.slice(end);
  const prefix=before && !before.endsWith("\n") ? "\n\n" : "";
  const tokens=assets.map(asset=>{
    ch.images.push(asset);
    return `[[PILT:${asset.id}]]`;
  }).join("\n\n");
  const suffix=after.startsWith("\n") ? "\n" : "\n\n";
  const insertion=prefix+tokens+suffix;

  ch.body=before+insertion+after;
  return {count:assets.length,caret:before.length+insertion.length};
}

// Arvutab kursori tegeliku vertikaalse asukoha textarea sees, arvestades ka
// Chrome'i automaatset reamurdmist. Selleks tehakse hetkeks nähtamatu peegel.
function caretOffsetTop(textarea,caret){
  const cs=getComputedStyle(textarea);
  const mirror=document.createElement("div");
  const props=[
    "fontFamily","fontSize","fontWeight","fontStyle","letterSpacing","lineHeight",
    "textTransform","textIndent","wordSpacing","tabSize","paddingTop","paddingRight",
    "paddingBottom","paddingLeft","borderTopWidth","borderRightWidth","borderBottomWidth",
    "borderLeftWidth","boxSizing"
  ];
  for(const p of props)mirror.style[p]=cs[p];
  mirror.style.position="absolute";
  mirror.style.visibility="hidden";
  mirror.style.pointerEvents="none";
  mirror.style.left="-100000px";
  mirror.style.top="0";
  mirror.style.width=textarea.offsetWidth+"px";
  mirror.style.whiteSpace="pre-wrap";
  mirror.style.overflowWrap="break-word";
  mirror.style.wordBreak="break-word";
  mirror.style.overflow="hidden";

  const before=document.createTextNode(textarea.value.slice(0,caret));
  const marker=document.createElement("span");
  marker.textContent="\u200b";
  mirror.append(before,marker);
  document.body.appendChild(mirror);
  const top=marker.offsetTop;
  mirror.remove();
  return top;
}

function scrollTextareaToCaret(textarea,caret){
  // Hoia viimati lisatud pilt/kursor nähtava ala keskosa lähedal. Nii saab
  // kasutaja kohe järgmise pildi lohistada, ilma tekstis tagasi otsimata.
  const caretTop=caretOffsetTop(textarea,caret);
  const target=Math.max(0,caretTop-textarea.clientHeight*0.58);
  textarea.scrollTop=target;
}

function restoreEditorAfterRender(ch,oldTextarea,caret){
  const pageX=window.scrollX;
  const pageY=window.scrollY;

  renderChapters();

  const restore=()=>{
    const fresh=document.querySelector(`.chapter[data-id="${ch.id}"] .ch-body`);
    if(!fresh)return;
    const pos=Math.max(0,Math.min(caret,fresh.value.length));
    try{fresh.focus({preventScroll:true})}catch(e){fresh.focus()}
    fresh.setSelectionRange(pos,pos);
    scrollTextareaToCaret(fresh,pos);
    // Tekstiala kerib ise viimati lisatud pildi juurde, kuid kogu veebileht
    // jääb samasse kohta ega hüppa Chrome'is fookuse tõttu üles.
    window.scrollTo(pageX,pageY);
  };

  restore();
  requestAnimationFrame(restore);
  setTimeout(restore,0);
}

function webImageName(url,type=""){
  try{
    const u=new URL(url,location.href);
    let name=decodeURIComponent(u.pathname.split("/").pop()||"").split("?")[0];
    if(name&&/\.[a-z0-9]{2,5}$/i.test(name))return name;
  }catch(e){}
  const ext=({"image/jpeg":"jpg","image/png":"png","image/gif":"gif","image/webp":"webp","image/svg+xml":"svg"}[type]||"jpg");
  return `veebipilt-${Date.now()}.${ext}`;
}

async function fetchWebImage(url){
  if(!/^(https?:|data:image\/)/i.test(url||""))throw new Error("Pildi aadress peab algama http://, https:// või data:image/.");
  let response;
  try{
    response=await fetch(url,{mode:"cors",credentials:"omit",referrerPolicy:"no-referrer"});
  }catch(err){
    const e=new Error("Veebileht ei luba brauseril seda pilti otse kopeerida (CORS). Proovi pildil „Copy image” ja kleebi see siia Ctrl/Cmd+V-ga või salvesta pilt esmalt arvutisse.");
    e.cause=err;throw e;
  }
  if(!response.ok)throw new Error(`Pildi laadimine ebaõnnestus (${response.status}).`);
  let blob=await response.blob();
  let type=blob.type||mimeFromName(url);
  if(!type.startsWith("image/")){
    const guessed=mimeFromName(url);
    if(!guessed.startsWith("image/"))throw new Error("Antud aadress ei tagastanud pildifaili.");
    blob=new Blob([blob],{type:guessed});type=guessed;
  }
  return makeAsset(blob,webImageName(url,type),"");
}

function draggedImageUrls(dt){
  const urls=[],seen=new Set();
  const add=value=>{
    const u=String(value||"").trim();
    if(!u||seen.has(u)||!/^(https?:|data:image\/)/i.test(u))return;
    seen.add(u);urls.push(u);
  };
  const html=dt?.getData?.("text/html")||"";
  if(html){
    try{
      const doc=new DOMParser().parseFromString(html,"text/html");
      for(const img of doc.querySelectorAll("img"))add(img.getAttribute("src")||img.currentSrc);
    }catch(e){}
  }
  const uriList=dt?.getData?.("text/uri-list")||"";
  for(const line of uriList.split(/\r?\n/))if(!line.startsWith("#"))add(line);
  const plain=dt?.getData?.("text/plain")||"";
  for(const piece of plain.split(/\s+/))add(piece);
  return urls;
}

function transferHasPossibleImage(dt){
  if(!dt)return false;
  if([...(dt.files||[])].some(f=>f.type.startsWith("image/")))return true;
  const types=[...(dt.types||[])];
  return types.includes("text/html")||types.includes("text/uri-list");
}

async function assetsFromTransfer(dt){
  const assets=[];
  const files=[...(dt?.files||[])].filter(f=>f.type.startsWith("image/"));
  for(const f of files)assets.push(makeAsset(f,f.name,""));
  if(assets.length)return assets;
  const urls=draggedImageUrls(dt);
  const errors=[];
  for(const url of urls){
    try{assets.push(await fetchWebImage(url))}catch(err){errors.push(err.message)}
  }
  if(!assets.length&&errors.length)throw new Error(errors[0]);
  return assets;
}

function enhanceChapterImageDrops(){
  for(const card of document.querySelectorAll(".chapter")){
    if(card.dataset.imageDropReady==="1")continue;
    card.dataset.imageDropReady="1";
    const ch=state.chapters.find(x=>x.id===card.dataset.id);
    const ta=card.querySelector(".ch-body");
    if(!ch||!ta)continue;

    const row=ta.nextElementSibling;
    const hint=document.createElement("div");
    hint.className="drop-image-hint";
    hint.textContent="Lohista pilt või mitu pilti otse siia teksti sisse. Toimib kettalt; veebist/Facebookist proovitakse pilt EPUB-i sisse kopeerida. Pildi saab ka kopeerida ja Ctrl/Cmd+V-ga kleepida.";
    ta.insertAdjacentElement("afterend",hint);

    if(row&&row.classList.contains("row")){
      const webBtn=document.createElement("button");
      webBtn.type="button";webBtn.className="btn small";webBtn.textContent="+ Veebipilt URL-ist";
      webBtn.addEventListener("click",async()=>{
        const raw=prompt("Kleebi pildi otselink (https://…):");
        if(!raw)return;
        const start=ta.selectionStart??ch.body.length,end=ta.selectionEnd??start;
        try{
          const asset=await fetchWebImage(raw.trim());
          const result=insertImageAssetsAt(ch,[asset],start,end);
          restoreEditorAfterRender(ch,ta,result.caret);
        }catch(err){alert(err.message)}
      });
      row.insertBefore(webBtn,row.querySelector(".hint")||null);
    }

    ta.addEventListener("dragenter",ev=>{
      if(transferHasPossibleImage(ev.dataTransfer)){ev.preventDefault();ta.classList.add("image-drop-target")}
    });
    ta.addEventListener("dragover",ev=>{
      if(transferHasPossibleImage(ev.dataTransfer)){
        ev.preventDefault();if(ev.dataTransfer)ev.dataTransfer.dropEffect="copy";
        ta.classList.add("image-drop-target");
      }
    });
    ta.addEventListener("dragleave",()=>ta.classList.remove("image-drop-target"));
    ta.addEventListener("drop",async ev=>{
      if(!transferHasPossibleImage(ev.dataTransfer))return;
      ev.preventDefault();ta.classList.remove("image-drop-target");
      const start=ta.selectionStart??ch.body.length,end=ta.selectionEnd??start;
      try{
        const assets=await assetsFromTransfer(ev.dataTransfer);
        if(!assets.length){alert("Lohistatud objektist ei leitud pilti.");return}
        const result=insertImageAssetsAt(ch,assets,start,end);
        restoreEditorAfterRender(ch,ta,result.caret);
      }catch(err){alert(err.message)}
    });

    ta.addEventListener("paste",async ev=>{
      const files=[...(ev.clipboardData?.files||[])].filter(f=>f.type.startsWith("image/"));
      const html=ev.clipboardData?.getData("text/html")||"";
      if(!files.length&&!/<img\b/i.test(html))return;
      ev.preventDefault();
      const start=ta.selectionStart??ch.body.length,end=ta.selectionEnd??start;
      try{
        const assets=await assetsFromTransfer(ev.clipboardData);
        if(!assets.length){alert("Lõikelaualt ei leitud pilti.");return}
        const result=insertImageAssetsAt(ch,assets,start,end);
        restoreEditorAfterRender(ch,ta,result.caret);
      }catch(err){alert(err.message)}
    });
  }
}

// renderChapters on juba app-ui.js failis olemas. Mähime selle nii,
// et uued peatükid saavad automaatselt lohistamise/kleepimise toe.
const renderChaptersBase=renderChapters;
renderChapters=function(){
  renderChaptersBase();
  enhanceChapterImageDrops();
};
