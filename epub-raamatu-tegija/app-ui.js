/* =========================================================
   Peatükkide UI
   ========================================================= */

function renderChapters(){
  chaptersEl.innerHTML="";
  state.chapters.forEach((ch,index)=>{
    const card=document.createElement("div");
    card.className="card chapter";
    card.dataset.id=ch.id;
    card.innerHTML=`
      <div class="chapter-head">
        <div class="chapter-number">${index+1}</div>
        <div class="chapter-title">Peatükk ${index+1}</div>
        <div class="chapter-tools">
          <button class="btn small" type="button" data-act="up" title="Liiguta üles">↑</button>
          <button class="btn small" type="button" data-act="down" title="Liiguta alla">↓</button>
          <button class="btn small danger" type="button" data-act="delete">Kustuta</button>
        </div>
      </div>
      <label>Peatüki / loo pealkiri</label>
      <input type="text" class="ch-title" value="${esc(ch.title)}" placeholder="Peatüki pealkiri">
      <div style="height:9px"></div>
      <label>Tekst</label>
      <textarea class="ch-body" placeholder="Kirjuta peatüki tekst siia...">${esc(ch.body)}</textarea>
      <div class="row" style="margin-top:9px">
        <button class="btn small" type="button" data-act="add-image">+ Lisa pilt kursori juurde</button>
        <span class="hint">${ch.images.length?ch.images.length+" pilti":"Pilte pole"}</span>
      </div>
      <div class="image-tray"></div>
    `;
    const titleInput=card.querySelector(".ch-title");
    const bodyInput=card.querySelector(".ch-body");
    titleInput.addEventListener("input",()=>ch.title=titleInput.value);
    bodyInput.addEventListener("input",()=>ch.body=bodyInput.value);

    card.addEventListener("click",async ev=>{
      const btn=ev.target.closest("[data-act]"); if(!btn)return;
      const act=btn.dataset.act;
      if(act==="delete"){
        if(confirm("Kas kustutan selle peatüki?")){
          ch.images.forEach(revokeAsset);
          state.chapters=state.chapters.filter(x=>x.id!==ch.id);
          renderChapters();
        }
      }else if(act==="up"&&index>0){
        [state.chapters[index-1],state.chapters[index]]=[state.chapters[index],state.chapters[index-1]];renderChapters();
      }else if(act==="down"&&index<state.chapters.length-1){
        [state.chapters[index+1],state.chapters[index]]=[state.chapters[index],state.chapters[index+1]];renderChapters();
      }else if(act==="add-image"){
        const posStart=bodyInput.selectionStart??ch.body.length, posEnd=bodyInput.selectionEnd??posStart;
        const inp=document.createElement("input"); inp.type="file"; inp.accept="image/*"; inp.multiple=true;
        inp.onchange=()=>{ if(inp.files?.length) addImagesAt(ch,[...inp.files],posStart,posEnd); };
        inp.click();
      }
    });

    const tray=card.querySelector(".image-tray");
    ch.images.forEach(img=>{
      const item=document.createElement("div"); item.className="thumb";
      item.innerHTML=`
        <img src="${img.url}" alt="">
        <div class="name" title="${esc(img.name)}">${esc(img.name)}</div>
        <label style="margin-top:6px">Pildiallkiri</label>
        <input type="text" value="${esc(img.caption||"")}" placeholder="Pildiallkiri">
        <div class="row" style="margin-top:7px">
          <button class="btn small" type="button" data-insert="${img.id}">Sisesta</button>
          <button class="btn small danger" type="button" data-remove="${img.id}">Eemalda</button>
        </div>
      `;
      item.querySelector("input").addEventListener("input",e=>img.caption=e.target.value);
      item.querySelector("[data-insert]").addEventListener("click",()=>{
        const token=`[[PILT:${img.id}]]`;
        const s=bodyInput.selectionStart??ch.body.length,e=bodyInput.selectionEnd??s;
        ch.body=ch.body.slice(0,s)+token+ch.body.slice(e);
        renderChapters();
        setTimeout(()=>{
          const fresh=document.querySelector(`.chapter[data-id="${ch.id}"] .ch-body`);
          if(fresh){fresh.focus();fresh.selectionStart=fresh.selectionEnd=s+token.length}
        },0);
      });
      item.querySelector("[data-remove]").addEventListener("click",()=>{
        const token=`[[PILT:${img.id}]]`;
        ch.body=ch.body.split(token).join("");
        ch.images=ch.images.filter(x=>x.id!==img.id); revokeAsset(img); renderChapters();
      });
      tray.appendChild(item);
    });
    chaptersEl.appendChild(card);
  });
}

function addImagesAt(ch,files,start,end){
  let insert="";
  for(const f of files){
    const a=makeAsset(f,f.name,""); ch.images.push(a);
    insert += (insert?"\n\n":"")+`[[PILT:${a.id}]]`;
  }
  ch.body=ch.body.slice(0,start)+insert+ch.body.slice(end);
  renderChapters();
}

/* =========================================================
   Märgistatud TXT parser
   ========================================================= */

function parseMarker(line){
  const m=String(line).trim().match(/^#(pealkiri|autor|keel|peatükk|peatukk|lugu|pilt|kaanepilt)\s*:?\s*(.*)$/i);
  if(!m)return null;
  let key=m[1].toLowerCase();
  if(key==="peatukk")key="peatükk";
  return {key,value:m[2].trim()};
}
function splitImageMarker(v){
  const [name,...rest]=v.split("|");
  return {name:(name||"").trim(),caption:rest.join("|").trim()};
}
function fileMap(files){
  const m=new Map();
  for(const f of files)m.set(f.name.toLowerCase(),f);
  return m;
}

async function importTxt(source,extras){
  const text=await source.text();
  const extrasMap=fileMap(extras);
  const lines=text.replace(/\r\n?/g,"\n").split("\n");
  let chapters=[], current=null, cover=null, bookTitle="", author="", language="";
  const missing=[];
  const ensure=()=>{if(!current){current=newChapter("Sissejuhatus","");chapters.push(current)}return current};
  for(const line of lines){
    const mk=parseMarker(line);
    if(mk){
      if(mk.key==="pealkiri"){bookTitle=mk.value;continue}
      if(mk.key==="autor"){author=mk.value;continue}
      if(mk.key==="keel"){language=mk.value;continue}
      if(mk.key==="peatükk"||mk.key==="lugu"){current=newChapter(mk.value||("Peatükk "+(chapters.length+1)),"");chapters.push(current);continue}
      if(mk.key==="kaanepilt"){
        const info=splitImageMarker(mk.value), f=extrasMap.get(info.name.toLowerCase());
        if(f) cover=makeAsset(f,f.name,""); else if(info.name) missing.push(info.name);
        continue;
      }
      if(mk.key==="pilt"){
        const info=splitImageMarker(mk.value), f=extrasMap.get(info.name.toLowerCase()), ch=ensure();
        if(f){
          const a=makeAsset(f,f.name,info.caption);ch.images.push(a);
          ch.body+=(ch.body?"\n\n":"")+`[[PILT:${a.id}]]`;
        }else{
          ch.body+=(ch.body?"\n\n":"")+`[PUUDUV PILT: ${info.name}${info.caption?" — "+info.caption:""}]`;
          if(info.name)missing.push(info.name);
        }
        continue;
      }
    }
    if(!current && !line.trim()) continue;
    const ch=ensure();
    ch.body+=(ch.body?"\n":"")+line;
  }
  return {bookTitle,author,language,cover,chapters,missing};
}
